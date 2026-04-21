import asyncio
import json
import os
import sys

# Ensure backend is in path
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.triage_orchestrator import triage_orchestrator

async def test_adaptive_matching():
    print(f"\n{'='*50}")
    print(f"TESTING ADAPTIVE MATCHING: Chest Pain with missing Cardiology")
    print(f"{'='*50}")
    
    # Simulate a hospital that has NO cardiology department
    # It only has Emergency and General Medicine.
    # The AI should pivot to Emergency Department.
    
    mock_valid_depts = ["General Medicine", "Pediatrics", "Obstetrics", "Emergency Department"]
    user_text = "I have sudden crushing chest pain and I'm sweating"
    
    try:
        # We manually inject the valid departments list into the orchestrator logic
        # For this test, we'll modify the run_pipeline call or mock it
        from app.services.agents.clinical_agents import ExtractorAgent, StrategistAgent, CriticAgent
        
        extraction = await ExtractorAgent.process(user_text)
        clinical_context = "Guidelines: Acute chest pain requires immediate cardiac evaluation in ED."
        
        decision = await StrategistAgent.process(
            extraction, 
            clinical_context, 
            valid_departments=mock_valid_depts
        )
        
        print(f"\n[RESULT]")
        print(f"Ideal Specialist would be Cardiology, but Valid Depts are: {mock_valid_depts}")
        print(f"AI Selected Specialist: {decision.get('specialist')}")
        print(f"Reasoning snippet: {decision.get('reasoning')[:200]}...")
        
        if decision.get('specialist') in mock_valid_depts:
            print("\nSUCCESS: AI correctly pivoted to a live department.")
        else:
            print("\nFAILURE: AI suggested a department not in the list.")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_adaptive_matching())
