import asyncio
import os
from sqlalchemy import select
from app.models.db import AsyncSessionLocal, Department, Hospital

async def extract_departments():
    print("DEBUG: Fetching departments from database...")
    async with AsyncSessionLocal() as session:
        # Get all departments grouped by hospital if possible
        stmt = (
            select(Department.name, Hospital.name)
            .join(Hospital, Department.hospital_id == Hospital.id)
        )
        result = await session.execute(stmt)
        rows = result.all()
        
        if not rows:
            print("No departments found in database.")
            return

        print("\n=== Extracted Departments ===")
        # Keep track of unique department names across all hospitals
        all_unique_depts = sorted(list(set(row[0] for row in rows)))
        for dept in all_unique_depts:
            print(f"- {dept}")
        
        print("\n=== Breakdown by Hospital ===")
        hospital_map = {}
        for d_name, h_name in rows:
            if h_name not in hospital_map:
                hospital_map[h_name] = []
            hospital_map[h_name].append(d_name)
        
        for h_name, depts in hospital_map.items():
            print(f"\n{h_name}:")
            for d in sorted(depts):
                print(f"  * {d}")

if __name__ == "__main__":
    asyncio.run(extract_departments())
