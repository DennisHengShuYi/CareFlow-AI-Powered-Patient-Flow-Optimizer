import httpx
import os
from dotenv import load_dotenv

load_dotenv()

def check_token():
    token = os.getenv("HUGGINGFACE_API_KEY")
    if not token:
        print("No token found in .env")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get("https://huggingface.co/api/whoami-v2", headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")

if __name__ == "__main__":
    check_token()
