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
        res = await client.get(f"{URL}/rest/v1/sessions?hospital_id=eq.{H_ID}&status=neq.signed&select=urgency_level,status", headers=headers)
        if res.status_code == 200:
            data = res.json()
            levels = [s.get("urgency_level") for s in data]
            print(f"Urgency Levels for Hospital {H_ID}:", levels)
            print("Total active sessions:", len(data))
        else:
            print("Error:", res.status_code, res.text)

import asyncio
asyncio.run(check())
