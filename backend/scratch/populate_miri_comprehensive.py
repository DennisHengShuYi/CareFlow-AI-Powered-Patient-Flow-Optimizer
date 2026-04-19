import asyncio
import uuid
from app.utils.supabase_client import supabase_rest

async def populate():
    hospital_id = "35df2071-0877-4ae0-b35e-a1e9e48bf19d"
    print(f"Populating Hospital Miri ({hospital_id}) with comprehensive data...")
    
    # 1. Departments
    depts_data = [
        {"hospital_id": hospital_id, "name": "Radiology"},
        {"hospital_id": hospital_id, "name": "Cardiology"},
        {"hospital_id": hospital_id, "name": "Pharmacy"},
        {"hospital_id": hospital_id, "name": "Dental Clinic"}
    ]
    
    dept_map = {} # name -> id
    
    # Get existing departments
    existing_depts = await supabase_rest.get_departments(hospital_id)
    for ed in existing_depts:
        dept_map[ed["name"]] = ed["id"]
        
    for d in depts_data:
        if d["name"] not in dept_map:
            res = await supabase_rest.insert_table("departments", d)
            if res:
                print(f"Created Department: {res[0]['name']}")
                dept_map[res[0]['name']] = res[0]['id']

    # 2. Doctors
    doctors_data = [
        {"hospital_id": hospital_id, "department_id": dept_map.get("Radiology"), "full_name": "Dr. Kelvin Tan"},
        {"hospital_id": hospital_id, "department_id": dept_map.get("Cardiology"), "full_name": "Dr. Chong Wei"},
        {"hospital_id": hospital_id, "department_id": dept_map.get("Dental Clinic"), "full_name": "Dr. Nurul Aziz"}
    ]
    
    doc_map = {} # name -> id
    for doc in doctors_data:
        res = await supabase_rest.insert_table("doctors", doc)
        if res:
            print(f"Created Doctor: {res[0]['full_name']}")
            doc_map[res[0]['full_name']] = res[0]['id']

    # 3. Rooms
    rooms_data = [
        {"department_id": dept_map.get("Radiology"), "label": "X-RAY-01", "doctor_id": doc_map.get("Dr. Kelvin Tan")},
        {"department_id": dept_map.get("Cardiology"), "label": "CARDIO-01", "doctor_id": doc_map.get("Dr. Chong Wei")},
        {"department_id": dept_map.get("Dental Clinic"), "label": "DENT-01", "doctor_id": doc_map.get("Dr. Nurul Aziz")}
    ]
    for r in rooms_data:
        res = await supabase_rest.insert_table("rooms", r)
        if res:
            print(f"Created Room: {res[0]['label']}")

    # 4. Patients & Sessions
    # Note: Using ic_number and phone as required by schema constraints
    patients_data = [
        {"full_name": "Robert Downey", "ic_number": "RD12345678", "phone": "0123456789"},
        {"full_name": "Scarlett Johansson", "ic_number": "SJ12345678", "phone": "0123456788"},
        {"full_name": "Chris Evans", "ic_number": "CE12345678", "phone": "0123456787"}
    ]
    
    for p_data in patients_data:
        p_res = await supabase_rest.insert_table("patients", p_data)
        if p_res:
            p_id = p_res[0]["id"]
            print(f"Created Patient: {p_res[0]['full_name']}")
            
            # Create a clinical session (table is 'sessions')
            session = {
                "patient_id": p_id,
                "hospital_id": hospital_id,
                "urgency_level": "P2", # P1-P4 format
                "status": "In Consult" if p_data["full_name"] == "Robert Downey" else "Waiting",
                "department_id": dept_map.get("Cardiology") if p_data["full_name"] == "Robert Downey" else dept_map.get("Radiology"),
                "doctor_id": doc_map.get("Dr. Chong Wei") if p_data["full_name"] == "Robert Downey" else None
            }
            s_res = await supabase_rest.insert_table("sessions", session)
            if s_res:
                print(f"  Created Session for {p_data['full_name']} (Status: {session['status']})")

if __name__ == "__main__":
    asyncio.run(populate())
