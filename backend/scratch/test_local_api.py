import httpx
import asyncio

async def test_api():
    url = "http://127.0.0.1:8005/api/capacity/board"
    headers = {
        "Authorization": "Bearer any_token" # This will trigger the demo bypass
    }
    print(f"Testing GET {url}...")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=10.0)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                depts = data.get("departments", [])
                print(f"Success! Found {len(depts)} departments.")
                for d in depts:
                    print(f"- {d['name']} (Rooms: {len(d['rooms'])})")
            else:
                print(f"Error: {resp.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_api())
