import httpx
import asyncio
import json

async def test_intake():
    print("--- Starting End-to-End Intake Test ---")
    url = "http://localhost:8002/intake/text"
    payload = {"text": "I have a severe migraine and light sensitivity."}
    
    try:
        async with httpx.AsyncClient() as client:
            # We don't use Auth for this simple test since the backend has a dev bypass or we can test health
            print(f"DEBUG: sending request to {url}")
            r = await client.post(url, json=payload, timeout=60.0)
            print(f"STATUS: {r.status_code}")
            print(f"RESPONSE: {json.dumps(r.json(), indent=2)[:1000]}")
    except Exception as e:
        print(f"TEST FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(test_intake())
