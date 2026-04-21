import asyncio
import httpx
from app.config.settings import settings
from app.config.llm_provider import llm

async def test_openai_direct():
    print("--- Testing OpenAI Connectivity ---")
    print(f"Using Key: {settings.OPENAI_API_KEY[:10]}... (Truncated)")
    
    prompt = "Reply with exactly 'OpenAI is Working!'"
    system = "You are a connectivity test bot."
    
    try:
        # We use the llm provider's generate method with provider='openai'
        result = await llm.generate(
            prompt=prompt, 
            system=system, 
            model="gpt-4o-mini", 
            provider="openai"
        )
        print(f"Result: {result}")
        if "Working!" in result:
            print("\nSUCCESS: OpenAI is fully functional in your environment.")
        else:
            print("\nFAILURE: Unexpected response from OpenAI.")
    except Exception as e:
        print(f"\nERROR: OpenAI failed to run.")
        print(f"Details: {e}")

if __name__ == "__main__":
    asyncio.run(test_openai_direct())
