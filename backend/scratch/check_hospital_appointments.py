import httpx
import os
from dotenv import load_dotenv

load_dotenv(r"c:\Users\den51\.gemini\antigravity\UMH-final\.env")

URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

H_ID = "35df2071-0877-4ae0-b35e-a1e9e48bf19d"

headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}"
}

async def check():
    async with httpx.AsyncClient(verify=False) as client:
        # Check all appointments for hospital
        res = await client.get(f"{URL}/rest/v1/appointments?hospital_id=eq.{H_ID}", headers=headers)
        if res.status_code == 200:
            data = res.json()
            print(f"Total appointments for hospital {H_ID}: {len(data)}")
            for a in data:
                print(f"ID: {a['id']}, Status: {a['status']}, Scheduled At: {a['scheduled_at']}, Patient ID: {a['patient_id']}")
        else:
            print(f"Error ({res.status_code}):", res.text)

import asyncio
asyncio.run(check())
