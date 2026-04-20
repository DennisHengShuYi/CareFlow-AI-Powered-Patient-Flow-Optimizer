import asyncio
import re
from app.services.triage_agent import triage_agent

async def verify_headache_fix():
    print("DEBUG: Testing 'Sakit kepala' with General Medicine constraint...")
    
    # Simulate the BM input from the screenshot
    user_text = "Sakit kepala teruk"
    session_id = "headache-test-1"
    live_depts = ["General Medicine", "Cardiology", "Emergency"]
    
    try:
        res = await triage_agent.analyze(
            user_text, session_id, available_departments=live_depts
        )
        specialty = res.get("recommended_specialist")
        print(f"AI Recommended Specialty: {specialty}")
        
        # Test the matching logic that is now in endpoints.py
        # specialist_lower = specialty.lower()
        specialist_lower = specialty.lower()
        search_term = specialist_lower
        match = re.search(r"\(([^)]+)\)$", specialist_lower)
        if match:
            search_term = match.group(1).strip()
        
        print(f"Extracted Search Term for DB: '{search_term}'")
        
        # Check if the search term matches one of our live departments
        matches = [d for d in live_depts if search_term == d.lower() or search_term in d.lower()]
        print(f"Database Matches Found: {matches}")
        
        if matches:
            print("SUCCESS: The specialty string will correctly match a database department.")
        else:
            print("FAILURE: No match found.")
            
    except Exception as e:
        print(f"Verification failed: {e}")

if __name__ == "__main__":
    asyncio.run(verify_headache_fix())
