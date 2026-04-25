import asyncio
from app.utils.supabase_client import supabase_rest
from app.services.careflow_service import CareFlowService
import uuid

async def f():
    # Find a patient session
    res = await supabase_rest.query_table('sessions', {'select': 'id', 'limit': 1})
    if res:
        sid = res[0]['id']
        # Find hospital
        h_res = await supabase_rest.query_table('hospitals', {'select': 'id', 'limit': 1})
        hid = h_res[0]['id']
        
        # Test auto assign
        try:
            print(f"Testing auto_assign for {sid} in {hid}")
            res = await CareFlowService.auto_assign_patient(None, uuid.UUID(sid), uuid.UUID(hid))
            print("Success:", res)
        except Exception as e:
            print("Error:", e)

asyncio.run(f())
