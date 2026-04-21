import asyncio
from app.models.db import AsyncSessionLocal, MedicalKBEmbedding
from sqlalchemy import select, func

async def check_chunks():
    try:
        async with AsyncSessionLocal() as db:
            res = await db.execute(select(func.count(MedicalKBEmbedding.id)))
            count = res.scalar()
            print(f"DEBUG: Total Chunks in DB: {count}")
    except Exception as e:
        print(f"Error checking chunks: {e}")

if __name__ == "__main__":
    asyncio.run(check_chunks())
