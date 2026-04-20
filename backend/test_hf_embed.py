import asyncio
import os
from dotenv import load_dotenv
from app.config.llm_provider import llm

load_dotenv()

async def test_hf_embedding():
    print("Testing HuggingFace BGE-M3 embedding...")
    text = "Clinical guideline for hypertension management"
    try:
        embedding = await llm.embed(text)
        print(f"Success! Embedding length: {len(embedding)}")
        print(f"First 5 values: {embedding[:5]}")
        if len(embedding) == 1024:
            print("Dimension check passed (1024).")
        else:
            print(f"ERROR: Expected 1024 dims, got {len(embedding)}")
    except Exception as e:
        print(f"Embedding failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_hf_embedding())
