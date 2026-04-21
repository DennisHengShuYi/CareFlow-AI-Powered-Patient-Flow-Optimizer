import asyncio
import uuid
from sqlalchemy import text
from app.models.db import engine

async def check_schema():
    async with engine.connect() as conn:
        print("Checking columns in 'profiles' table...")
        result = await conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'profiles'
            ORDER BY ordinal_position;
        """))
        columns = result.fetchall()
        for col in columns:
            print(f" - {col[0]} ({col[1]})")
            
        print("\nChecking columns in 'hospitals' table...")
        result = await conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'hospitals'
            ORDER BY ordinal_position;
        """))
        columns = result.fetchall()
        for col in columns:
            print(f" - {col[0]} ({col[1]})")

if __name__ == "__main__":
    asyncio.run(check_schema())
