import asyncio
import uuid
from app.utils.supabase_client import supabase_rest

async def fix_demo_user():
    hospital_id = "35df2071-0877-4ae0-b35e-a1e9e48bf19d"
    demo_user_id = "demo_user"
    
    print(f"Creating/Updating profile for {demo_user_id} to link to Hospital Miri...")
    
    profile_data = {
        "id": demo_user_id,
        "hospital_id": hospital_id,
        "full_name": "Demo Staff Account",
        "role": "hospital_staff",
        "age": 30,
        "gender": "Male"
    }
    
    # Try inserting. Note: In Supabase REST we use upsert by adding Prefer: resolution=merge
    # But for now I'll just try to insert or update.
    # Actually supabase_rest.insert_table doesn't have upsert Prefer headers.
    # I'll just check if it exists first.
    
    existing = await supabase_rest.get_profile(demo_user_id)
    if existing:
        print("Demo user already exists. Updating...")
        # We don't have update_table in the REST client yet. I'll just add it or use raw httpx.
        pass
    else:
        res = await supabase_rest.insert_table("profiles", profile_data)
        if res:
            print(f"Successfully created demo profile linked to {hospital_id}")
        else:
            print("Failed to create demo profile.")

if __name__ == "__main__":
    asyncio.run(fix_demo_user())
