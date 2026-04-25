import logging
import time
from fastapi import FastAPI, Request
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

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = f"DEBUG: [500] Global Error: {type(exc).__name__}: {str(exc)}"
    print(error_msg)
    import traceback
    traceback.print_exc()
    with open('backend_errors.log', 'a') as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - 500_ERROR - {error_msg}\n")
        f.write(traceback.format_exc() + "\n")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc), "type": type(exc).__name__}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = exc.body
    serializable_body = None
    
    try:
        # FormData objects are not JSON serializable, so we convert to dict
        if str(type(body)) == "<class 'starlette.datastructures.FormData'>":
            res = {}
            for key, value in dict(body).items():
                if hasattr(value, 'filename'): # It's an UploadFile
                    res[key] = f"File: {value.filename} ({value.size} bytes)"
                else:
                    res[key] = value
            serializable_body = res
        elif isinstance(body, (dict, list, str, int, float, bool, type(None))):
            serializable_body = body
        else:
            serializable_body = str(body)
    except Exception:
        serializable_body = str(body)

    exc_str = f'{exc}'.replace('\n', ' ').replace('   ', ' ')
    error_msg = f"DEBUG: [422] Validation Error: {exc_str} | Body: {serializable_body}"
    print(error_msg)
    with open('backend_errors.log', 'a') as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - 422_ERROR - {error_msg}\n")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": serializable_body}
    )

app.include_router(router)
