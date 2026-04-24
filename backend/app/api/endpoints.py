"""
FastAPI API endpoints.
Auth: Clerk JWT — no JWT_SECRET, uses JWKS from Clerk.
Audit: every non-health request logs to audit_logs (SHA-256 only, no PII).
"""
import hashlib
import json
import math
import re
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text, select, and_, func

from app.auth.clerk import verify_clerk_token
from app.cache.redis_client import redis_client
from app.config.llm_provider import llm
from app.config.settings import settings
from app.models.db import AsyncSessionLocal, AuditLog, IntakeLog, Session as SessionModel, Profile, Doctor, Room, Hospital, Department, Appointment, Patient
from app.services.booking_engine import booking_engine
from app.services.intake_pipeline import intake_pipeline
from app.services.triage_agent import triage_agent
from app.services.triage_orchestrator import triage_orchestrator
from app.services.careflow_service import CareFlowService
from app.utils.supabase_client import supabase_rest



router = APIRouter()

MAX_FOLLOW_UP_TURNS = 3
QUEUE_DIVERSION_THRESHOLD_MINUTES = 45

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
# Patient & Archive APIs
# ---------------------------------------------------------------------------

async def _get_patient_payload(db, archived: bool = False):
    # Fetch patients
    stmt = select(Patient).where(Patient.archived == archived)
    result = await db.execute(stmt)
    patients = result.scalars().all()

    payload = []
    for p in patients:
        # Fetch sessions for this patient
        s_stmt = select(SessionModel).where(SessionModel.patient_id == p.id)
        s_result = await db.execute(s_stmt)
        sessions = s_result.scalars().all()

        cases = []
        for s in sessions:
            # Calculate total bill from appointments
            a_stmt = select(func.sum(Appointment.bill_amount)).where(Appointment.session_id == s.id)
            a_result = await db.execute(a_stmt)
            total_bill = a_result.scalar() or 0.0

            cases.append({
                "id": str(s.id),
                "type": s.case_type or "General Consultation",
                "department": "Medicine", # Hardcoded for now or fetch from dept
                "glStatus": s.gl_status,
                "claimStatus": s.claim_status,
                "totalBill": float(total_bill)
            })

        # Calculate age
        age = 0
        if p.date_of_birth:
            age = (datetime.utcnow().year - p.date_of_birth.year)

        payload.append({
            "id": str(p.id),
            "name": p.full_name,
            "age": age,
            "caseCount": len(sessions),
            "diagnoses": ["Hypertension", "Diabetes"], # Placeholder
            "insurers": ["AIA Platinum"], # Placeholder
            "type": "inpatient", # Default for now
            "cases": cases
        })
    return payload

# @router.get("/api/patients")
# async def get_patients():
#     async with AsyncSessionLocal() as db:
#         return await _get_patient_payload(db, archived=False)

# @router.get("/api/patients/archives")
# async def get_archives():
#     async with AsyncSessionLocal() as db:
#         return await _get_patient_payload(db, archived=True)
# async def _log_intake(
#     session_id: str,
#     user_id: str,
#     turn_number: int,
#     user_prompt: str,
#     triage_result: dict,
#     ai_reply: str | None,
#     input_channel: str = "text"
# ) -> None:
#     if "[password]" in settings.DATABASE_URL:
#         return
        
#     try:
#         async with AsyncSessionLocal() as db:
#             log = IntakeLog(
#                 session_id=session_id,
#                 clerk_user_id=user_id,
#                 turn_number=turn_number,
#                 user_prompt=user_prompt,
#                 ai_triage_result=triage_result,
#                 ai_reply=ai_reply,
#                 urgency_score=triage_result.get("urgency_score"),
#                 recommended_specialist=triage_result.get("recommended_specialist"),
#                 confidence=triage_result.get("confidence"),
#                 input_channel=input_channel,
#             )
#             db.add(log)
#             await db.commit()
#     except Exception as e:
#         print(f"DEBUG: Intake log failed, bypassing: {e}")


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


class NewCaseRequest(BaseModel):
    title: str
    department: str


class UpdateCaseRequest(BaseModel):
    title: str | None = None
    department: str | None = None


class UpdatePatientRequest(BaseModel):
    full_name: str | None = None
    insurers: list[str] | None = None



def _calculate_haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def _build_nearby_facilities_for_user(
    clerk_user_id: str,
    specialist: str = "",
    location: str = "",
    latitude: float | None = None,
    longitude: float | None = None,
    limit: int = 12,
) -> list[dict]:
    hospitals = await supabase_rest.query_table("hospitals", {
        "select": "*,departments(id,name,specialty_code)",
        "is_active": "eq.true"
    })
    if not hospitals:
        return []

    profile = await supabase_rest.get_profile(clerk_user_id)
    user_lat = latitude if latitude is not None else (profile.get("latitude") if profile else None)
    user_lng = longitude if longitude is not None else (profile.get("longitude") if profile else None)

    if (user_lat is None or user_lng is None):
        user_loc = (profile.get("location") if profile else None) or location
        if user_loc:
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

    specialist_lower = specialist.lower().strip()

    facilities: list[dict] = []
    for hospital in hospitals:
        departments = hospital.get("departments", []) or []
        matched_depts: list[str] = []

        for dept in departments:
            dept_name = dept.get("name", "")
            dept_lower = dept_name.lower()
            code = (dept.get("specialty_code") or "").lower()

            if specialist_lower:
                if specialist_lower in dept_lower or dept_lower in specialist_lower or (code and specialist_lower in code):
                    matched_depts.append(dept_name)
            else:
                matched_depts.append(dept_name)

        if specialist_lower and not matched_depts:
            continue

        h_lat = hospital.get("latitude")
        h_lng = hospital.get("longitude")
        dist_km = None
        if user_lat is not None and user_lng is not None and h_lat is not None and h_lng is not None:
            dist_km = _calculate_haversine(user_lat, user_lng, h_lat, h_lng)

        name = hospital.get("name", "Unknown")
        lower_name = name.lower()
        if "clinic" in lower_name:
            facility_type = "clinic"
        elif "hospital" in lower_name:
            facility_type = "hospital"
        else:
            facility_type = "healthcare"

        facilities.append({
            "id": str(hospital["id"]),
            "name": name,
            "address": hospital.get("address") or "Address not available",
            "contact_number": hospital.get("contact_number") or "",
            "latitude": h_lat,
            "longitude": h_lng,
            "facility_type": facility_type,
            "specialty_match": bool(matched_depts),
            "matched_departments": matched_depts,
            "all_departments": [d.get("name", "") for d in departments],
            "distance_km": dist_km,
            "distance_note": f"{round(dist_km, 1)} km away" if dist_km is not None else "Distance unknown",
        })

    facilities.sort(key=lambda item: (item["distance_km"] if item["distance_km"] is not None else 999999))
    return facilities[: max(1, min(limit, 20))]


# ---------------------------------------------------------------------------
# POST /intake/text
# ---------------------------------------------------------------------------
@router.post("/intake/text")
async def intake_text(
    body: dict,
    request: Request,
    user: dict = Depends(verify_clerk_token),
):
    print(f"DEBUG: [Request] Body: {body}")
    t0 = time.time()
    
    text = body.get("text")
    language_preference = body.get("language_preference", "auto")
    session_id = body.get("session_id") or str(uuid.uuid4())
    
    if not text:
        raise HTTPException(status_code=400, detail="Missing 'text' field in request body")
        
    raw = str(text)
    
    try:
        # Rate limit by Clerk user id
        user_id = user.get("sub", request.client.host)
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

        # 3. Fetch User Profile for Hospital Context
        from app.utils.supabase_client import supabase_rest
        hospital_id = None
        try:
            profile = await supabase_rest.get_profile(user_id)
            if profile:
                hospital_id = profile.get("hospital_id")
                print(f"DEBUG: Found hospital_id {hospital_id} for user {user_id}")
        except Exception as e:
            print(f"DEBUG: Profile fetch failed: {e}")

        # 4. Multi-Agent Triage Pipeline (Global Discovery)
        print("DEBUG: [Stage 3] Calling Global Multi-Agent Triage...")
        
        # We now use the Global-to-Local pipeline (decisions are hospital-agnostic initially)
        pipeline_output = await triage_orchestrator.run_pipeline(raw, language_preference=language_preference)

        # Map pipeline output to the frontend expected format
        decision = pipeline_output.get("decision", {})
        extraction = pipeline_output.get("extraction", {})
        symptoms = extraction.get("symptoms", [])
        
        # Split reasoning into a list for the frontend 'chain'
        reasoning_text = decision.get("reasoning", "No specific reasoning provided.")
        # Split by numbered points (1., 2., 3.) or newlines
        reasoning_chain = [s.strip() for s in re.split(r'\d+\.\s+', reasoning_text) if s.strip()]
        
        if not reasoning_chain:
            reasoning_chain = [s.strip() for s in reasoning_text.split("\n") if s.strip()]


        result = {
            "urgency_score": decision.get("urgency", "P4"),
            "recommended_specialist": decision.get("specialist", "General Medicine"),
            "chief_complaint": symptoms[0] if symptoms else "N/A",
            "reasoning_chain": reasoning_chain,
            "guideline_snippet": decision.get("guideline_snippet", ""),
            "confidence": decision.get("confidence", 0.5),
            "is_validated": pipeline_output.get("is_validated"),
            "is_fallback": pipeline_output.get("is_fallback"),
            "critique": pipeline_output.get("critique"),
            "follow_up_questions": decision.get("follow_up_questions", [])
        }


        # 5. Ambiguity loop decision
        follow_up_q: str | None = None
        confidence = result.get("confidence", 0.5)
        fup_questions = result.get("follow_up_questions", [])
        
        # Enforce minimum turns if confidence is not high enough
        current_turns = turn_count // 2
        is_unclear = confidence < 0.9
        
        # We loop if (it is unclear OR AI has specific questions) AND we haven't hit the cap
        if (is_unclear or fup_questions) and current_turns < MAX_FOLLOW_UP_TURNS:
            follow_up_q = fup_questions[0] if fup_questions else "Could you please describe your symptoms in more detail? (e.g. onset, severity, location)"


        # 6. Append turns to Redis
        print("DEBUG: [Stage 4] Persisting to Redis...")
        lang = result.get("language_detected", "en")
        complete_msg = "Triage selesai" if lang == "ms" else "Triage complete"
        
        await redis_client.append_turn(session_id, {"role": "user", "content": raw})
        await redis_client.append_turn(
            session_id,
            {"role": "agent", "content": follow_up_q or complete_msg},
        )

        # 7. Persist session to DB (Wrapped in resilience block)
        print("DEBUG: [Stage 5] Auditing and returning...")
        try:
            latency = int((time.time() - t0) * 1000)
            await _audit(session_id, "/intake/text", raw, latency, 200)

            # Log this specific triage turn to intake_logs
            await _log_intake(
                session_id=session_id,
                user_id=user_id,
                turn_number=(turn_count // 2) + 1,
                user_prompt=raw,
                triage_result=result,
                ai_reply=follow_up_q or complete_msg,
                input_channel=body.get("modality", "text")
            )
        except Exception as db_err:
            print(f"DEBUG: Triage completed but persistence failed (likely Network/DNS): {db_err}")

        print(f"DEBUG: [Final] Result -> Urgency: {result.get('urgency_score')}, Specialist: {result.get('recommended_specialist')}")
        print(f"DEBUG: [Final] Next Action: {'question' if follow_up_q else 'book'}")
        if follow_up_q:
            print(f"DEBUG: [Final] Follow-up Question: {follow_up_q}")
        
        print("DEBUG: [Success] Returning response to frontend")

        return {
            "session_id": session_id,
            "triage": result,
            "next_action": "question" if follow_up_q else "book",
            "question": follow_up_q,
            "is_validated": result.get("is_validated", False)
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(f"DEBUG: [CRASH] {type(exc).__name__}: {exc}")
        # Final safety catch: if even the AI logic fails, return a graceful error
        raise HTTPException(
            status_code=200, 
            detail={
                "triage": {"urgency_score": "P3", "reasoning_chain": ["The triage engine is currently experiencing high latency. Please proceed to General Medicine for evaluation."]},
                "next_action": "book",
                "error": str(exc)
            }
        )



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
    print(f"DEBUG: [Voice] Processing audio: {file.filename} ({len(contents)} bytes)")
    try:
        result = await intake_pipeline.process_voice(contents)
        print(f"DEBUG: [Voice] Transcription successful: {result.extracted[:100]}...")
        latency = int((time.time() - t0) * 1000)
        await _audit("voice", "/intake/voice", file.filename or "audio", latency, 200)
        return result.model_dump()
    except Exception as exc:
        print(f"DEBUG: [Voice] Processing failed: {exc}")
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
    print(f"DEBUG: [Doc] Processing document: {file.filename} (MIME: {mime}, {len(contents)} bytes)")
    try:
        result = await intake_pipeline.process_document(contents, mime)
        print(f"DEBUG: [Doc] Extraction successful: {result.extracted if hasattr(result, 'extracted') else 'Content extracted'}")
        latency = int((time.time() - t0) * 1000)
        await _audit("doc", "/intake/document", file.filename or "document", latency, 200)
        return result.model_dump()
    except ValueError as val_err:
        print(f"DEBUG: [Doc] Validation failed: {val_err}")
        latency = int((time.time() - t0) * 1000)
        await _audit("doc", "/intake/document", file.filename or "document", latency, 400, str(val_err))
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        print(f"DEBUG: [Doc] Processing failed: {exc}")
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
    limit: int = 12,
    preferred_window: str = "any",
    auto_expand: bool = True,
    user: dict = Depends(verify_clerk_token),
):
    slot_limit = max(3, min(limit, 24))
    normalized_window = preferred_window.strip().lower()
    if normalized_window not in {"any", "morning", "afternoon"}:
        normalized_window = "any"

    slots = await booking_engine.get_available_slots(
        specialty,
        urgency,
        hospital_id,
        limit=slot_limit,
        preferred_window=normalized_window,
    )

    expanded_from_hospital_filter = False
    if hospital_id and auto_expand and len(slots) < slot_limit:
        extra_slots = await booking_engine.get_available_slots(
            specialty,
            urgency,
            None,
            limit=slot_limit * 2,
            preferred_window=normalized_window,
        )
        seen = {(s.get("doctor_id"), s.get("scheduled_at")) for s in slots}
        for slot in extra_slots:
            key = (slot.get("doctor_id"), slot.get("scheduled_at"))
            if key in seen:
                continue
            slots.append(slot)
            seen.add(key)
            if len(slots) >= slot_limit:
                break
        expanded_from_hospital_filter = len(slots) > 0
    wait_values = [slot.get("estimated_wait_minutes") for slot in slots if slot.get("estimated_wait_minutes") is not None]
    queue_too_long = not slots or (bool(wait_values) and min(wait_values) >= QUEUE_DIVERSION_THRESHOLD_MINUTES)

    nearby_facilities: list[dict] = []
    if queue_too_long:
        uid = user.get("sub") if isinstance(user, dict) else str(user)
        nearby_facilities = await _build_nearby_facilities_for_user(uid, specialist=specialty, limit=3)

    return {
        "slots": slots,
        "queue_too_long": queue_too_long,
        "queue_threshold_minutes": QUEUE_DIVERSION_THRESHOLD_MINUTES,
        "nearby_facilities": nearby_facilities,
        "expanded_from_hospital_filter": expanded_from_hospital_filter,
    }


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
    latitude: float | None = None
    longitude: float | None = None


class NearbyFacilityRequest(BaseModel):
    location: str = ""
    latitude: float | None = None
    longitude: float | None = None
    specialist: str = ""
    limit: int = 12

@router.post("/api/hospitals/recommend")
async def recommend_hospitals(
    body: HospitalRecommendRequest,
    user_id: str = Depends(verify_clerk_token)
):
    """
    Rank hospitals by distance (close to far) and STRICTLY filter by department match.
    """
    # 1. Fetch ALL active hospitals with their departments
    print(f"DEBUG: Recommendation request for specialist: '{body.specialist}'")
    hospitals = await supabase_rest.query_table("hospitals", {
        "select": "*,departments(id,name,specialty_code)",
        "is_active": "eq.true"
    })
    
    if not hospitals:
        print("DEBUG: No active hospitals found in database.")
        return {"recommendations": []}
    
    print(f"DEBUG: Found {len(hospitals)} raw hospitals in DB.")

    # 2. Get User Coordinates (from profile or location lookup)
    uid = user_id.get("sub") if isinstance(user_id, dict) else user_id
    profile = await supabase_rest.get_profile(uid)
    user_lat, user_lng = body.latitude, body.longitude
    
    if profile and (user_lat is None or user_lng is None):
        user_lat = profile.get("latitude")
        user_lng = profile.get("longitude")
    
    # Fallback: City lookup if coordinates are missing but location name exists
    user_loc = (profile.get("location") if profile else None) or body.location
    if (user_lat is None or user_lng is None) and user_loc:
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

    city_coords = {
        "miri": (4.3995, 113.9914),
        "kl": (3.1390, 101.6869),
        "kuala lumpur": (3.1390, 101.6869),
        "pj": (3.1073, 101.6067),
        "petaling jaya": (3.1073, 101.6067),
        "cyberjaya": (2.9213, 101.6511),
        "selangor": (3.0738, 101.5183),
    }

    def _infer_coords_from_text(text_value: str | None) -> tuple[float, float] | None:
        if not text_value:
            return None
        lower = text_value.lower()
        for token, coords in city_coords.items():
            if token in lower:
                return coords
        return None
    
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

        # specialist = e.g. "General Medicine (Klinik Am)"
        specialist_clean = specialist_lower.strip(" .")
        
        # 1. Extraction: Get parts outside/inside parentheses
        terms_to_check = {specialist_clean}
        match = re.search(r"([^(]+)\(([^)]+)\)", specialist_clean)
        if match:
            terms_to_check.add(match.group(1).strip()) # Outside: 'general medicine'
            terms_to_check.add(match.group(2).strip()) # Inside: 'klinik am'
        
        for dept in departments:
            name = dept.get("name", "").lower().strip()
            code = (dept.get("specialty_code") or "").lower().strip()

            # Flexible Matching Strategy
            matched = False
            for term in terms_to_check:
                if not term: continue
                if term == name or term in name or (code and term in code):
                    matched = True
                    break
            
            # 2. Fuzzy Fallback: If AI says "Medicine" or "Emergency", match standard groups
            if not matched:
                if "medicine" in specialist_clean and ("medicine" in name or name == "klinik am"):
                    matched = True
                elif "emergency" in specialist_clean and ("emergency" in name or "kecemasan" in name):
                    matched = True

            if matched:
                matched_depts.append(dept.get("name", ""))

        if not matched_depts:
            print(f"DEBUG: Hospital '{h.get('name')}' did NOT match specialist '{body.specialist}' (Terms tried: {terms_to_check})")
            return None # FILTERED OUT


        print(f"DEBUG: Hospital '{h.get('name')}' MATCHED! ({matched_depts})")

        # DISTANCE CALCULATION
        dist_km = None
        h_lat = h.get("latitude")
        h_lng = h.get("longitude")

        if h_lat is None or h_lng is None:
            inferred = _infer_coords_from_text(h.get("address") or h.get("name"))
            if inferred:
                h_lat, h_lng = inferred
        
        if user_lat is not None and user_lng is not None and h_lat is not None and h_lng is not None:
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

    # Prefer nearby hospitals first when location is known.
    NEARBY_RADIUS_KM = 120
    if user_lat is not None and user_lng is not None:
        nearby = [c for c in candidates if c["distance_km"] is not None and c["distance_km"] <= NEARBY_RADIUS_KM]
        if nearby:
            nearby.sort(key=lambda x: x["distance_km"])
            return {"recommendations": nearby[:5]}

    # Fallback to global distance sorting if no nearby matches are available.
    candidates.sort(key=lambda x: (x["distance_km"] if x["distance_km"] is not None else 999999))
    return {"recommendations": candidates[:5]}


@router.post("/api/hospitals/nearby")
async def nearby_facilities(
    body: NearbyFacilityRequest,
    user_id: str = Depends(verify_clerk_token)
):
    """Return nearby healthcare facilities for the patient map and booking flow."""
    uid = user_id.get("sub") if isinstance(user_id, dict) else user_id
    facilities = await _build_nearby_facilities_for_user(
        uid,
        specialist=body.specialist,
        location=body.location,
        latitude=body.latitude,
        longitude=body.longitude,
        limit=body.limit,
    )
    return {"facilities": facilities}


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

# ─────────────────────────────────────────────
#  GET /api/patients  – active patients + cases
# ─────────────────────────────────────────────
@router.get("/api/patients")
async def get_active_patients():
    try:
        # Note the select syntax: medical_cases(*) fetches the related rows
        # via the patient_id foreign key automatically.
        response = await supabase_rest.query_table(
            "patients",
            {
                "select": "id, full_name, age, category, status, insurers, medical_cases(id, title, department, status, workflow_status, has_medical_bill, medical_bill_price, created_at, medical_bills(file_url, total_bill))",
                "status": "eq.active",
                "order": "created_at.desc"
            }
        )

        sidebar_data = {
            "emergency": [],
            "inpatient": [],
            "outpatient": []
        }

        for p in response:
            # We explicitly define the keys to prevent "all columns" from leaking
            clean_patient = {
                "id": p.get("id"),
                "full_name": p.get("full_name"),
                "age": p.get("age"),
                "category": p.get("category"),
                "insurers": p.get("insurers") or [],
                # This matches your UI where cases appear under the patient
                "cases": [
                    {
                        "id": c.get("id"),
                        "title": c.get("title"),
                        "department": c.get("department"),
                        "status": c.get("status"),
                          "workflow_status": c.get("workflow_status"),
                          "has_medical_bill": c.get("has_medical_bill"),
                          "medical_bill_price": c.get("medical_bill_price"),
                          "bill_url": next((b.get("file_url") for b in c.get("medical_bills", []) if b.get("case_id") == c.get("id")), 
                                          c.get("medical_bills", [{}])[0].get("file_url") if c.get("medical_bills") else None),
                          "created_at": c.get("created_at")
                    } 
                    for c in p.get("medical_cases", [])
                ]
            }
            
            # Use the Case Titles as "Diagnoses" for the UI summary for now
            clean_patient["diagnoses"] = [c["title"] for c in clean_patient["cases"]]

            cat = str(p.get("category", "")).lower()
            if cat in sidebar_data:
                sidebar_data[cat].append(clean_patient)
            else:
                sidebar_data["outpatient"].append(clean_patient)

        return {
            "success": True,
            "data": sidebar_data
        }

    except Exception as e:
        print(f"[API ERROR] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
 
# ─────────────────────────────────────────────
#  GET /api/patients/{patient_id}/cases
#  Single patient detail with cases
# ─────────────────────────────────────────────
@router.post("/api/patients/{patient_id}/cases")
async def create_patient_case(patient_id: str, body: NewCaseRequest):
    try:
        print(f"[CASE_CREATE] Creating case for patient {patient_id}")
        
        new_case = {
            "patient_id": patient_id,
            "title": body.title,
            "department": body.department,
            "status": "active",
            "workflow_status": "none",
            "has_medical_bill": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        response = await supabase_rest.insert_table("medical_cases", new_case)
        
        if not response:
            raise HTTPException(status_code=500, detail="Failed to create case in Supabase")
            
        return {
            "success": True,
            "data": response[0] if isinstance(response, list) else response
        }
        
    except Exception as e:
        print(f"[CASE_CREATE] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/api/cases/{case_id}")
async def update_patient_case(case_id: str, body: UpdateCaseRequest):
    try:
        print(f"[CASE_UPDATE] Updating case {case_id}")
        
        update_data = {}
        if body.title is not None: update_data["title"] = body.title
        if body.department is not None: update_data["department"] = body.department
        
        if not update_data:
            return {"success": True, "message": "No changes provided"}
            
        response = await supabase_rest.update_table("medical_cases", update_data, {"id": f"eq.{case_id}"})
        
        if not response:
            raise HTTPException(status_code=500, detail="Failed to update case in Supabase")
            
        return {"success": True, "data": response}
        
    except Exception as e:
        print(f"[CASE_UPDATE] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/cases/{case_id}")
async def delete_medical_case(case_id: str):
    try:
        print(f"[MANUAL_DELETE] Starting deletion process for case: {case_id}")
        
        # 1. Fetch appointments for this case to handle nested dependencies
        appointments = await supabase_rest.query_table("appointments", {"case_id": f"eq.{case_id}", "select": "id, bill_id"})
        apt_ids = [a["id"] for a in appointments] if appointments else []
        print(f"[MANUAL_DELETE] Found {len(apt_ids)} linked appointments.")

        # 2. Break circular dependencies in appointments (NULL out bill_id)
        if apt_ids:
            print(f"[MANUAL_DELETE] Nulling out bill_id in appointments to break circular links.")
            for aid in apt_ids:
                # Break the link so the bill can be deleted
                await supabase_rest.update_table("appointments", {"bill_id": None}, {"id": f"eq.{aid}"})

        # 3. Delete linked medical bills (the children of appointments and cases)
        # 3a. Bills linked to the appointments
        if apt_ids:
            print(f"[MANUAL_DELETE] Deleting bills linked to appointments.")
            await supabase_rest.delete_table("medical_bills", {"appointment_id": f"in.({','.join(apt_ids)})"})
        
        # 3b. Bills linked to the case directly
        print(f"[MANUAL_DELETE] Deleting bills linked directly to the case.")
        await supabase_rest.delete_table("medical_bills", {"case_id": f"eq.{case_id}"})

        # 4. Delete the appointments (the children of the case)
        if apt_ids:
            print(f"[MANUAL_DELETE] Deleting appointments linked to the case.")
            await supabase_rest.delete_table("appointments", {"case_id": f"eq.{case_id}"})
        
        # 5. Delete the case itself (the parent)
        print(f"[MANUAL_DELETE] Finally deleting the medical case record.")
        res = await supabase_rest.delete_table("medical_cases", {"id": f"eq.{case_id}"})
        
        if not res:
            # If res is None, it might mean the case was already deleted or doesn't exist
            return {"success": True, "message": "Case was already removed or not found."}
            
        print(f"[MANUAL_DELETE] Success: Case {case_id} and all children deleted.")
        return {"success": True, "message": "Case and all related records deleted successfully."}

    except Exception as e:
        print(f"[MANUAL_DELETE] CRITICAL ERROR: {str(e)}")
        # If it's a 409/23503 error, we know there's a child we missed
        raise HTTPException(status_code=500, detail=f"Manual deletion failed: {str(e)}")


@router.patch("/api/patients/{patient_id}")
async def update_patient_info(patient_id: str, body: UpdatePatientRequest):
    try:
        print(f"[PATIENT_UPDATE] Updating patient {patient_id}")
        
        update_data = {}
        if body.full_name is not None: update_data["full_name"] = body.full_name
        if body.insurers is not None: update_data["insurers"] = body.insurers
        
        if not update_data:
            return {"success": True, "message": "No changes provided"}
            
        response = await supabase_rest.update_table("patients", update_data, {"id": f"eq.{patient_id}"})
        
        if not response:
            raise HTTPException(status_code=500, detail="Failed to update patient in Supabase")
            
        return {"success": True, "data": response}
        
    except Exception as e:
        print(f"[PATIENT_UPDATE] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/cases/{case_id}/bill")
async def upload_case_bill(
    case_id: str, 
    total_bill: float = Form(...),
    file: UploadFile = File(...)
):
    try:
        print(f"[BILL_UPLOAD] Uploading bill for case {case_id}")
        
        # 1. Upload file to Supabase Storage
        file_content = await file.read()
        file_ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
        storage_path = f"bills/{case_id}_{int(time.time())}.{file_ext}"
        
        # We assume a bucket named 'medical_bills' exists
        upload_res = await supabase_rest.upload_file("medical_bills", storage_path, file_content, file.content_type)
        
        # Construct public URL (adjust based on Supabase public/private bucket settings)
        file_url = f"{supabase_rest.url}/storage/v1/object/public/medical_bills/{storage_path}"
        
        # 2. Get patient_id for the case
        case_response = await supabase_rest.query_table("medical_cases", {"select": "patient_id", "id": f"eq.{case_id}"})
        if not case_response:
            raise HTTPException(status_code=404, detail="Case not found")
        patient_id = case_response[0]["patient_id"]
        
        # 3. Create medical_bills entry
        bill_data = {
            "total_bill": total_bill,
            "status": "pending",
            "file_url": file_url,
            "case_id": case_id
        }
        bill_res = await supabase_rest.insert_table("medical_bills", bill_data)
        if not bill_res:
            raise HTTPException(status_code=500, detail="Failed to create bill in Supabase")
        bill_id = bill_res[0]["id"]
        
        # 4. Update medical_cases: has_medical_bill = True AND medical_bill_price = total_bill
        await supabase_rest.update_table("medical_cases", {
            "has_medical_bill": True,
            "medical_bill_price": total_bill
        }, {"id": f"eq.{case_id}"})
        
        return {"success": True, "bill_id": bill_id, "file_url": file_url}
        
    except Exception as e:
        print(f"[BILL_UPLOAD] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
#  GET /api/patients/{patient_id}/cases
@router.get("/api/patients/{patient_id}/cases")
async def get_patient_detail_with_cases(patient_id: str):
    try:
        print(f"[PATIENT_DETAIL] Fetching patient {patient_id}")
 
        response = await supabase_rest.query_table(
            "patients",
            {
                "select": """
                    id,
                    full_name,
                    age,
                    insurers,
                    category,
                    medical_cases (
                        id,
                        title,
                        department,
                        status,
                        workflow_status,
                        has_medical_bill,
                        created_at
                    )
                """,
                "id": f"eq.{patient_id}"
            }
        )
 
        if not response:
            raise HTTPException(status_code=404, detail="Patient not found")
 
        data = response[0] if isinstance(response, list) else response
        cases = data.get("medical_cases", [])
 
        return {
            "patient": {k: v for k, v in data.items() if k != "medical_cases"},
            "cases": cases
        }
 
    except Exception as e:
        print(f"[PATIENT_DETAIL] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
 
 
# ─────────────────────────────────────────────
#  GET /api/cases/{case_id}/appointments
#
#  medical_cases.appointment_ids is a uuid[]
#  with NO foreign key, so we:
#    1. fetch the case to get appointment_ids array
#    2. fetch appointments whose id is in that array
# ─────────────────────────────────────────────
@router.get("/api/cases/{case_id}/appointments")
async def get_case_timeline(case_id: str):
    try:
        print(f"[CASE_TIMELINE] Fetching case {case_id}")

        # Step 1 – get case
        case_response = await supabase_rest.query_table(
            "medical_cases",
            {
                "select": "id, title, department, status, workflow_status",
                "id": f"eq.{case_id}"
            }
        )

        if not case_response:
            raise HTTPException(status_code=404, detail="Case not found")

        case_data = case_response[0]

        # Step 2 – fetch appointments directly via case_id
        appointments = await supabase_rest.query_table(
            "appointments",
            {
                "select": """
                    id,
                    scheduled_at,
                    appointment_type,
                    urgency_level,
                    chief_complaint,
                    outcome_summary,
                    status,
                    duration_minutes,
                    ward,
                    bill_id,
                    case_id,
                    doctors (
                        id,
                        full_name
                    )
                """,
                "case_id": f"eq.{case_id}",
                "order": "scheduled_at.asc"
            }
        )

        # Step 3 – bills (unchanged)
        bill_ids = [a.get("bill_id") for a in appointments if a.get("bill_id")]
        bills_by_id = {}

        if bill_ids:
            bills = await supabase_rest.query_table(
                "medical_bills",
                {
                    "select": "id, total_bill, status, file_url",
                    "id": f"in.({','.join(bill_ids)})"
                }
            )
            bills_by_id = {b["id"]: b for b in bills}

        enriched = []
        for apt in appointments:
            bill_info = bills_by_id.get(apt.get("bill_id"), {})
            enriched.append({
                **apt,
                "total_bill": float(bill_info.get("total_bill", 0)),
                "bill_status": bill_info.get("status"),
                "bill_file_url": bill_info.get("file_url"),
            })

        return {
            "success": True,
            "case": case_data,
            "data": enriched
        }

    except Exception as e:
        print(f"[CASE_TIMELINE] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))
 
 
# ─────────────────────────────────────────────
#  GET /api/patients/archived
# ─────────────────────────────────────────────
@router.get("/api/patients/archived")
async def get_archived_patients():
    try:
        print("[PATIENTS] Fetching archived patients...")
 
        response = await supabase_rest.query_table(
            "patients",
            {
                "select": """
                    id,
                    full_name,
                    age,
                    category,
                    insurers,
                    diagnoses,
                    medical_cases (
                        id,
                        title,
                        department,
                        status,
                        workflow_status,
                        has_medical_bill,
                        created_at
                    )
                """,
                "status": "eq.archived",
                "order": "created_at.desc"
            }
        )
 
        print(f"[PATIENTS] Archived success. Count = {len(response)}")
 
        return {
            "success": True,
            "count": len(response),
            "data": response
        }
 
    except Exception as e:
        print(f"[PATIENTS] ARCHIVED ERROR: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": str(e)}
        )