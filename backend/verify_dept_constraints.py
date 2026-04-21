import asyncio
import json
from app.services.triage_agent import triage_agent

async def test_department_constraints():
    # Scenario: A hospital that ONLY has 'Pediatrics' registered.
    # User input: 'Chest pain' (usually Cardiology/Emergency)
    user_text = "I have severe chest pain and breathlessness."
    session_id = "constraint-test-1"
    
    # CASE 1: With constraint
    live_depts = ["Pediatrics"]
    print(f"Testing CASE 1: Input='{user_text}', Live Depts={live_depts}")
    try:
        result_constrained = await triage_agent.analyze(
            user_text, session_id, available_departments=live_depts
        )
        print("RESULT (Constrained):")
        print(f" - Recommended Specialist: {result_constrained.get('recommended_specialist')}")
        print(f" - Reasoning Snippet: {result_constrained.get('reasoning_chain')[-1][:50]}...")
    except Exception as e:
        print(f"FAILED CASE 1: {e}")

    print("\n" + "="*50 + "\n")

    # CASE 2: No constraints (Fallback to standard catalog)
    print(f"Testing CASE 2: Input='{user_text}', Live Depts=[] (Fallback)")
    try:
        result_fallback = await triage_agent.analyze(
            user_text, session_id, available_departments=[]
        )
        print("RESULT (Fallback):")
        print(f" - Recommended Specialist: {result_fallback.get('recommended_specialist')}")
        print(f" - Reasoning Snippet: {result_fallback.get('reasoning_chain')[-1][:50]}...")
    except Exception as e:
        print(f"FAILED CASE 2: {e}")

if __name__ == "__main__":
    asyncio.run(test_department_constraints())
