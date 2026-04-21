import asyncio
import uuid
from sqlalchemy import text
from app.models.db import engine

async def check_database():
    async with engine.connect() as conn:
        print("--- Hospitals ---")
        h_res = await conn.execute(text("SELECT id, name FROM hospitals"))
        hospitals = h_res.fetchall()
        for h in hospitals:
            print(f"Hospital: {h[1]} (ID: {h[0]})")
        
        print("\n--- Departments ---")
        d_res = await conn.execute(text("SELECT id, hospital_id, name FROM departments"))
        depts = d_res.fetchall()
        for d in depts:
            print(f"Dept: {d[2]} (Hospital ID: {d[1]})")

        print("\n--- Profiles ---")
        p_res = await conn.execute(text("SELECT id, full_name, role, hospital_id, age FROM profiles"))
        profiles = p_res.fetchall()
        if not profiles:
            print("No profiles found.")
        for p in profiles:
            print(f"Profile: {p[1]} (ID: {p[0]}, Role: {p[2]}, Hospital: {p[3]}, Age: {p[4]})")

if __name__ == "__main__":
    asyncio.run(check_database())
