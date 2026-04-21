import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load .env
load_dotenv(".env")
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

try:
    models = genai.list_models()
    print("AVAILABLE MODELS:")
    for m in models:
        if 'generateContent' in m.supported_generation_methods:
            print(f"- {m.name} ({m.display_name})")
except Exception as e:
    print(f"Error: {e}")
