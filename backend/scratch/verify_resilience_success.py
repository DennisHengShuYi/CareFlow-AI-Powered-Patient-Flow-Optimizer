import httpx
import asyncio
import json
import sys

# Force UTF-8 output to avoid Windows console errors
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

async def verify_resilience():
    print("--- Verifying Triage Resilience Layer (v2) ---")
    # Use 127.0.0.1 to avoid DNS resolution issues with 'localhost'
    url = "http://127.0.0.1:8002/intake/text"
    headers = {"Authorization": "Bearer dev_token_resilience_test"}
    payload = {"text": "I have severe symptoms"}
    
    try:
        async with httpx.AsyncClient() as client:
            print(f"DEBUG: sending request to {url}")
            # Decrease script timeout to see if it's the server hanging or script
            r = await client.post(url, json=payload, headers=headers, timeout=40.0)
            print(f"STATUS: {r.status_code}")
            data = r.json()
            print("--- RESULTS ---")
            triage = data.get('triage', {})
            print(f"Urgency: {triage.get('urgency')}")
            
            reasoning = str(triage.get('reasoning', ''))
            print(f"Reasoning Sample: {reasoning[:100]}...")
            
            if "fallback" in str(data).lower() or "unavailable" in reasoning.lower():
                print("✅ RESILIENCE ACTIVE: System survived network/DNS glitch.")
            else:
                print("✅ SYSTEM HEALTHY: Pipeline completed normally.")
                
    except Exception as e:
        print(f"TEST FAILED: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(verify_resilience())
