import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

def check_embedding_dim():
    api_key = os.getenv("GEMINI_API_KEY")
    genai.configure(api_key=api_key)
    
    text = "Hello medical world"
    result = genai.embed_content(
        model="models/gemini-embedding-001",
        content=text,
        task_type="retrieval_document"
    )
    dim = len(result['embedding'])
    print(f"DEBUG: gemini-embedding-001 returns {dim} dimensions.")

if __name__ == "__main__":
    check_embedding_dim()
