"""
Appointment booking engine.
Maps P1-P4 urgency to booking windows, queries providers, and
serialises confirmed appointments as FHIR R4 resources.
"""
import json
import uuid
import re
from datetime import datetime, timedelta, time as clock_time
from typing import Optional, Literal
from datetime import timezone

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

_APP_TZ = timezone(timedelta(hours=8))


class BookingEngine:
    _DEFAULT_OPEN_TIME = clock_time(9, 0)
    _DEFAULT_CLOSE_TIME = clock_time(17, 0)
    _DEFAULT_OPEN_WEEKDAYS = {0, 1, 2, 3, 4, 5}

    @staticmethod
    def _norm(text: str | None) -> str:
        if not text:
            return ""
        return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()

    @staticmethod
    def _parse_time_value(raw_value: object) -> clock_time | None:
        if raw_value is None:
            return None
        if isinstance(raw_value, clock_time):
            return raw_value.replace(tzinfo=None)
        if isinstance(raw_value, datetime):
            return raw_value.time().replace(tzinfo=None)
        if isinstance(raw_value, str):
            text_value = raw_value.strip()
            if not text_value:
                return None
            if len(text_value) <= 5 and ":" in text_value:
                text_value = f"{text_value}:00" if text_value.count(":") == 1 else text_value
            try:
                return datetime.fromisoformat(f"2000-01-01T{text_value}").time()
            except ValueError:
                return None
        return None

    @staticmethod
    def _parse_days_value(raw_value: object) -> set[int] | None:
        if raw_value is None:
            return None

        day_lookup = {
            "mon": 0,
            "monday": 0,
            "tue": 1,
            "tues": 1,
            "tuesday": 1,
            "wed": 2,
            "wednesday": 2,
            "thu": 3,
            "thur": 3,
            "thurs": 3,
            "thursday": 3,
            "fri": 4,
            "friday": 4,
            "sat": 5,
            "saturday": 5,
            "sun": 6,
            "sunday": 6,
        }

        values: list[object]
        if isinstance(raw_value, str):
            text_value = raw_value.strip()
            if not text_value:
                return None
            try:
                parsed = json.loads(text_value)
                values = parsed if isinstance(parsed, list) else [parsed]
            except json.JSONDecodeError:
                values = [part.strip() for part in text_value.split(",") if part.strip()]
        elif isinstance(raw_value, (list, tuple, set)):
            values = list(raw_value)
        else:
            values = [raw_value]

        days: set[int] = set()
        for item in values:
            if isinstance(item, int):
                if 0 <= item <= 6:
                    days.add(item)
                elif 1 <= item <= 7:
                    days.add(item - 1 if item < 7 else 6)
                continue
            if isinstance(item, str):
                normalized = item.strip().lower()
                if not normalized:
                    continue
                if normalized.isdigit():
                    number = int(normalized)
                    if 0 <= number <= 6:
                        days.add(number)
                    elif 1 <= number <= 7:
                        days.add(number - 1 if number < 7 else 6)
                    continue
                if normalized in day_lookup:
                    days.add(day_lookup[normalized])

        return days or None

    @staticmethod
    def _round_up_to_interval(value: datetime, interval_minutes: int = 30) -> datetime:
        remainder = value.minute % interval_minutes
        if remainder == 0 and value.second == 0 and value.microsecond == 0:
            return value.replace(second=0, microsecond=0)

        delta_minutes = interval_minutes - remainder
        rounded = value + timedelta(minutes=delta_minutes)
        return rounded.replace(second=0, microsecond=0)

    @staticmethod
    def _to_app_tz(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=_APP_TZ)
        return value.astimezone(_APP_TZ)

    async def _get_hospital_operating_window(
        self,
        session,
        hospital_id: uuid.UUID,
    ) -> tuple[clock_time, clock_time, set[int]]:
        columns_result = await session.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'hospitals'
                """
            )
        )
        hospital_columns = {row[0] for row in columns_result}

        candidate_columns = ["open_time", "opening_time", "start_time", "close_time", "closing_time", "end_time", "operating_hours", "operating_days", "business_days"]
        selected_columns = ["id"] + [column for column in candidate_columns if column in hospital_columns]

        if len(selected_columns) == 1:
            return self._DEFAULT_OPEN_TIME, self._DEFAULT_CLOSE_TIME, self._DEFAULT_OPEN_WEEKDAYS

        hospital_result = await session.execute(
            text(f"SELECT {', '.join(selected_columns)} FROM hospitals WHERE id = :hid LIMIT 1"),
            {"hid": hospital_id},
        )
        row = hospital_result.mappings().first()
        if not row:
            return self._DEFAULT_OPEN_TIME, self._DEFAULT_CLOSE_TIME, self._DEFAULT_OPEN_WEEKDAYS

        operating_hours = row.get("operating_hours")
        open_value = row.get("open_time") or row.get("opening_time") or row.get("start_time")
        close_value = row.get("close_time") or row.get("closing_time") or row.get("end_time")
        days_value = row.get("operating_days") or row.get("business_days")

        if isinstance(operating_hours, str):
            try:
                operating_hours = json.loads(operating_hours)
            except json.JSONDecodeError:
                operating_hours = None

        if isinstance(operating_hours, dict):
            open_value = open_value or operating_hours.get("open") or operating_hours.get("start")
            close_value = close_value or operating_hours.get("close") or operating_hours.get("end")
            days_value = days_value or operating_hours.get("days")

        open_time = self._parse_time_value(open_value) or self._DEFAULT_OPEN_TIME
        close_time = self._parse_time_value(close_value) or self._DEFAULT_CLOSE_TIME
        open_days = self._parse_days_value(days_value) or self._DEFAULT_OPEN_WEEKDAYS

        if close_time <= open_time:
            close_time = self._DEFAULT_CLOSE_TIME

        return open_time, close_time, open_days

    @staticmethod
    def _advance_into_open_hours(
        candidate: datetime,
        open_time: clock_time,
        close_time: clock_time,
        open_days: set[int],
        interval_minutes: int = 30,
    ) -> datetime:
        while True:
            if candidate.weekday() not in open_days:
                next_day = candidate.date() + timedelta(days=1)
                candidate = datetime.combine(next_day, open_time, tzinfo=candidate.tzinfo)
                candidate = BookingEngine._round_up_to_interval(candidate, interval_minutes)
                continue

            day_open = datetime.combine(candidate.date(), open_time, tzinfo=candidate.tzinfo)
            day_close = datetime.combine(candidate.date(), close_time, tzinfo=candidate.tzinfo)

            if candidate < day_open:
                candidate = BookingEngine._round_up_to_interval(day_open, interval_minutes)
                continue

            if candidate > day_close:
                next_day = candidate.date() + timedelta(days=1)
                candidate = datetime.combine(next_day, open_time, tzinfo=candidate.tzinfo)
                candidate = BookingEngine._round_up_to_interval(candidate, interval_minutes)
                continue

            return candidate

    @staticmethod
    def _hospital_cutoff(
        now: datetime,
        close_time: clock_time,
        days_window: int,
    ) -> datetime:
        target_date = now.date() + timedelta(days=max(days_window, 0))
        cutoff = datetime.combine(target_date, close_time, tzinfo=now.tzinfo)
        return max(cutoff, now)

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

        columns_result = await session.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'sessions'
                """
            )
        )
        session_columns = {row[0] for row in columns_result}

        field_values = {
            "id": session_id,
            "patient_id": patient_id,
            "urgency_level": urgency,
            "status": "active",
            "follow_up_count": 0,
            "conversation_history": json.dumps([]),
            "intake_channel": "text",
        }

        insert_columns: list[str] = []
        insert_values: list[str] = []
        parameters: dict[str, object] = {}
        for column_name, value in field_values.items():
            if column_name not in session_columns:
                continue
            insert_columns.append(column_name)
            if column_name == "conversation_history":
                insert_values.append("CAST(:conversation_history AS jsonb)")
            else:
                insert_values.append(f":{column_name}")
            parameters[column_name] = value

        await session.execute(
            text(
                f"""
                INSERT INTO sessions ({', '.join(insert_columns)})
                VALUES ({', '.join(insert_values)})
                """
            ),
            parameters,
        )

    async def get_available_slots(
        self,
        specialty: str,
        urgency: str,
        hospital_id: str | None = None,
        limit: int = 12,
        preferred_window: Literal["any", "morning", "afternoon"] = "any",
    ) -> list[dict]:
        """
        Return available slots for providers matching the specialty.
        Slots are computed from provider.slot_templates JSONB against existing
        appointments rows to detect conflicts.
        """
        max_slots = max(3, min(limit, 24))
        days_window = _URGENCY_DAYS.get(urgency, 7)
        now = datetime.now(_APP_TZ)

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
            hospital_schedule_cache: dict[str, tuple[clock_time, clock_time, set[int]]] = {}

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

                schedule_key = str(hosp.id)
                if schedule_key not in hospital_schedule_cache:
                    hospital_schedule_cache[schedule_key] = await self._get_hospital_operating_window(session, hosp.id)
                open_time, close_time, open_days = hospital_schedule_cache[schedule_key]
                hospital_cutoff = self._hospital_cutoff(now, close_time, days_window)

                if wait_minutes is not None:
                    # Temporary hardcoded primary-care wait-time mode.
                    candidate = now + timedelta(minutes=wait_minutes)
                    candidate = self._round_up_to_interval(candidate, 30)
                    candidate = self._advance_into_open_hours(candidate, open_time, close_time, open_days, 30)
                    while candidate <= hospital_cutoff and len(slots) < max_slots:
                        est_wait = max(0, int((candidate - now).total_seconds() // 60))
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
                            "service_mode": "wait_time",
                            "estimated_wait_minutes": est_wait,
                        })
                        candidate = candidate + timedelta(minutes=30)
                        candidate = self._advance_into_open_hours(candidate, open_time, close_time, open_days, 30)
                    if len(slots) >= max_slots:
                        break
                    continue

                if specialist_priorities is not None:
                    # Temporary hardcoded specialist priority mode.
                    priority = specialist_priorities[min(len(slots), len(specialist_priorities) - 1)]
                    priority_offset = 0 if priority == "CRITICAL" else 10 if priority == "URGENT" else 25
                    candidate = now + timedelta(minutes=urgency_base + priority_offset)
                    candidate = self._round_up_to_interval(candidate, 30)
                    candidate = self._advance_into_open_hours(candidate, open_time, close_time, open_days, 30)
                    while candidate <= hospital_cutoff and len(slots) < max_slots:
                        est_wait = max(0, int((candidate - now).total_seconds() // 60))
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
                            "estimated_wait_minutes": est_wait,
                        })
                        candidate = candidate + timedelta(minutes=30)
                        candidate = self._advance_into_open_hours(candidate, open_time, close_time, open_days, 30)
                    if len(slots) >= max_slots:
                        break
                    continue

                # Default templates since Doctor table is simpler
                duration: int = 30
                interval_minutes: int = 30

                # Fetch existing booked appointment times for this doctor
                booked_stmt = select(Appointment.scheduled_at).where(
                    and_(
                        Appointment.doctor_id == doc.id,
                        Appointment.status == "booked",
                        Appointment.scheduled_at >= now,
                        Appointment.scheduled_at <= hospital_cutoff,
                    )
                )
                booked_result = await session.execute(booked_stmt)
                booked_times = {self._to_app_tz(row[0]).replace(second=0, microsecond=0) for row in booked_result}

                # Iterate candidate slot times in 30-minute blocks inside the hospital operating window.
                cursor = datetime.combine(now.date(), open_time, tzinfo=_APP_TZ)
                cursor = self._round_up_to_interval(max(cursor, now), interval_minutes)
                while cursor <= hospital_cutoff and len(slots) < max_slots:
                    candidate = self._advance_into_open_hours(cursor, open_time, close_time, open_days, interval_minutes)
                    if candidate > hospital_cutoff:
                        break
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
                    cursor = candidate + timedelta(minutes=interval_minutes)

                if len(slots) >= max_slots:
                    break

            if not slots and (wait_minutes is not None or specialist_priorities is not None):
                hosp_stmt = select(Hospital).where(Hospital.is_active.is_(True)).limit(3)
                if hospital_id:
                    hosp_stmt = hosp_stmt.where(Hospital.id == uuid.UUID(hospital_id))
                hosp_rows = await session.execute(hosp_stmt)
                hospitals = hosp_rows.scalars().all()

                for idx, hosp in enumerate(hospitals):
                    schedule_key = str(hosp.id)
                    if schedule_key not in hospital_schedule_cache:
                        hospital_schedule_cache[schedule_key] = await self._get_hospital_operating_window(session, hosp.id)
                    open_time, close_time, open_days = hospital_schedule_cache[schedule_key]
                    hospital_cutoff = self._hospital_cutoff(now, close_time, days_window)

                    if wait_minutes is not None:
                        candidate = now + timedelta(minutes=wait_minutes + idx * 30)
                        candidate = self._round_up_to_interval(candidate, 30)
                        candidate = self._advance_into_open_hours(candidate, open_time, close_time, open_days, 30)
                        if candidate > hospital_cutoff:
                            continue
                        est = max(0, int((candidate - now).total_seconds() // 60))
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
                            "service_mode": "wait_time",
                            "estimated_wait_minutes": est,
                            "booking_mode": "department_queue",
                        })
                    else:
                        priority = specialist_priorities[min(idx, len(specialist_priorities) - 1)]
                        priority_offset = 0 if priority == "CRITICAL" else 10 if priority == "URGENT" else 25
                        candidate = now + timedelta(minutes=urgency_base + priority_offset + idx * 30)
                        candidate = self._round_up_to_interval(candidate, 30)
                        candidate = self._advance_into_open_hours(candidate, open_time, close_time, open_days, 30)
                        if candidate > hospital_cutoff:
                            continue
                        est = max(0, int((candidate - now).total_seconds() // 60))
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

                    if len(slots) >= max_slots:
                        break

        def _to_datetime(iso_value: str) -> datetime:
            value = datetime.fromisoformat(iso_value)
            return self._to_app_tz(value)

        def _in_window(slot_dt: datetime) -> bool:
            if preferred_window == "morning":
                return slot_dt.hour < 12
            if preferred_window == "afternoon":
                return slot_dt.hour >= 12
            return True

        ordered = sorted(slots, key=lambda item: _to_datetime(item["scheduled_at"]))
        filtered = [item for item in ordered if _in_window(_to_datetime(item["scheduled_at"]))]

        return filtered[:max_slots]

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
        scheduled_at = self._to_app_tz(scheduled_at)

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
