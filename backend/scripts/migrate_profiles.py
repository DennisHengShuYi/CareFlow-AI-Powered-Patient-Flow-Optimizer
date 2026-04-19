import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def migrate():
    if not DATABASE_URL:
        print("DATABASE_URL not found")
        return

    # Create engine - note we remove the pooler server settings for a simple script
    engine = create_async_engine(DATABASE_URL)
    
    async with engine.begin() as conn:
        print("Adding columns to profiles table...")
        try:
            # location: String(255)
            await conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location VARCHAR(255)"))
            
            # age: Integer
            await conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER"))
            
            # gender: String(50)
            await conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(50)"))
            
            print("Successfully added location, age, and gender columns.")
        except Exception as e:
            print(f"Error during migration: {e}")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
