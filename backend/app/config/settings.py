import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal
from pydantic import Field

# Calculate absolute path to the root .env file
# settings.py is in backend/app/config/ -> 4 levels up to reach root
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
ENV_PATH = BASE_DIR / ".env"

print(f"DEBUG: Loading settings from {ENV_PATH}")
if not ENV_PATH.exists():
    print(f"DEBUG: WARNING! .env file not found at {ENV_PATH}")


class Settings(BaseSettings):
    # DB Settings
    DATABASE_URL: str
    DATABASE_URL_DIRECT: str

    # LLM Provider
    LLM_PROVIDER: Literal["gemini", "zhipu", "openai", "groq"] = "gemini"
    GEMINI_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OPENAI_API_BASE: str = ""
    ZHIPU_API_KEY: str = ""
    MODEL_NAME: str = "models/gemini-3.1-flash-lite-preview"
    
    # Multi-Agent Models
    AGENT_EXTRACTOR_MODEL: str = "models/gemini-3.1-flash-lite-preview"
    AGENT_STRATEGIST_MODEL: str = "models/gemini-3.1-flash-lite-preview"
    AGENT_STRATEGIST_PROVIDER: str = "gemini"

    AGENT_CRITIC_MODEL: str = "llama-3.3-70b-versatile"
    AGENT_CRITIC_PROVIDER: str = "groq"

    
    GROQ_API_KEY: str = ""
    
    # Embedding Configuration (Decoupled from LLM Provider)
    EMBEDDING_PROVIDER: str = "huggingface"
    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    EMBEDDING_DIMENSIONS: int = 1024
    HUGGINGFACE_API_KEY: str = ""

    # Upstash Redis
    UPSTASH_REDIS_REST_URL: str
    UPSTASH_REDIS_REST_TOKEN: str
    SESSION_TTL_SECONDS: int = 1800
    RATE_LIMIT_MAX: int = 20
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Clerk Auth (replaces JWT)
    CLERK_SECRET_KEY: str = ""      # sk_live_... or sk_test_... from Clerk dashboard
    CLERK_JWKS_URL: str = ""        # Optional: auto-derived from secret key if blank

    # Supabase REST (Fallback for DB connection issues)
    SUPABASE_URL: str = Field(default="", alias="VITE_SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
