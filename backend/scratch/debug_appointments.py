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
        # Check all appointments for hospital with joins
        select = "*,patient_data:patients!patient_id(*),doctor_data:doctors!doctor_id(full_name)"
        res = await client.get(f"{URL}/rest/v1/appointments?hospital_id=eq.{H_ID}&status=in.(Upcoming,confirmed,pending,scheduled)&select={select}", headers=headers)
        if res.status_code == 200:
            data = res.json()
            print(f"Fetched {len(data)} appointments.")
            for a in data:
                p_info = a.get("patient_data")
                print(f"ID: {a['id']}, Status: {a['status']}, Patient Data Found: {p_info is not None}")
                if p_info:
                    p = p_info[0] if isinstance(p_info, list) else p_info
                    print(f"  Patient Name: {p.get('full_name')}")
        else:
            print(f"Error ({res.status_code}):", res.text)

import asyncio
asyncio.run(check())
