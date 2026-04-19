import asyncio
from app.utils.supabase_client import supabase_rest

async def check(): 
    res = await supabase_rest.query_table('patients', {'select': '*'})
    if res: 
        print(f"Keys: {list(res[0].keys())}")
    else:
        print("No patients found.")

if __name__ == "__main__":
    asyncio.run(check())
