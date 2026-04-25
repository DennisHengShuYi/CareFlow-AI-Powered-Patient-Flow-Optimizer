import asyncio
from app.models.db import engine
from sqlalchemy import text

async def migrate():
    async with engine.begin() as conn:
        print("Checking for bill_amount column in appointments table...")
        # Check if column exists
        res = await conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='appointments' AND column_name='bill_amount';
        """))
        if not res.scalar():
            print("Adding bill_amount column to appointments table...")
            await conn.execute(text("ALTER TABLE appointments ADD COLUMN bill_amount FLOAT DEFAULT 0.0 NOT NULL;"))
            print("Column added successfully.")
        else:
            print("Column bill_amount already exists.")

if __name__ == "__main__":
    asyncio.run(migrate())
