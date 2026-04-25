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
        # Check all distinct statuses
        res = await client.get(f"{URL}/rest/v1/appointments?select=status", headers=headers)
        if res.status_code == 200:
            statuses = set(a['status'] for a in res.json())
            print("Available statuses in table:", statuses)
        else:
            print(f"Error ({res.status_code}):", res.text)

import asyncio
asyncio.run(check())
