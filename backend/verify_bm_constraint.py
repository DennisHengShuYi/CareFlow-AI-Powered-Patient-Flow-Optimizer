import asyncio
from app.services.triage_agent import triage_agent

async def test_bm_constraint():
    res = await triage_agent.analyze(
        "Saya sakit dada", 
        "bm-test-2", 
        available_departments=["Cardiology"]
    )
    print(f"User Input: Saya sakit dada")
    print(f"Live Depts: ['Cardiology']")
    print(f"Recommended Specialist: {res.get('recommended_specialist')}")

if __name__ == "__main__":
    asyncio.run(test_bm_constraint())
