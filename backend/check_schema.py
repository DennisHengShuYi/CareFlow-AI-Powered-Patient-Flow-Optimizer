import asyncio
from app.utils.supabase_client import supabase_rest

async def check_schema():
    print("APPOINTMENTS SAMPLE:")
    appts = await supabase_rest.query_table('appointments', {'limit': 1})
    print(appts)
    print("\nSESSIONS SAMPLE:")
    sessions = await supabase_rest.query_table('sessions', {'limit': 1})
    print(sessions)

asyncio.run(check_schema())
