from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid

app = FastAPI()

IN_ROOM_STATUSES = frozenset({"In Consult", "In Resus"})

# Add CORS middleware to allow the frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mutable state for simulation
triage_state = {
    "critical": 3,
    "queue_active": 14,
    "avg_wait": "12m",
    "patients": [
        {
            "id": "1",
            "time": "10:42",
            "level": 1,
            "initials": "JR",
            "name": "J. Reyes",
            "details": "58M • MRN: 9284",
            "complaint": "Chest pain, radiating to left arm",
            "diagnosis": "Suspected STEMI",
            "department": "Cardiology",
            "assigned_doctor": "Dr. Smith",
            "ai_reasoning": "Z.ai detected 'crushing chest pain' and 'diaphoresis'. High probability of STEMI. Immediate routing to Cardiology required to meet door-to-balloon time.",
            "status": "In Resus",
            "status_color": "danger"
        },
        {
            "id": "2",
            "time": "11:05",
            "level": 2,
            "initials": "SL",
            "name": "S. Lin",
            "details": "32F • MRN: 1102",
            "complaint": "Acute abdominal pain, nausea",
            "diagnosis": "Query Acute Appendicitis",
            "department": "General Surgery",
            "assigned_doctor": "Dr. Jones",
            "ai_reasoning": "Z.ai identified acute abdominal pain with nausea as high risk for appendicitis. Routed to General Surgery for immediate evaluation.",
            "status": "Awaiting Labs",
            "status_color": "neutral"
        },
        {
            "id": "3",
            "time": "11:20",
            "level": 3,
            "initials": "MK",
            "name": "M. Kaur",
            "details": "45F • MRN: 8821",
            "complaint": "Laceration to left forearm",
            "diagnosis": "Forearm Laceration",
            "department": "Minor Injuries",
            "assigned_doctor": "Dr. Taylor",
            "ai_reasoning": "Z.ai assessed laceration as standard urgency. No systemic symptoms. Routed to Minor Injuries for suturing.",
            "status": "Room 4",
            "status_color": "neutral"
        }
    ],
    "active_encounter": {
        "id": "1",
        "initials": "JR",
        "name": "Javier Reyes",
        "details": "58 yrs • Male • DOB: 04/12/1966"
    },
    "ai_scribe": {
        "status": "Processing live audio... Note generation in progress based on initial triage vitals and complaint.",
        "subjective": "Patient presents with sudden onset chest pain starting 45 mins ago. Describes as \"crushing\" pressure, 8/10, radiating to L arm. Accompanied by diaphoresis and mild nausea. No prior history of CAD.",
        "vitals": {
            "bp": "165/95",
            "hr": "110",
            "o2": "96% RA"
        },
        "assessment_plan": ""
    }
}

# Facility layout: departments, doctors, and room staffing (capacity board + admin UI)
capacity_state = {
    "departments": [
        {"id": "d_card", "name": "Cardiology"},
        {"id": "d_surg", "name": "General Surgery"},
        {"id": "d_mi", "name": "Minor Injuries"},
        {"id": "d_peds", "name": "Department of Pediatricians"},
    ],
    "doctors": [
        {"id": "doc_smith", "name": "Dr. Smith", "department_id": "d_card"},
        {"id": "doc_jones", "name": "Dr. Jones", "department_id": "d_surg"},
        {"id": "doc_taylor", "name": "Dr. Taylor", "department_id": "d_mi"},
    ],
    "rooms": [
        {"id": "r_c1", "department_id": "d_card", "label": "Room 1", "doctor_id": "doc_smith"},
        {"id": "r_c2", "department_id": "d_card", "label": "Room 2", "doctor_id": None},
        {"id": "r_s1", "department_id": "d_surg", "label": "Room 1", "doctor_id": "doc_jones"},
        {"id": "r_mi1", "department_id": "d_mi", "label": "Room 1", "doctor_id": "doc_taylor"},
        {"id": "r_p1", "department_id": "d_peds", "label": "Room 1", "doctor_id": None},
        {"id": "r_p2", "department_id": "d_peds", "label": "Room 2", "doctor_id": None},
        {"id": "r_p3", "department_id": "d_peds", "label": "Room 3", "doctor_id": None},
    ],
}


def _dept_by_id(did: str):
    return next((d for d in capacity_state["departments"] if d["id"] == did), None)


def _doctor_by_id(doc_id: str | None):
    if not doc_id:
        return None
    return next((x for x in capacity_state["doctors"] if x["id"] == doc_id), None)


def build_capacity_board():
    """Merge triage patients into room-level occupancy and per-doctor queues."""
    patients = triage_state["patients"]
    out_depts = []
    for dept in capacity_state["departments"]:
        rooms_out = []
        for room in capacity_state["rooms"]:
            if room["department_id"] != dept["id"]:
                continue
            doc = _doctor_by_id(room.get("doctor_id"))
            doc_name = doc["name"] if doc else None
            in_room = []
            waiting = []
            if doc_name:
                for p in patients:
                    if p.get("assigned_doctor") != doc_name:
                        continue
                    if p.get("department") != dept["name"]:
                        continue
                    if p.get("status") in IN_ROOM_STATUSES:
                        in_room.append(
                            {"id": p["id"], "name": p["name"], "status": p["status"], "level": p["level"]}
                        )
                    else:
                        waiting.append(
                            {"id": p["id"], "name": p["name"], "status": p["status"], "level": p["level"]}
                        )
            has_session = len(in_room) > 0
            has_queue = len(waiting) > 0
            if not doc_name:
                room_state = "unstaffed"
            elif has_session:
                room_state = "occupied"
            elif has_queue:
                room_state = "queued"
            else:
                room_state = "ready"
            rooms_out.append(
                {
                    "id": room["id"],
                    "label": room["label"],
                    "doctor_id": room.get("doctor_id"),
                    "doctor_name": doc_name,
                    "state": room_state,
                    "in_consult": in_room,
                    "queue": waiting,
                }
            )
        total_rooms = sum(1 for r in capacity_state["rooms"] if r["department_id"] == dept["id"])
        staffed = sum(
            1 for r in capacity_state["rooms"] if r["department_id"] == dept["id"] and r.get("doctor_id")
        )
        occ_rooms = sum(1 for ro in rooms_out if ro["state"] == "occupied")
        queue_rooms = sum(1 for ro in rooms_out if ro["state"] == "queued")
        ready_rooms = sum(1 for ro in rooms_out if ro["state"] == "ready")
        doctors_in_dept = [d for d in capacity_state["doctors"] if d["department_id"] == dept["id"]]
        busy_docs = set()
        for p in patients:
            if p.get("status") not in IN_ROOM_STATUSES:
                continue
            if p.get("department") != dept["name"]:
                continue
            ad = p.get("assigned_doctor")
            if ad and ad != "Unassigned":
                busy_docs.add(ad)
        out_depts.append(
            {
                "id": dept["id"],
                "name": dept["name"],
                "metrics": {
                    "rooms_total": total_rooms,
                    "rooms_occupied": occ_rooms,
                    "rooms_with_queue": queue_rooms,
                    "rooms_ready": ready_rooms,
                    "rooms_staffed": staffed,
                    "doctors_total": len(doctors_in_dept),
                    "doctors_in_consult": len(busy_docs),
                },
                "rooms": rooms_out,
            }
        )
    return {"departments": out_depts}


@app.get("/api/capacity/catalog")
def capacity_catalog():
    """Department and doctor names for triage overrides and forms."""
    return {
        "departments": [d["name"] for d in capacity_state["departments"]],
        "doctors": [
            {
                "name": d["name"],
                "department": _dept_by_id(d["department_id"])["name"] if _dept_by_id(d["department_id"]) else "",
            }
            for d in capacity_state["doctors"]
        ],
    }


@app.get("/api/capacity/layout")
def capacity_layout():
    """Raw layout for admin screens."""
    return capacity_state


@app.get("/api/capacity/board")
def capacity_board():
    return build_capacity_board()


class NewDepartmentBody(BaseModel):
    name: str


@app.post("/api/capacity/departments")
def add_department(body: NewDepartmentBody):
    nid = "d_" + uuid.uuid4().hex[:8]
    capacity_state["departments"].append({"id": nid, "name": body.name.strip()})
    return {"id": nid, "layout": capacity_state}


class UpdateDepartmentBody(BaseModel):
    name: str


@app.put("/api/capacity/departments/{department_id}")
def update_department(department_id: str, body: UpdateDepartmentBody):
    d = _dept_by_id(department_id)
    if not d:
        raise HTTPException(status_code=404, detail="Department not found")
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name is required")
    old_name = d["name"]
    d["name"] = new_name
    if old_name != new_name:
        for p in triage_state["patients"]:
            if p.get("department") == old_name:
                p["department"] = new_name
    return {"layout": capacity_state}


@app.delete("/api/capacity/departments/{department_id}")
def delete_department(department_id: str):
    d = _dept_by_id(department_id)
    if not d:
        raise HTTPException(status_code=404, detail="Department not found")
    dept_name = d["name"]
    pc = sum(1 for p in triage_state["patients"] if p.get("department") == dept_name)
    if pc:
        raise HTTPException(
            status_code=400,
            detail=f"{pc} patient(s) still assigned to this department in triage. Reassign them first.",
        )
    capacity_state["rooms"] = [r for r in capacity_state["rooms"] if r["department_id"] != department_id]
    capacity_state["doctors"] = [x for x in capacity_state["doctors"] if x["department_id"] != department_id]
    capacity_state["departments"] = [x for x in capacity_state["departments"] if x["id"] != department_id]
    return {"layout": capacity_state}


class NewRoomBody(BaseModel):
    label: str


@app.post("/api/capacity/departments/{department_id}/rooms")
def add_room(department_id: str, body: NewRoomBody):
    if not _dept_by_id(department_id):
        return {"error": "department not found"}
    rid = "r_" + uuid.uuid4().hex[:8]
    capacity_state["rooms"].append(
        {"id": rid, "department_id": department_id, "label": body.label.strip(), "doctor_id": None}
    )
    return {"id": rid, "layout": capacity_state}


class UpdateRoomBody(BaseModel):
    label: str


@app.put("/api/capacity/rooms/{room_id}")
def update_room(room_id: str, body: UpdateRoomBody):
    room = next((r for r in capacity_state["rooms"] if r["id"] == room_id), None)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    lab = body.label.strip()
    if not lab:
        raise HTTPException(status_code=400, detail="Label is required")
    room["label"] = lab
    return {"layout": capacity_state}


@app.delete("/api/capacity/rooms/{room_id}")
def delete_room(room_id: str):
    room = next((r for r in capacity_state["rooms"] if r["id"] == room_id), None)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    capacity_state["rooms"] = [r for r in capacity_state["rooms"] if r["id"] != room_id]
    return {"layout": capacity_state}


class NewDoctorBody(BaseModel):
    name: str
    department_id: str


@app.post("/api/capacity/doctors")
def add_doctor(body: NewDoctorBody):
    if not _dept_by_id(body.department_id):
        return {"error": "department not found"}
    did = "doc_" + uuid.uuid4().hex[:8]
    capacity_state["doctors"].append(
        {"id": did, "name": body.name.strip(), "department_id": body.department_id}
    )
    return {"id": did, "layout": capacity_state}


class UpdateDoctorBody(BaseModel):
    name: str | None = None
    department_id: str | None = None


@app.put("/api/capacity/doctors/{doctor_id}")
def update_doctor(doctor_id: str, body: UpdateDoctorBody):
    doc = _doctor_by_id(doctor_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    has_name = body.name is not None and body.name.strip() != ""
    has_dept = body.department_id is not None and body.department_id != ""
    if not has_name and not has_dept:
        raise HTTPException(status_code=400, detail="Provide a new name and/or department")
    old_name = doc["name"]
    if has_name:
        doc["name"] = body.name.strip()
    if has_dept:
        if not _dept_by_id(body.department_id):
            raise HTTPException(status_code=400, detail="Department not found")
        new_dept = body.department_id
        for r in capacity_state["rooms"]:
            if r.get("doctor_id") == doctor_id and r["department_id"] != new_dept:
                r["doctor_id"] = None
        doc["department_id"] = new_dept
    new_name = doc["name"]
    if old_name != new_name:
        for p in triage_state["patients"]:
            if p.get("assigned_doctor") == old_name:
                p["assigned_doctor"] = new_name
    return {"layout": capacity_state}


@app.delete("/api/capacity/doctors/{doctor_id}")
def delete_doctor(doctor_id: str):
    doc = _doctor_by_id(doctor_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")
    name = doc["name"]
    for r in capacity_state["rooms"]:
        if r.get("doctor_id") == doctor_id:
            r["doctor_id"] = None
    capacity_state["doctors"] = [x for x in capacity_state["doctors"] if x["id"] != doctor_id]
    for p in triage_state["patients"]:
        if p.get("assigned_doctor") == name:
            p["assigned_doctor"] = "Unassigned"
    return {"layout": capacity_state}


class AssignRoomBody(BaseModel):
    doctor_id: str | None = None


@app.put("/api/capacity/rooms/{room_id}/doctor")
def assign_room_doctor(room_id: str, body: AssignRoomBody):
    room = next((r for r in capacity_state["rooms"] if r["id"] == room_id), None)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if body.doctor_id is not None and body.doctor_id != "":
        doc = _doctor_by_id(body.doctor_id)
        if not doc:
            raise HTTPException(status_code=400, detail="Doctor not found")
        if doc["department_id"] != room["department_id"]:
            raise HTTPException(
                status_code=400,
                detail="Doctor must belong to the same department as the room",
            )
        # Exclusive staffing: a clinician may only be assigned to one room at a time
        for r in capacity_state["rooms"]:
            if r["id"] != room_id and r.get("doctor_id") == body.doctor_id:
                r["doctor_id"] = None
        room["doctor_id"] = body.doctor_id
    else:
        room["doctor_id"] = None
    return {"layout": capacity_state}


@app.get('/api/triage/overview')
def get_triage_overview():
    triage_state['queue_active'] = len(triage_state['patients'])
    triage_state['critical'] = sum(1 for p in triage_state['patients'] if p['level'] == 1)
    return triage_state

class SimulatePatientRequest(BaseModel):
    name: str = "D. Hua"
    complaint: str = "Severe migraine, blurred vision"
    level: int = 2

@app.post('/api/triage/simulate')
def simulate_patient(req: SimulatePatientRequest):
    import datetime
    now = datetime.datetime.now().strftime("%H:%M")
    new_patient = {
        "id": f"sim_{len(triage_state['patients']) + 1}",
        "time": now,
        "level": req.level,
        "initials": "".join([part[0].upper() for part in req.name.split() if part]),
        "name": req.name,
        "details": "30M • MRN: NEW",
        "complaint": req.complaint,
        "diagnosis": "Pending Initial Triage",
        "department": "Triage Queue",
        "assigned_doctor": "Unassigned",
        "ai_reasoning": "Z.ai has placed patient in the queue based on initial symptoms. Awaiting physician review or override.",
        "status": "Waiting Room",
        "status_color": "neutral"
    }
    triage_state["patients"].append(new_patient)  # Add to bottom of queue
    triage_state["queue_active"] += 1
    return {"status": "success", "patient": new_patient}

class SetEncounterRequest(BaseModel):
    patient_id: str

@app.post('/api/triage/active_encounter')
def set_active_encounter(req: SetEncounterRequest):
    # Only one live charting session: previous "In Consult" patient returns to the waiting list
    prev_id = triage_state.get("active_encounter", {}).get("id")
    if prev_id and prev_id != req.patient_id:
        prev_p = next((p for p in triage_state["patients"] if p["id"] == prev_id), None)
        if prev_p and prev_p.get("status") == "In Consult":
            prev_p["status"] = "Waiting for Doctor"
            prev_p["status_color"] = "neutral"

    patient = next((p for p in triage_state["patients"] if p["id"] == req.patient_id), None)
    if patient:
        triage_state["active_encounter"] = {
            "id": patient["id"],
            "initials": patient["initials"],
            "name": patient["name"].replace(".", " "),
            "details": patient["details"]
        }
        # Mocking scribe update for the new patient
        triage_state["ai_scribe"] = {
            "status": f"Ready. Analyzing data for {patient['name']}...",
            "subjective": f"Patient reports {patient['complaint'].lower()}.",
            "vitals": {
                "bp": "120/80",
                "hr": "75",
                "o2": "98% RA"
            },
            "assessment_plan": ""
        }
        # Update status in queue
        patient["status"] = "In Consult"
        patient["status_color"] = "neutral"
        return {"status": "success"}
    return {"error": "Patient not found"}


@app.post("/api/triage/cancel_encounter")
def cancel_encounter():
    """Leave charting without signing: revert In Consult so accidental opens do not strand the patient."""
    active_id = triage_state.get("active_encounter", {}).get("id") or ""
    if active_id:
        patient = next((p for p in triage_state["patients"] if p["id"] == active_id), None)
        if patient and patient.get("status") == "In Consult":
            if patient.get("department") == "Triage Queue":
                patient["status"] = "Waiting Room"
            else:
                patient["status"] = "Waiting for Doctor"
            patient["status_color"] = "neutral"
    triage_state["active_encounter"] = {
        "id": "",
        "initials": "-",
        "name": "No Active Encounter",
        "details": "Select a patient from the queue.",
    }
    triage_state["ai_scribe"] = {
        "status": "Waiting for next encounter...",
        "subjective": "N/A",
        "vitals": {"bp": "-", "hr": "-", "o2": "-"},
        "assessment_plan": "",
    }
    return {"status": "success"}


class SignNoteRequest(BaseModel):
    assessment_plan: str

@app.post('/api/triage/sign_note')
def sign_note(req: SignNoteRequest):
    triage_state["ai_scribe"]["assessment_plan"] = req.assessment_plan
    triage_state["ai_scribe"]["status"] = "Note signed and committed to EHR."
    
    active_id = triage_state["active_encounter"].get("id")
    if active_id:
        triage_state["patients"] = [p for p in triage_state["patients"] if p["id"] != active_id]
        triage_state["queue_active"] = max(0, triage_state["queue_active"] - 1)
        
        triage_state["active_encounter"] = {
             "id": "",
             "initials": "-",
             "name": "No Active Encounter",
             "details": "Select a patient from the queue."
        }
        triage_state["ai_scribe"] = {
             "status": "Waiting for next encounter...",
             "subjective": "N/A",
             "vitals": {"bp": "-", "hr": "-", "o2": "-"},
             "assessment_plan": ""
        }
        
    return {"status": "success"}

class OverridePatientRequest(BaseModel):
    level: int
    diagnosis: str
    department: str
    assigned_doctor: str
    status: str = None
    status_color: str = None

@app.put('/api/triage/patient/{patient_id}')
def override_patient(patient_id: str, req: OverridePatientRequest):
    for p in triage_state["patients"]:
        if p["id"] == patient_id:
            p["level"] = req.level
            p["diagnosis"] = req.diagnosis
            p["department"] = req.department
            p["assigned_doctor"] = req.assigned_doctor
            if req.status:
                p["status"] = req.status
            if req.status_color:
                p["status_color"] = req.status_color
            p["ai_reasoning"] = f"Admin Override: Priority changed to Level {req.level}. Assigned to {req.department} ({req.assigned_doctor})."
            
            # Recalculate critical count dynamically if needed, though get_triage_overview handles it
            return {"status": "success", "patient": p}
    return {"error": "Patient not found"}
