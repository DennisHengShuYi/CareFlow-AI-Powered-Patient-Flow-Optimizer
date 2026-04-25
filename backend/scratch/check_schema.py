import httpx
import os
from dotenv import load_dotenv

load_dotenv(r"c:\Users\den51\.gemini\antigravity\UMH-final\.env")

URL = os.getenv("VITE_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print(f"URL: {URL}")

headers = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}"
}

async def check():
    if not URL:
        print("URL is missing!")
        return
    async with httpx.AsyncClient(verify=False) as client:
        # Check medical_cases columns
        res = await client.get(f"{URL}/rest/v1/medical_cases?limit=1", headers=headers)
        if res.status_code == 200:
            data = res.json()
            if data:
                print("Medical Cases columns:", data[0].keys())
            else:
                print("Medical Cases table is empty.")
        else:
            print(f"Error fetching medical_cases ({res.status_code}):", res.text)

import asyncio
asyncio.run(check())
