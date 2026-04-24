"""
FastAPI API endpoints.
Auth: Clerk JWT — no JWT_SECRET, uses JWKS from Clerk.
Audit: every non-health request logs to audit_logs (SHA-256 only, no PII).
"""
import hashlib
import json
import math
import time
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text, select

from app.auth.clerk import verify_clerk_token
from app.cache.redis_client import redis_client
from app.config.llm_provider import llm
from app.config.settings import settings
from app.models.db import AsyncSessionLocal, AuditLog, IntakeLog, Session as SessionModel, Profile, Doctor, Room, Hospital, Department
from app.services.booking_engine import booking_engine
from app.services.intake_pipeline import intake_pipeline
from app.services.triage_agent import triage_agent
from app.services.careflow_service import CareFlowService
from app.utils.supabase_client import supabase_rest



router = APIRouter()

MAX_FOLLOW_UP_TURNS = 3

# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------
async def _audit(
    session_id: str,
    endpoint: str,
    raw_input: str,
    latency_ms: int,
    status_code: int,
    error_message: str | None = None,
) -> None:
    if "[password]" in settings.DATABASE_URL:
        return
        
    try:
        input_hash = hashlib.sha256(raw_input.encode()).hexdigest()
        async with AsyncSessionLocal() as db:
            log = AuditLog(
                session_id=session_id,
                endpoint=endpoint,
                llm_provider=settings.LLM_PROVIDER,
                llm_model=settings.MODEL_NAME,
                input_hash=input_hash,
                latency_ms=latency_ms,
                status_code=status_code,
                error_message=error_message,
            )
            db.add(log)
            await db.commit()
    except Exception as e:
        print(f"DEBUG: Audit log failed, bypassing: {e}")

# ---------------------------------------------------------------------------
# Intake Log helper
# ---------------------------------------------------------------------------
async def _log_intake(
    session_id: str,
    user_id: str,
    turn_number: int,
    user_prompt: str,
    triage_result: dict,
    ai_reply: str | None,
    input_channel: str = "text"
) -> None:
    if "[password]" in settings.DATABASE_URL:
        return
        
    try:
        async with AsyncSessionLocal() as db:
            log = IntakeLog(
                session_id=session_id,
                clerk_user_id=user_id,
                turn_number=turn_number,
                user_prompt=user_prompt,
                ai_triage_result=triage_result,
                ai_reply=ai_reply,
                urgency_score=triage_result.get("urgency_score"),
                recommended_specialist=triage_result.get("recommended_specialist"),
                confidence=triage_result.get("confidence"),
                input_channel=input_channel,
            )
            db.add(log)
            await db.commit()
    except Exception as e:
        print(f"DEBUG: Intake log failed, bypassing: {e}")


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------
class TextIntakeRequest(BaseModel):
    text: str
    session_id: str | None = None


class BookRequest(BaseModel):
    session_id: str
    patient_id: str
    provider_id: str
    scheduled_at: str       # ISO 8601
    urgency: str
    complaint: str
    duration_minutes: int = 30


# ---------------------------------------------------------------------------
# CareFlow Request Models
# ---------------------------------------------------------------------------
class SimulatePatientRequest(BaseModel):
    name: str
    complaint: str
    level: int


class SetEncounterRequest(BaseModel):
    patient_id: str


class RegisterPatientRequest(BaseModel):
    name: str
    ic_number: str
    phone: str
    email: str | None = None
    complaint: str
    level: int


class UpdateVitalsRequest(BaseModel):
    blood_pressure: str | None = None
    heart_rate: str | None = None
    oxygen_saturation: str | None = None


class ExtendedOverrideRequest(BaseModel):
    level: int | None = None
    diagnosis: str | None = None
    department_id: str | None = None
    doctor_id: str | None = None
    status: str | None = None
    blood_pressure: str | None = None
    heart_rate: str | None = None
    oxygen_saturation: str | None = None


class SignNoteRequest(BaseModel):
    assessment_plan: str | None = None
    subjective: str | None = None
    objective_note: str | None = None
    assessment: str | None = None
    plan: str | None = None


class GenerateSoapRequest(BaseModel):
    objective_note: str | None = ""


class OverridePatientRequest(BaseModel):
    level: int | None = None
    diagnosis: str | None = None
    department_id: str | None = None
    doctor_id: str | None = None
    status: str | None = None

class AddDoctorRequest(BaseModel):
    department_id: str
    name: str
    room_id: str | None = None  # optional: assign doctor to a room on creation
    specialty: str | None = None

class AddRoomRequest(BaseModel):
    department_id: str
    label: str

    status_color: str | None = None


class NewDepartmentBody(BaseModel):
    name: str


class NewRoomBody(BaseModel):
    label: str


class NewDoctorBody(BaseModel):
    name: str
    department_id: str


class AssignRoomBody(BaseModel):
    doctor_id: str | None = None


# ---------------------------------------------------------------------------
# POST /intake/text
# ---------------------------------------------------------------------------
@router.post("/intake/text")
async def intake_text(
    body: dict,
    request: Request,
    _user: dict = Depends(verify_clerk_token),
):
    print(f"DEBUG: [Request] Body: {body}")
    t0 = time.time()
    
    text = body.get("text")
    session_id = body.get("session_id") or str(uuid.uuid4())
    
    if not text:
        raise HTTPException(status_code=400, detail="Missing 'text' field in request body")
        
    raw = str(text)

    try:
        # Rate limit by Clerk user id
        user_id = _user.get("sub", request.client.host)
        if not await redis_client.check_rate_limit(user_id):
            raise HTTPException(status_code=429, detail="Rate limit exceeded")

        # 1. Intake pipeline
        print("DEBUG: [Stage 1] Processing intake content...")
        intake = await intake_pipeline.process_text(raw)

        # 2. Fetch history from Redis
        print(f"DEBUG: [Stage 2] Session: {session_id}, Fetching history...")
        history = await redis_client.get_turns(session_id)
        turn_count = await redis_client.get_turn_count(session_id)
        print(f"DEBUG: Current turn count for {session_id}: {turn_count}")

        # 3. Ambiguity cap
        if turn_count // 2 >= 10:  # Loosened to 10 for testing
            print(f"DEBUG: [REJECT] Max turns reached for {session_id}")
            raise HTTPException(
                status_code=422,
                detail=f"Maximum follow-up turns reached ({turn_count} turns). Please start a new intake session.",
            )

        # 4. Triage agent
        print("DEBUG: [Stage 3] Calling Triage Agent...")
        result = await triage_agent.analyze(
            raw, session_id, history
        )

        # 5. Ambiguity loop decision
        follow_up_q: str | None = None
        confidence = result.get("confidence", 1.0)
        fup_questions = result.get("follow_up_questions", [])

        if (confidence < 0.75 or fup_questions) and (turn_count // 2) < MAX_FOLLOW_UP_TURNS:
            follow_up_q = fup_questions[0] if fup_questions else None

        # 6. Append turns to Redis
        print("DEBUG: [Stage 4] Persisting to Redis...")
        await redis_client.append_turn(session_id, {"role": "user", "content": raw})
        await redis_client.append_turn(
            session_id,
            {"role": "agent", "content": follow_up_q or "Triage complete"},
        )

        # 7. Persist session to DB
        print("DEBUG: [Stage 5] Auditing and returning...")
        if "[password]" not in settings.DATABASE_URL:
            # ... (DB logic)
            pass

        latency = int((time.time() - t0) * 1000)
        await _audit(session_id, "/intake/text", raw, latency, 200)

        # Log this specific triage turn to intake_logs
        await _log_intake(
            session_id=session_id,
            user_id=user_id,
            turn_number=(turn_count // 2) + 1,  # e.g. turn_count is 0 -> 1st turn, 2 -> 2nd turn
            user_prompt=raw,
            triage_result=result,
            ai_reply=follow_up_q or "Triage complete",
            input_channel=body.get("modality", "text")  # If frontend sends modality
        )

        print("DEBUG: [Success] Returning response")
        return {
            "session_id": session_id,
            "triage": result,
            "next_action": "question" if follow_up_q else "book",
            "question": follow_up_q,
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(f"DEBUG: [CRASH] {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        latency = int((time.time() - t0) * 1000)
        # Try audit but don't crash again
        try:
            await _audit(session_id, "/intake/text", raw, latency, 500, str(exc))
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Diagnostic: {type(exc).__name__} - {str(exc)}")


# ---------------------------------------------------------------------------
# POST /intake/voice
# ---------------------------------------------------------------------------
@router.post("/intake/voice")
async def intake_voice(
    request: Request,
    file: UploadFile = File(...),
    _user: dict = Depends(verify_clerk_token),
):
    t0 = time.time()
    contents = await file.read()
    try:
        result = await intake_pipeline.process_voice(contents)
        latency = int((time.time() - t0) * 1000)
        await _audit("voice", "/intake/voice", file.filename or "audio", latency, 200)
        return result.model_dump()
    except Exception as exc:
        latency = int((time.time() - t0) * 1000)
        await _audit("voice", "/intake/voice", file.filename or "audio", latency, 500, str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /intake/document
# ---------------------------------------------------------------------------
@router.post("/intake/document")
async def intake_document(
    request: Request,
    file: UploadFile = File(...),
    _user: dict = Depends(verify_clerk_token),
):
    t0 = time.time()
    contents = await file.read()
    mime = file.content_type or "application/octet-stream"
    try:
        result = await intake_pipeline.process_document(contents, mime)
        latency = int((time.time() - t0) * 1000)
        await _audit("doc", "/intake/document", file.filename or "document", latency, 200)
        return result.model_dump()
    except Exception as exc:
        latency = int((time.time() - t0) * 1000)
        await _audit("doc", "/intake/document", file.filename or "document", latency, 500, str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /sessions/{id}
# ---------------------------------------------------------------------------
@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    _user: dict = Depends(verify_clerk_token),
):
    cached = await redis_client.get_session(session_id)
    if cached:
        return cached

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select as sa_select
        result = await db.execute(
            sa_select(SessionModel).where(SessionModel.id == uuid.UUID(session_id))
        )
        sess = result.scalar_one_or_none()
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "id": str(sess.id),
            "urgency_level": sess.urgency_level,
            "status": sess.status,
            "triage_result": sess.triage_result,
        }


# ---------------------------------------------------------------------------
# GET /appointments/slots
# ---------------------------------------------------------------------------
@router.get("/appointments/slots")
async def appointment_slots(
    specialty: str,
    urgency: str,
    _user: dict = Depends(verify_clerk_token),
):
    slots = await booking_engine.get_available_slots(specialty, urgency)
    return {"slots": slots}


# ---------------------------------------------------------------------------
# POST /appointments/book
# ---------------------------------------------------------------------------
@router.post("/appointments/book")
async def book_appointment(
    body: BookRequest,
    _user: dict = Depends(verify_clerk_token),
):
    t0 = time.time()
    try:
        fhir = await booking_engine.confirm_booking(
            session_id=body.session_id,
            patient_id=body.patient_id,
            provider_id=body.provider_id,
            scheduled_at_iso=body.scheduled_at,
            urgency=body.urgency,
            complaint=body.complaint,
            duration_minutes=body.duration_minutes,
        )
        latency = int((time.time() - t0) * 1000)
        await _audit(body.session_id, "/appointments/book", body.complaint, latency, 200)
        return {"status": "confirmed", "fhir_resource": fhir}
    except Exception as exc:
        latency = int((time.time() - t0) * 1000)
        await _audit(body.session_id, "/appointments/book", body.complaint, latency, 500, str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Hospital Recommendation API
# ---------------------------------------------------------------------------

class HospitalRecommendRequest(BaseModel):
    specialist: str = ""          # From triage.recommended_specialist
    chief_complaint: str = ""     # From triage.chief_complaint
    location: str = ""            # From user profile.location (e.g. "Miri, Sarawak")

@router.post("/api/hospitals/recommend")
async def recommend_hospitals(
    body: HospitalRecommendRequest,
    user_id: str = Depends(verify_clerk_token)
):
    """
    Rank hospitals by distance (close to far) and STRICTLY filter by department match.
    """
    # 1. Fetch ALL active hospitals with their departments
    hospitals = await supabase_rest.query_table("hospitals", {
        "select": "*,departments(id,name,specialty_code)",
        "is_active": "eq.true"
    })
    if not hospitals:
        return {"recommendations": []}

    # 2. Get User Coordinates (from profile or location lookup)
    uid = user_id.get("sub") if isinstance(user_id, dict) else user_id
    profile = await supabase_rest.get_profile(uid)
    user_lat, user_lng = None, None
    
    if profile:
        user_lat = profile.get("latitude")
        user_lng = profile.get("longitude")
    
    # Fallback: City lookup if coordinates are missing but location name exists
    user_loc = (profile.get("location") if profile else None) or body.location
    if (not user_lat or not user_lng) and user_loc:
        loc_map = {
            "miri": (4.3995, 113.9914),
            "kl": (3.1390, 101.6869),
            "kuala lumpur": (3.1390, 101.6869),
            "pj": (3.1073, 101.6067),
            "petaling jaya": (3.1073, 101.6067),
            "cyberjaya": (2.9213, 101.6511),
        }
        loc_lower = user_loc.lower()
        for city, coords in loc_map.items():
            if city in loc_lower:
                user_lat, user_lng = coords
                break

    specialist_lower = body.specialist.lower()
    
    def _calculate_haversine(lat1, lon1, lat2, lon2):
        R = 6371.0 # KM
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat / 2)**2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def _process_hospital(h: dict) -> dict | None:
        departments = h.get("departments", []) or []
        matched_depts: list[str] = []

        # STRICT FILTER: Check if any department matches the specialist
        # specialist = e.g. "General Practice" or "Pediatrics"
        for dept in departments:
            name = dept.get("name", "").lower()
            code = (dept.get("specialty_code") or "").lower()

            # Flexible but targeted matching
            # e.g. "Pediatrics" matches "Pediatrics", "Pediatric Department", etc.
            if specialist_lower and (
                specialist_lower in name 
                or name in specialist_lower
                or (code and specialist_lower in code)
            ):
                matched_depts.append(dept.get("name", ""))

        if not matched_depts:
            return None # FILTERED OUT

        # DISTANCE CALCULATION
        dist_km = None
        h_lat = h.get("latitude")
        h_lng = h.get("longitude")
        
        if user_lat and user_lng and h_lat and h_lng:
            dist_km = _calculate_haversine(user_lat, user_lng, h_lat, h_lng)

        return {
            "id": str(h["id"]),
            "name": h.get("name", "Unknown"),
            "address": h.get("address") or "Address not available",
            "contact_number": h.get("contact_number") or "",
            "specialty_match": True,
            "matched_departments": matched_depts,
            "all_departments": [d.get("name", "") for d in departments],
            "distance_km": dist_km,
            "distance_note": f"{round(dist_km, 1)} km away" if dist_km is not None else "Distance unknown",
        }

    # Apply processing and filtering
    candidates = []
    for h in hospitals:
        res = _process_hospital(h)
        if res:
            candidates.append(res)

    # SORT: Primarily by distance (ascending)
    # If distance is unknown, move to end
    candidates.sort(key=lambda x: (x["distance_km"] if x["distance_km"] is not None else 999999))

    return {"recommendations": candidates[:5]}


async def _get_hospital_id(user_id: str):
    profile = await supabase_rest.get_profile(user_id)
    if profile:
        pid = profile.get("hospital_id")
        return uuid.UUID(pid) if pid else None
    return None


@router.get("/api/triage/overview")
async def get_triage_overview(user_id: str = Depends(verify_clerk_token)):
    uid = user_id.get("sub")
    print(f"DEBUG: [GET /api/triage/overview] UserID: {uid}")
    h_id = await _get_hospital_id(uid)
    print(f"DEBUG: HospitalID: {h_id}")
    if not h_id:
        return {"patients": [], "queue_active": 0, "critical": 0}
    async with AsyncSessionLocal() as db:
        res = await CareFlowService.get_triage_overview(db, h_id)
        print(f"DEBUG: Returning {len(res.get('patients', []))} patients")
        return res

@router.get("/api/capacity/board")
async def get_capacity_board(user_id: str = Depends(verify_clerk_token)):
    uid = user_id.get("sub")
    print(f"DEBUG: [GET /api/capacity/board] UserID: {uid}")
    h_id = await _get_hospital_id(uid)
    print(f"DEBUG: HospitalID: {h_id}")
    if not h_id:
        return {"departments": []}
    async with AsyncSessionLocal() as db:
        res = await CareFlowService.build_capacity_board(db, h_id)
        print(f"DEBUG: Returning {len(res.get('departments', []))} departments")
        return res

@router.post("/api/triage/simulate")
async def simulate_patient(req: SimulatePatientRequest, user_id: str = Depends(verify_clerk_token)):
    h_id = await _get_hospital_id(user_id.get("sub"))
    if not h_id: raise HTTPException(403, "No hospital assigned")
    async with AsyncSessionLocal() as db:
        sess = await CareFlowService.simulate_patient(db, h_id, req.name, req.complaint, req.level)
        return {"status": "success", "session_id": str(sess.id)}

@router.post("/api/triage/override/{patient_id}")
async def override_patient(patient_id: str, req: OverridePatientRequest, user_id: str = Depends(verify_clerk_token)):
    try:
        print(f"DEBUG: [override_patient] patient_id={patient_id}, req={req.dict()}")
        async with AsyncSessionLocal() as db:
            success = await CareFlowService.override_patient(db, uuid.UUID(patient_id), req.dict(exclude_none=True))
            print(f"DEBUG: [override_patient] success={success}")
            return {"success": success}
    except ValueError as e:
        print(f"ERROR: [override_patient] Invalid UUID: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid patient ID format: {e}")
    except Exception as e:
        print(f"ERROR: [override_patient] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to override patient: {str(e)}")

@router.post("/api/triage/auto_assign/{patient_id}")
async def auto_assign_patient(patient_id: str, user_id: str = Depends(verify_clerk_token)):
    try:
        uid = user_id.get("sub")
        hospital_id = await _get_hospital_id(uid)
        if not hospital_id:
            raise HTTPException(403, "No hospital assigned")

        async with AsyncSessionLocal() as db:
            assignment = await CareFlowService.auto_assign_patient(db, uuid.UUID(patient_id), hospital_id)
            if not assignment:
                raise HTTPException(500, "Auto-assignment failed")
            return {"success": True, "assignment": assignment}
    except ValueError as e:
        print(f"ERROR: [auto_assign_patient] Invalid UUID: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid patient ID format: {e}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR: [auto_assign_patient] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to auto-assign patient: {str(e)}")

@router.post("/api/admin/departments")
async def add_department(req: NewDepartmentBody, user_id: str = Depends(verify_clerk_token)):
    h_id = await _get_hospital_id(user_id.get("sub"))
    if not h_id: 
        raise HTTPException(403, "No hospital assigned to profile")
    
    async with AsyncSessionLocal() as db:
        dept = await CareFlowService.add_department(db, h_id, req.name)
        
        # 1. Extract from list if necessary
        new_dept = dept[0] if isinstance(dept, list) else dept
        
        # 2. Handle both Object (dot notation) and Dictionary (bracket notation)
        if isinstance(new_dept, dict):
            return {
                "id": str(new_dept.get("id")), 
                "name": new_dept.get("name")
            }
        
        # Fallback for class objects
        return {
            "id": str(new_dept.id), 
            "name": new_dept.name
        }

# @router.post("/api/admin/doctors")
# async def add_doctor(req: AddDoctorRequest, user_id: str = Depends(verify_clerk_token)):
#     h_id = await _get_hospital_id(user_id.get("sub"))
#     if not h_id: raise HTTPException(403)
#     room_id = uuid.UUID(req.room_id) if req.room_id else None
#     async with AsyncSessionLocal() as db:
#         doc = await CareFlowService.add_doctor(db, h_id, uuid.UUID(req.department_id), req.name, room_id)
#         return {"id": str(doc.id), "name": doc.full_name}

@router.post("/api/admin/doctors")
async def add_doctor(req: AddDoctorRequest, user_id: dict = Depends(verify_clerk_token)):
    h_id = await _get_hospital_id(user_id.get("sub"))
    if not h_id:
        raise HTTPException(status_code=403, detail="Unauthorized: Hospital context missing")
    
    try:
        dept_uuid = uuid.UUID(req.department_id)
        room_uuid = uuid.UUID(req.room_id) if req.room_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format provided")

    async with AsyncSessionLocal() as db:
        try:
            # Pass req.specialty into the service call
            doc = await CareFlowService.add_doctor(
                db, 
                h_id, 
                dept_uuid, 
                req.name, 
                room_uuid,
                specialty=req.specialty
            )
            
            if not doc:
                raise Exception("Failed to create doctor record")

            # doc is now confirmed to be a single DICT thanks to the service layer update
            return {
                "id": str(doc.get('id', '')), 
                "name": doc.get('full_name', req.name),
                "specialty": doc.get('specialty', req.specialty)
            }
        except Exception as e:
            # General error handler for database/logic issues
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# @router.patch("/api/admin/rooms/{room_id}/assign")
# async def assign_room(room_id: str, req: AssignRoomBody, user_id: str = Depends(verify_clerk_token)):
#     """Assign or unassign a doctor from a room."""
#     async with AsyncSessionLocal() as db:
#         doctor_id = uuid.UUID(req.doctor_id) if req.doctor_id else None
#         success = await CareFlowService.assign_doctor_to_room(db, uuid.UUID(room_id), doctor_id)
#         return {"success": success}
@router.patch("/api/admin/rooms/{room_id}/assign")
async def assign_doctor_to_room_api(
    room_id: str,
    req: AssignRoomBody,
    user_id: str = Depends(verify_clerk_token)
):
    try:
        target_room_id = str(room_id)
        target_doctor_id = str(req.doctor_id) if req.doctor_id else None

        print("Assign request:", target_room_id, target_doctor_id)

        # ============================================
        # STEP 1: Remove doctor from ANY existing room
        # ============================================
        if target_doctor_id:
            current_rooms = await supabase_rest.query_table(
                "rooms",
                {"doctor_id": f"eq.{target_doctor_id}"}   
            ) or []

            print("Rooms currently assigned:", current_rooms)

            for r in current_rooms:
                await supabase_rest.update_table(
                    "rooms",
                    r["id"],                    
                    {"doctor_id": None}
                )

        # ============================================
        # STEP 2: Assign doctor to new room
        # ============================================
        if target_room_id:
            await supabase_rest.update_table(
                "rooms",
                target_room_id,               # ✅ FIX: pass STRING id
                {"doctor_id": target_doctor_id}
            )

        # ============================================
        # STEP 3: DEBUG VERIFY
        # ============================================
        updated = await supabase_rest.query_table(
            "rooms",
            {"id": f"eq.{target_room_id}"}   # ✅ keep eq. for query
        )

        print("AFTER UPDATE:", updated)

        return {"success": True}

    except Exception as e:
        print(f"ERROR: {e}")
        return {"success": False, "detail": str(e)}

# @router.post("/api/admin/rooms")
# async def add_room(req: AddRoomRequest, user_id: str = Depends(verify_clerk_token)):
#     async with AsyncSessionLocal() as db:
#         room = await CareFlowService.add_room(db, uuid.UUID(req.department_id), req.label)
#         return {"id": str(room.id), "label": room.label}

@router.post("/api/admin/rooms")
async def add_room(req: AddRoomRequest, user_id: str = Depends(verify_clerk_token)):
    async with AsyncSessionLocal() as db:
        # We assume req.department_id is passed from your AddRoomRequest schema
        room = await CareFlowService.add_room(db, uuid.UUID(req.department_id), req.label)
        
        # 1. Extract from list if necessary (Fixes: AttributeError: 'list' object has no attribute 'id')
        new_room = room[0] if isinstance(room, list) else room
        
        # 2. Handle both Object (dot notation) and Dictionary (bracket notation)
        if isinstance(new_room, dict):
            return {
                "id": str(new_room.get("id")), 
                "label": new_room.get("label")
            }
        
        return {
            "id": str(new_room.id), 
            "label": new_room.label
        }

@router.post("/api/triage/active_encounter")
async def set_active_encounter(req: SetEncounterRequest, user_id: str = Depends(verify_clerk_token)):
    h_id = await _get_hospital_id(user_id.get("sub"))
    async with AsyncSessionLocal() as db:
        success = await CareFlowService.set_active_encounter(db, h_id, uuid.UUID(req.patient_id))
        if not success: raise HTTPException(404)
        return {"status": "success"}

@router.post("/api/triage/sign_note")
async def sign_note(req: SignNoteRequest, user_id: str = Depends(verify_clerk_token)):
    # Assuming active encounter context or passing session_id
    # For now, let's just use the request if we have it, or rely on frontend to pass patient_id
    # We'll need a way for the frontend to specify WHICH patient to sign
    pass # Wait, let's refine this to match the override logic

@router.post("/api/triage/generate_soap/{session_id}")
async def generate_soap_note(session_id: str, req: GenerateSoapRequest, user_id: str = Depends(verify_clerk_token)):
    try:
        async with AsyncSessionLocal() as db:
            note = await CareFlowService.generate_soap_note(db, uuid.UUID(session_id), req.objective_note or "")
            if not note:
                raise HTTPException(status_code=404, detail="Session not found or unable to generate SOAP")
            return note
    except ValueError as e:
        print(f"ERROR: [generate_soap_note] Invalid UUID: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid session ID format: {e}")
    except Exception as e:
        print(f"ERROR: [generate_soap_note] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate SOAP note: {str(e)}")


@router.post("/api/triage/sign_note/{session_id}")
async def sign_note_v2(session_id: str, req: SignNoteRequest, user_id: str = Depends(verify_clerk_token)):
    async with AsyncSessionLocal() as db:
        ok = await CareFlowService.sign_note(
            db,
            uuid.UUID(session_id),
            clinical_note=req.assessment_plan or "",
            soap_note={
                "subjective": req.subjective or "",
                "objective": req.objective_note or "",
                "assessment": req.assessment or "",
                "plan": req.plan or "",
            },
        )
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to persist signed SOAP note")
        return {"status": "success"}


# ---------------------------------------------------------------------------
# POST /api/triage/register - Register new patient and add to queue
# ---------------------------------------------------------------------------
@router.post("/api/triage/register")
async def register_patient(req: RegisterPatientRequest, user_id: str = Depends(verify_clerk_token)):
    """Register a new patient and add to queue."""
    try:
        uid = user_id.get("sub")
        h_id = await _get_hospital_id(uid)
        if not h_id:
            raise HTTPException(403, "No hospital assigned to profile")
        
        async with AsyncSessionLocal() as db:
            patient = await CareFlowService.register_patient(
                db, h_id,
                name=req.name,
                ic_number=req.ic_number,
                phone=req.phone,
                email=req.email,
                complaint=req.complaint,
                level=req.level
            )
            return {
                "status": "success",
                "patient_id": str(patient.id),
                "name": patient.full_name
            }
    except Exception as e:
        print(f"ERROR: [register_patient] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to register patient: {str(e)}")


# ---------------------------------------------------------------------------
# GET /api/patients/search - Search patients by name
# ---------------------------------------------------------------------------
# @router.get("/api/patients/search")
# async def search_patients(q: str, user_id: str = Depends(verify_clerk_token)):
#     """Search existing patients by name."""
#     try:
#         uid = user_id.get("sub")
#         h_id = await _get_hospital_id(uid)
#         if not h_id:
#             return {"patients": []}
        
#         async with AsyncSessionLocal() as db:
#             patients = await CareFlowService.search_patients(db, h_id, q)
#             return {
#                 "patients": [
#                     {
#                         "id": str(p.id),
#                         "name": p.full_name,
#                         "ic_number": p.ic_number,
#                         "phone": p.phone,
#                         "email": p.email,
#                         "complaint": p.metadata_data.get("complaint") if p.metadata_data else None,
#                         "level": p.metadata_data.get("level") if p.metadata_data else 3
#                     }
#                     for p in patients
#                 ]
#             }
#     except Exception as e:
#         print(f"ERROR: [search_patients] {type(e).__name__}: {e}")
#         return {"patients": []}
@router.get("/api/patients/search")
async def search_patients(q: str, user_id: str = Depends(verify_clerk_token)):
    try:
        uid = user_id.get("sub")
        h_id = await _get_hospital_id(uid)

        print("=== SEARCH DEBUG ===")
        print("USER:", uid)
        print("HOSPITAL:", h_id)
        print("QUERY:", q)

        async with AsyncSessionLocal() as db:
            patients = await CareFlowService.search_patients(db, h_id, q)

            print("FOUND PATIENTS:", len(patients))

            return {
                "patients": [
                    {
                        "id": str(p.id),
                        "name": p.full_name,   # ✅ match frontend
                        "ic_number": p.ic_number,
                        "phone": p.phone,
                        "email": p.email,
                        "complaint": p.metadata_data.get("complaint") if p.metadata_data else None,
                        "level": p.metadata_data.get("level") if p.metadata_data else 3
                    }
                    for p in patients
                ]
            }

    except Exception as e:
        print(f"ERROR: [search_patients] {type(e).__name__}: {e}")
        return {"patients": []}

# ---------------------------------------------------------------------------
# GET /api/doctors - Get all doctors for hospital
# ---------------------------------------------------------------------------
@router.get("/api/doctors")
async def get_doctors(user_id: str = Depends(verify_clerk_token)):
    """Get all doctors for the user's hospital."""
    try:
        uid = user_id.get("sub")
        h_id = await _get_hospital_id(uid)
        if not h_id:
            return {"doctors": []}
        
        async with AsyncSessionLocal() as db:
            doctors = await CareFlowService.get_doctors_by_hospital(db, h_id)
            return {
                "doctors": [
                    {
                        "id": str(d.id),
                        "name": d.full_name,
                        "department_id": str(d.department_id) if d.department_id else None,
                        "department_name": d.department.name if d.department else None
                    }
                    for d in doctors
                ]
            }
    except Exception as e:
        print(f"ERROR: [get_doctors] {type(e).__name__}: {e}")
        return {"doctors": []}


# ---------------------------------------------------------------------------
# GET /api/departments/{dept_id}/doctors - Filter doctors by department
# ---------------------------------------------------------------------------
# @router.get("/api/departments/{dept_id}/doctors")
# async def get_doctors_by_department(dept_id: str, user_id: str = Depends(verify_clerk_token)):
#     """Get doctors for a specific department."""
#     try:
#         async with AsyncSessionLocal() as db:
#             doctors = await CareFlowService.get_doctors_by_department(db, uuid.UUID(dept_id))
#             return {
#                 "doctors": [
#                     {
#                         "id": str(d.id),
#                         "name": d.full_name,
#                         "department_id": str(d.department_id) if d.department_id else None
#                     }
#                     for d in doctors
#                 ]
#             }
#     except Exception as e:
#         print(f"ERROR: [get_doctors_by_department] {type(e).__name__}: {e}")
#         return {"doctors": []}
@router.get("/api/departments/{dept_id}/doctors")
async def get_doctors_by_department(
    dept_id: str,
    user_id: str = Depends(verify_clerk_token)
):
    try:
        async with AsyncSessionLocal() as db:
            doctors = await CareFlowService.get_doctors_by_department(
                db, uuid.UUID(dept_id)
            )

            return {
                "doctors": [
                    {
                        "id": doc["id"],
                        "full_name": doc["full_name"],
                        "department_id": doc.get("department_id"),
                        "room_id": doc.get("room_id")  
                    }
                    for doc in doctors
                ]
            }

    except Exception as e:
        print(f"ERROR: {e}")
        return {"doctors": []}


# ---------------------------------------------------------------------------
# PATCH /api/patients/{patient_id}/vitals - Update patient vitals
# ---------------------------------------------------------------------------
@router.patch("/api/patients/{patient_id}/vitals")
async def update_patient_vitals(patient_id: str, req: UpdateVitalsRequest, user_id: str = Depends(verify_clerk_token)):
    """Update patient vital signs."""
    try:
        async with AsyncSessionLocal() as db:
            success = await CareFlowService.update_patient_vitals(
                db, uuid.UUID(patient_id),
                bp=req.blood_pressure,
                hr=req.heart_rate,
                o2=req.oxygen_saturation
            )
            if not success:
                raise HTTPException(404, "Patient not found")
            return {"status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid patient ID: {e}")
    except Exception as e:
        print(f"ERROR: [update_patient_vitals] {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update vitals: {str(e)}")


# ---------------------------------------------------------------------------
# DELETE /api/admin/departments/{dept_id} - Delete department
# ---------------------------------------------------------------------------
@router.delete("/api/admin/departments/{dept_id}")
async def delete_department(dept_id: str, user_id: str = Depends(verify_clerk_token)):
    """Delete a department via REST API."""
    try:
        result = await supabase_rest.delete_table("departments", dept_id)
        if result:
            return {"status": "success"}
        raise HTTPException(404, "Department not found")
    except Exception as e:
        print(f"ERROR: [delete_department] {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete department: {str(e)}")


# ---------------------------------------------------------------------------
# DELETE /api/admin/rooms/{room_id} - Delete room
# ---------------------------------------------------------------------------
@router.delete("/api/admin/rooms/{room_id}")
async def delete_room(room_id: str, user_id: str = Depends(verify_clerk_token)):
    """Delete a room via REST API."""
    try:
        result = await supabase_rest.delete_table("rooms", room_id)
        if result:
            return {"status": "success"}
        raise HTTPException(404, "Room not found")
    except Exception as e:
        print(f"ERROR: [delete_room] {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete room: {str(e)}")


# ---------------------------------------------------------------------------
# DELETE /api/admin/doctors/{doctor_id} - Delete doctor
# ---------------------------------------------------------------------------
@router.delete("/api/admin/doctors/{doctor_id}")
async def delete_doctor(doctor_id: str, user_id: str = Depends(verify_clerk_token)):
    """Delete a doctor via REST API."""
    try:
        result = await supabase_rest.delete_table("doctors", doctor_id)
        if result:
            return {"status": "success"}
        raise HTTPException(404, "Doctor not found")
    except Exception as e:
        print(f"ERROR: [delete_doctor] {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete doctor: {str(e)}")


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@router.get("/health")
async def health():
    checks: dict[str, bool] = {
        "supabase_db": False,
        "upstash_redis": False,
        "llm_provider": False,
    }

    # Supabase DB
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["supabase_db"] = True
    except Exception:
        pass

    # Upstash Redis
    try:
        allowed = await redis_client.check_rate_limit("healthcheck_probe")
        checks["upstash_redis"] = True   # INCR itself proves connectivity
    except Exception:
        pass

    # LLM provider
    try:
        ping = await llm.generate("ping", "Reply with the single word: pong", response_format="text")
        checks["llm_provider"] = bool(ping)
    except Exception:
        pass

    status = "healthy" if all(checks.values()) else "degraded"
    code = 200 if status == "healthy" else 503
    return JSONResponse(content={"status": status, "checks": checks}, status_code=code)
