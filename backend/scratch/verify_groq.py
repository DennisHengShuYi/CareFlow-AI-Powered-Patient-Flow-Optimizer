import asyncio
from app.config.settings import settings
from app.config.llm_provider import llm

async def test_groq_critic():
    print("--- Testing Groq (Llama 3 70B) Critic Agent ---")
    print(f"Provider: {settings.AGENT_CRITIC_PROVIDER}")
    print(f"Model: {settings.AGENT_CRITIC_MODEL}")
    
    prompt = "Patient has severe chest pain radiating to the jaw. Gemini proposes P1 Triage. Does this match?"
    system = "You are a medical auditor. Reply with a JSON: {'status': 'PASSED' | 'REJECTED', 'critique': '...'}"
    
    try:
        result = await llm.generate(
            prompt=prompt, 
            system=system, 
            model=settings.AGENT_CRITIC_MODEL, 
            provider=settings.AGENT_CRITIC_PROVIDER,
            response_format="json"
        )
        print(f"Result: {result}")
        print("\nSUCCESS: Groq is working as your Critic Agent!")
    except Exception as e:
        print(f"\nERROR: Groq Agent failed.")
        print(f"Details: {e}")

if __name__ == "__main__":
    asyncio.run(test_groq_critic())
