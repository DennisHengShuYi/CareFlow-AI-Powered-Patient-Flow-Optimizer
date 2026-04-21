import asyncio
from app.services.triage_agent import triage_agent

async def test_triage():
    print("\n--- Testing Triage Agent with HIGH RISK scenario ---")
    user_input = "I have a high fever (39.5) and I am shivering uncontrollably (rigors) for 2 days."
    
    try:
        # Mocking departments to test strict mapping
        depts = ["Emergency Department", "General Medicine", "Pediatrics"]
        
        result = await triage_agent.analyze(
            user_text=user_input,
            session_id="test_session",
            available_departments=depts
        )
        
        print(f"Urgency: {result['urgency_score']}")
        print(f"Specialist: {result['recommended_specialist']}")
        print("Reasoning Chain:")
        for step in result['reasoning_chain']:
            print(f"  - {step}")
            
        # Verify "Judge" logic in Step 4
        if "THE JUDGE" in result['reasoning_chain'][3]:
            print("\n✅ 'The Judge' logic detected in reasoning.")
        else:
            print("\n❌ 'The Judge' logic MISSING.")
            
        # Verify Specialist format
        if "(" in result['recommended_specialist'] and ")" in result['recommended_specialist']:
             print("✅ Specialist format matches [Translated] (Exact)")
        else:
             print("❌ Specialist format WRONG")

    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_triage())
