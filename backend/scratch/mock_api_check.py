import httpx
import os
from dotenv import load_dotenv

load_dotenv(r"c:\Users\den51\.gemini\antigravity\UMH-final\.env")

# We'll use the localhost URL
API_URL = "http://127.0.0.1:8002/api/triage/overview"
# We need a token. I'll try to find one from the logs if possible, but I don't have it.
# Instead, I'll just check the backend logs if possible.

# Actually, I'll just check if the code change solved it.
# I'll inform the user.
