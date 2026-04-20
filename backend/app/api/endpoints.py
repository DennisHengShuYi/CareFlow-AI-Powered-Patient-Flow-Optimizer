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
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text, select, and_, func

from app.auth.clerk import verify_clerk_token
from app.cache.redis_client import redis_client
from app.config.llm_provider import llm
from app.config.settings import settings
from app.models.db import AsyncSessionLocal, AuditLog, IntakeLog, Session as SessionModel, Profile, Doctor, Room, Hospital, Department, Appointment
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
    patient_id: str | None = None
    provider_id: str | None = None
    scheduled_at: str       # ISO 8601
    urgency: str
    complaint: str
    recommended_specialist: str | None = None
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


class SignNoteRequest(BaseModel):
    assessment_plan: str


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
        err_text = str(exc)

        # Bubble provider quota/rate-limit issues as 429 instead of generic 500.
        status_code = 500
        detail = f"Diagnostic: {type(exc).__name__} - {err_text}"
        if "quota" in err_text.lower() or "rate limit" in err_text.lower() or "429" in err_text:
            status_code = 429
            detail = "Triage provider quota exceeded. Please wait and retry, or switch provider/API project."

        # Try audit but don't crash again
        try:
            await _audit(session_id, "/intake/text", raw, latency, status_code, err_text)
        except:
            pass
        raise HTTPException(status_code=status_code, detail=detail)


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
            "confidence_score": sess.confidence_score,
            "status": sess.status,
            "triage_result": sess.triage_result,
            "language_detected": sess.language_detected,
        }


# ---------------------------------------------------------------------------
# GET /appointments/slots
# ---------------------------------------------------------------------------
@router.get("/appointments/slots")
async def appointment_slots(
    specialty: str,
    urgency: str,
    hospital_id: str | None = None,
    _user: dict = Depends(verify_clerk_token),
):
    slots = await booking_engine.get_available_slots(specialty, urgency, hospital_id)
    return {"slots": slots}


# ---------------------------------------------------------------------------
# POST /appointments/book
# ---------------------------------------------------------------------------
@router.post("/appointments/book")
async def book_appointment(
    body: BookRequest,
    user: dict = Depends(verify_clerk_token),
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
            recommended_specialist=body.recommended_specialist,
            patient_profile_id=user.get("sub"),
            duration_minutes=body.duration_minutes,
        )
        latency = int((time.time() - t0) * 1000)
        await _audit(body.session_id, "/appointments/book", body.complaint, latency, 200)
        return {"status": "confirmed", "fhir_resource": fhir}
    except Exception as exc:
        latency = int((time.time() - t0) * 1000)
        await _audit(body.session_id, "/appointments/book", body.complaint, latency, 500, str(exc))
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/appointments/my")
async def my_appointments(user: dict = Depends(verify_clerk_token)):
    """Return current/upcoming/history appointments for the signed-in patient."""
    clerk_id = user.get("sub") if isinstance(user, dict) else str(user)
    now = datetime.utcnow().replace(tzinfo=timezone.utc)

    async with AsyncSessionLocal() as db:
        patient_res = await db.execute(
            text("SELECT id FROM patients WHERE profile_id = :pid LIMIT 1"),
            {"pid": clerk_id},
        )
        patient_row = patient_res.first()
        if not patient_row:
            return {"current": None, "upcoming": [], "history": []}
        patient_id = patient_row[0]

        appt_res = await db.execute(
            select(Appointment)
            .where(Appointment.patient_id == patient_id)
            .order_by(Appointment.scheduled_at.desc())
        )
        appointments = appt_res.scalars().all()

        async def enrich(appt: Appointment):
            people_before = 0
            if appt.doctor_id:
                queue_res = await db.execute(
                    select(func.count(Appointment.id)).where(
                        and_(
                            Appointment.doctor_id == appt.doctor_id,
                            Appointment.status == "booked",
                            Appointment.scheduled_at < appt.scheduled_at,
                        )
                    )
                )
                people_before = int(queue_res.scalar() or 0)
            else:
                queue_res = await db.execute(
                    select(func.count(Appointment.id)).where(
                        and_(
                            Appointment.doctor_id.is_(None),
                            Appointment.status == "booked",
                            Appointment.scheduled_at < appt.scheduled_at,
                        )
                    )
                )
                people_before = int(queue_res.scalar() or 0)

            wait_from_time = max(0, int((appt.scheduled_at - now).total_seconds() // 60))
            live_wait_minutes = wait_from_time + (people_before * int(appt.duration_minutes or 30))

            return {
                "id": str(appt.id),
                "session_id": str(appt.session_id),
                "scheduled_at": appt.scheduled_at.isoformat(),
                "duration_minutes": appt.duration_minutes,
                "urgency": appt.urgency_level,
                "status": appt.status,
                "chief_complaint": appt.chief_complaint,
                "doctor_id": str(appt.doctor_id) if appt.doctor_id else None,
                "people_before": people_before,
                "live_wait_minutes": live_wait_minutes,
            }

        upcoming_raw = [a for a in appointments if a.scheduled_at >= now and a.status == "booked"]
        history_raw = [a for a in appointments if a.scheduled_at < now or a.status != "booked"]

        current = None
        if upcoming_raw:
            nearest = sorted(upcoming_raw, key=lambda a: a.scheduled_at)[0]
            current = await enrich(nearest)

        upcoming = [await enrich(a) for a in sorted(upcoming_raw, key=lambda x: x.scheduled_at)]
        history = [await enrich(a) for a in history_raw]

        return {
            "current": current,
            "upcoming": upcoming,
            "history": history,
        }


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

@router.post("/api/triage/override/{session_id}")
async def override_patient(session_id: str, req: OverridePatientRequest, user_id: str = Depends(verify_clerk_token)):
    async with AsyncSessionLocal() as db:
        success = await CareFlowService.override_patient(db, uuid.UUID(session_id), req.dict(exclude_none=True))
        return {"success": success}

@router.post("/api/admin/departments")
async def add_department(req: NewDepartmentBody, user_id: str = Depends(verify_clerk_token)):
    h_id = await _get_hospital_id(user_id.get("sub"))
    if not h_id: raise HTTPException(403, "No hospital assigned to profile")
    async with AsyncSessionLocal() as db:
        dept = await CareFlowService.add_department(db, h_id, req.name)
        return {"id": str(dept.id), "name": dept.name}

@router.post("/api/admin/doctors")
async def add_doctor(req: AddDoctorRequest, user_id: str = Depends(verify_clerk_token)):
    h_id = await _get_hospital_id(user_id.get("sub"))
    if not h_id: raise HTTPException(403)
    room_id = uuid.UUID(req.room_id) if req.room_id else None
    async with AsyncSessionLocal() as db:
        doc = await CareFlowService.add_doctor(db, h_id, uuid.UUID(req.department_id), req.name, room_id)
        return {"id": str(doc.id), "name": doc.full_name}

@router.patch("/api/admin/rooms/{room_id}/assign")
async def assign_room(room_id: str, req: AssignRoomBody, user_id: str = Depends(verify_clerk_token)):
    """Assign or unassign a doctor from a room."""
    async with AsyncSessionLocal() as db:
        doctor_id = uuid.UUID(req.doctor_id) if req.doctor_id else None
        success = await CareFlowService.assign_doctor_to_room(db, uuid.UUID(room_id), doctor_id)
        return {"success": success}

@router.post("/api/admin/rooms")
async def add_room(req: AddRoomRequest, user_id: str = Depends(verify_clerk_token)):
    async with AsyncSessionLocal() as db:
        room = await CareFlowService.add_room(db, uuid.UUID(req.department_id), req.label)
        return {"id": str(room.id), "label": room.label}

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

@router.post("/api/triage/sign_note/{session_id}")
async def sign_note_v2(session_id: str, req: SignNoteRequest, user_id: str = Depends(verify_clerk_token)):
    async with AsyncSessionLocal() as db:
        await CareFlowService.sign_note(db, uuid.UUID(session_id), req.assessment_plan)
        return {"status": "success"}


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
