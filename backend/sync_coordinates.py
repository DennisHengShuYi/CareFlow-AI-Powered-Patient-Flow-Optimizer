import asyncio
import uuid
from sqlalchemy import text
from app.models.db import engine

# Approximate coordinates for Malaysian cities
COORDS = {
    "Metropolitan General Hospital": (3.1390, 101.6869),  # KL
    "City Wellness Center": (2.9213, 101.6511),          # Cyberjaya
    "Hospital Miri": (4.3995, 113.9914),                 # Miri
    "Borneo Hospital": (3.1073, 101.6067)               # Petaling Jaya
}

async def sync():
    async with engine.begin() as conn:
        print("Checking/Adding columns to hospitals...")
        try:
            await conn.execute(text("ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS latitude FLOAT"))
            await conn.execute(text("ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS longitude FLOAT"))
        except Exception as e:
            print(f"Hospitals column error: {e}")

        print("Checking/Adding columns to profiles...")
        try:
            await conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude FLOAT"))
            await conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude FLOAT"))
        except Exception as e:
            print(f"Profiles column error: {e}")

        # Update hospital coordinates
        print("Seeding hospital coordinates...")
        for name, (lat, lng) in COORDS.items():
            await conn.execute(
                text("UPDATE hospitals SET latitude = :lat, longitude = :lng WHERE name ILIKE :name"),
                {"lat": lat, "lng": lng, "name": f"%{name}%"}
            )
        
        # Verify
        res = await conn.execute(text("SELECT name, latitude, longitude FROM hospitals"))
        for row in res:
            print(f"Hospital: {row[0]} -> {row[1]}, {row[2]}")

if __name__ == "__main__":
    asyncio.run(sync())
