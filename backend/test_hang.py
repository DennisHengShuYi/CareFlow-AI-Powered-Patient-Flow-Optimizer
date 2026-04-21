import asyncio
import httpx
import time

async def test():
    print("Testing /intake/text with mock bearer token...")
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Provide a dummy JWT format: header.payload.signature
            # This triggers jwt.get_unverified_claims() in the bypass block.
            # Base64 payload: {"sub": "user_123"} -> eyJzdWIiOiAidXNlcl8xMjMifQ
            dummy_token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiAidXNlcl8xMjMifQ.signature"
            
            t0 = time.time()
            resp = await client.post(
                "http://localhost:8002/intake/text",
                json={"text": "I have a headache"},
                headers={"Authorization": f"Bearer {dummy_token}"}
            )
            print(f"Status: {resp.status_code} (took {time.time()-t0:.2f}s)")
            print(resp.json())
        except Exception as e:
            print(f"Error: {e}")

asyncio.run(test())
