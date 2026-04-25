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
        # Check appointments columns
        res = await client.get(f"{URL}/rest/v1/appointments?limit=1", headers=headers)
        if res.status_code == 200:
            data = res.json()
            if data:
                print("Appointments columns:", data[0].keys())
            else:
                print("Appointments table is empty.")
        else:
            print(f"Error ({res.status_code}):", res.text)

import asyncio
asyncio.run(check())
