import asyncio
from app.services.triage_agent import triage_agent
from app.api.endpoints import _log_intake
import uuid
from app.config.settings import settings

async def test_direct():
    print("Testing Triage Agent...")
    sid = str(uuid.uuid4())
    raw = "I cut my finger, it's bleeding a bit."
    try:
        res = await triage_agent.analyze(raw, sid, [])
        print("Triage OK:", res)
        
        print("Testing DB Log...")
        await _log_intake(
            session_id=sid,
            user_id="test_user",
            turn_number=1,
            user_prompt=raw,
            triage_result=res,
            ai_reply="Did you put pressure on it?",
            input_channel="text"
        )
        print("Log OK.")
    except Exception as e:
        print(f"FAILED: {e}")

asyncio.run(test_direct())
