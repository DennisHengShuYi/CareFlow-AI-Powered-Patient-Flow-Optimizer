import asyncio
import os
from dotenv import load_dotenv
import google.generativeai as genai

async def test_key():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    print(f"Testing Key: {api_key[:10]}...{api_key[-5:]}")
    
    genai.configure(api_key=api_key)
    model = "models/gemini-embedding-001"
    
    try:
        print(f"Attempting to embed 'Hello World' using {model}...")
        result = genai.embed_content(
            model=model,
            content="Hello World",
            task_type="retrieval_document"
        )
        embedding = result['embedding']
        print(f"SUCCESS! Received embedding with {len(embedding)} dimensions.")
    except Exception as e:
        print(f"FAILED! Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_key())
