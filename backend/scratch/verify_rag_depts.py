import asyncio
import httpx
import sys

async def verify_e2e():
    url = "http://localhost:8002/intake/text"
    # Using the dev token we set up earlier
    headers = {
        "Authorization": "Bearer dev_token_resilience_test",
        "Content-Type": "application/json"
    }
    
    # Test symptom that should trigger specific guidelines (Chest Pain -> AMI)
    payload = {
        "text": "I have been experiencing sharp chest pain for the last 2 hours, it is getting worse when I breathe.",
        "session_id": "verify-e2e-session-001"
    }

    print(f"--- E2E Verification Triage Test ---")
    print(f"Sending symptom: {payload['text']}")
    
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                triage = data.get("triage", {})
                print(f"[SUCCESS] Urgency: {triage.get('urgency_score')}")
                print(f"[SUCCESS] Specialist: {triage.get('recommended_specialist')}")
                print(f"[SUCCESS] Reasoning Chain: {triage.get('reasoning_chain')[:2]}...")
                
                # Check for RAG snippet presence
                snippet = triage.get('guideline_snippet', '')
                if snippet and "NOTE:" not in snippet:
                    print(f"[SUCCESS] RAG Snippet found: {snippet[:100]}...")
                else:
                    print(f"[WARNING] RAG Retrieval might have failed or used base knowledge: {snippet}")
            else:
                print(f"[FAILED] Status {r.status_code}: {r.text}")
    except Exception as e:
        print(f"[ERROR] {e}")


if __name__ == "__main__":
    asyncio.run(verify_e2e())
