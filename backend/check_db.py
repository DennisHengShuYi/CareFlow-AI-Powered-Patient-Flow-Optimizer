import asyncio
import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

from app.models.db import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as db:
        print("Recent Profiles:")
        res = await db.execute(text("SELECT id, full_name, role, updated_at FROM profiles ORDER BY updated_at DESC LIMIT 10"))
        for row in res:
            print(f"ID: {row[0]}, Name: {row[1]}, Role: {row[2]}, Updated: {row[3]}")

if __name__ == "__main__":
    asyncio.run(check())
