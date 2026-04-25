import httpx
import os
import uuid
from dotenv import load_dotenv

load_dotenv(r"c:\Users\den51\.gemini\antigravity\UMH-final\.env")

URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

H_ID = "35df2071-0877-4ae0-b35e-a1e9e48bf19d"

headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

async def test_register():
    async with httpx.AsyncClient(verify=False) as client:
        # 1. Create Patient
        p_data = {
            "full_name": "Test Patient " + str(uuid.uuid4())[:4],
            "ic_number": "IC-" + str(uuid.uuid4())[:8],
            "phone": "123456",
            "email": "test@example.com"
        }
        res = await client.post(f"{URL}/rest/v1/patients", headers=headers, json=p_data)
        if res.status_code not in [200, 201]:
            print("Failed to create patient:", res.status_code, res.text)
            return
        
        try:
            p_id = res.json()[0]["id"]
            print(f"Created Patient: {p_id}")
        except Exception as e:
            print("Error parsing patient JSON:", e, res.text)
            return

        # 2. Create Session
        s_data = {
            "hospital_id": H_ID,
            "patient_id": p_id,
            "status": "waiting",
            "urgency_level": "P3",
            "triage_result": {"summary": "test", "urgency_level": "P3"}
        }
        res = await client.post(f"{URL}/rest/v1/sessions", headers=headers, json=s_data)
        if res.status_code in [200, 201]:
            print("Successfully created session!")
        else:
            print(f"Failed to create session ({res.status_code}):", res.text)

import asyncio
asyncio.run(test_register())
