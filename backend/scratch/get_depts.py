import asyncio
import os
from sqlalchemy import text
from app.models.db import AsyncSessionLocal

async def get_departments():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT distinct(name) FROM departments ORDER BY name ASC"))
        names = [r[0] for r in res.fetchall()]
        print(f"DISTINCT DEPARTMENTS: {names}")

if __name__ == "__main__":
    asyncio.run(get_departments())
