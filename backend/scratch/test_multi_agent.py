import asyncio
import os
from app.services.triage_orchestrator import triage_orchestrator

async def test_multi_agent_pipeline():
    print("\n--- Testing MULTI-AGENT Pipeline (Gemini + OpenAI Critic) ---")
    
    # 1. High Risk Case
    case_1 = "My chest feels like there is an elephant sitting on it and a sharp pain in my left arm."
    
    # 2. Low Risk Case
    case_2 = "I have a small cough but no fever, started this morning."

    for i, case in enumerate([case_1, case_2]):
        print(f"\n[Case {i+1}] Input: {case}")
        try:
            result = await triage_orchestrator.run_pipeline(case)
            
            print(f"Extraction: {result['extraction']['symptoms']}")
            print(f"Decision: {result['decision']['urgency']} at {result['decision']['specialist']}")
            print(f"Critic Status: {result['is_validated']}")
            print(f"Critic Feedback: {result['critique']}")
            
        except Exception as e:
            print(f"Pipeline Failed: {e}")

if __name__ == "__main__":
    # Ensure OPENAI_API_KEY is present
    from app.config.settings import settings
    if not settings.OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY is not set in settings!")
    else:
        asyncio.run(test_multi_agent_pipeline())
