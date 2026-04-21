import asyncio
from sqlalchemy import text
from app.models.db import AsyncSessionLocal

async def check_dim():
    async with AsyncSessionLocal() as db:
        try:
            res = await db.execute(text("SELECT array_upper(embedding::float8[], 1) FROM medical_kb_embeddings LIMIT 1"))
            dim = res.scalar()
            print(f"Current Database Vector Dimension: {dim}")
        except Exception as e:
            print(f"Error checking dimension: {e}")

if __name__ == "__main__":
    asyncio.run(check_dim())
