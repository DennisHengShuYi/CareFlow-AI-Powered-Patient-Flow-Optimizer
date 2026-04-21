import asyncio
import os
import sys

# Ensure backend is in path
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'backend'))

async def debug_ingestion():
    print("--- Ingestion Debug Script ---")
    
    # 1. Test Environment & Config
    try:
        from app.config.settings import settings
        print(f"DEBUG: Using EMBEDDING_PROVIDER: {settings.EMBEDDING_PROVIDER}")
        print(f"DEBUG: Using DATABASE_URL: {settings.DATABASE_URL[:20]}...")
    except Exception as e:
        print(f"ERROR: Config loading failed: {e}")
        return

    # 2. Test DB Connection
    print("DEBUG: testing DB Connection...")
    try:
        from app.models.db import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as db:
            res = await db.execute(text("SELECT 1"))
            print(f"SUCCESS: DB Connection OK {res.scalar()}")
    except Exception as e:
        print(f"ERROR: DB Connection failed: {e}")
        # Note: gaierror is common here if DNS is flaky

    # 3. Test Embedding Call
    print("DEBUG: Testing Embedding (HuggingFace)...")
    try:
        from app.config.llm_provider import llm
        vector = await llm.embed("Test clinical sentence.")
        print(f"SUCCESS: Embedding OK. Vector dim: {len(vector)}")
    except Exception as e:
        print(f"ERROR: Embedding failed: {e}")

    # 4. Test PDF Access
    print("DEBUG: Testing PDF access...")
    try:
        import pdfplumber
        PDF_PATH = 'C:/Users/den51/.gemini/antigravity/UMH/MOH_Malaysia_CPG_Combined.pdf'
        with pdfplumber.open(PDF_PATH) as pdf:
            print(f"SUCCESS: PDF Opened. Total pages: {len(pdf.pages)}")
            first_page_text = pdf.pages[0].extract_text()
            print(f"DEBUG: First page snippet: {first_page_text[:50]}...")
    except Exception as e:
        print(f"ERROR: PDF access failed: {e}")

if __name__ == "__main__":
    asyncio.run(debug_ingestion())
