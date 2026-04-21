import asyncio
import httpx
import uuid

async def verify_loop():
    url = "http://localhost:8002/intake/text"
    headers = {
        "Authorization": "Bearer dev_token_resilience_test",
        "Content-Type": "application/json"
    }
    
    session_id = f"test-loop-{uuid.uuid4().hex[:6]}"
    
    # 1. Send vague symptom
    payload = {
        "text": "headache",
        "session_id": session_id
    }

    print(f"--- Turn 1: Sending 'headache' ---")
    async with httpx.AsyncClient(timeout=45.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        if r.status_code == 200:
            data = r.json()
            next_action = data.get("next_action")
            question = data.get("question")
            print(f"Action: {next_action}")
            print(f"AI Question: {question}")
            
            if next_action == "question" and question:
                print("PASSED Turn 1: AI asked for more info.")
            else:
                print("FAILED Turn 1: AI finalized too early or provided no question.")
        else:
            print(f"ERROR Turn 1: {r.text}")
            return

    # 2. Send follow-up answer (still somewhat vague)
    payload["text"] = "it started this morning"
    print(f"\n--- Turn 2: Sending 'it started this morning' ---")
    async with httpx.AsyncClient(timeout=45.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        if r.status_code == 200:
            data = r.json()
            next_action = data.get("next_action")
            question = data.get("question")
            print(f"Action: {next_action}")
            print(f"AI Question: {question}")
            
            if next_action == "question":
                 print("PASSED Turn 2: AI asked for even more info.")
            else:
                 print("Turn 2: AI finalized (this is okay if confidence grew, but let's see).")
        else:
            print(f"ERROR Turn 2: {r.text}")

if __name__ == "__main__":
    asyncio.run(verify_loop())
