"""
Appointment booking engine.
Maps P1-P4 urgency to booking windows, queries providers, and
serialises confirmed appointments as FHIR R4 resources.
"""
import uuid
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, and_, text

from app.models.db import AsyncSessionLocal, Appointment, Doctor, Hospital, Department, Profile

# ---------------------------------------------------------------------------
# Urgency → max days ahead
# ---------------------------------------------------------------------------
_URGENCY_DAYS: dict[str, int] = {
    "P1": 0,   # same-day
    "P2": 1,   # within 24 h
    "P3": 3,
    "P4": 7,
}

# ---------------------------------------------------------------------------
# Hardcoded appointment policy (temporary)
# ---------------------------------------------------------------------------
_PRIMARY_CARE_WAIT_MINUTES: dict[str, int] = {
    "outpatient": 35,
    "maternal child health": 20,
    "dental": 45,
    "chronic disease": 30,
    "mental health": 15,
    "women s health": 25,
    "immunisation": 10,
    "pharmacy": 15,
}

_SPECIALIST_PRIORITY: dict[str, list[str]] = {
    "emergency trauma": ["CRITICAL", "URGENT"],
    "general medicine": ["URGENT", "MODERATE"],
    "cardiology": ["URGENT", "MODERATE"],
    "neurology": ["URGENT", "MODERATE"],
    "gastroenterology": ["MODERATE"],
    "respiratory medicine": ["URGENT", "MODERATE"],
    "endocrinology diabetes": ["MODERATE"],
    "nephrology renal": ["URGENT", "MODERATE"],
    "infectious disease": ["URGENT", "MODERATE"],
    "haematology": ["MODERATE"],
    "rheumatology": ["MODERATE"],
    "geriatrics": ["URGENT", "MODERATE"],
    "general surgery": ["URGENT", "MODERATE"],
    "orthopaedics": ["URGENT", "MODERATE"],
    "urology": ["MODERATE"],
    "cardiothoracic surgery": ["URGENT"],
    "neurosurgery": ["URGENT"],
    "plastic reconstructive": ["MODERATE"],
    "obstetrics gynaecology": ["URGENT", "MODERATE"],
    "paediatrics": ["URGENT", "MODERATE"],
    "ophthalmology": ["MODERATE"],
    "ent": ["MODERATE"],
    "dermatology": ["MODERATE"],
    "psychiatry": ["MODERATE"],
    "oncology": ["MODERATE"],
    "rehabilitation medicine": ["MODERATE"],
    "oral maxillofacial surgery": ["MODERATE"],
}

_SPECIALIST_ALIASES: dict[str, str] = {
    "a e": "emergency trauma",
    "emergency": "emergency trauma",
    "emergency department": "emergency trauma",
    "kardiologi": "cardiology",
    "neurologi": "neurology",
    "ipr": "respiratory medicine",
    "diabetes": "endocrinology diabetes",
    "renal": "nephrology renal",
    "ortopedik": "orthopaedics",
    "o g": "obstetrics gynaecology",
    "pediatrics": "paediatrics",
    "mata": "ophthalmology",
    "telinga hidung tekak": "ent",
    "kulit": "dermatology",
    "psikiatri": "psychiatry",
    "onkologi": "oncology",
    "farmasi": "pharmacy",
    "vaksinasi": "immunisation",
    "pesakit luar": "outpatient",
    "k i a": "maternal child health",
    "pergigian": "dental",
}

_URGENCY_BASE_MINUTES: dict[str, int] = {
    "P1": 10,
    "P2": 25,
    "P3": 45,
    "P4": 70,
}


class BookingEngine:

    @staticmethod
    def _norm(text: str | None) -> str:
        if not text:
            return ""
        return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()

    @classmethod
    def _matches_specialty(
        cls,
        required_specialty: str | None,
        doctor_specialty: str | None,
        department_name: str | None,
        department_code: str | None,
    ) -> bool:
        """Best-effort matcher across doctor specialty and department metadata."""
        req = cls._norm(required_specialty)
        if not req:
            return True

        candidates = [
            cls._norm(doctor_specialty),
            cls._norm(department_name),
            cls._norm(department_code),
        ]
        return any(c and (req in c or c in req) for c in candidates)

    @classmethod
    def _canonical_department(cls, raw: str | None) -> str:
        value = cls._norm(raw)
        if not value:
            return ""

        if value in _SPECIALIST_ALIASES:
            return _SPECIALIST_ALIASES[value]

        for key in _PRIMARY_CARE_WAIT_MINUTES:
            if value in key or key in value:
                return key

        for key in _SPECIALIST_PRIORITY:
            if value in key or key in value:
                return key

        return value

    async def _resolve_patient_id(
        self,
        session,
        patient_id: str | None,
        patient_profile_id: str | None,
    ) -> uuid.UUID:
        """Resolve patient UUID from explicit ID or create/get by Clerk profile ID."""
        if patient_id:
            return uuid.UUID(patient_id)

        if not patient_profile_id:
            raise ValueError("Missing patient_id. Sign in as a patient or provide patient_id explicitly.")

        existing = await session.execute(
            text("SELECT id FROM patients WHERE profile_id = :pid LIMIT 1"),
            {"pid": patient_profile_id},
        )
        row = existing.first()
        if row and row[0]:
            return row[0]

        profile_row = await session.execute(
            select(Profile).where(Profile.id == patient_profile_id).limit(1)
        )
        profile = profile_row.scalar_one_or_none()
        full_name = (
            (profile.full_name if profile else None)
            or f"Patient {patient_profile_id[:6]}"
        )

        new_id = uuid.uuid4()
        await session.execute(
            text(
                """
                INSERT INTO patients (id, profile_id, full_name, ic_number, phone, email, language_preference, metadata_data)
                VALUES (:id, :profile_id, :full_name, :ic_number, :phone, :email, :language_preference, :metadata_data)
                """
            ),
            {
                "id": new_id,
                "profile_id": patient_profile_id,
                "full_name": full_name,
                "ic_number": f"AUTO-{uuid.uuid4().hex[:10].upper()}",
                "phone": "N/A",
                "email": None,
                "language_preference": "en",
                "metadata_data": None,
            },
        )
        return new_id

    async def _ensure_session_exists(
        self,
        session,
        session_id: uuid.UUID,
        patient_id: uuid.UUID,
        urgency: str,
    ) -> None:
        """Create a minimal sessions row when the given session_id is missing."""
        existing = await session.execute(
            text("SELECT id FROM sessions WHERE id = :sid LIMIT 1"),
            {"sid": session_id},
        )
        if existing.first():
            return

        await session.execute(
            text(
                """
                INSERT INTO sessions (id, patient_id, urgency_level, status, intake_channel, follow_up_count, conversation_history)
                VALUES (:id, :patient_id, :urgency_level, :status, :intake_channel, :follow_up_count, :conversation_history::jsonb)
                """
            ),
            {
                "id": session_id,
                "patient_id": patient_id,
                "urgency_level": urgency,
                "status": "active",
                "intake_channel": "text",
                "follow_up_count": 0,
                "conversation_history": "[]",
            },
        )

    async def get_available_slots(
        self,
        specialty: str,
        urgency: str,
        hospital_id: str | None = None,
    ) -> list[dict]:
        """
        Return top-3 available slots for providers matching the specialty.
        Slots are computed from provider.slot_templates JSONB against existing
        appointments rows to detect conflicts.
        """
        days_window = _URGENCY_DAYS.get(urgency, 7)
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=days_window)

        slots: list[dict] = []

        async with AsyncSessionLocal() as session:
            # Join Doctor with Hospital to get clinic info
            stmt = (
                select(Doctor, Hospital, Department)
                .join(Hospital, Doctor.hospital_id == Hospital.id)
                .join(Department, Doctor.department_id == Department.id)
                .where(
                    Hospital.is_active.is_(True),
                )
                .limit(50)
            )
            if hospital_id:
                stmt = stmt.where(Hospital.id == uuid.UUID(hospital_id))
            result = await session.execute(stmt)
            rows = result.all() # list of (Doctor, Hospital, Department) tuples

            canonical_specialty = self._canonical_department(specialty)
            wait_minutes = _PRIMARY_CARE_WAIT_MINUTES.get(canonical_specialty)
            specialist_priorities = _SPECIALIST_PRIORITY.get(canonical_specialty)
            urgency_base = _URGENCY_BASE_MINUTES.get(urgency, 60)

            for doc, hosp, dept in rows:
                if not self._matches_specialty(
                    specialty,
                    doc.specialty,
                    dept.name,
                    dept.specialty_code,
                ):
                    continue

                if wait_minutes is not None:
                    # Temporary hardcoded primary-care wait-time mode.
                    candidate = now + timedelta(minutes=wait_minutes + len(slots) * 5)
                    slots.append({
                        "doctor_id": str(doc.id),
                        "hospital_id": str(hosp.id),
                        "clinic_name": hosp.name,
                        "clinic_address": hosp.address or "Contact Hospital",
                        "department_name": dept.name,
                        "scheduled_at": candidate.isoformat(),
                        "duration_minutes": 20,
                        "urgency": urgency,
                        "specialty_match": True,
                        "service_mode": "wait_time",
                        "estimated_wait_minutes": wait_minutes,
                    })
                    if len(slots) >= 3:
                        break
                    continue

                if specialist_priorities is not None:
                    # Temporary hardcoded specialist priority mode.
                    priority = specialist_priorities[min(len(slots), len(specialist_priorities) - 1)]
                    priority_offset = 0 if priority == "CRITICAL" else 10 if priority == "URGENT" else 25
                    candidate = now + timedelta(minutes=urgency_base + priority_offset + len(slots) * 10)
                    slots.append({
                        "doctor_id": str(doc.id),
                        "hospital_id": str(hosp.id),
                        "clinic_name": hosp.name,
                        "clinic_address": hosp.address or "Contact Hospital",
                        "department_name": dept.name,
                        "scheduled_at": candidate.isoformat(),
                        "duration_minutes": 30,
                        "urgency": urgency,
                        "specialty_match": True,
                        "service_mode": "priority",
                        "estimated_wait_minutes": urgency_base + priority_offset,
                    })
                    if len(slots) >= 3:
                        break
                    continue

                # Default templates since Doctor table is simpler
                start_hour: int = 9
                end_hour: int = 17
                duration: int = 30
                weekdays: list[int] = [1, 2, 3, 4, 5]

                # Fetch existing booked appointment times for this doctor
                booked_stmt = select(Appointment.scheduled_at).where(
                    and_(
                        Appointment.doctor_id == doc.id,
                        Appointment.status == "booked",
                        Appointment.scheduled_at >= now,
                        Appointment.scheduled_at <= cutoff,
                    )
                )
                booked_result = await session.execute(booked_stmt)
                booked_times = {row[0].replace(tzinfo=timezone.utc) for row in booked_result}

                # Iterate candidate slot times
                cursor = now.replace(minute=0, second=0, microsecond=0)
                while cursor <= cutoff and len(slots) < 3:
                    if cursor.weekday() + 1 in weekdays:
                        for hour in range(start_hour, end_hour):
                            candidate = cursor.replace(hour=hour, minute=0)
                            if candidate > now and candidate not in booked_times:
                                slots.append({
                                    "doctor_id": str(doc.id),
                                    "hospital_id": str(hosp.id),
                                    "clinic_name": hosp.name,
                                    "clinic_address": hosp.address or "Contact Hospital",
                                    "department_name": dept.name,
                                    "scheduled_at": candidate.isoformat(),
                                    "duration_minutes": duration,
                                    "urgency": urgency,
                                    "specialty_match": True,
                                    "service_mode": "standard",
                                    "estimated_wait_minutes": None,
                                })
                            if len(slots) >= 3:
                                break
                    cursor += timedelta(days=1)

                if len(slots) >= 3:
                    break

            if not slots and (wait_minutes is not None or specialist_priorities is not None):
                hosp_stmt = select(Hospital).where(Hospital.is_active.is_(True)).limit(3)
                if hospital_id:
                    hosp_stmt = hosp_stmt.where(Hospital.id == uuid.UUID(hospital_id))
                hosp_rows = await session.execute(hosp_stmt)
                hospitals = hosp_rows.scalars().all()

                for idx, hosp in enumerate(hospitals):
                    if wait_minutes is not None:
                        est = wait_minutes + idx * 5
                        candidate = now + timedelta(minutes=est)
                        slots.append({
                            "doctor_id": "",
                            "hospital_id": str(hosp.id),
                            "clinic_name": hosp.name,
                            "clinic_address": hosp.address or "Contact Hospital",
                            "department_name": specialty,
                            "scheduled_at": candidate.isoformat(),
                            "duration_minutes": 20,
                            "urgency": urgency,
                            "specialty_match": True,
                            "service_mode": "wait_time",
                            "estimated_wait_minutes": est,
                            "booking_mode": "department_queue",
                        })
                    else:
                        priority = specialist_priorities[min(idx, len(specialist_priorities) - 1)]
                        priority_offset = 0 if priority == "CRITICAL" else 10 if priority == "URGENT" else 25
                        est = urgency_base + priority_offset + idx * 5
                        candidate = now + timedelta(minutes=est)
                        slots.append({
                            "doctor_id": "",
                            "hospital_id": str(hosp.id),
                            "clinic_name": hosp.name,
                            "clinic_address": hosp.address or "Contact Hospital",
                            "department_name": specialty,
                            "scheduled_at": candidate.isoformat(),
                            "duration_minutes": 30,
                            "urgency": urgency,
                            "specialty_match": True,
                            "service_mode": "priority",
                            "estimated_wait_minutes": est,
                            "booking_mode": "department_queue",
                        })

                    if len(slots) >= 3:
                        break

        return slots[:3]

    def _build_fhir_appointment(
        self,
        appointment_id: str,
        patient_id: str,
        provider_id: str | None,
        scheduled_at: datetime,
        duration_minutes: int,
        urgency: str,
        complaint: str,
    ) -> dict:
        """Serialise as FHIR R4 Appointment resource."""
        end_at = scheduled_at + timedelta(minutes=duration_minutes)
        priority_map = {"P1": "stat", "P2": "asap", "P3": "urgent", "P4": "routine"}
        return {
            "resourceType": "Appointment",
            "id": appointment_id,
            "status": "booked",
            "priority": priority_map.get(urgency, "routine"),
            "description": complaint,
            "start": scheduled_at.isoformat(),
            "end": end_at.isoformat(),
            "minutesDuration": duration_minutes,
            "appointmentType": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/v2-0276",
                    "code": "FOLLOWUP" if urgency in ("P3", "P4") else "EMERGNT",
                    "display": "Follow-up" if urgency in ("P3", "P4") else "Emergency",
                }]
            },
            "participant": [
                {
                    "actor": {
                        "reference": f"Patient/{patient_id}",
                        "display": "Patient",
                    },
                    "status": "accepted",
                },
                {
                    "actor": {
                        "reference": f"Practitioner/{provider_id or 'UNASSIGNED'}",
                        "display": "Doctor" if provider_id else "Unassigned Doctor",
                    },
                    "status": "accepted",
                },
            ],
        }

    async def confirm_booking(
        self,
        session_id: str,
        patient_id: str | None,
        provider_id: str | None,
        scheduled_at_iso: str,
        urgency: str,
        complaint: str,
        recommended_specialist: str | None = None,
        patient_profile_id: str | None = None,
        duration_minutes: int = 30,
    ) -> dict:
        """Write appointment to DB and return the FHIR R4 resource."""
        appt_id = uuid.uuid4()
        scheduled_at = datetime.fromisoformat(scheduled_at_iso)
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

        async with AsyncSessionLocal() as session:
            session_uuid = uuid.UUID(session_id)
            patient_uuid = await self._resolve_patient_id(session, patient_id, patient_profile_id)
            await self._ensure_session_exists(session, session_uuid, patient_uuid, urgency)

            provider_clean = (provider_id or "").strip()
            doctor_uuid: uuid.UUID | None = None
            if provider_clean:
                doctor_lookup = await session.execute(
                    select(Doctor, Department)
                    .join(Department, Doctor.department_id == Department.id)
                    .where(Doctor.id == uuid.UUID(provider_clean))
                )
                doctor_row = doctor_lookup.first()
                if not doctor_row:
                    raise ValueError("Selected provider does not exist.")
                doctor, dept = doctor_row

                if recommended_specialist and not self._matches_specialty(
                    recommended_specialist,
                    doctor.specialty,
                    dept.name,
                    dept.specialty_code,
                ):
                    raise ValueError(
                        "Selected appointment slot does not match triage-recommended department/specialty."
                    )
                doctor_uuid = doctor.id
            elif not recommended_specialist:
                raise ValueError("Recommended specialty is required for department-queue booking.")

            fhir = self._build_fhir_appointment(
                str(appt_id), str(patient_uuid), provider_clean or None,
                scheduled_at, duration_minutes, urgency, complaint,
            )

            appt = Appointment(
                id=appt_id,
                session_id=session_uuid,
                patient_id=patient_uuid,
                doctor_id=doctor_uuid,
                scheduled_at=scheduled_at,
                duration_minutes=duration_minutes,
                appointment_type="consultation",
                urgency_level=urgency,
                status="booked",
                chief_complaint=complaint,
                fhir_resource=fhir,
                confirmation_sent_at=datetime.utcnow(),
            )
            session.add(appt)
            await session.commit()

        return fhir


booking_engine = BookingEngine()
