# MediRoute AI Healthcare Platform

MediRoute is a full-stack AI-powered healthcare platform designed to optimize patient flow through multi-modal triage (text, voice, documents) and automated insurance orchestration.

## Architecture
| Layer | Technology | Port |
|---|---|---|
| **Frontend** | React + TypeScript + Vite | 5173 |
| **Backend** | Python + FastAPI | 8002 |
| **Database** | Supabase (PostgreSQL) | Hosted |
| **Cache / Session** | Upstash Redis (Serverless REST) | Hosted |
| **AI Engine** | Google Gemini (`gemini-2.5-flash-lite`) | Hosted |
| **Auth** | Clerk | Hosted |

---

## 🚀 Running the Platform Locally

### Prerequisites
Make sure you have the following installed:
- **Node.js** v18 or higher
- **Python** 3.9 or higher
- A `.env` file in the project root (see [Environment Variables](#environment-variables))

---

### Step 1 — Backend (FastAPI)

Open a terminal and select the instructions for your operating system:

**🪟 Windows (PowerShell):**
```powershell
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install all necessary Python dependencies from the root directory
pip install -r ../requirements.txt

# Start the backend server
$env:PYTHONPATH="."; uvicorn main:app --port 8002 --reload
```

**🍎 macOS / 🐧 Linux (Bash/Zsh):**
```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install all necessary Python dependencies from the root directory
pip install -r ../requirements.txt

# Start the backend server
PYTHONPATH="." uvicorn main:app --port 8002 --reload
```

> ✅ Backend is live at: **http://localhost:8002**  
> 📋 API docs (Swagger): **http://localhost:8002/docs**

---

### Step 2 — Frontend (React + Vite)

Open a **second** terminal and run:

```powershell
# Navigate to the frontend directory
cd frontend

# Install Node dependencies (first time only)
npm install

# Start the development server
npm run dev
```

> ✅ Frontend is live at: **http://localhost:5173**

---

## 🔑 Environment Variables

Copy the template below into a file named `.env` in the **project root** (not inside `backend/` or `frontend/`).

```env
# ================================
# Database — Supabase
# ================================
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/postgres
DATABASE_URL_DIRECT=postgresql+asyncpg://<user>:<password>@<host>:5432/postgres

# ================================
# LLM Provider
# ================================
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your_gemini_api_key>
MODEL_NAME=gemini-2.5-flash-lite

# ================================
# Upstash Redis
# ================================
UPSTASH_REDIS_REST_URL=https://<your-upstash-redis-url>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your_upstash_token>
SESSION_TTL_SECONDS=1800
RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_SECONDS=60

# ================================
# Clerk Authentication
# ================================
CLERK_SECRET_KEY=sk_test_<your_clerk_secret_key>
CLERK_JWKS_URL=          # Leave blank to use Clerk's default JWKS

# ================================
# Supabase REST
# ================================
USE_SUPABASE=true
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<your_supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_supabase_service_role_key>
```

Additionally, create `frontend/.env` with:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_<your_clerk_publishable_key>
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your_supabase_anon_key>
```

---

## 🛠️ Troubleshooting

### Port Already in Use
If you see an error saying port 8001/8002 is already in use, kill the ghost process:
```powershell
# Kill all stale uvicorn/python processes (Windows)
taskkill /F /IM uvicorn.exe /T
taskkill /F /IM python.exe /T

# Then restart the backend
$env:PYTHONPATH="."; .\venv\Scripts\python.exe -m uvicorn main:app --port 8002 --reload
```

### CORS Errors in Browser
Ensure the backend is running on port **8002** (not 8001). The CORS allowlist in `backend/main.py` is configured for:
- `http://localhost:5173`
- `http://127.0.0.1:5173`

### Authentication Issues
Make sure `VITE_CLERK_PUBLISHABLE_KEY` is set in `frontend/.env`. You must be signed in via Clerk to access the Intake, Departments, and Claims pages.

### Database Schema Out of Sync
If you encounter column errors, run the schema sync script:
```powershell
cd backend
.\venv\Scripts\python.exe sync_schema.py
.\venv\Scripts\python.exe sync_coordinates.py
```

---

## 🧭 Platform Modules

| Module | Route | Description |
|---|---|---|
| **Landing** | `/` | Platform overview and sign-in entry point |
| **Dashboard** | `/live` | Live queue monitoring and clinical board |
| **Patient Data** | `/intake` | Text / Voice / Document triage intake |
| **Departments** | `/departments` | Hospital unit management and live room board |
| **Claims** | `/claims` | Automated insurance GL generation |
| **Appointments** | `/appointments` | AI-assisted scheduling |

---

## 🏥 Department & Doctor Flow

Admin workflow for setting up a hospital:

1. **Departments tab → Configuration**
2. Create a **Department** (select from standardised dropdown)
3. Create a **Room** (assign to a department)
4. **Onboard Clinician** (select department → select room → enter name)
5. View assignments on the **Live Board** tab
