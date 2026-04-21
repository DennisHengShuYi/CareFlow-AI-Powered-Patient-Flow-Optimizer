import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
model_name = os.getenv("MODEL_NAME")

print(f"Testing with API Key: {api_key[:5]}... and Model: {model_name}")

genai.configure(api_key=api_key)
model = genai.GenerativeModel(model_name)

try:
    print("Available Models:")
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(m.name)
except Exception as e:
    print(f"List models error: {e}")

try:
    response = model.generate_content("ping")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
