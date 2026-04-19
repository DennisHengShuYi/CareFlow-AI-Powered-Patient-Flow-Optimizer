import asyncio
from app.utils.supabase_client import supabase_rest

async def dump_data():
    hospital_id = "35df2071-0877-4ae0-b35e-a1e9e48bf19d"
    print(f"--- DUMPING DATA FOR HOSPITAL: {hospital_id} ---")
    
    hospitals = await supabase_rest.query_table("hospitals", {"id": f"eq.{hospital_id}"})
    print(f"Hospitals: {hospitals}")
    
    depts = await supabase_rest.get_departments(hospital_id)
    print(f"Departments ({len(depts)}): {[d['name'] for d in depts]}")
    
    for d in depts:
        rooms = await supabase_rest.query_table("rooms", {"department_id": f"eq.{d['id']}"})
        print(f"  Dept {d['name']} Rooms: {[r['label'] for r in rooms]}")
        
        docs = await supabase_rest.query_table("doctors", {"department_id": f"eq.{d['id']}"})
        print(f"  Dept {d['name']} Doctors: {[dc['full_name'] for dc in docs]}")
        
    sessions = await supabase_rest.query_table("sessions", {"hospital_id": f"eq.{hospital_id}"})
    print(f"Sessions ({len(sessions)}):")
    for s in sessions:
        print(f"  - Session ID: {s['id']}, Status: {s['status']}, Patient ID: {s['patient_id']}")

if __name__ == "__main__":
    asyncio.run(dump_data())
