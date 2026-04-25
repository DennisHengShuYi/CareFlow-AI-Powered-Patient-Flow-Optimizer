import uuid
from datetime import datetime, timezone
from sqlalchemy import select, update, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.db import (
    Hospital, Department, Doctor, Room, Session as TriageSession, Patient, Appointment,
    APPOINTMENT_STATUS_SCHEDULED
)
from app.utils.supabase_client import supabase_rest
from app.config.llm_provider import llm
from typing import Optional
import json

IN_ROOM_STATUSES = frozenset({"In Consult", "In Resus"})

class CareFlowService:
    @staticmethod
    async def get_triage_overview(db: AsyncSession, hospital_id: uuid.UUID):
        """Fetch all patients currently in triage or scheduled for a specific hospital."""
        # 1. Fetch active sessions (walk-ins / checked-in)
        # Use aliases and explicit hints for sessions as they seem to have FKs
        sessions = await supabase_rest.query_table("sessions", {
            "hospital_id": f"eq.{hospital_id}",
            "status": "neq.signed",
            "select": "*,patient_data:patients!patient_id(*),doctor_data:doctors!doctor_id(full_name),dept_data:departments!department_id(name)",
            "order": "created_at.desc"
        })
        if not sessions: sessions = []

        # 2. Fetch upcoming appointments (scheduled)
        # We'll fetch appointments first, then patients/doctors separately because of missing FKs
        appointments = await supabase_rest.query_table("appointments", {
            "hospital_id": f"eq.{hospital_id}",
            "status": "eq.Upcoming",
            "order": "scheduled_at.asc"
        })
        if not appointments: appointments = []

        # JIT Status Update: Auto-expire appointments that are in the past
        now = datetime.now(timezone.utc)
        expired_ids = []
        active_appointments = []
        
        for a in appointments:
            sched_str = a.get("scheduled_at")
            if sched_str:
                try:
                    # Use a small grace period (e.g. 15 mins) or just straight time
                    sched_dt = datetime.fromisoformat(sched_str.replace("Z", "+00:00"))
                    if sched_dt < now:
                        expired_ids.append(str(a["id"]))
                        continue
                except: pass
            active_appointments.append(a)

        if expired_ids:
            # Perform bulk update for expired appointments
            await supabase_rest.update_table("appointments", {"status": "Past"}, {"id": f"in.({','.join(expired_ids)})"})
            print(f"DEBUG: [get_triage_overview] Auto-expired {len(expired_ids)} appointments")
        
        appointments = active_appointments

        # Fetch patients and doctors for these appointments
        appt_patient_ids = list(set(str(a["patient_id"]) for a in appointments if a.get("patient_id")))
        appt_doctor_ids = list(set(str(a["doctor_id"]) for a in appointments if a.get("doctor_id")))
        
        print(f"DEBUG: [get_triage_overview] Appt Patient IDs: {appt_patient_ids}")

        patients_map = {}
        if appt_patient_ids:
            p_res = await supabase_rest.query_table("patients", {"id": f"in.({','.join(appt_patient_ids)})"})
            print(f"DEBUG: [get_triage_overview] Patients fetched: {len(p_res or [])}")
            for p in (p_res or []): patients_map[str(p["id"])] = p

        doctors_map = {}
        if appt_doctor_ids:
            d_res = await supabase_rest.query_table("doctors", {"id": f"in.({','.join(appt_doctor_ids)})", "select": "id,full_name"})
            for d in (d_res or []): doctors_map[str(d["id"])] = d

        patient_list = []
        critical_count = 0
        active_session_ids = {str(s["id"]) for s in sessions}

        # Process Sessions
        for s in sessions:
            p_info = s.get("patient_data", {})
            p = p_info[0] if isinstance(p_info, list) and p_info else p_info
            if not p: continue

            level = 1 if s.get("urgency_level") == "P1" else 2 if s.get("urgency_level") == "P2" else 3
            if level == 1: critical_count += 1

            doc_info = s.get("doctor_data")
            doc_name = (doc_info[0] if isinstance(doc_info, list) and doc_info else doc_info or {}).get("full_name", "Unassigned")
            
            dept_info = s.get("dept_data")
            dept_name = (dept_info[0] if isinstance(dept_info, list) and dept_info else dept_info or {}).get("name", "Triage Queue")

            created_at = s.get("created_at", "")
            time_str = "00:00"
            if created_at:
                try: time_str = datetime.fromisoformat(created_at.replace("Z", "+00:00")).strftime("%H:%M")
                except: pass

            triage_res = s.get("triage_result", {}) or {}
            metadata = p.get("metadata_data", {}) or {}

            patient_list.append({
                "id": str(s["id"]),
                "patient_id": str(p.get("id", "")),
                "time": f"Arrived {time_str}",
                "level": level,
                "initials": "".join([n[0] for n in p.get("full_name", "??").split() if n]),
                "name": p.get("full_name", "Unknown"),
                "details": f"{p.get('phone', '')} • MRN: {str(p.get('id', ''))[:4].upper()}",
                "complaint": metadata.get("complaint") or triage_res.get("summary", "No summary"),
                "diagnosis": triage_res.get("preliminary_diagnosis", "Pending"),
                "department": dept_name,
                "assigned_doctor": doc_name,
                "status": s.get("status", "In Consult"),
                "is_active": True,
                "type": "walk-in",
                "triage_result": triage_res,
                "metadata_data": metadata,
                "ai_reasoning": triage_res.get("reasoning"),
                "raw_time": created_at
            })

        # Process Appointments
        for a in appointments:
            if a.get("session_id") and str(a["session_id"]) in active_session_ids:
                continue
            
            p = patients_map.get(str(a.get("patient_id")))
            if not p: continue

            level_str = a.get("urgency_level") or "P3"
            level = 1 if level_str == "P1" else 2 if level_str == "P2" else 3
            
            doc = doctors_map.get(str(a.get("doctor_id")), {})
            doc_name = doc.get("full_name", "Unassigned")

            scheduled_at = a.get("scheduled_at", "")
            time_str = "Scheduled"
            if scheduled_at:
                try: time_str = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00")).strftime("%H:%M")
                except: pass

            metadata = dict(p.get("metadata_data", {}) or {})
            metadata["complaint"] = a.get("chief_complaint")

            patient_list.append({
                "id": str(a["id"]),
                "patient_id": str(p.get("id", "")),
                "time": f"Appt {time_str}",
                "level": level,
                "initials": "".join([n[0] for n in p.get("full_name", "??").split() if n]),
                "name": p.get("full_name", "Unknown"),
                "details": f"{p.get('phone', '')} • MRN: {str(p.get('id', ''))[:4].upper()}",
                "complaint": a.get("chief_complaint") or "Scheduled Appointment",
                "diagnosis": "Scheduled",
                "department": "Scheduled",
                "assigned_doctor": doc_name,
                "status": "Awaiting Arrival",
                "is_active": False,
                "type": "appointment",
                "triage_result": a.get("triage_result") or {},
                "metadata_data": metadata,
                "ai_reasoning": (a.get("triage_result") or {}).get("reasoning"),
                "raw_time": scheduled_at
            })

        # Final sorting: Urgency first (P1 top), then Arrival/Appt time
        patient_list.sort(key=lambda x: (x["level"], x["time"]))

        # Recalculate critical_count from the final list to include appointments
        critical_count = len([p for p in patient_list if p.get("level") == 1])

        # Find active encounter
        active = next((p for p in patient_list if p.get("is_active")), None)

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
                    "doctors_in_consult": sum(1 for ro in rooms_out if ro["in_consult"]),
                    "total_appointment_usage": sum(ro["usage_minutes"] for ro in rooms_out)
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
        """Update a specific triage session or appointment via REST API."""
        try:
            # Check if it's a session
            is_session = await supabase_rest.query_table("sessions", {"id": f"eq.{session_id}", "select": "id,triage_result"})
            if is_session:
                update_data = {}
                if "level" in data: update_data["urgency_level"] = f"P{data['level']}"
                if "department_id" in data: update_data["department_id"] = data["department_id"]
                if "doctor_id" in data: update_data["doctor_id"] = data["doctor_id"]
                if "status" in data: update_data["status"] = data["status"]
                
                # Update diagnosis in triage_result if provided
                if "diagnosis" in data and data["diagnosis"]:
                    triage_res = is_session[0].get("triage_result") or {}
                    triage_res["preliminary_diagnosis"] = data["diagnosis"]
                    update_data["triage_result"] = triage_res

                if update_data:
                    result = await supabase_rest.update_table("sessions", update_data, str(session_id))
                    return result is not None
                return True

            # Check if it's an appointment
            is_appt = await supabase_rest.query_table("appointments", {"id": f"eq.{session_id}", "select": "id"})
            if is_appt:
                update_data = {}
                if "level" in data: update_data["urgency_level"] = f"P{data['level']}"
                if "department_id" in data: update_data["department_id"] = data["department_id"]
                if "doctor_id" in data: update_data["doctor_id"] = data["doctor_id"]
                # Appointments use "Scheduled", "Arrived", etc. Ignore "Awaiting Arrival" from frontend.
                if "status" in data and data["status"] != "Awaiting Arrival": 
                    update_data["status"] = data["status"]
                if "diagnosis" in data and data["diagnosis"] and data["diagnosis"] != "Scheduled":
                    update_data["chief_complaint"] = data["diagnosis"]

                if update_data:
                    result = await supabase_rest.update_table("appointments", update_data, str(session_id))
                    return result is not None
                return True

            return False
        except Exception as e:
            print(f"ERROR in override_patient: {e}")
            return False

    @staticmethod
    async def update_patient_vitals(db: AsyncSession, patient_id: uuid.UUID, vitals: dict):
        """Update a patient's vitals in their metadata_data via REST API."""
        try:
            # Get existing patient to preserve other metadata
            patient_records = await supabase_rest.query_table("patients", {"id": f"eq.{patient_id}", "select": "metadata_data"})
            if not patient_records:
                return False
                
            metadata = patient_records[0].get("metadata_data") or {}
            
            # Sanitize: ensure vitals are always stored as strings, never nested objects
            def _safe_str(v):
                if isinstance(v, dict):
                    # unwrap if accidentally a dict
                    return str(next(iter(v.values()), ""))
                return str(v) if v is not None else ""
            
            # Also flatten any existing bad data in the stored metadata before merging
            for k in ["blood_pressure", "heart_rate", "oxygen_saturation"]:
                if isinstance(metadata.get(k), dict):
                    metadata[k] = _safe_str(metadata[k])
            
            # Merge new vitals
            if "blood_pressure" in vitals: metadata["blood_pressure"] = _safe_str(vitals["blood_pressure"])
            if "heart_rate" in vitals: metadata["heart_rate"] = _safe_str(vitals["heart_rate"])
            if "oxygen_saturation" in vitals: metadata["oxygen_saturation"] = _safe_str(vitals["oxygen_saturation"])
            
            result = await supabase_rest.update_table("patients", {"metadata_data": metadata}, str(patient_id))
            return result is not None
        except Exception as e:
            print(f"ERROR in update_patient_vitals: {e}")
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
                # Check if it's an appointment
                appt_records = await supabase_rest.query_table("appointments", {"id": f"eq.{session_id}", "select": "*"})
                if appt_records:
                    # Update status to In Consult and return existing assignment
                    await supabase_rest.update_table("appointments", {"status": "In Consult"}, str(session_id))
                    a = appt_records[0]
                    dept_name = "Scheduled"
                    doc_name = "Unassigned"
                    if a.get("doctor_id"):
                        doc_res = await supabase_rest.query_table("doctors", {"id": f"eq.{a['doctor_id']}", "select": "full_name"})
                        if doc_res: doc_name = doc_res[0].get("full_name", doc_name)
                    if a.get("department_id"):
                        dept_res = await supabase_rest.query_table("departments", {"id": f"eq.{a['department_id']}", "select": "name"})
                        if dept_res: dept_name = dept_res[0].get("name", dept_name)
                    return {
                        "department_name": dept_name,
                        "doctor_name": doc_name,
                        "department_id": a.get("department_id"),
                        "doctor_id": a.get("doctor_id"),
                        "reasoning": "Pre-scheduled appointment."
                    }
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

            if not department_list:
                print("DEBUG: [auto_assign_patient] no departments found, using fallback department")
                department_list = [{"id": None, "name": "General"}]
            if not doctor_list:
                print("DEBUG: [auto_assign_patient] no doctors found, using fallback doctor")
                doctor_list = [{"id": None, "name": "Unassigned", "department_id": None, "specialty": ""}]

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
            print(f"DEBUG: [auto_assign_patient] LLM raw response: {raw}")
            assignment = None
            if isinstance(raw, str):
                try:
                    assignment = json.loads(raw)
                except json.JSONDecodeError:
                    import re
                    match = re.search(r"\{.*\}", raw, re.S)
                    if match:
                        try:
                            assignment = json.loads(match.group(0))
                        except json.JSONDecodeError:
                            assignment = None
            elif isinstance(raw, dict):
                assignment = raw

            if not assignment:
                print("DEBUG: [auto_assign_patient] LLM assignment parse failed or empty; falling back to default selection.")
                assignment = {}

            department_name = (assignment.get("department_name") or assignment.get("department") or "").strip()
            doctor_name = (assignment.get("doctor_name") or assignment.get("doctor") or "").strip()
            reasoning = assignment.get("reasoning") or assignment.get("reason") or "Fallback assignment due to missing or invalid AI response."

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
            if chosen_doctor is None and doctor_list:
                chosen_doctor = doctor_list[0]

            print(f"DEBUG: [auto_assign_patient] chosen_department={chosen_department}, chosen_doctor={chosen_doctor}, reasoning={reasoning}")

            # Room Eviction Logic
            if chosen_doctor and chosen_doctor.get("id"):
                new_doc_id = str(chosen_doctor["id"])
                # Evict from sessions
                evict_sessions = await supabase_rest.query_table(
                    "sessions",
                    {
                        "doctor_id": f"eq.{new_doc_id}",
                        "status": "eq.In Consult",
                        "id": f"neq.{session_id}",
                        "select": "id"
                    }
                )
                for s in evict_sessions:
                    print(f"DEBUG: [auto_assign_patient] Evicting session {s['id']} from doctor {new_doc_id}")
                    await supabase_rest.update_table("sessions", {"status": "Waiting for Doctor"}, str(s['id']))
                
                # Evict from appointments
                evict_appts = await supabase_rest.query_table(
                    "appointments",
                    {
                        "doctor_id": f"eq.{new_doc_id}",
                        "status": "eq.In Consult",
                        "id": f"neq.{session_id}",
                        "select": "id"
                    }
                )
                for a in evict_appts:
                    print(f"DEBUG: [auto_assign_patient] Evicting appointment {a['id']} from doctor {new_doc_id}")
                    await supabase_rest.update_table("appointments", {"status": "Waiting for Doctor"}, str(a['id']))

            update_data = {"status": "In Consult"}
            if chosen_department and chosen_department.get("id") is not None:
                update_data["department_id"] = chosen_department["id"]
            if chosen_doctor and chosen_doctor.get("id") is not None:
                update_data["doctor_id"] = chosen_doctor["id"]

            result = await supabase_rest.update_table("sessions", update_data, str(session_id))
            if not result:
                print(f"ERROR: [auto_assign_patient] supabase update failed for session {session_id} with data {update_data}")
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
                await supabase_rest.update_table("rooms", {
                    "doctor_id": doc["id"]
                }, str(room_id))
            
            return doc
        except Exception as e:
            print(f"ERROR in add_doctor: {e}")
            return None

    @staticmethod
    async def assign_doctor_to_room(db: AsyncSession, room_id: uuid.UUID, doctor_id: Optional[uuid.UUID]):
        """Assign or unassign a doctor from a room via REST API."""
        try:
            result = await supabase_rest.update_table("rooms", {
                "doctor_id": str(doctor_id) if doctor_id else None
            }, str(room_id))
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
            payload = {}
            if clinical_note is not None:
                payload["clinical_note"] = clinical_note
            if soap_note:
                payload["soap_note"] = soap_note

            # Check sessions first
            is_session = await supabase_rest.query_table("sessions", {"id": f"eq.{session_id}", "select": "id,triage_result"})
            if is_session:
                existing_triage = is_session[0].get("triage_result") or {}
                merged_triage = {**existing_triage, **payload}
                update_data = {"status": "signed", "triage_result": merged_triage}
                result = await supabase_rest.update_table("sessions", update_data, str(session_id))
                return result is not None

            # Check appointments
            is_appt = await supabase_rest.query_table("appointments", {"id": f"eq.{session_id}", "select": "id,triage_result"})
            if is_appt:
                existing_triage = is_appt[0].get("triage_result") or {}
                merged_triage = {**existing_triage, **payload}
                update_data = {"status": "signed", "triage_result": merged_triage}
                result = await supabase_rest.update_table("appointments", update_data, str(session_id))
                return result is not None

            return False
        except Exception as e:
            print(f"ERROR in sign_note: {e}")
            return False

    @staticmethod
    async def generate_soap_note(db: AsyncSession, session_id: uuid.UUID, objective_note: str = ""):
        """Generate a SOAP note draft from the encounter using the configured LLM."""
        # Check sessions first
        session_data = await supabase_rest.query_table("sessions", {"id": f"eq.{session_id}"})
        is_appt = False
        if not session_data:
            # Check appointments
            session_data = await supabase_rest.query_table("appointments", {"id": f"eq.{session_id}"})
            is_appt = True
            if not session_data:
                return None

        session = session_data[0]
        
        # Fetch Patient separately
        patient = {}
        patient_id = session.get("patient_id")
        if patient_id:
            patient_res = await supabase_rest.query_table("patients", {"id": f"eq.{patient_id}"})
            if patient_res: patient = patient_res[0]

        # Fetch Doctor separately
        doctor_name = "Unassigned"
        doctor_id = session.get("doctor_id")
        doctor = {}
        if doctor_id:
            doc_res = await supabase_rest.query_table("doctors", {"id": f"eq.{doctor_id}"})
            if doc_res: 
                doctor = doc_res[0]
                doctor_name = doctor.get("full_name", "Unassigned")

        # Fetch Department separately
        department_name = "Triage"
        dept_id = session.get("department_id")
        if not dept_id and doctor:
            dept_id = doctor.get("department_id")
        
        if dept_id:
            dept_res = await supabase_rest.query_table("departments", {"id": f"eq.{dept_id}"})
            if dept_res: department_name = dept_res[0].get("name", "Triage")

        metadata = (patient.get("metadata_data") or {})
        
        # Try to find the complaint in various places
        complaint = metadata.get("complaint")
        if not complaint:
            # Check triage_result (walk-ins)
            triage_res = session.get("triage_result", {}) or {}
            complaint = triage_res.get("summary")
        if not complaint:
            # Check chief_complaint (appointments)
            complaint = session.get("chief_complaint")
        
        if not complaint:
            complaint = "No complaint provided"

        vitals = {
            "blood_pressure": metadata.get("blood_pressure", "N/A"),
            "heart_rate": metadata.get("heart_rate", "N/A"),
            "oxygen_saturation": metadata.get("oxygen_saturation", "N/A"),
        }

        prompt = (
            "You are a clinical assistant that generates professional SOAP notes for emergency triage encounters. "
            "Draft a short, focused SOAP note from the patient encounter details below. "
            "Return only a JSON object with keys: subjective, objective, assessment, plan. "
            "Do not include any additional explanation outside the JSON object. "
            "Use precise physician-style clinical language. "
            "Ignore conversational fillers, greetings, bedside banter, and direct patient quotes unless they contain relevant clinical findings. "
            "When the intake note contains repeated words or non-clinical noise, extract the meaningful history and discard the noise. "
            "If the note is patient-reported history or symptoms, place it under subjective. "
            "If it is exam findings, place it under objective. "
            "If no objective findings are present, set objective to 'No objective findings documented.'\n\n"
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
            f"Clinical notes: {objective_note or 'None'}\n"
            "Use the clinical notes to complete subjective and objective sections appropriately."
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
            "objective": note.get("objective", ""),
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
                    {
                        "full_name": name,
                        "phone": phone,
                        "email": email
                    },
                    patient_id
                )

            else:
                print("🆕 Creating new patient")

                # Supabase patients table does not expose hospital_id in this schema.
                # The patient is linked to a hospital via the session record instead.
                patient_data = {
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
                    "hospital_id": f"eq.{hospital_id}",
                    "status": "neq.signed"
                }
            )

            if existing_session:
                print("⚠️ Patient already in queue")
                return {
                    "status": "exists",
                    "patient_id": patient_id,
                    "name": name
                }

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
            return {
                "status": "success",
                "patient_id": patient_id,
                "name": name
            }

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
            result = await supabase_rest.update_table("patients", update_data, patient_id)
            return result is not None
        except Exception as e:
            print(f"ERROR in update_patient_vitals: {e}")
            return False
