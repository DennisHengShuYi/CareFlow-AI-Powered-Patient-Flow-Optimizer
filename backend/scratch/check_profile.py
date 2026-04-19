import asyncio
from app.utils.supabase_client import supabase_rest

async def check(): 
    p = await supabase_rest.get_profile('user_3CZpMqdmrs55cKsb18v0H08Dnfo')
    print(f"Profile: {p}")

if __name__ == "__main__":
    asyncio.run(check())
