import asyncio
from app.utils.supabase_client import supabase_rest

async def find_id():
    id_val = 'd57c7d87-5dc5-47d7-b362-dddcf09c5ee6'
    print(f"SEARCHING FOR {id_val}")
    s = await supabase_rest.query_table('sessions', {'id': f'eq.{id_val}'})
    print(f"SESSIONS: {s}")
    a = await supabase_rest.query_table('appointments', {'id': f'eq.{id_val}'})
    print(f"APPOINTMENTS: {a}")

asyncio.run(find_id())
