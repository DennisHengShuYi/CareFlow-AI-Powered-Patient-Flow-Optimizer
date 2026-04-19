import asyncio
from app.utils.supabase_client import supabase_rest

async def check(): 
    # Create a dummy patient with just full_name to see what we get
    res = await supabase_rest.insert_table('patients', {'full_name': 'Test Column Check'})
    if res:
        print(f"Record created: {res[0]}")
    else:
        print("Failed to create record.")

if __name__ == "__main__":
    asyncio.run(check())
