import asyncio
import sys
import os
sys.path.append(os.getcwd())

from sqlalchemy import text
from app.models.db import engine

async def check():
    async with engine.connect() as conn:
        print("Checking tables and columns...")
        
        # Check tables
        tables = ['hospitals', 'doctors', 'rooms', 'profiles', 'sessions']
        for table in tables:
            res = await conn.execute(text(f"SELECT exists (SELECT FROM information_schema.tables WHERE table_name = '{table}')"))
            exists = res.scalar()
            print(f"Table '{table}': {'EXISTS' if exists else 'MISSING'}")
            
            if exists:
                # Check important columns
                if table in ['profiles', 'sessions']:
                    res = await conn.execute(text(f"SELECT exists (SELECT FROM information_schema.columns WHERE table_name = '{table}' AND column_name = 'hospital_id')"))
                    col_exists = res.scalar()
                    print(f"  - Column 'hospital_id' in '{table}': {'EXISTS' if col_exists else 'MISSING'}")

if __name__ == "__main__":
    asyncio.run(check())
