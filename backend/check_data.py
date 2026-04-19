import asyncio
from sqlalchemy import text
from app.models.db import engine

async def check():
    async with engine.begin() as conn:
        print("--- Hospitals ---")
        res = await conn.execute(text("SELECT id, name, address, latitude, longitude FROM hospitals"))
        for row in res: print(row)
        
        print("\n--- Departments ---")
        res = await conn.execute(text("SELECT id, hospital_id, name, specialty_code FROM departments"))
        for row in res: print(row)

        print("\n--- Profiles ---")
        res = await conn.execute(text("SELECT id, location, latitude, longitude FROM profiles"))
        for row in res: print(row)

if __name__ == "__main__":
    asyncio.run(check())
