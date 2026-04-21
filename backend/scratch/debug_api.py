import httpx
import asyncio

async def debug_call():
    url = "http://localhost:8002/intake/text"
    headers = {
        "Authorization": "Bearer dev_token_resilience_test",
        "Content-Type": "application/json"
    }
    payload = {"text": "headache"}
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, json=payload, headers=headers)
            print(f"STATUS: {r.status_code}")
            print(f"BODY: {r.text}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(debug_call())
