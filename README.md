# MediRoute AI Healthcare Platform

MediRoute is a full-stack AI-powered healthcare platform designed to optimize patient flow through multi-modal triage (text, voice, documents) and automated insurance orchestration.

## Architecture
- **Frontend**: React + TypeScript + Vite (Port 5173)
- **Backend**: Python + FastAPI (Port 8002)
- **Memory/Cache**: Upstash Redis (Serverless)
- **AI Engine**: Google Gemini (gemini-2.5-flash-lite)

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (3.9+)
- **API Keys**: You will need a `.env` file in the root directory with:
  - `GEMINI_API_KEY`: For AI Triage
  - `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: For session memory
  - `CLERK_SECRET_KEY` & `VITE_CLERK_PUBLISHABLE_KEY`: For Authentication

### 2. Run the Backend
The backend serves the AI logic and handles session persistence.

```bash
cd backend

# Create & Activate Virtual Environment
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
# source venv/bin/activate   # Mac/Linux

# Install Dependencies
pip install -r requirements.txt

# Start Backend Server on Port 8002
# IMPORTANT: Use port 8002 to avoid conflicts with ghost processes on 8001
uvicorn main:app --port 8002 --reload
```
*Backend will be live at: `http://localhost:8002`*

### 3. Run the Frontend
The frontend provides the Luminescent Sanctuary UI experience.

```bash
cd frontend

# Install Dependencies
npm install

# Start Development Server
npm run dev
```
*Frontend will be live at: `http://localhost:5173`*

---

## 🛠️ Troubleshooting

### Stuck Port Error
If you see an error saying the address is already in use (common with port 8001/8002 on Windows), run:
```powershell
# Kill all ghost uvicorn/python processes
taskkill /F /IM uvicorn.exe /T
taskkill /F /IM python.exe /T
```

### Authentication
Ensure you are logged into Clerk in the browser to access the Intake features. For development, a "demo" mode is active if the Clerk key is not fully configured.

---

## 🧭 Platform Modules
- **Dashboard**: Live queue monitoring.
- **Patient Data**: Text/Voice/PDF symptom intake.
- **Claims**: Automated Insurance GL generation.
- **Appointments**: AI-assisted scheduling.
