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

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text, select, and_, func

from app.auth.clerk import verify_clerk_token
from app.cache.redis_client import redis_client
from app.config.llm_provider import llm
from app.config.settings import settings
from app.models.db import AsyncSessionLocal, AuditLog, IntakeLog, Session as SessionModel, Profile, Doctor, Room, Hospital, Department, Appointment, APPOINTMENT_STATUS_SCHEDULED
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
    hospital_id: str | None = None
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
        
        # We now pass 'history' so the AI can remember previous turns (Context-Aware)
        pipeline_output = await triage_orchestrator.run_pipeline(
            raw, 
            language_preference=language_preference,
            history=history
        )


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
        
        await redis_client.append_turn(session_id, {"role": "user", "text": raw})
        await redis_client.append_turn(
            session_id,
            {"role": "assistant", "text": follow_up_q or complete_msg},
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
    target_date: str | None = None,
    user: dict = Depends(verify_clerk_token),
):
    slot_limit = max(3, min(limit, 100))
    normalized_window = preferred_window.strip().lower()
    if normalized_window not in {"any", "morning", "afternoon"}:
        normalized_window = "any"

    parsed_date: datetime | None = None
    if target_date:
        try:
            parsed_date = datetime.fromisoformat(target_date.replace('Z', '+00:00'))
        except ValueError:
            pass

    slots = await booking_engine.get_available_slots(
        specialty,
        urgency,
        hospital_id,
        limit=slot_limit,
        preferred_window=normalized_window,
        target_date=parsed_date,
    )

    expanded_from_hospital_filter = False
    if hospital_id and auto_expand:
        # If the primary hospital is busy or has few slots, always try to bring in variety
        # regardless of whether we hit the initial 'limit'
        extra_slots = await booking_engine.get_available_slots(
            specialty,
            urgency,
            None,
            limit=24, # Fetch a larger pool for variety
            preferred_window=normalized_window,
            target_date=parsed_date,
        )
        seen = {(s.get("doctor_id"), s.get("hospital_id"), s.get("scheduled_at")) for s in slots}
        added_count = 0
        for slot in extra_slots:
            key = (slot.get("doctor_id"), slot.get("hospital_id"), slot.get("scheduled_at"))
            if key in seen:
                continue
            slots.append(slot)
            seen.add(key)
            added_count += 1
            # Allow up to 20 slots total when showing multiple hospitals
            if len(slots) >= 20:
                break
        expanded_from_hospital_filter = added_count > 0
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
            hospital_id=body.hospital_id,
            scheduled_at_iso=body.scheduled_at,
            urgency=body.urgency,
            complaint=body.complaint,
            recommended_specialist=body.recommended_specialist,
            patient_profile_id=user.get("sub"),
            duration_minutes=body.duration_minutes,
        )

        # ── Room assignment ──────────────────────────────────────────────────
        # Convert scheduled_at to MYT (UTC+8) and check working hours 08:00-17:00
        room_label: str | None = None
        try:
            from datetime import timedelta
            MYT_OFFSET = timedelta(hours=8)
            scheduled_utc = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
            if scheduled_utc.tzinfo is None:
                scheduled_utc = scheduled_utc.replace(tzinfo=timezone.utc)
            scheduled_myt = scheduled_utc.astimezone(timezone(MYT_OFFSET))
            hour_myt = scheduled_myt.hour
            is_working_hours = 8 <= hour_myt < 17

            if is_working_hours and body.provider_id:
                async with AsyncSessionLocal() as db:
                    # Look up the doctor's department
                    doctor_res = await db.execute(
                        select(Doctor).where(Doctor.id == uuid.UUID(body.provider_id))
                    )
                    doctor = doctor_res.scalar_one_or_none()

                    if doctor and doctor.department_id:
                        # Find appointment id just created (latest for this patient/session)
                        appt_res = await db.execute(
                            text(
                                "SELECT id FROM appointments "
                                "WHERE session_id = :sid "
                                "ORDER BY created_at DESC LIMIT 1"
                            ),
                            {"sid": body.session_id},
                        )
                        appt_row = appt_res.first()

                        # Get room with lowest usage in the department
                        room_res = await db.execute(
                            select(Room)
                            .where(Room.department_id == doctor.department_id)
                            .order_by(Room.usage_minutes.asc())
                            .limit(1)
                        )
                        room = room_res.scalar_one_or_none()

                        if room and appt_row:
                            appt_id = appt_row[0]
                            # Assign room and increment usage
                            await db.execute(
                                text(
                                    "UPDATE appointments SET room_id = :rid WHERE id = :aid"
                                ),
                                {"rid": str(room.id), "aid": str(appt_id)},
                            )
                            new_usage = (room.usage_minutes or 0) + (body.duration_minutes or 30)
                            await db.execute(
                                text(
                                    "UPDATE rooms SET usage_minutes = :um WHERE id = :rid"
                                ),
                                {"um": new_usage, "rid": str(room.id)},
                            )
                            await db.commit()
                            room_label = room.label
                            print(f"DEBUG: Assigned room '{room_label}' to appointment {appt_id}")
        except Exception as room_err:
            print(f"DEBUG: Room assignment failed (non-fatal): {room_err}")
        # ────────────────────────────────────────────────────────────────────

        latency = int((time.time() - t0) * 1000)
        await _audit(body.session_id, "/appointments/book", body.complaint, latency, 200)
        return {"status": "confirmed", "fhir_resource": fhir, "room_label": room_label}
    except ValueError as exc:
        latency = int((time.time() - t0) * 1000)
        await _audit(body.session_id, "/appointments/book", body.complaint, latency, 409, str(exc))
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        latency = int((time.time() - t0) * 1000)
        await _audit(body.session_id, "/appointments/book", body.complaint, latency, 500, str(exc))
        raise HTTPException(status_code=500, detail=str(exc))



@router.get("/appointments/my")
async def my_appointments(user: dict = Depends(verify_clerk_token)):
    """Return current/upcoming/history appointments for the signed-in patient."""
    clerk_id = user.get("sub") if isinstance(user, dict) else str(user)
    now = datetime.now(timezone.utc)

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
            select(Appointment, Hospital.name)
            .join(Hospital, Appointment.hospital_id == Hospital.id)
            .where(Appointment.patient_id == patient_id)
            .order_by(Appointment.scheduled_at.desc())
        )
        appointment_rows = appt_res.all()

        async def enrich(appt: Appointment, hosp_name: str):
            people_before = 0
            if appt.doctor_id:
                queue_res = await db.execute(
                    select(func.count(Appointment.id)).where(
                        and_(
                            Appointment.doctor_id == appt.doctor_id,
                            Appointment.status == APPOINTMENT_STATUS_SCHEDULED,
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
                            Appointment.status == APPOINTMENT_STATUS_SCHEDULED,
                            Appointment.scheduled_at < appt.scheduled_at,
                        )
                    )
                )
                people_before = int(queue_res.scalar() or 0)

            appt_at = appt.scheduled_at
            if appt_at.tzinfo is None:
                appt_at = appt_at.replace(tzinfo=timezone.utc)

            wait_from_time = max(0, int((appt_at - now).total_seconds() // 60))
            live_wait_minutes = wait_from_time + (people_before * int(appt.duration_minutes or 30))

            # Fetch room label if assigned
            room_label: str | None = None
            if appt.room_id:
                room_res = await db.execute(
                    select(Room).where(Room.id == appt.room_id)
                )
                room = room_res.scalar_one_or_none()
                if room:
                    room_label = room.label

            return {
                "id": str(appt.id),
                "session_id": str(appt.session_id),
                "scheduled_at": appt.scheduled_at.isoformat(),
                "duration_minutes": appt.duration_minutes,
                "urgency": appt.urgency_level,
                "status": appt.status,
                "chief_complaint": appt.chief_complaint,
                "doctor_id": str(appt.doctor_id) if appt.doctor_id else None,
                "room_label": room_label,
                "people_before": people_before,
                "live_wait_minutes": live_wait_minutes,
                "hospital_name": hosp_name,
            }

        upcoming_raw = [r for r in appointment_rows if r[0].scheduled_at.replace(tzinfo=timezone.utc if r[0].scheduled_at.tzinfo is None else r[0].scheduled_at.tzinfo) >= now and r[0].status == APPOINTMENT_STATUS_SCHEDULED]
        history_raw = [r for r in appointment_rows if r[0].scheduled_at.replace(tzinfo=timezone.utc if r[0].scheduled_at.tzinfo is None else r[0].scheduled_at.tzinfo) < now or r[0].status != APPOINTMENT_STATUS_SCHEDULED]

        current = None
        if upcoming_raw:
            nearest = sorted(upcoming_raw, key=lambda r: r[0].scheduled_at)[0]
            current = await enrich(nearest[0], nearest[1])

        upcoming = [await enrich(r[0], r[1]) for r in sorted(upcoming_raw, key=lambda x: x[0].scheduled_at)]
        history = [await enrich(r[0], r[1]) for r in history_raw]

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
    # Return all candidates sorted by distance (nearby first)
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


@router.get("/api/departments/all")
async def get_all_departments():
    """Fetch all unique department names across all hospitals."""
    hospitals = await supabase_rest.query_table("hospitals", {
        "select": "departments(name)",
        "is_active": "eq.true"
    })
    
    if not hospitals:
        return {"departments": []}
    
    unique_names = set()
    for h in hospitals:
        depts = h.get("departments", []) or [] # Ensure it is iterable
        for d in depts:
            name = d.get("name")
            if name:
                unique_names.add(name)
                
    return {"departments": sorted(list(unique_names))}



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
