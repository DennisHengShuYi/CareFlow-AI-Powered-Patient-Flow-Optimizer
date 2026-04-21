import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def seed():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"Connected to Supabase: {SUPABASE_URL}")

    # 1. Add Hospitals
    hospitals_data = [
        {"name": "Kuala Lumpur General Hospital", "address": "Jalan Pahang, 50586 Kuala Lumpur", "contact_number": "+603-2615 5555"},
        {"name": "Sunway Medical Centre", "address": "5, Jalan Lagoon Selatan, Bandar Sunway, 47500 Petaling Jaya", "contact_number": "+603-7491 9191"},
        {"name": "Gleneagles Hospital Kuala Lumpur", "address": "282, Jln Ampang, 50450 Kuala Lumpur", "contact_number": "+603-4141 3000"}
    ]

    for h_data in hospitals_data:
        try:
            # Upsert by name (if possible, but usually we just insert if not exists)
            # Check if exists
            res = supabase.table("hospitals").select("*").eq("name", h_data["name"]).execute()
            if not res.data:
                supabase.table("hospitals").insert(h_data).execute()
                print(f"Added hospital: {h_data['name']}")
            else:
                print(f"Hospital already exists: {h_data['name']}")
        except Exception as e:
            print(f"Error adding hospital {h_data['name']}: {e}")

    # Fetch hospitals to get IDs
    hospitals = supabase.table("hospitals").select("id, name").execute().data

    # 2. Add Departments
    dept_names = ["Emergency", "Cardiology", "Neurology", "General Medicine", "Pediatrics"]
    for h in hospitals:
        for d_name in dept_names:
            try:
                res = supabase.table("departments").select("*").eq("name", d_name).eq("hospital_id", h["id"]).execute()
                if not res.data:
                    supabase.table("departments").insert({
                        "name": d_name,
                        "hospital_id": h["id"],
                        "description": f"{d_name} department at {h['name']}"
                    }).execute()
                    print(f"Added {d_name} to {h['name']}")
                else:
                    print(f"Department {d_name} already exists in {h['name']}")
            except Exception as e:
                print(f"Error adding department {d_name}: {e}")

    print("Seeding completed successfully!")

if __name__ == "__main__":
    seed()
