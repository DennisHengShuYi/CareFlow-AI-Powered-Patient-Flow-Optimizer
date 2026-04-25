import asyncio
import pdfplumber
import uuid
import sys
import os
import time
import re
from sqlalchemy import text
from app.models.db import AsyncSessionLocal, MedicalKBEmbedding
from app.config.llm_provider import llm

# Force UTF-8 encoding for script output
sys.stdout.reconfigure(encoding='utf-8')

PDF_PATH = 'C:/Users/den51/.gemini/antigravity/UMH/MOH_Malaysia_CPG_Combined.pdf'
LOG_FILE = 'backend/ingestion_progress.log'

CHUNK_SIZE = 1500  # Larger chunks = fewer records, better context
CHUNK_OVERLAP = 200

# High-Intent Clinical Keywords
CLINICAL_KEYWORDS = {
    "symptoms": 1, "clinical features": 1, "diagnostic": 1, "presentation": 1,
    "assessment": 1, "criteria": 1, "referral": 2, "specialist": 1,
    "hospitalization": 1, "emergency": 2, "management": 1, "treatment": 1,
    "algorithm": 2, "flowchart": 2, "signs": 1, "prognosis": 1,
    "department": 2, "prescribe": 1, "dosage": 1, "contraindications": 1
}

EXCLUSION_KEYWORDS = [
    r"references", r"acknowledgements", r"levels of evidence", r"methodology",
    r"search strategy", r"members of the dg", r"review committee", r"list of tables"
]

async def log_progress(message):
    """Write progress to both console and log file."""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {message}"
    print(formatted)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(formatted + "\n")

def is_clinical_page(text: str) -> bool:
    """Strict heuristic to focus on triage-relevant clinical data."""
    if not text or len(text) < 200:
        return False
    
    text_lower = text.lower()
    
    # 1. Exclusion check (stronger)
    for kw in EXCLUSION_KEYWORDS:
        if re.search(kw, text_lower):
            # If an exclusion keyword appears at the TOP of the page, it's likely a divider page
            if text_lower.find(kw) < 100:
                return False

    # 2. Score check
    score = 0
    matched_keywords = []
    for kw, weight in CLINICAL_KEYWORDS.items():
        if re.search(r'\b' + re.escape(kw) + r'\b', text_lower):
            score += weight
            matched_keywords.append(kw)
    
    # Require at least a score of 2 (e.g. one 'referral' OR two 'symptoms/signs')
    # This prevents indexing pages that just happen to mention 'treatment' once.
    return score >= 2

async def ingest_guidelines():
    if not os.path.exists(PDF_PATH):
        await log_progress(f"ERROR: PDF not found at {PDF_PATH}")
        return

    # Resume Logic: Append to log file on startup
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"\n--- Ingestion Resumed at {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")

    # 1. Resume Logic: Check existing pages
    await log_progress("System Initialized. Resuming from Page 3551...")
    await log_progress("Opening Clinical PDF (7,000+ pages)... please wait.")
    
    with pdfplumber.open(PDF_PATH) as pdf:
        total_pages = len(pdf.pages)
        await log_progress(f"PDF Structure Parsed Successfully. Targeting {total_pages} pages.")
        await log_progress(f"Processing clinical content starting from Page 3551...")

        # MANUAL OVERRIDE: Start from Page 3551 (index 3550)
        for i in range(3550, total_pages):
            page_num = i + 1

            # Give constant visual feedback every 10 pages
            if page_num % 10 == 0:
                # Use a lightweight check to see if we are still alive
                pass

            page = pdf.pages[i]
            text_content = page.extract_text()
            if not text_content or len(text_content) < 100:
                if page_num % 100 == 0:
                     await log_progress(f"Page {page_num}: No text found.")
                continue


            # a. HEURISTIC FILTER (Instant)
            if not is_clinical_page(text_content):
                if page_num % 25 == 0: # Increased frequency for user peace of mind
                    await log_progress(f"Page {page_num}: Scanning... (Filtered: Non-clinical)")
                continue


            # b. SMART FILTER (SKIPPED - Bypassing Gemini Rate Limits)
            # We now rely strictly on the Heuristic Filter above to maximize speed.
            pass

            # c. CHUNKING
            page_chunks_texts = []
            start = 0
            while start < len(text_content):
                end = start + CHUNK_SIZE
                page_chunks_texts.append(text_content[start:end])
                start += (CHUNK_SIZE - CHUNK_OVERLAP)

            # d. BATCH EMBEDDING (HuggingFace - Fast)
            try:
                # We send all chunks of the page in ONE request to HuggingFace
                vectors = await llm.embed(page_chunks_texts)
                
                async with AsyncSessionLocal() as db:
                    for idx, (chunk_text, vector) in enumerate(zip(page_chunks_texts, vectors)):
                        record = MedicalKBEmbedding(
                            content=chunk_text,
                            embedding=vector,
                            metadata_data={"source": "MOH_Malaysia_CPG_Combined.pdf", "page": page_num, "chunk": idx}
                        )
                        db.add(record)
                    await db.commit()
                await log_progress(f"SUCCESS: Page {page_num} processed ({len(page_chunks_texts)} chunks).")
            except Exception as e:
                await log_progress(f"ERROR: Failed to embed Page {page_num}: {e}")
                # We skip to next page on failure to keep the script moving
                continue

    await log_progress("MOH Clinical Guideline Ingestion Complete!")

    await log_progress("Smart Ingestion complete!")

if __name__ == "__main__":
    asyncio.run(ingest_guidelines())
