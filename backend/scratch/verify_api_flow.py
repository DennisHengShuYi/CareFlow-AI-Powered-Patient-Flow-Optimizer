import asyncio
import httpx
import json

async def verify_flow():
    url = "http://localhost:8002/intake/text"
    payload = {
        "text": "I have severe chest pain and difficulty breathing.",
        "session_id": "api-verify-session"
    }
    # Using a Bearer token that will trigger the 'unverified claims' bypass in dev
    # We just need it to LOOK like a JWT
    mock_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsIm5hbWUiOiJKb2huIERvZSJ9.signature"
    headers = {"Authorization": f"Bearer {mock_token}"}

    print(f"--- Sending Triage Request to {url} ---")
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(url, json=payload, headers=headers)
            print(f"Status Code: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print("\nSUCCESS: API Response Received:")
                print(json.dumps(data, indent=2))
                
                triage = data.get("triage", {})
                if triage.get("is_validated"):
                    print("\nMulti-Agent Validation: SUCCESS (Critic Agent approved the decision)")
                else:
                    print("\nMulti-Agent Validation: PENDING/FAILED (Check Critic logs)")
            else:
                print(f"\nERROR: {response.text}")
        except Exception as e:
            print(f"\nRequest failed: {e}")

if __name__ == "__main__":
    asyncio.run(verify_flow())
