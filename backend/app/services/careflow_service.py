import uuid
from datetime import datetime
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import Hospital, Department, Doctor, Room, Session as TriageSession, Patient
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
            metadata = p.get("metadata_data", {}) or {}

            patient_list.append({
                "id": str(s["id"]),
                "patient_id": str(p.get("id", "")),
                "time": time_str,
                "level": level,
                "initials": "".join([n[0] for n in p.get("full_name", "??").split() if n]),
                "name": p.get("full_name", "Unknown"),
                "details": f"{p.get('phone', '')} • MRN: {str(p.get('id', ''))[:4].upper()}",
                "complaint": metadata.get("complaint") or triage_res.get("summary", "No summary"),
                "diagnosis": triage_res.get("preliminary_diagnosis", "Pending"),
                "department": dept_name,
                "assigned_doctor": doc_name,
                "ai_reasoning": triage_res.get("reasoning", "Awaiting AI analysis..."),
                "status": s.get("status"),
                "status_color": "danger" if level == 1 else "warning" if level == 2 else "neutral",
                "metadata_data": metadata,
                "email": p.get("email", ""),
                "phone": p.get("phone", ""),
                "ic_number": p.get("ic_number", "")
            })

        # Find active encounter (patient with "In Consult" status)
        active = None
        for p in patient_list:
            if p.get("status") == "In Consult":
                active = p
                break

        return {
            "critical": critical_count,
            "queue_active": len(patient_list),
            "avg_wait": "15m",
            "patients": patient_list,
            "active_encounter": active
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
                    "in_consult": in_consult,
                    "queue": queue
                })

            dept_docs_count = sum(1 for doc in all_docs if doc.get("department_id") == dept["id"])
            # Find doctors for this department and their assigned rooms
            dept_doctors = [
                {
                    "id": str(doc["id"]),
                    "full_name": doc["full_name"],
                    "room_id": next(
                        (r["id"] for r in dept.get("rooms", []) if r.get("doctor_id") == doc["id"]),
                        None
                    )
                }
                for doc in all_docs
                if doc.get("department_id") == dept["id"]
            ]
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
                    "doctors_in_consult": sum(1 for ro in rooms_out if ro["in_consult"])
                },
                "rooms": rooms_out,
                "doctors": dept_doctors 
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
        """Update a specific triage session via REST API."""
        try:
            update_data = {}
            if "level" in data: update_data["urgency_level"] = f"P{data['level']}"
            if "department_id" in data: update_data["department_id"] = data["department_id"]
            if "doctor_id" in data: update_data["doctor_id"] = data["doctor_id"]
            if "status" in data: update_data["status"] = data["status"]

            if update_data:
                result = await supabase_rest.update_table("sessions", str(session_id), update_data)
                return result is not None
            return False
        except Exception as e:
            print(f"ERROR in override_patient: {e}")
            return False

    @staticmethod
    async def add_department(db: AsyncSession, hospital_id: uuid.UUID, name: str, specialty_code: str = ""):
        """Create a new department via REST API."""
        try:
            result = await supabase_rest.insert_table("departments", {
                "hospital_id": str(hospital_id),
                "name": name,
                "specialty_code": specialty_code
            })
            if result:
                return result
            return None
        except Exception as e:
            print(f"ERROR in add_department: {e}")
            return None

    # @staticmethod
    # async def add_doctor(db: AsyncSession, hospital_id: uuid.UUID, department_id: uuid.UUID, name: str, room_id: Optional[uuid.UUID] = None):
    #     """Create a new doctor via REST API."""
    #     try:
    #         doc_result = await supabase_rest.insert_table("doctors", {
    #             "hospital_id": str(hospital_id),
    #             "department_id": str(department_id),
    #             "full_name": name
    #         })
    #         if not doc_result:
    #             return None
            
    #         # Assign to room if provided
    #         if room_id and doc_result.get("id"):
    #             await supabase_rest.update_table("rooms", str(room_id), {
    #                 "doctor_id": doc_result["id"]
    #             })
            
    #         return doc_result
    #     except Exception as e:
    #         print(f"ERROR in add_doctor: {e}")
    #         return None
    @staticmethod
    async def add_doctor(
        db: AsyncSession, 
        hospital_id: uuid.UUID, 
        department_id: uuid.UUID, 
        name: str, 
        room_id: Optional[uuid.UUID] = None,
        specialty: Optional[str] = None  # Add this parameter
    ):
        """Create a new doctor via REST API."""
        try:
            # Include specialty directly in the insert payload
            doc_result = await supabase_rest.insert_table("doctors", {
                "hospital_id": str(hospital_id),
                "department_id": str(department_id),
                "full_name": name,
                "specialty": specialty  # Now stored correctly
            })
            
            if not doc_result:
                return None
                
            # SAFETY UNWRAP: Supabase often returns a list [doc] for inserts
            doc = doc_result[0] if isinstance(doc_result, list) else doc_result
            
            # Assign to room if provided
            if room_id and doc.get("id"):
                await supabase_rest.update_table("rooms", str(room_id), {
                    "doctor_id": doc["id"]
                })
            
            return doc
        except Exception as e:
            print(f"ERROR in add_doctor: {e}")
            return None

    @staticmethod
    async def assign_doctor_to_room(db: AsyncSession, room_id: uuid.UUID, doctor_id: Optional[uuid.UUID]):
        """Assign or unassign a doctor from a room via REST API."""
        try:
            result = await supabase_rest.update_table("rooms", str(room_id), {
                "doctor_id": str(doctor_id) if doctor_id else None
            })
            return result is not None
        except Exception as e:
            print(f"ERROR in assign_doctor_to_room: {e}")
            return False

    @staticmethod
    async def add_room(db: AsyncSession, dept_id: uuid.UUID, label: str):
        """Create a new room via REST API."""
        try:
            result = await supabase_rest.insert_table("rooms", {
                "department_id": str(dept_id),
                "label": label
            })
            if result:
                return result
            return None
        except Exception as e:
            print(f"ERROR in add_room: {e}")
            return None

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

    @staticmethod
    async def register_patient(db: AsyncSession, hospital_id: uuid.UUID, name: str, ic_number: str, phone: str, email: str, complaint: str, level: int):
        """Register a new patient and add to queue via REST API."""
        try:
            # Create patient via Supabase REST API
            patient_data = {
                "full_name": name,
                "ic_number": ic_number,
                "phone": phone,
                "email": email,
                "language_preference": "en",
                "metadata_data": {"complaint": complaint, "level": level}
            }
            patient_result = await supabase_rest.insert_table("patients", patient_data)
            if not patient_result:
                raise Exception("Failed to create patient in database")
            
            # Extract patient ID from result
            patient_id = patient_result[0]["id"] if isinstance(patient_result, list) else patient_result.get("id")
            
            # Create session (add to queue) via REST API
            session_data = {
                "hospital_id": str(hospital_id),
                "patient_id": patient_id,
                "status": "waiting",
                "urgency_level": f"P{level}",
                "triage_result": {
                    "summary": complaint,
                    "urgency_level": f"P{level}",
                    "preliminary_diagnosis": "Pending evaluation"
                }
            }
            await supabase_rest.insert_table("sessions", session_data)
            
            # Return patient object with ID
            patient = type('Patient', (), {'id': patient_id, 'full_name': name})()
            return patient
        except Exception as e:
            print(f"ERROR in register_patient: {e}")
            raise

    @staticmethod
    async def search_patients(db: AsyncSession, hospital_id: uuid.UUID, query: str):
        """Search patients by name. Hospital filtering is done via Session relationship."""
        stmt = select(Patient).where(
            Patient.full_name.ilike(f"%{query}%")
        ).limit(10)
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_doctors_by_hospital(db: AsyncSession, hospital_id: uuid.UUID):
        """Get all doctors for a hospital."""
        stmt = select(Doctor).where(Doctor.hospital_id == hospital_id)
        result = await db.execute(stmt)
        return result.scalars().all()

    # @staticmethod
    # async def get_doctors_by_department(db: AsyncSession, department_id: uuid.UUID):
    #     """Get doctors for a specific department."""
    #     stmt = select(Doctor).where(Doctor.department_id == department_id)
    #     result = await db.execute(stmt)
    #     return result.scalars().all()
    
    @staticmethod
    async def get_doctors_by_department(db: AsyncSession, department_id: uuid.UUID):
        try:
            doctors = await supabase_rest.query_table(
                "doctors",
                {"department_id": str(department_id)}
            )

            for doc in doctors:
                rooms = await supabase_rest.query_table(
                    "rooms",
                    {"doctor_id": doc["id"]}
                )
                doc["room_id"] = rooms[0]["id"] if rooms else None

            return doctors

        except Exception as e:
            print(f"Error: {e}")
            return []

    @staticmethod
    async def update_patient_vitals(db: AsyncSession, patient_id: uuid.UUID, bp: str = None, hr: str = None, o2: str = None):
        """Update patient vital signs via REST API."""
        try:
            # Fetch current patient data
            patient_data = await supabase_rest.query_table("patients", {"id": f"eq.{patient_id}", "select": "*"})
            if not patient_data or len(patient_data) == 0:
                return False
            
            patient = patient_data[0]
            metadata = patient.get("metadata_data", {}) or {}
            
            # Update vitals
            if bp:
                metadata["blood_pressure"] = bp
            if hr:
                metadata["heart_rate"] = hr
            if o2:
                metadata["oxygen_saturation"] = o2
            
            # Update via REST API using PATCH
            update_data = {"metadata_data": metadata}
            result = await supabase_rest.update_table("patients", patient_id, update_data)
            return result is not None
        except Exception as e:
            print(f"ERROR in update_patient_vitals: {e}")
            return False
