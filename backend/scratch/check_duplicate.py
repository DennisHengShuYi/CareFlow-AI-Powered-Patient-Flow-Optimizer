import httpx
import os
from dotenv import load_dotenv

load_dotenv(r"c:\Users\den51\.gemini\antigravity\UMH-final\.env")

URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}"
}

async def check():
    async with httpx.AsyncClient(verify=False) as client:
        # Find patient by IC
        res = await client.get(f"{URL}/rest/v1/patients?ic_number=eq.12345678", headers=headers)
        if res.status_code == 200:
            patients = res.json()
            if not patients:
                print("No patient found with IC 12345678")
                return
            
            p_id = patients[0]["id"]
            print(f"Patient ID: {p_id}, Name: {patients[0].get('full_name')}")
            
            # Find active sessions
            res = await client.get(f"{URL}/rest/v1/sessions?patient_id=eq.{p_id}&status=neq.signed", headers=headers)
            if res.status_code == 200:
                sessions = res.json()
                print(f"Found {len(sessions)} active sessions")
                for s in sessions:
                    print(f"Session ID: {s['id']}, Hospital: {s['hospital_id']}, Status: {s['status']}")
            else:
                print("Error fetching sessions:", res.text)
        else:
            print("Error fetching patient:", res.text)

import asyncio
asyncio.run(check())
