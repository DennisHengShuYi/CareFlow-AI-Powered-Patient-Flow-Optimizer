import asyncio
import json
from app.services.triage_agent import triage_agent
from app.models.db import AsyncSessionLocal, Department
from sqlalchemy import select

async def verify_system_wide_constraint():
    print("DEBUG: Fetching system-wide unique departments...")
    async with AsyncSessionLocal() as db:
        dept_stmt = select(Department.name).distinct()
        dept_res = await db.execute(dept_stmt)
        live_depts = [row[0] for row in dept_res.all()]
    
    print(f"System-wide Live Departments: {live_depts}")
    
    # Test 1: Typical case - Cardiology is live
    test_1_input = "I have crushing chest pain."
    print(f"\nTEST 1 (Should match live Cardiology): '{test_1_input}'")
    res1 = await triage_agent.analyze(test_1_input, "test-1", available_departments=live_depts)
    print(f"Recommended Specialist: {res1.get('recommended_specialist')}")
    
    # Test 2: Extreme Constraint - Force recommendation to something unrelated
    # If we ONLY had 'Radiology' in the entire country
    forced_depts = ["Radiology"]
    test_2_input = "I have a severe fever and cough."
    print(f"\nTEST 2 (Forced Constraint - Only Radiology): '{test_2_input}'")
    res2 = await triage_agent.analyze(test_2_input, "test-2", available_departments=forced_depts)
    print(f"Recommended Specialist: {res2.get('recommended_specialist')}")

if __name__ == "__main__":
    asyncio.run(verify_system_wide_constraint())
