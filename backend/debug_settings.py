import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'app'))
from app.config.settings import settings

print(f"Loaded Settings:")
print(f"DATABASE_URL: {settings.DATABASE_URL}")
print(f"LLM_PROVIDER: {settings.LLM_PROVIDER}")
print(f"MODEL_NAME: {settings.MODEL_NAME}")
print(f"GEMINI_API_KEY: {settings.GEMINI_API_KEY[:5]}...")
print(f"UPSTASH_REDIS_REST_URL: {settings.UPSTASH_REDIS_REST_URL}")
print(f"CLERK_SECRET_KEY: {settings.CLERK_SECRET_KEY}")

