import asyncio
import os
from dotenv import load_dotenv
from app.config.llm_provider import llm

async def verify_keys():
    print("--- LLM Key Verification ---")
    
    # 1. Check Gemini
    try:
        print("Testing Gemini (Strategist/Extractor)...")
        res = await llm.generate("Hello", "System check", model="models/gemini-2.5-flash-lite")
        print(f"SUCCESS: Gemini Response: {res[:50]}...")
    except Exception as e:
        print(f"ERROR: Gemini Failed: {e}")

    # 2. Check Groq
    try:
        print("\nTesting Groq (Critic)...")
        # Ensure we specify provider='groq' if it's not the default
        res = await llm.generate("Hello", "System check", provider="groq", model="llama-3.3-70b-versatile")
        print(f"SUCCESS: Groq Response: {res[:50]}...")
    except Exception as e:
        print(f"ERROR: Groq Failed: {e}")

if __name__ == "__main__":
    asyncio.run(verify_keys())
