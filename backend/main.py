from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Add CORS middleware to allow the frontend to access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/api/triage/overview')
def get_triage_overview():
    return {
        "critical": 3,
        "queue_active": 14,
        "avg_wait": "12m",
        "patients": [
            {
                "time": "10:42",
                "level": 1,
                "initials": "JR",
                "name": "J. Reyes",
                "details": "58M • MRN: 9284",
                "complaint": "Chest pain, radiatin...",
                "status": "In Resus",
                "status_color": "danger"
            },
            {
                "time": "11:05",
                "level": 2,
                "initials": "SL",
                "name": "S. Lin",
                "details": "32F • MRN: 1102",
                "complaint": "Acute abdominal p...",
                "status": "Awaiting Labs",
                "status_color": "neutral"
            },
            {
                "time": "11:20",
                "level": 3,
                "initials": "MK",
                "name": "M. Kaur",
                "details": "45F • MRN: 8821",
                "complaint": "Laceration to left fo...",
                "status": "Room 4",
                "status_color": "neutral"
            }
        ],
        "active_encounter": {
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
            }
        }
    }
