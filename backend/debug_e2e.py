import asyncio
import os
import sys
from pathlib import Path

# Fix paths
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

async def test_triage():
    try:
        from app.services.triage_agent import triage_agent
        from app.services.intake_pipeline import intake_pipeline
        
        text = "I have a sharp pain in my chest that started 10 minutes ago."
        print(f"Testing intake...")
        intake = await intake_pipeline.process_text(text)
        print(f"Intake content: {intake.content}")
        
        print(f"Testing triage agent analyze...")
        result = await triage_agent.analyze(intake.content, "test_session_id")
        print(f"Triage Result: {result}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_triage())
