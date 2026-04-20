from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.endpoints import router
from .config.settings import settings

app = FastAPI(title="MediRoute Patient Intake API")
print("--- BACKEND STARTUP: RESILIENCE_V1 (Timeout 30s + RAG Fallback) ---")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
