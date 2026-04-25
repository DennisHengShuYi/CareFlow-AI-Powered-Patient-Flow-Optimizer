import asyncio
import json
import re
from app.utils.supabase_client import supabase_rest

async def debug_recommendation_logic():
    print("DEBUG: Fetching hospitals with departments...")
    hospitals = await supabase_rest.query_table("hospitals", {
        "select": "*,departments(id,name,specialty_code)",
        "is_active": "eq.true"
    })
    
    if not hospitals:
        print("ERROR: No active hospitals found in database.")
        return

    print(f"Found {len(hospitals)} hospitals.")
    
    # Simulate the AI recommendation from the screenshot
    specialist_recommendation = "Klinik Am (General Medicine)"
    specialist_lower = specialist_recommendation.lower()
    
    search_term = specialist_lower
    match = re.search(r"\(([^)]+)\)$", specialist_lower)
    if match:
        search_term = match.group(1).strip()
    
    print(f"Search term extracted: '{search_term}'")
    
    found_any = False
    for h in hospitals:
        depts = h.get("departments", []) or []
        print(f"\nHospital: {h.get('name')} (ID: {h.get('id')})")
        print(f"Departments raw: {depts}")
        
        matched_depts = []
        for dept in depts:
            name = dept.get("name", "").lower()
            if search_term == name or search_term in name:
                matched_depts.append(dept.get("name"))
        
        if matched_depts:
            print(f"MATCHED: {matched_depts}")
            found_any = True
        else:
            print("NO MATCH")
            
    if not found_any:
        print("\nSUMMARY: No hospitals matched 'General Medicine'.")

if __name__ == "__main__":
    asyncio.run(debug_recommendation_logic())
