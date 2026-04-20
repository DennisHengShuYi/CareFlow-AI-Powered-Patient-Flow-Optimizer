import asyncio
import os
import sys

# Ensure backend is in path
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.triage_orchestrator import triage_orchestrator

async def test_global_to_local():
    scenarios = [
        {
            "name": "IDEAL MATCH",
            "text": "Frequent chest pain especially when climbing stairs",
            "expected_ideal": "Cardiology"
        },
        {
            "name": "ADVERSARIAL DEBATE",
            "text": "I have been feeling very tired and occasionally dizzy for the past week. No chest pain, but I just feel weak.",
            "expected_ideal": "Consensus between P2 and P4",
            "note": "Tests if Strategist overreacts and Auditor pulls it back to a reasonable P3/P4."
        }


    ]
    
    for sc in scenarios:
        print(f"\n{'='*50}")
        print(f"TESTING: {sc['name']}")
        print(f"INPUT: {sc['text']}")
        print(f"{'='*50}")
        
        try:
            result = await triage_orchestrator.run_pipeline(sc['text'])
            decision = result.get("decision", {})
            
            print(f"\n[FINAL RESULT]")
            print(f"Selected Specialist: {decision.get('specialist')}")
            print(f"Is Fallback Triggered: {result.get('is_fallback')}")
            print(f"Urgency: {decision.get('urgency')}")
            print(f"Reasoning snippet: {decision.get('reasoning')[:300]}...")
            
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_global_to_local())
