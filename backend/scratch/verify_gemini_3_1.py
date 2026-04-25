import asyncio
import os
from dotenv import load_dotenv
from app.config.llm_provider import llm

async def check():
    print("--- Gemini 3.1 Verification ---")
    try:
        # Test with the specific 3.1 model name
        res = await llm.generate(
            "Extract symptoms from: I have a severe cough and fever.",
            "Clinical Extraction Task",
            model="models/gemini-3.1-flash-lite-preview"
        )
        print(f"SUCCESS: Gemini 3.1 Response: {res}")
    except Exception as e:
        print(f"FAILED: Gemini 3.1 Error: {e}")

if __name__ == "__main__":
    asyncio.run(check())
