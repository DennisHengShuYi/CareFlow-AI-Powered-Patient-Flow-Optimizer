import asyncio
from app.models.db import engine, Base
from sqlalchemy import text

async def sync():
    async with engine.begin() as conn:
        print("Enabling pgvector extension...")
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        
        print("Syncing schema...")
        # Create tables if not exist
        await conn.run_sync(Base.metadata.create_all)
        print("Schema synced successfully.")
        
    async with engine.begin() as conn:
        # Check if hospitals exist, if not add dummy ones
        res = await conn.execute(text("SELECT count(*) FROM hospitals"))
        if res.scalar() == 0:
            print("Seeding hospitals...")
            await conn.execute(text("""
                INSERT INTO hospitals (id, name, address, is_active)
                VALUES 
                (gen_random_uuid(), 'Kuala Lumpur General Hospital', 'Jalan Pahang, KL', true),
                (gen_random_uuid(), 'Prince Court Medical Centre', 'Jalan Kia Peng, KL', true)
            """))
            print("Hospitals seeded.")


if __name__ == "__main__":
    asyncio.run(sync())
