from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

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
