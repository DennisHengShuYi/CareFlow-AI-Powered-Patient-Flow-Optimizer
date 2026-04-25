import asyncio
from app.utils.supabase_client import supabase_rest

async def test_query():
    id_val = 'd57c7d87-5dc5-47d7-b362-dddcf09c5ee6'
    params = {
        "id": f"eq.{id_val}",
        "select": "*,patients(*),doctors(full_name,departments(name))"
    }
    print(f"QUERYING: {params}")
    res = await supabase_rest.query_table('appointments', params)
    print(f"RESULT: {res}")

asyncio.run(test_query())
