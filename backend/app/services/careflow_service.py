import uuid
from datetime import datetime, timezone
from sqlalchemy import select, update, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import (
    Hospital, Department, Doctor, Room, Session as TriageSession, Patient, Appointment,
    APPOINTMENT_STATUS_SCHEDULED
)
from app.utils.supabase_client import supabase_rest
from typing import Optional

IN_ROOM_STATUSES = frozenset({"In Consult", "In Resus"})

class CareFlowService:
    @staticmethod
    async def get_triage_overview(db: AsyncSession, hospital_id: uuid.UUID):
        """Fetch all patients currently in triage for a specific hospital via optimized REST joins."""
        # Query Sessions with Patient, Doctor and Department info joined in one call
        sessions = await supabase_rest.query_table("sessions", {
            "hospital_id": f"eq.{hospital_id}",
            "status": "neq.signed",
            "select": "*,patients(*),doctors(full_name),departments(name)",
            "order": "created_at.desc"
        })
        if not sessions:
            sessions = []

        patient_list = []
        critical_count = 0

        for s in sessions:
            p_info = s.get("patients", {})
            # Supabase join returns either a list or a dict depending on relationship type
            p = p_info[0] if isinstance(p_info, list) and p_info else p_info
            if not p:
                continue

            level = 1 if s.get("urgency_level") == "P1" else 2 if s.get("urgency_level") == "P2" else 3
            if level == 1:
                critical_count += 1

            doc_info = s.get("doctors")
            if isinstance(doc_info, list) and doc_info:
                doc_name = doc_info[0].get("full_name", "Unassigned")
            elif isinstance(doc_info, dict):
                doc_name = doc_info.get("full_name", "Unassigned")
            else:
                doc_name = "Unassigned"

            dept_info = s.get("departments")
            if isinstance(dept_info, list) and dept_info:
                dept_name = dept_info[0].get("name", "Triage Queue")
            elif isinstance(dept_info, dict):
                dept_name = dept_info.get("name", "Triage Queue")
            else:
                dept_name = "Triage Queue"

            created_at = s.get("created_at", "")
            time_str = "00:00"
            if created_at:
                try:
                    time_str = datetime.fromisoformat(created_at.replace("Z", "+00:00")).strftime("%H:%M")
                except Exception:
                    pass

            triage_res = s.get("triage_result", {}) or {}

            patient_list.append({
                "id": str(s["id"]),
                "time": time_str,
                "level": level,
                "initials": "".join([n[0] for n in p.get("full_name", "??").split() if n]),
                "name": p.get("full_name", "Unknown"),
                "details": f"{p.get('phone', '')} • MRN: {str(p.get('id', ''))[:4].upper()}",
                "complaint": triage_res.get("summary", "No summary"),
                "diagnosis": triage_res.get("preliminary_diagnosis", "Pending"),
                "department": dept_name,
                "assigned_doctor": doc_name,
                "ai_reasoning": triage_res.get("reasoning", "Awaiting AI analysis..."),
                "status": s.get("status"),
                "status_color": "danger" if level == 1 else "warning" if level == 2 else "neutral"
            })

        return {
            "critical": critical_count,
            "queue_active": len(patient_list),
            "avg_wait": "15m",
            "patients": patient_list
        }

    @staticmethod
    async def build_capacity_board(db: AsyncSession, hospital_id: uuid.UUID):
        """Build a hierarchical view of hospital capacity via optimized REST joins."""
        # Fetch all departments with their rooms embedded
        depts_with_rooms = await supabase_rest.query_table("departments", {
            "hospital_id": f"eq.{hospital_id}",
            "select": "*,rooms(*)"
        })
        if not depts_with_rooms:
            return {"departments": [], "catalog": {"departments": [], "doctors": []}}

        # Fetch all doctors for the hospital once
        all_docs = await supabase_rest.query_table("doctors", {
            "hospital_id": f"eq.{hospital_id}",
            "select": "*"
        })
        all_docs = all_docs or []
        doc_map = {doc["id"]: doc for doc in all_docs}

        # Fetch all active sessions with patient info joined (avoids N+1)
        all_sessions = await supabase_rest.query_table("sessions", {
            "hospital_id": f"eq.{hospital_id}",
            "status": "neq.signed",
            "select": "*,patients(full_name)"
        })

        # Fetch all future appointments for these rooms
        appt_counts = {}
        now_utc = datetime.now(timezone.utc)
        
        appt_res = await db.execute(
            select(Appointment.room_id, func.count(Appointment.id))
            .where(
                Appointment.hospital_id == hospital_id,
                Appointment.scheduled_at >= now_utc,
                Appointment.status == APPOINTMENT_STATUS_SCHEDULED,
                Appointment.room_id.is_not(None)
            )
            .group_by(Appointment.room_id)
        )
        for rid, count in appt_res:
            appt_counts[rid] = count

        # Group sessions by doctor_id for O(1) lookup
        doctor_sessions: dict = {}
        if all_sessions:
            for s in all_sessions:
                did = s.get("doctor_id")
                if did:
                    doctor_sessions.setdefault(did, []).append(s)

        out_depts = []
        for dept in depts_with_rooms:
            rooms_out = []
            for r in dept.get("rooms", []):
                doc = doc_map.get(r.get("doctor_id"))
                doc_name = doc["full_name"] if doc else None

                in_consult = []
                queue = []
                for sess in doctor_sessions.get(r.get("doctor_id"), []):
                    p_info = sess.get("patients", {})
                    if isinstance(p_info, list) and p_info:
                        p_name = p_info[0].get("full_name", "Unknown")
                    elif isinstance(p_info, dict):
                        p_name = p_info.get("full_name", "Unknown")
                    else:
                        p_name = "Unknown"

                    p_data = {
                        "id": str(sess["id"]),
                        "name": p_name,
                        "status": sess.get("status"),
                        "level": 1 if sess.get("urgency_level") == "P1" else 2
                    }
                    if sess.get("status") in IN_ROOM_STATUSES:
                        in_consult.append(p_data)
                    else:
                        queue.append(p_data)

                if not r.get("doctor_id"):
                    state = "unstaffed"
                elif in_consult:
                    state = "occupied"
                elif queue:
                    state = "queued"
                else:
                    state = "ready"

                rooms_out.append({
                    "id": str(r["id"]),
                    "label": r.get("label"),
                    "doctor_id": str(r["doctor_id"]) if r.get("doctor_id") else None,
                    "doctor_name": doc_name,
                    "state": state,
                    "usage_minutes": r.get("usage_minutes") or 0,
                    "appointment_count": appt_counts.get(uuid.UUID(str(r["id"])), 0),
                    "in_consult": in_consult,
                    "queue": queue
                })

            dept_docs_count = sum(1 for doc in all_docs if doc.get("department_id") == dept["id"])
            out_depts.append({
                "id": str(dept["id"]),
                "name": dept.get("name"),
                "metrics": {
                    "rooms_total": len(rooms_out),
                    "rooms_occupied": sum(1 for ro in rooms_out if ro["state"] == "occupied"),
                    "rooms_with_queue": sum(1 for ro in rooms_out if ro["state"] == "queued"),
                    "rooms_ready": sum(1 for ro in rooms_out if ro["state"] == "ready"),
                    "rooms_staffed": sum(1 for ro in rooms_out if ro["doctor_id"]),
                    "doctors_total": dept_docs_count,
                    "doctors_in_consult": sum(1 for ro in rooms_out if ro["in_consult"]),
                    "total_appointment_usage": sum(ro["usage_minutes"] for ro in rooms_out)
                },
                "rooms": rooms_out
            })

        # Build doctor catalog from already-fetched data (no extra queries)
        catalog_docs = []
        for doc in all_docs:
            dept_info = next(
                (dept for dept in depts_with_rooms if dept["id"] == doc.get("department_id")),
                None
            )
            catalog_docs.append({
                "name": doc["full_name"],
                "department": dept_info["name"] if dept_info else "Unknown"
            })

        return {
            "departments": out_depts,
            "catalog": {
                "departments": [{"id": str(dept["id"]), "name": dept["name"]} for dept in depts_with_rooms],
                "doctors": [{"id": str(doc["id"]), "name": doc["full_name"]} for doc in all_docs]
            }
        }

    @staticmethod
    async def override_patient(db: AsyncSession, session_id: uuid.UUID, data: dict):
        """Update a specific triage session."""
        update_data = {}
        if "level" in data: update_data["urgency_level"] = f"P{data['level']}"
        if "department_id" in data: update_data["department_id"] = data["department_id"]
        if "doctor_id" in data: update_data["doctor_id"] = data["doctor_id"]
        if "status" in data: update_data["status"] = data["status"]

        if update_data:
            stmt = update(TriageSession).where(TriageSession.id == session_id).values(**update_data)
            await db.execute(stmt)
            await db.commit()
            return True
        return False

    @staticmethod
    async def add_department(db: AsyncSession, hospital_id: uuid.UUID, name: str, specialty_code: str = ""):
        dept = Department(hospital_id=hospital_id, name=name, specialty_code=specialty_code)
        db.add(dept)
        await db.commit()
        await db.refresh(dept)
        return dept

    @staticmethod
    async def add_doctor(db: AsyncSession, hospital_id: uuid.UUID, department_id: uuid.UUID, name: str, room_id: Optional[uuid.UUID] = None):
        doc = Doctor(hospital_id=hospital_id, department_id=department_id, full_name=name)
        db.add(doc)
        await db.flush()  # get doc.id without committing

        if room_id:
            # Assign doctor to room in same transaction
            await db.execute(
                update(Room)
                .where(Room.id == room_id)
                .values(doctor_id=doc.id)
            )

        await db.commit()
        await db.refresh(doc)
        return doc

    @staticmethod
    async def assign_doctor_to_room(db: AsyncSession, room_id: uuid.UUID, doctor_id: Optional[uuid.UUID]):
        """Assign or unassign a doctor from a room."""
        await db.execute(
            update(Room)
            .where(Room.id == room_id)
            .values(doctor_id=doctor_id)
        )
        await db.commit()
        return True

    @staticmethod
    async def add_room(db: AsyncSession, dept_id: uuid.UUID, label: str):
        room = Room(department_id=dept_id, label=label)
        db.add(room)
        await db.commit()
        await db.refresh(room)
        return room

    @staticmethod
    async def simulate_patient(db: AsyncSession, hospital_id: uuid.UUID, name: str, complaint: str, level: int):
        """Simulate a new patient arrival and register them in the persistent queue."""
        ic_suffix = uuid.uuid4().hex[:6].upper()
        patient = Patient(
            full_name=name,
            ic_number=f"SIM-{ic_suffix}",
            phone="+1 555-0199",
            email=f"{name.lower().replace(' ', '.')}@example.com"
        )
        db.add(patient)
        await db.flush()

        session = TriageSession(
            hospital_id=hospital_id,
            patient_id=patient.id,
            urgency_level=f"P{level}",
            status="Wait Triage",
            triage_result={
                "summary": complaint,
                "preliminary_diagnosis": "Evaluating...",
                "reasoning": "Simulated entry via dashboard."
            }
        )
        db.add(session)
        await db.commit()
        return session

    @staticmethod
    async def set_active_encounter(db: AsyncSession, hospital_id: uuid.UUID, session_id: uuid.UUID):
        """Mark a patient as 'In Consult'."""
        res = await db.execute(select(TriageSession).where(TriageSession.id == session_id))
        sess = res.scalar_one_or_none()
        if not sess: return False

        if sess.doctor_id:
            await db.execute(
                update(TriageSession)
                .where(TriageSession.doctor_id == sess.doctor_id, TriageSession.status.in_(IN_ROOM_STATUSES))
                .values(status="Waiting for Doctor")
            )

        sess.status = "In Consult"
        await db.commit()
        return True

    @staticmethod
    async def sign_note(db: AsyncSession, session_id: uuid.UUID, clinical_note: str):
        """Sign off an encounter and move it to history."""
        stmt = update(TriageSession).where(TriageSession.id == session_id).values(
            status="signed",
            triage_result=TriageSession.triage_result.concat({"clinical_note": clinical_note})
        )
        await db.execute(stmt)
        await db.commit()
        return True
