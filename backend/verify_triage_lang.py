import asyncio
import json
from app.services.triage_agent import triage_agent

async def test_bm_mirroring():
    # Simulate a BM input
    bm_text = "Saya sakit dada yang sangat teruk dan susah nak bernafas."
    session_id = "test-session-123"
    
    print(f"Testing with input: {bm_text}")
    print("-" * 50)
    
    try:
        # Note: This might fail if RAG fails, but we care about the Prompt structure mostly.
        # However, let's see if it generates BM output.
        result = await triage_agent.analyze(bm_text, session_id)
        print("Triage Result:")
        print(json.dumps(result, indent=2))
        
        # Check if key fields are in BM
        reasoning = result.get("reasoning_chain", [])
        complaint = result.get("chief_complaint", "")
        
        print("-" * 50)
        print(f"Detected Language: {result.get('language_detected')}")
        print(f"Chief Complaint: {complaint}")
        print("Reasoning Chain:")
        for r in reasoning:
            print(f" - {r}")
            
    except Exception as e:
        print(f"Execution failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_bm_mirroring())
