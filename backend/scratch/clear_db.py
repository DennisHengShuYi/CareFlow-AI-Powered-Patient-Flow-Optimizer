import asyncio
from app.models.db import AsyncSessionLocal
from sqlalchemy import text

async def clear_db():
    print("Clearing medical_kb_embeddings database...")
    async with AsyncSessionLocal() as db:
        await db.execute(text("TRUNCATE TABLE medical_kb_embeddings RESTART IDENTITY CASCADE"))
        await db.commit()
    print("Database cleared successfully.")

if __name__ == "__main__":
    asyncio.run(clear_db())
