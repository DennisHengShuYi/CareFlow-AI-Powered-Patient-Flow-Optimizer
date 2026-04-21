import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

def list_embedding_models():
    api_key = os.getenv("GEMINI_API_KEY")
    genai.configure(api_key=api_key)
    
    print("Available Embedding Models:")
    for m in genai.list_models():
        if 'embedContent' in m.supported_generation_methods:
            print(f"- {m.name} (Supported: {m.supported_generation_methods})")

if __name__ == "__main__":
    list_embedding_models()
