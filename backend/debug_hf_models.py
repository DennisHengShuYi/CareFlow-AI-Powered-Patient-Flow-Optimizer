import httpx
import os
from dotenv import load_dotenv

load_dotenv()

async def debug_hf():
    token = os.getenv("HUGGINGFACE_API_KEY")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    models = [
        "BAAI/bge-m3",
        "BAAI/bge-small-en-v1.5",
        "sentence-transformers/all-MiniLM-L6-v2",
        "intfloat/multilingual-e5-small"
    ]
    
    for model in models:
        print(f"\n--- Testing model: {model} ---")
        url = f"https://api-inference.huggingface.co/models/{model}"
        payload = {"inputs": "This is a test document."}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                print(f"URL: {url}")
                print(f"Status: {resp.status_code}")
                if resp.status_code == 200:
                    print("SUCCESS!")
                    res = resp.json()
                    # print(f"Length: {len(res[0]) if isinstance(res, list) else '?'}")
                    break
                else:
                    print(f"Error: {resp.text[:200]}")
        except Exception as e:
            print(f"FAILED: {e}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(debug_hf())
