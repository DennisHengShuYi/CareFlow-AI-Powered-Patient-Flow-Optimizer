import asyncio
from app.models.db import AsyncSessionLocal, MedicalKBEmbedding
from app.utils.supabase_client import supabase_rest
from sqlalchemy import func, select
import sys

async def check():
    print("--- Clinical Guideline RAG Check ---")
    try:
        async with AsyncSessionLocal() as db:
            count = await db.execute(select(func.count(MedicalKBEmbedding.id)))
            c = count.scalar()
            print(f"MOH GUIDELINES CHUNKS: {c}")
            if c > 0:
                sample = await db.execute(select(MedicalKBEmbedding.content).limit(1))
                print(f"SAMPLE CONTENT: {sample.scalar()[:100]}...")
    except Exception as e:
        print(f"MOH GUIDELINES DB ERROR: {e}")

    print("\n--- Live Departments Check ---")
    try:
        # Just check first 5 departments in the whole DB
        depts = await supabase_rest.query_table("departments", {"select": "name,hospital_id", "limit": 5})
        print(f"DEPARTMENTS SAMPLE: {depts}")
    except Exception as e:
        print(f"DEPARTMENTS SUPABASE ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(check())
