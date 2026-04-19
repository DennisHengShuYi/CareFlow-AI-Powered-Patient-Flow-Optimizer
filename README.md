# MediRoute AI Healthcare Platform

CareFlow-AI-Powered-Patient-Flow-Optimizer is a full-stack platform built to digitize and automate critical clinical pathways, bridging real-time hospital queues with smart multi-modal patient intake and automated insurance workflows.

## Architecture Structure
- **Frontend** (React + TypeScript + Vite)
- **Backend** (Python + FastAPI)

---

## 🚀 How to Run the Website Locally

This application requires both the frontend dev server and the backend API service to run concurrently. We recommend opening two separate terminal instances.

### 1. Starting the Python Backend

The backend utilizes FastAPI to serve clinical data and orchestrate AI features.

```bash
# Navigate to the backend directory
cd backend

# Activate the virtual environment (Windows Powershell)
.\venv\Scripts\Activate.ps1
# (or if you are on Mac/Linux: source venv/bin/activate)

# Install dependencies (if you haven't yet)
pip install fastapi uvicorn

# Start the local ASGI server
uvicorn main:app --reload
```
*The backend API will run on `http://127.0.0.1:8000`*


### 2. Starting the React Frontend

The frontend is a Vite-powered single-page application integrating a custom cohesive design system (Luminescent Sanctuary).

```bash
# Navigate to the frontend directory
cd frontend

# Install necessary Node.js dependencies
npm install

# Start the Vite development server
npm run dev
```
*The website will now be accessible in your browser at `http://localhost:5173`*

---

## 🧭 Platform Modules overview

1. **Dashboard (`/`)**: Live triage queue monitoring, capacity stats, and dynamic SOAP Note generation capabilities.
2. **Patient Data Pipeline (`/intake`)**: End-to-end multi-modal symptom collection (accepting text/voice/pdfs) featuring real-time AI cross-referencing and urgency scores.
3. **Insurance Claims Orchestrator (`/claims`)**: Pipeline built to ingest Medical Diagnosis, Bills, and Policy docs to output auto-generated GL requests directly to regional insurers (AIA/Prudential).
4. **Appointments Simulator (`/appointments`)**: Dynamic slot mapping algorithm bridging Telehealth + GP. 
5. **Departments Overview (`/departments`)**: Abstract scaling architecture for hospital cross-functional expansions.
