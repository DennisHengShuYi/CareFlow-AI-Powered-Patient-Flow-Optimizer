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
        # Find patient Dennis Heng
        res = await client.get(f"{URL}/rest/v1/patients?full_name=ilike.*Dennis%20Heng*", headers=headers)
        if res.status_code == 200:
            patients = res.json()
            if not patients:
                print("Dennis Heng not found")
                return
            p_id = patients[0]["id"]
            print(f"Patient ID: {p_id}")
            
            # Find sessions
            res = await client.get(f"{URL}/rest/v1/sessions?patient_id=eq.{p_id}&order=created_at.desc&limit=1", headers=headers)
            if res.status_code == 200:
                sessions = res.json()
                if sessions:
                    print("Last Session:", sessions[0])
                else:
                    print("No sessions found")
            else:
                print("Error fetching sessions:", res.text)
        else:
            print("Error fetching patient:", res.text)

import asyncio
asyncio.run(check())
