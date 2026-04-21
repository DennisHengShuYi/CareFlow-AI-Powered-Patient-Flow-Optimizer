import asyncio
from app.cache.redis_client import redis_client

async def test_redis():
    print("Testing Redis...")
    ans = await redis_client.check_rate_limit("test_user_limit")
    print(f"Rate limit: {ans}")
    await redis_client.append_turn("test_session_id", {"role": "user", "content": "hi"})
    turns = await redis_client.get_turns("test_session_id")
    print(f"Turns: {turns}")

asyncio.run(test_redis())
