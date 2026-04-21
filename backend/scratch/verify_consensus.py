import asyncio
import json
import os
import sys

# Ensure backend is in path
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.triage_orchestrator import triage_orchestrator

async def test_scenarios():
    scenarios = [
        {"text": "light headache", "context": "MILD SCENARIO"},
        {"text": "crushing chest pain and left arm numbness", "context": "RED FLAG SCENARIO"}
    ]
    
    for sc in scenarios:
        print(f"\n{'='*50}")
        print(f"TESTING: {sc['text']} ({sc['context']})")
        print(f"{'='*50}")
        
        try:
            result = await triage_orchestrator.run_pipeline(sc['text'])
            decision = result.get("decision", {})
            
            print(f"\n[FINAL RESULT]")
            print(f"Urgency: {decision.get('urgency')}")
            print(f"Specialist: {decision.get('specialist')}")
            print(f"Validated: {result.get('is_validated')}")
            print(f"Re-audited: {result.get('re_audited')}")
            print(f"Reasoning: {decision.get('reasoning')[:300]}...")
            
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_scenarios())
