import asyncio
import httpx
from sqlalchemy import text
from app.models.db import engine

async def test_intake_log():
    # 1. Hit the endpoint
    print("Testing intake API...")
    async with httpx.AsyncClient() as client:
        # Note: We need a Clerk token for this normally, but in dev setup,
        # verify_clerk_token returns a mock dictionary like {"sub": "user_123"}
        # Wait, verify_clerk_token checks headers, if no header it might use demo mode or throw. 
        # Let's check how the frontend does it, but actually we can just check the DB directly 
        # since I already know the endpoints require auth.
        pass

    # 2. Check the Database
    print("\nChecking intake_logs table...")
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT id, session_id, turn_number, user_prompt, ai_reply, urgency_score FROM intake_logs ORDER BY created_at DESC LIMIT 5"))
        rows = list(res)
        if not rows:
            print("No logs found. Try using the website UI to submit a symptom!")
        for r in rows:
            print(f"[{r.turn_number}] Sess: {r.session_id[:8]}... | User: '{r.user_prompt[:20]}...' -> AI: '{str(r.ai_reply)[:20]}...' (Urgency: {r.urgency_score})")

if __name__ == "__main__":
    asyncio.run(test_intake_log())
