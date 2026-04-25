import httpx
import os
import uuid
from datetime import datetime, timezone
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
        # Check sessions exactly like careflow_service.py
        select = "*,patient_data:patients!patient_id(*),doctor_data:doctors!doctor_id(full_name),dept_data:departments!department_id(name)"
        res = await client.get(f"{URL}/rest/v1/sessions?hospital_id=eq.{H_ID}&status=neq.signed&select={select}&order=created_at.desc", headers=headers)
        if res.status_code == 200:
            data = res.json()
            print(f"Total active sessions: {len(data)}")
            for s in data:
                p = s.get("patient_data")
                print(f"ID: {s['id']}, Status: {s['status']}, Patient Found: {p is not None}")
        else:
            print(f"Error ({res.status_code}):", res.text)

import asyncio
asyncio.run(check())
