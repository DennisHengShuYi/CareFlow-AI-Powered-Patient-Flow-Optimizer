import asyncio
import httpx
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import time

# Force UTF-8 for Windows console
if sys.platform == "win32":
    import sys
    sys.stdout.reconfigure(encoding='utf-8')

async def check_supabase():
    url = "https://guiimyubbbrnzmzncetx.supabase.co"
    db_url = "postgresql+asyncpg://postgres:1tzM0ZzSOS3oicsB@db.guiimyubbbrnzmzncetx.supabase.co:5432/postgres"
    anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1aWlteXViYmJybnptem5jZXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1OTU1MzksImV4cCI6MjA5MjE3MTUzOX0.KiPc0HjSQ1IYi3s01_9CInYqK0nqsXecFtVaKAtJcFA"

    print(f"--- Supabase Connectivity Check ---")
    
    # 1. Test REST API (HTTPS)
    print(f"\n[1/2] Testing REST API: {url}")
    try:
        t0 = time.time()
        async with httpx.AsyncClient() as client:
            headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}
            r = await client.get(f"{url}/rest/v1/", headers=headers, timeout=20.0)
            latency = (time.time() - t0) * 1000
            if r.status_code == 200:
                print(f"✅ REST API: Success (Status 200) | Latency: {latency:.2f}ms")
            else:
                print(f"⚠️ REST API: Responded with status {r.status_code}")
    except Exception as e:
        print(f"❌ REST API: FAILED | Error: {type(e).__name__}: {e}")

    # 2. Test PostgreSQL (Direct)
    print(f"\n[2/2] Testing PostgreSQL: {db_url.split('@')[1]}")
    try:
        t0 = time.time()
        # Increased timeout and added command_timeout for network flakiness
        engine = create_async_engine(db_url, connect_args={"command_timeout": 30.0})
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT 1"))
            latency = (time.time() - t0) * 1000
            print(f"✅ POSTGRES: Success (SELECT 1: {res.fetchone()[0]}) | Latency: {latency:.2f}ms")
        await engine.dispose()
    except Exception as e:
        print(f"❌ POSTGRES: FAILED | Error: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(check_supabase())
