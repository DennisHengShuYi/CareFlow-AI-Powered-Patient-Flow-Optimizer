from fastapi import FastAPI, Depends, Request
from fastapi.testclient import TestClient
from app.api.endpoints import router
from app.config.settings import settings

app = FastAPI()
app.include_router(router)

from app.auth.clerk import verify_clerk_token

# Override the auth dependency to bypass Clerk
def mock_auth():
    return {"sub": "test_user_id_123"}
    
app.dependency_overrides[verify_clerk_token] = mock_auth

client = TestClient(app)

def run():
    print("Sending POST /intake/text")
    resp = client.post("/intake/text", json={"text": "I feel dizzy."})
    print(resp.status_code)
    print(resp.json())

if __name__ == "__main__":
    run()
