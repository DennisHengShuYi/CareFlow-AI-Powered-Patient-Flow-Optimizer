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
from app.models.db import AsyncSessionLocal, AuditLog, IntakeLog, Session as SessionModel, Profile, Doctor, Room, Hospital, Department, Appointment, Patient, APPOINTMENT_STATUS_SCHEDULED
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
        print(f"DEBUG: [Voice] Transcription successful: {result.content[:100]}...")
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
        print("DEBUG: [Doc] Extraction successful: Content extracted")
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
                "select": "id, full_name, age, category, status, insurers, medical_cases(*)",
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
                        "created_at": c.get("created_at")
                    } 
                    for c in (p.get("medical_cases") or [])
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
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
 
# ─────────────────────────────────────────────
#  GET /api/patients/{patient_id}/cases
#  Single patient detail with cases
# ─────────────────────────────────────────────
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
 
#  Get own cases
async def get_current_patient_id(user: dict = Depends(verify_clerk_token)):
    clerk_id = user.get("sub")

    res = await supabase_rest.query_table(
        "patients",
        {
            "profile_id": f"eq.{clerk_id}",
            "select": "id",
            "limit": 1
        }
    )

    if not res:
        raise HTTPException(404, "Patient not found")

    return res[0]["id"]

async def get_current_staff_id(user: dict = Depends(verify_clerk_token)):
    clerk_id = user.get("sub")

    res = await supabase_rest.query_table(
        "doctors",
        {
            "profile_id": f"eq.{clerk_id}",
            "select": "id",
            "limit": 1
        }
    )

    if not res:
        raise HTTPException(404, "Staff not found")

    return res[0]["id"]
    
@router.get("/api/my/cases")
async def get_my_cases(user=Depends(verify_clerk_token)):
    clerk_id = user.get("sub")
    try:
        print(f"[MY_CASES] Fetching cases for patient {clerk_id}")

        select_query = (
            "id,full_name,age,category,status,insurers,"
            "medical_cases!patient_id("
            "*, "
            "gl!gl_id(status,file_url, total_amount, rejection_reason), "
            "claims!claims_id(status,file_url, total_amount, rejection_reason)"
            ")"
        )

        response = await supabase_rest.query_table(
            "patients", {
                # "select": """id, full_name, age, category, status, insurers,
                #             medical_cases!patient_id(
                #                 *,
                #                 gl:gl!gl_id(status, file_url),
                #                 claims:claims!claims_id(status, file_url)
                #             )
                #             """,
                # "select": "*", "patient_id": f"eq.{p.get('id')}",
                # "select": """id, full_name, age, category, status, insurers,
                #             medical_cases(*)""",
                "select": select_query,
                "profile_id": f"eq.{clerk_id}"
            }
        )
        print("[DEBUG] clerk_id:", clerk_id)
        print("[DEBUG] raw response:", response)

        if not response:
            raise HTTPException(status_code=404, detail="Patient not found")

        p = response[0]
        diagnoses = [c["title"] for c in p.get("medical_cases", [])]

        return {
            "cases": [
                {
                    "id": c.get("id"),
                    "title": c.get("title"),
                    "department": c.get("department"),
                    "status": c.get("status"),
                    "workflow_status": c.get("workflow_status"),
                    "created_at": c.get("created_at"),
                    "insurers": p.get("insurers"),

                    "gl": c.get("gl"),
                    "claim": c.get("claims"),
                }
                for c in p.get("medical_cases", [])
            ],
            "age": p.get("age"),
            "diagnoses": diagnoses,
            "insurers": p.get("insurers"),

        }

    except Exception as e:
        print(f"[MY_CASES] ERROR: {e}")
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
                "select": "id, full_name, age, category, status, insurers, medical_cases(*)",
                "status": "eq.archived",
                "order": "created_at.desc"
            }
        )

        patients = []
        for p in response:
            cases = [
                {
                    "id": c.get("id"),
                    "title": c.get("title"),
                    "department": c.get("department"),
                    "status": c.get("status"),
                    "workflow_status": c.get("workflow_status"),
                    "rejection_reason": c.get("rejection_reason"),
                    "created_at": c.get("created_at")
                }
                for c in (p.get("medical_cases") or [])
            ]

            patients.append({
                "id": p.get("id"),
                "full_name": p.get("full_name"),
                "age": p.get("age"),
                "category": p.get("category"),
                "insurers": p.get("insurers") or [],
                "diagnoses": [c["title"] for c in cases],
                "cases": cases
            })

        print(f"[PATIENTS] Archived success. Count = {len(patients)}")

        return {
            "success": True,
            "count": len(patients),
            "data": patients
        }

    except Exception as e:
        print(f"[PATIENTS] ARCHIVED ERROR: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": str(e)}
        )
        
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
                    doctors:doctor_id (
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
 
VALID_STATUS = {"none", "requested", "approved", "rejected"}


def validate_status(status: str):
    s = status.lower().strip()
    if s not in VALID_STATUS:
        raise HTTPException(status_code=400, detail="Invalid status")
    return s

# @router.patch("/cases/{case_id}/gl-status")
# async def update_gl_status(case_id: str, status: str = Query(...)):
#     status = validate_status(status)

#     res = supabase.table("medical_cases") \
#         .update({"gl_status": status}) \
#         .eq("id", case_id) \
#         .execute()

#     if not res.data:
#         raise HTTPException(status_code=404, detail="Case not found")

#     return {"success": True, "gl_status": status}

# @router.patch("/cases/{case_id}/claim-status")
# async def update_claim_status(case_id: str, status: str = Query(...)):
#     status = validate_status(status)

#     res = supabase.table("medical_cases") \
#         .update({"claim_status": status}) \
#         .eq("id", case_id) \
#         .execute()

#     if not res.data:
#         raise HTTPException(status_code=404, detail="Case not found")

#     return {"success": True, "claim_status": status}

@router.patch("/cases/{case_id}/status")
async def update_status(case_id: str, type: str, status: str):
    status = validate_status(status)

    if type not in ["gl", "claim"]:
        raise HTTPException(400, "Invalid type")

    # 1. Get related IDs
    case_res = await supabase_rest.query_table(
        "medical_cases",
        {
            "select": "gl_id, claims_id",
            "id": f"eq.{case_id}"
        }
    )

    if not case_res:
        raise HTTPException(404, "Case not found")

    case = case_res[0]
    gl_id = case.get("gl_id")
    claims_id = case.get("claims_id")

    # 2. Update correct table
    if type == "gl":
        if gl_id:
            await supabase_rest.update_table(
                "gl",
                {"status": status},
                {"id": f"eq.{gl_id}"}
            )

        else:
            create = await supabase_rest.update_table(
                "gl",
                {
                    "case_id": case_id,
                    "status": status
                },
                None,
                method="POST"
            )

            new_gl_id = create[0]["id"]

            await supabase_rest.update_table(
                "medical_cases",
                {"gl_id": new_gl_id},
                {"id": f"eq.{case_id}"}
            )

@router.delete("/cases/{case_id}/status")
async def withdraw_gl(case_id: str, patient_id: str = Depends(get_current_patient_id)):
    # 1. get GL id
    res = await supabase_rest.query_table(
        "medical_cases",
        {
            "select": "gl_id",
            "id": f"eq.{case_id}",
            "patient_id": f"eq.{patient_id}"
        }
    )

    if not res or not res[0].get("gl_id"):
        return {"message": "No GL record to withdraw"}

    gl_id = res[0]["gl_id"]

    # 2. unlink from medical_cases
    await supabase_rest.update_table(
        "medical_cases",
        {"gl_id": None},
        {"id": f"eq.{case_id}"}
    )

    # 3. delete GL row
    await supabase_rest.delete_table(
        "gl",
        {"id": f"eq.{gl_id}"}
    )

    return {"status": "none", "message": "GL record withdrawn successfully"}

# ---------------------------------------------------------------------------
# GET /me/role  — returns the current user's role from profiles table
# ---------------------------------------------------------------------------
@router.get("/me/role")
async def get_my_role(user: dict = Depends(verify_clerk_token)):
    clerk_id = user.get("sub")
 
    res = await supabase_rest.query_table(
        "profiles",
        {
            "select": "role",
            "id": f"eq.{clerk_id}"   # profiles.id = Clerk sub
        }
    )
 
    if not res:
        raise HTTPException(404, "Profile not found")
 
    return {"role": res[0].get("role")}
 
 
# ---------------------------------------------------------------------------
# PATCH /cases/{case_id}/reject  — hospital staff rejects GL or Claim
# Sets status=rejected and writes rejection_reason
# ---------------------------------------------------------------------------
@router.patch("/cases/{case_id}/reject")
async def reject_status(
    case_id: str,
    type: str,
    reason: str,
    user: dict = Depends(verify_clerk_token),
):
    if type not in ["gl", "claim"]:
        raise HTTPException(400, "Invalid type. Must be 'gl' or 'claim'")
 
    # 1. Get FK ids from medical_cases
    case_res = await supabase_rest.query_table(
        "medical_cases",
        {
            "select": "gl_id,claims_id",
            "id": f"eq.{case_id}"
        }
    )
 
    if not case_res:
        raise HTTPException(404, "Case not found")
 
    case = case_res[0]
 
    if type == "gl":
        record_id = case.get("gl_id")
        if not record_id:
            raise HTTPException(404, "No GL record found for this case")
 
        await supabase_rest.update_table(
            "gl",
            {"status": "rejected", "rejection_reason": reason},
            {"id": f"eq.{record_id}"}
        )
        return {"status": "rejected", "message": "GL rejected"}
 
    else:  # claim
        record_id = case.get("claims_id")
        if not record_id:
            raise HTTPException(404, "No Claim record found for this case")
 
        await supabase_rest.update_table(
            "claims",
            {"status": "rejected", "rejection_reason": reason},
            {"id": f"eq.{record_id}"}
        )
        return {"status": "rejected", "message": "Claim rejected"}