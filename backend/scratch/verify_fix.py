import asyncio
import uuid
from app.utils.supabase_client import supabase_rest
from app.services.careflow_service import CareFlowService
from app.models.db import AsyncSessionLocal

async def verify():
    # Literal hospital ID for Miri
    h_id = uuid.UUID("35df2071-0877-4ae0-b35e-a1e9e48bf19d")
    print(f"Testing direct data retrieval for Hospital: {h_id}")
    
    # Test Capacity Board (this was returning empty)
    async with AsyncSessionLocal() as db:
        res = await CareFlowService.build_capacity_board(db, h_id)
        depts = res.get("departments", [])
        print(f"Found {len(depts)} departments.")
        if not depts:
            print("FAIL: No departments found.")
            return

        for d in depts:
            occupied = d["metrics"]["rooms_occupied"]
            total = d["metrics"]["rooms_total"]
            print(f"- {d['name']}: {occupied}/{total} rooms occupied")
            for r in d["rooms"]:
                if r["in_consult"]:
                    print(f"  [ROOM] {r['label']} - PATIENT IN CONSULT: {r['in_consult'][0]['name']}")
                elif r["queue"]:
                    print(f"  [ROOM] {r['label']} - PATIENTS QUEUED: {[p['name'] for p in r['queue']]}")

if __name__ == "__main__":
    asyncio.run(verify())
