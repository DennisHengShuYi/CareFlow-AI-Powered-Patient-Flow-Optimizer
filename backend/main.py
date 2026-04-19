import logging
import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router

# Configure logging to a file
logging.basicConfig(
    filename='backend_errors.log',
    level=logging.ERROR,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Diagnostic Print
import app
print(f"DEBUG: Loading 'app' module from: {app.__file__}")

app = FastAPI(
    title="MediRoute AI Patient Intake API",
    description="Bilingual (BM+EN) AI-powered triage & appointment booking",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request_request, exc):
    exc_str = f'{exc}'.replace('\n', ' ').replace('   ', ' ')
    error_msg = f"DEBUG: [422] Validation Error: {exc_str} | Body: {exc.body}"
    print(error_msg)
    with open('backend_errors.log', 'a') as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - 422_ERROR - {error_msg}\n")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body}
    )

app.include_router(router)
