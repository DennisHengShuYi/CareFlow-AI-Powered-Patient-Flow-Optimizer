import asyncio
from app.utils.supabase_client import supabase_rest

async def f():
    res = await supabase_rest.query_table('patients', {'select': 'id,full_name,metadata_data'})
    for p in res:
        meta = p.get('metadata_data') or {}
        if 'blood_pressure' in meta:
            print(f"{p['full_name']}: {meta}")

asyncio.run(f())
