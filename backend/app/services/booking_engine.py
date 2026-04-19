"""
Appointment booking engine.
Maps P1-P4 urgency to booking windows, queries providers, and
serialises confirmed appointments as FHIR R4 resources.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, and_

from app.models.db import AsyncSessionLocal, Appointment, Doctor, Hospital

# ---------------------------------------------------------------------------
# Urgency → max days ahead
# ---------------------------------------------------------------------------
_URGENCY_DAYS: dict[str, int] = {
    "P1": 0,   # same-day
    "P2": 1,   # within 24 h
    "P3": 3,
    "P4": 7,
}


class BookingEngine:

    async def get_available_slots(
        self, specialty: str, urgency: str
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
                select(Doctor, Hospital)
                .join(Hospital, Doctor.hospital_id == Hospital.id)
                .where(
                    and_(
                        Hospital.is_active.is_(True),
                        Doctor.specialty.ilike(f"%{specialty}%"),
                    )
                )
                .limit(10)
            )
            result = await session.execute(stmt)
            rows = result.all() # list of (Doctor, Hospital) tuples

            for doc, hosp in rows:
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
                                    "clinic_name": hosp.name,
                                    "clinic_address": hosp.address or "Contact Hospital",
                                    "scheduled_at": candidate.isoformat(),
                                    "duration_minutes": duration,
                                    "urgency": urgency,
                                })
                            if len(slots) >= 3:
                                break
                    cursor += timedelta(days=1)

                if len(slots) >= 3:
                    break

        return slots[:3]

    def _build_fhir_appointment(
        self,
        appointment_id: str,
        patient_id: str,
        provider_id: str,
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
                        "reference": f"Practitioner/{provider_id}",
                        "display": "Doctor",
                    },
                    "status": "accepted",
                },
            ],
        }

    async def confirm_booking(
        self,
        session_id: str,
        patient_id: str,
        provider_id: str,
        scheduled_at_iso: str,
        urgency: str,
        complaint: str,
        duration_minutes: int = 30,
    ) -> dict:
        """Write appointment to DB and return the FHIR R4 resource."""
        appt_id = uuid.uuid4()
        scheduled_at = datetime.fromisoformat(scheduled_at_iso)
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

        fhir = self._build_fhir_appointment(
            str(appt_id), patient_id, provider_id,
            scheduled_at, duration_minutes, urgency, complaint,
        )

        async with AsyncSessionLocal() as session:
            appt = Appointment(
                id=appt_id,
                session_id=uuid.UUID(session_id),
                patient_id=uuid.UUID(patient_id),
                doctor_id=uuid.UUID(provider_id),
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
