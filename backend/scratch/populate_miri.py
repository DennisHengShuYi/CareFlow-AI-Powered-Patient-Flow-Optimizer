import asyncio
import uuid
from app.utils.supabase_client import supabase_rest

async def populate():
    hospital_id = "35df2071-0877-4ae0-b35e-a1e9e48bf19d"
    print(f"Populating Hospital Miri ({hospital_id})...")
    
    # 1. Departments
    depts = [
        {"hospital_id": hospital_id, "name": "Emergency Department"},
        {"hospital_id": hospital_id, "name": "General Medicine"},
        {"hospital_id": hospital_id, "name": "Pediatrics"}
    ]
    
    dept_ids = []
    for d in depts:
        res = await supabase_rest.insert_table("departments", d)
        if res:
            print(f"Created Department: {res[0]['name']}")
            dept_ids.append(res[0]['id'])

    # 2. Rooms
    if dept_ids:
        rooms = [
            {"department_id": dept_ids[0], "label": "ED-01"},
            {"department_id": dept_ids[0], "label": "ED-02"},
            {"department_id": dept_ids[1], "label": "GM-01"},
            {"department_id": dept_ids[1], "label": "GM-02"}
        ]
        for r in rooms:
            res = await supabase_rest.insert_table("rooms", r)
            if res:
                print(f"Created Room: {res[0]['label']}")
    
    # 3. Doctors
    docs = [
        {"hospital_id": hospital_id, "department_id": dept_ids[0], "full_name": "Dr. Aris Wong"},
        {"hospital_id": hospital_id, "department_id": dept_ids[1], "full_name": "Dr. Siti Aminah"}
    ]
    for d in docs:
        res = await supabase_rest.insert_table("doctors", d)
        if res:
            print(f"Created Doctor: {res[0]['full_name']}")

if __name__ == "__main__":
    asyncio.run(populate())
