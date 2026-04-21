import asyncio
from app.models.db import engine, Base
from sqlalchemy import text

async def reset_rag():
    print("Dropping medical_kb_embeddings table to fix vector dimensions...")
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS medical_kb_embeddings CASCADE;"))
        print("Table dropped. Now recreating...")
        await conn.run_sync(Base.metadata.create_all)
        print("Table recreated successfully with 1024 dimensions.")

if __name__ == "__main__":
    asyncio.run(reset_rag())
