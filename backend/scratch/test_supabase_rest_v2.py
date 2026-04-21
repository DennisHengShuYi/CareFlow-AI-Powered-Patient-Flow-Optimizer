import asyncio
import uuid
from app.utils.supabase_client import supabase_rest

async def test_rest():
    print("--- Testing Supabase REST Connection ---")
    
    # 1. Test Profiles
    print("\nFetching profiles...")
    profiles = await supabase_rest.query_table("profiles")
    if profiles:
        print(f"Found {len(profiles)} profiles.")
        for p in profiles[:3]:
            print(f"- {p.get('full_name')} (ID: {p.get('id')})")
    else:
        print("No profiles found or error occurred.")

    # 2. Test Hospitals
    print("\nFetching hospitals...")
    hospitals = await supabase_rest.query_table("hospitals")
    if hospitals:
        print(f"Found {len(hospitals)} hospitals.")
        for h in hospitals:
            print(f"- {h.get('name')} (ID: {h.get('id')})")
            
            # 3. Test Departments for first hospital
            h_id = h.get('id')
            print(f"  Fetching departments for {h.get('name')}...")
            depts = await supabase_rest.query_table("departments", {"hospital_id": f"eq.{h_id}"})
            if depts:
                print(f"  Found {len(depts)} departments.")
            else:
                print("  No departments found.")
    else:
        print("No hospitals found.")

if __name__ == "__main__":
    asyncio.run(test_rest())
