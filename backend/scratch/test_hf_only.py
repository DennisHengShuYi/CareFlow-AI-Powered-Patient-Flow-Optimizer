import asyncio
import os
from huggingface_hub import AsyncInferenceClient

async def test_hf():
    print("Testing HuggingFace Connection...")
    token = "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"
    client = AsyncInferenceClient(token=token)
    try:
        # Try a simple text feature extraction
        res = await client.feature_extraction("Hello world", model="BAAI/bge-m3")
        print(f"Success! Result type: {type(res)}")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_hf())
