import httpx
import asyncio
import traceback

async def debug_call():
    url = "http://localhost:8002/intake/text"
    headers = {
        "Authorization": "Bearer dev_token_resilience_test",
        "Content-Type": "application/json"
    }
    payload = {"text": "headache"}
    
    print(f"DEBUG: Calling {url}...")
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(url, json=payload, headers=headers)
            print(f"STATUS: {r.status_code}")
            print(f"BODY: {r.text[:1000]}")
    except Exception as e:
        print(f"EXCEPTION TYPE: {type(e)}")
        print(f"EXCEPTION MESSAGE: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_call())
