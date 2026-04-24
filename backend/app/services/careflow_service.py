import uuid
from datetime import datetime
from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import Hospital, Department, Doctor, Room, Session as TriageSession, Patient
from app.utils.supabase_client import supabase_rest
from app.config.llm_provider import llm
from typing import Optional
import json

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
    async def auto_assign_patient(db: AsyncSession, session_id: uuid.UUID, hospital_id: uuid.UUID):
        """Auto-assign the best department and available doctor based on chief complaint."""
        try:
            session_records = await supabase_rest.query_table(
                "sessions",
                {
                    "id": f"eq.{session_id}",
                    "select": "*,triage_result"
                }
            )
            if not session_records:
                return None

            session_data = session_records[0]
            triage_result = session_data.get("triage_result") or {}
            complaint = triage_result.get("summary") or triage_result.get("chief_complaint") or "No chief complaint provided"
            recommended_specialist = (triage_result.get("recommended_specialist") or "").strip()

            departments = await supabase_rest.query_table(
                "departments",
                {"hospital_id": f"eq.{hospital_id}", "select": "*"}
            ) or []
            doctors = await supabase_rest.query_table(
                "doctors",
                {"hospital_id": f"eq.{hospital_id}", "select": "*"}
            ) or []
            active_sessions = await supabase_rest.query_table(
                "sessions",
                {
                    "hospital_id": f"eq.{hospital_id}",
                    "status": "neq.signed",
                    "select": "doctor_id,status"
                }
            ) or []

            busy_doctor_ids = {
                str(session.get("doctor_id"))
                for session in active_sessions
                if session.get("doctor_id") and session.get("status") in IN_ROOM_STATUSES
            }
            available_doctors = [doc for doc in doctors if str(doc.get("id")) not in busy_doctor_ids]
            if not available_doctors:
                available_doctors = doctors

            department_list = [
                {"id": str(dept["id"]), "name": dept["name"]}
                for dept in departments
            ]
            doctor_list = [
                {
                    "id": str(doc["id"]),
                    "name": doc["full_name"],
                    "department_id": str(doc["department_id"]) if doc.get("department_id") else None,
                    "specialty": doc.get("specialty") or "",
                }
                for doc in available_doctors
            ]

            if not department_list or not doctor_list:
                return None

            system = (
                "You are an expert clinical assignment assistant for a hospital triage workflow. "
                "Choose the best department and available doctor for a patient based on the chief complaint and recommended specialist. "
                "Return ONLY a JSON object with keys: department_name, doctor_name, reasoning." 
                "Do not include any additional text."
            )

            prompt = (
                f"Chief complaint: {complaint}\n"
                f"Recommended specialist: {recommended_specialist or 'Not available'}\n"
                "Departments:\n"
                + "\n".join([f"- {dept['name']}" for dept in department_list])
                + "\nAvailable doctors:\n"
                + "\n".join([
                    f"- {doc['name']} (dept: {next((d['name'] for d in department_list if d['id'] == doc['department_id']), 'Unknown')}, specialty: {doc['specialty']})"
                    for doc in doctor_list
                ])
                + "\n\nChoose the most suitable department and doctor for this patient." 
            )

            raw = await llm.generate(prompt, system, response_format="json")
            assignment = None
            if isinstance(raw, str):
                try:
                    assignment = json.loads(raw)
                except json.JSONDecodeError:
                    import re
                    match = re.search(r"\{.*\}", raw, re.S)
                    if match:
                        assignment = json.loads(match.group(0))
            elif isinstance(raw, dict):
                assignment = raw

            if not assignment:
                return None

            department_name = (assignment.get("department_name") or "").strip()
            doctor_name = (assignment.get("doctor_name") or "").strip()
            reasoning = assignment.get("reasoning") or assignment.get("reason") or ""

            def find_department(name: str):
                if not name:
                    return None
                lower_name = name.lower()
                for dept in department_list:
                    if lower_name == dept["name"].lower() or lower_name in dept["name"].lower() or dept["name"].lower() in lower_name:
                        return dept
                if recommended_specialist:
                    lower_specialist = recommended_specialist.lower()
                    for dept in department_list:
                        if lower_specialist in dept["name"].lower() or dept["name"].lower() in lower_specialist:
                            return dept
                return None

            chosen_department = find_department(department_name) or find_department(recommended_specialist) or department_list[0]

            def find_doctor(name: str, dept_id: Optional[str]):
                if name:
                    lower_name = name.lower()
                    for doc in doctor_list:
                        if lower_name == doc["name"].lower() or lower_name in doc["name"].lower() or doc["name"].lower() in lower_name:
                            return doc
                if dept_id:
                    for doc in doctor_list:
                        if doc.get("department_id") == dept_id:
                            return doc
                return doctor_list[0]

            chosen_doctor = find_doctor(doctor_name, chosen_department["id"] if chosen_department else None)

            update_data = {"status": "In Consult"}
            if chosen_department:
                update_data["department_id"] = chosen_department["id"]
            if chosen_doctor:
                update_data["doctor_id"] = chosen_doctor["id"]

            result = await supabase_rest.update_table("sessions", str(session_id), update_data)
            if not result:
                return None

            return {
                "department_name": chosen_department["name"],
                "doctor_name": chosen_doctor["name"],
                "department_id": chosen_department["id"],
                "doctor_id": chosen_doctor["id"],
                "reasoning": reasoning,
            }
        except Exception as e:
            print(f"ERROR in auto_assign_patient: {e}")
            return None

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
    async def sign_note(db: AsyncSession, session_id: uuid.UUID, clinical_note: str | None = None, soap_note: dict | None = None):
        """Sign off an encounter and move it to history."""
        try:
            session_data = await supabase_rest.query_table(
                "sessions",
                {
                    "id": f"eq.{session_id}",
                    "select": "triage_result"
                }
            )
            existing_triage = {}
            if session_data and isinstance(session_data, list) and len(session_data) > 0:
                existing_triage = session_data[0].get("triage_result") or {}

            payload = {}
            if clinical_note is not None:
                payload["clinical_note"] = clinical_note
            if soap_note:
                payload["soap_note"] = soap_note

            merged_triage = {**existing_triage, **payload}
            update_data = {
                "status": "signed",
                "triage_result": merged_triage,
            }

            result = await supabase_rest.update_table("sessions", str(session_id), update_data)
            return result is not None
        except Exception as e:
            print(f"ERROR in sign_note: {e}")
            return False

    @staticmethod
    async def generate_soap_note(db: AsyncSession, session_id: uuid.UUID, objective_note: str = ""):
        """Generate a SOAP note draft from the encounter using the configured LLM."""
        session_data = await supabase_rest.query_table(
            "sessions",
            {
                "id": f"eq.{session_id}",
                "select": "*,patients(*),doctors(full_name),departments(name)"
            }
        )
        if not session_data:
            return None

        session = session_data[0]
        patient_info = session.get("patients")
        if isinstance(patient_info, list) and patient_info:
            patient = patient_info[0]
        else:
            patient = patient_info or {}

        doctor_info = session.get("doctors")
        if isinstance(doctor_info, list) and doctor_info:
            doctor_name = doctor_info[0].get("full_name", "Unassigned")
        elif isinstance(doctor_info, dict):
            doctor_name = doctor_info.get("full_name", "Unassigned")
        else:
            doctor_name = "Unassigned"

        department_info = session.get("departments")
        if isinstance(department_info, list) and department_info:
            department_name = department_info[0].get("name", "Triage")
        elif isinstance(department_info, dict):
            department_name = department_info.get("name", "Triage")
        else:
            department_name = "Triage"

        metadata = (patient.get("metadata_data") or {})
        complaint = metadata.get("complaint") or session.get("triage_result", {}).get("summary", "No complaint provided")
        vitals = {
            "blood_pressure": metadata.get("blood_pressure", "N/A"),
            "heart_rate": metadata.get("heart_rate", "N/A"),
            "oxygen_saturation": metadata.get("oxygen_saturation", "N/A"),
        }

        prompt = (
            "You are a clinical assistant that generates professional SOAP notes for emergency triage encounters. "
            "Draft a short, focused SOAP note from the patient encounter details below. "
            "Return only a JSON object with keys: subjective, assessment, plan. "
            "Do not include any additional explanation outside the JSON object. "
            "Use precise physician-style clinical language. "
            "Ignore conversational fillers, greetings, bedside banter, and direct patient quotes unless they contain relevant clinical findings. "
            "Do not reproduce phrases like 'okay', 'hi there', 'I'm sorry', or 'please' in the final note.\n\n"
            f"Patient name: {patient.get('full_name', 'Unknown')}\n"
            f"Patient phone: {patient.get('phone', 'Unknown')}\n"
            f"Patient email: {patient.get('email', 'Unknown')}\n"
            f"Patient MRN: {patient.get('id', 'Unknown')}\n"
            f"Assigned doctor: {doctor_name}\n"
            f"Department: {department_name}\n"
            f"Urgency level: {session.get('urgency_level', 'Unknown')}\n"
            f"Status: {session.get('status', 'Unknown')}\n"
            f"Complaint: {complaint}\n"
            f"Vitals: blood pressure={vitals['blood_pressure']}, heart rate={vitals['heart_rate']}, oxygen saturation={vitals['oxygen_saturation']}\n"
            f"Objective findings: {objective_note or 'None'}\n"
            "Summarize exam findings and plan concisely."
        )

        system = (
            "You are an experienced clinical documentation assistant. "
            "Generate structured SOAP note components for the encounter using the information provided."
        )

        raw = await llm.generate(prompt, system, response_format="json")

        note = None
        if isinstance(raw, str):
            try:
                note = json.loads(raw)
            except json.JSONDecodeError:
                import re
                match = re.search(r"\{.*\}", raw, re.S)
                if match:
                    note = json.loads(match.group(0))
        elif isinstance(raw, dict):
            note = raw

        if not note:
            raise ValueError("Failed to parse SOAP note from LLM response")

        return {
            "status": "soap_generated",
            "subjective": note.get("subjective", ""),
            "assessment": note.get("assessment", ""),
            "plan": note.get("plan", ""),
        }

    # @staticmethod
    # async def register_patient(db: AsyncSession, hospital_id: uuid.UUID, name: str, ic_number: str, phone: str, email: str, complaint: str, level: int):
    #     """Register a new patient and add to queue via REST API."""
    #     try:
    #         # Create patient via Supabase REST API
    #         patient_data = {
    #             "full_name": name,
    #             "ic_number": ic_number,
    #             "phone": phone,
    #             "email": email,
    #             "language_preference": "en",
    #             "metadata_data": {"complaint": complaint, "level": level}
    #         }
    #         patient_result = await supabase_rest.insert_table("patients", patient_data)
    #         if not patient_result:
    #             raise Exception("Failed to create patient in database")
            
    #         # Extract patient ID from result
    #         patient_id = patient_result[0]["id"] if isinstance(patient_result, list) else patient_result.get("id")
            
    #         # Create session (add to queue) via REST API
    #         session_data = {
    #             "hospital_id": str(hospital_id),
    #             "patient_id": patient_id,
    #             "status": "waiting",
    #             "urgency_level": f"P{level}",
    #             "triage_result": {
    #                 "summary": complaint,
    #                 "urgency_level": f"P{level}",
    #                 "preliminary_diagnosis": "Pending evaluation"
    #             }
    #         }
    #         await supabase_rest.insert_table("sessions", session_data)
            
    #         # Return patient object with ID
    #         patient = type('Patient', (), {'id': patient_id, 'full_name': name})()
    #         return patient
    #     except Exception as e:
    #         print(f"ERROR in register_patient: {e}")
    #         raise

    @staticmethod
    async def register_patient(
        db: AsyncSession,
        hospital_id: uuid.UUID,
        name: str,
        ic_number: str,
        phone: str,
        email: str,
        complaint: str,
        level: int
    ):
        """Register or reuse patient, prevent duplicate queue, create session."""

        try:
            # ============================================
            # STEP 0: FORCE STRING (IMPORTANT)
            # ============================================
            hospital_id_str = str(hospital_id)

            # ============================================
            # STEP 1: Check if patient already exists
            # ============================================
            existing_patient = await supabase_rest.query_table(
                "patients",
                {"ic_number": f"eq.{ic_number}"}
            )

            if existing_patient:
                patient = existing_patient[0]

                raw_id = patient.get("id")

                # ✅ HANDLE weird Supabase return
                if isinstance(raw_id, dict):
                    patient_id = str(raw_id.get("id"))
                else:
                    patient_id = str(raw_id)

                print("✅ Existing patient found:", patient_id)

                # OPTIONAL: update latest info
                await supabase_rest.update_table(
                    "patients",
                    {"id": patient_id},
                    {
                        "full_name": name,
                        "phone": phone,
                        "email": email
                    }
                )

            else:
                print("🆕 Creating new patient")

                patient_data = {
                    "hospital_id": hospital_id_str,   # ✅ STRING
                    "full_name": name,
                    "ic_number": ic_number,
                    "phone": phone,
                    "email": email,
                    "language_preference": "en"
                }

                patient_result = await supabase_rest.insert_table("patients", patient_data)

                if not patient_result:
                    raise Exception("Failed to create patient in database")

                raw_id = patient_result[0]["id"]

                # ✅ ALWAYS STRING
                if isinstance(raw_id, dict):
                    patient_id = str(raw_id.get("id"))
                else:
                    patient_id = str(raw_id)

            # ============================================
            # STEP 2: Check if patient already in queue
            # ============================================
            existing_session = await supabase_rest.query_table(
                "sessions",
                {
                    "patient_id": f"eq.{patient_id}",
                    "status": "neq.signed"
                }
            )

            if existing_session:
                print("⚠️ Patient already in queue")

                return type('Patient', (), {
                    'id': patient_id,
                    'full_name': name
                })()

            # ============================================
            # STEP 3: Create NEW session
            # ============================================
            session_data = {
                "hospital_id": hospital_id_str,   # ✅ MUST BE STRING
                "patient_id": patient_id,         # ✅ MUST BE STRING
                "status": "waiting",
                "urgency_level": f"P{level}",

                # ❗ only include if column exists
                # "chief_complaint": complaint,

                # ✅ JSON SAFE
                "triage_result": {
                    "summary": complaint,
                    "urgency_level": f"P{level}",
                    "preliminary_diagnosis": "Pending evaluation"
                }
            }

            print("DEBUG SESSION DATA:", session_data)

            session_result = await supabase_rest.insert_table("sessions", session_data)

            if not session_result:
                raise Exception("Failed to create session")

            print("✅ Session created for patient:", patient_id)

            # ============================================
            # STEP 4: Return
            # ============================================
            return type('Patient', (), {
                'id': patient_id,
                'full_name': name
            })()

        except Exception as e:
            print(f"ERROR in register_patient: {e}")
            raise

    @staticmethod
    async def search_patients(db: AsyncSession, hospital_id: uuid.UUID, query: str):
        """Search patients by name via Supabase REST when available, fall back to direct DB query."""
        if supabase_rest.url and supabase_rest.key:
            try:
                query_value = f"%{query}%"
                rows = await supabase_rest.query_table(
                    "patients",
                    {
                        "full_name": f"ilike.{query_value}",
                        "select": "*",
                        "limit": 10,
                    },
                )
                if rows is None:
                    raise RuntimeError("Supabase REST returned no rows")

                patients = []
                for r in rows:
                    patient_obj = type(
                        "Patient",
                        (),
                        {
                            "id": uuid.UUID(r.get("id")) if r.get("id") else None,
                            "full_name": r.get("full_name"),
                            "ic_number": r.get("ic_number"),
                            "phone": r.get("phone"),
                            "email": r.get("email"),
                            "metadata_data": r.get("metadata_data"),
                        },
                    )
                    patients.append(patient_obj)
                return patients
            except Exception as e:
                print(f"WARN: Supabase search fallback failed: {e}")

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
