"""
LLM triage agent — all five accuracy techniques + Clerk-compatible session tracking.

Techniques implemented:
  a) Structured JSON output with Pydantic validation + retry
  b) RAG from pgvector medical_kb_embeddings
  c) Chain-of-thought (4 mandatory steps)
  d) Few-shot examples (P1/P2/P4, BM + EN + code-switched)
  e) Ambiguity loop (max 3 follow-up turns, tracked in Redis)
  f) Prompt injection defence
  g) Bilingual system instruction
"""
import json
import re
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select, func

from app.models.db import AsyncSessionLocal, MedicalKBEmbedding
from app.config.llm_provider import llm
from app.config.settings import settings

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class Symptom(BaseModel):
    name: str
    severity: str
    duration: str


class TriageResult(BaseModel):
    chief_complaint: str
    symptoms: list[Symptom]
    red_flags: list[str]
    urgency_score: Literal["P1", "P2", "P3", "P4"]
    recommended_specialist: str
    follow_up_questions: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning_chain: list[str] = Field(min_length=4, max_length=4)
    language_detected: str


# ---------------------------------------------------------------------------
# System prompt template
# ---------------------------------------------------------------------------
_SYSTEM_TEMPLATE = """\
You are an expert bilingual clinical triage AI assistant operating in a Malaysian hospital.

LANGUAGE RULE: Mirror the user's language EXACTLY for all output fields (follow_up_questions, chief_complaint, reasoning_chain).
- If the user writes in English, you MUST respond in English.
- If they use Bahasa Malaysia, you MUST use Bahasa Malaysia.
- If they mix both (Social Media / Manglish style), respond with a similar natural mix.

CHAIN-OF-THOUGHT — You MUST produce exactly 4 reasoning steps in `reasoning_chain`:
  1. List every symptom mentioned (in user's language).
  2. Identify every Clinical Red Flag (even if subtle) and map it to risk.
  3. Correlate duration and severity with clinical guidelines.
  4. THE JUDGE (Safety Check): Verify if identified Red Flags require a higher P-score than originally thought. Justify why the chosen P-score safely covers the absolute worst-case scenario.

SPECIALIST NAMES: You MUST recommend a specialist from the provided live list ONLY. 
- Format: [Translated Name] ([Exact Technical Name from List]).
- Example: If the list has "General Medicine", output "Klinik Am (General Medicine)".
- The parenthetical part MUST match an item in the live list exactly.
- If no specific match is found, fallback to "Perubatan Am (General Medicine)".

FEW-SHOT EXAMPLES:

--- Example 1 (English, P1) ---
Input: "I have a crushing chest pain that radiates to my jaw and I'm very short of breath."
Output:
{{
  "chief_complaint": "Chest pain with jaw radiation and shortness of breath",
  "symptoms": [
    {{"name": "Chest pain", "severity": "severe", "duration": "acute onset"}},
    {{"name": "Shortness of breath", "severity": "severe", "duration": "acute onset"}}
  ],
  "red_flags": ["Crushing chest pain", "Jaw radiation — suggests ischaemia", "Shortness of breath"],
  "urgency_score": "P1",
  "recommended_specialist": "Unit Kecemasan (Emergency Department)",
  "follow_up_questions": [],
  "confidence": 0.99,
  "reasoning_chain": [
    "1. Symptoms: crushing chest pain, shortness of breath.",
    "2. Red flags: jaw radiation strongly suggests ischaemia/STEMI.",
    "3. Acute onset of severe pain requires immediate protocol activation.",
    "4. THE JUDGE: Symptoms are life-threatening Red Flags. P1 is the only safe categorization for immediate intervention."
  ],
  "language_detected": "en"
}}

--- Example 2 (Code-switched BM+EN, P2) ---
Input: "Demam panas gila for 3 hari dan menggigil teruk (rigors)."
Output:
{{
  "chief_complaint": "Demam panas (high fever) dengan rigors selama 3 hari",
  "symptoms": [
    {{"name": "Fever", "severity": "high", "duration": "3 days"}},
    {{"name": "Rigors", "severity": "severe", "duration": "3 days"}}
  ],
  "red_flags": ["Rigors with high fever > 3 days — suspicious for sepsis"],
  "urgency_score": "P2",
  "recommended_specialist": "Perubatan Am (General Medicine)",
  "follow_up_questions": ["Adakah anda baru balik dari kawasan malaria?", "Adakah ada batuk atau sesak nafas?"],
  "confidence": 0.95,
  "reasoning_chain": [
    "1. Simptom: demam panas, menggigil teruk (rigors).",
    "2. Red flags: rigors + demam > 3 hari suggests serious systemic infection.",
    "3. Keparahan tinggi dengan risiko sepsis jika tidak dirawat segera.",
    "4. THE JUDGE: While not yet unconscious, 'Rigors' are a high-risk indicator. P2 is mandatory to ensure patient is seen within 15 mins."
  ],
  "language_detected": "mixed"
}}

--- Example 3 (Bahasa Malaysia, P4) ---
Input: "Sakit tekak sikit dari semalam sahaja."
Output:
{{
  "chief_complaint": "Sakit tekak ringan sejak semalam",
  "symptoms": [
    {{"name": "Sakit tekak", "severity": "ringan", "duration": "1 hari"}}
  ],
  "red_flags": [],
  "urgency_score": "P4",
  "recommended_specialist": "Perubatan Am (General Medicine)",
  "follow_up_questions": ["Adakah anda mengalami kesukaran menelan atau bernafas?"],
  "confidence": 0.95,
  "reasoning_chain": [
    "1. Simptom: sakit tekak ringan.",
    "2. Red flags: tiada tanda bahaya dikesan setakat ini.",
    "3. Keparahan rendah, tempoh singkat (1 hari).",
    "4. THE JUDGE: No red flags present. P4 is safe for standard clinical follow-up."
  ],
  "language_detected": "ms"
}}

OUTPUT RULE: Return ONLY raw JSON matching the schema above. No markdown fences. No extra keys.
"""

# ---------------------------------------------------------------------------
# Input sanitisation
# ---------------------------------------------------------------------------
_INJECTION_PATTERNS = re.compile(
    r"\b(system:|user:|assistant:|ignore previous|disregard all|forget instructions)\b",
    re.IGNORECASE,
)

MAX_INPUT_LENGTH = 2000


def sanitise(text: str) -> str:
    """Strip prompt-injection keywords, wrap in XML, cap length."""
    cleaned = _INJECTION_PATTERNS.sub("", text)[:MAX_INPUT_LENGTH]
    return f"<user_input>{cleaned}</user_input>"


# ---------------------------------------------------------------------------
# Standard Catalog Fallback
# ---------------------------------------------------------------------------
STANDARD_CATALOG = [
    "Emergency Department", "General Medicine", "Pediatrics", "Obstetrics & Gynecology",
    "General Surgery", "Cardiology", "Orthopedics", "Oncology", "Neurology", "Psychiatry",
    "Dermatology", "Gastroenterology", "Urology", "Radiology", "Pathology / Laboratory",
    "Pharmacy", "Rehabilitation / Physiotherapy", "Intensive Care Unit (ICU)",
    "Neonatal ICU (NICU)", "Operating Theater", "General Practice (GP)", "Dental Clinic",
    "Ophthalmology", "ENT (Ear, Nose & Throat)"
]

# ---------------------------------------------------------------------------
# Triage agent
# ---------------------------------------------------------------------------
class TriageAgent:
    async def _retrieve_clinical_context(self, text: str) -> str:
        """Fetch top-3 most relevant MOH guideline chunks from vector DB."""
        try:
            vector = await llm.embed(text)
            async with AsyncSessionLocal() as db:
                # Similarity search using <=> operator (cosine distance) via pgvector
                # We order by distance ascending (top matches have smallest distance)
                stmt = select(MedicalKBEmbedding.content).order_by(
                    MedicalKBEmbedding.embedding.cosine_distance(vector)
                ).limit(3)
                
                res = await db.execute(stmt)
                chunks = res.scalars().all()
                
                if not chunks:
                    return ""
                
                context = "\n\nOFFICIAL CLINICAL GUIDELINES (MOH):\n"
                context += "\n---\n".join(chunks)
                context += "\n\nINSTRUCTION: Use the above guidelines to ground your triage decision and reasoning."
                return context
        except Exception as e:
            print(f"DEBUG: RAG Retrieval failed: {e}")
            return ""

    async def analyze(
        self,
        user_text: str,
        session_id: str,
        turn_history: list[dict] | None = None,
        available_departments: list[str] | None = None,
    ) -> dict:
        """
        Run one triage turn. Returns TriageResult dict.
        Caller is responsible for:
          - Checking follow_up_count in Redis before calling (max 3 turns)
          - Appending turns to Redis after this returns
        """
        safe_input = sanitise(user_text)
        
        # Determine department constraint
        live_depts = available_departments if available_departments else STANDARD_CATALOG
        dept_constraint = f"STRICT CONSTRAINT: You MUST recommend a specialist from this list ONLY: {', '.join(live_depts)}."
        
        # 2. Retrieve Clinical Guidelines (RAG)
        rag_context = await self._retrieve_clinical_context(user_text)
        
        system_prompt = f"{_SYSTEM_TEMPLATE}\n\n{dept_constraint}{rag_context}"

        # Build prompt with conversation history
        history_block = ""
        if turn_history:
            history_block = (
                "Previous conversation:\n"
                + "\n".join(f"{t['role'].upper()}: {t['content']}" for t in turn_history)
                + "\n\n"
            )
        prompt = f"{history_block}Current patient input:\n{safe_input}"

        # JSON generation with retry on validation failure
        last_error = ""
        for attempt in range(3):   # 0, 1, 2 → max 2 retries
            try:
                raw = await llm.generate(
                    prompt if not last_error else f"{prompt}\n\nFIX VALIDATION ERROR: {last_error}",
                    system_prompt,
                    response_format="json",
                )
                # Strip markdown fences if model wraps anyway
                raw = raw.strip()
                if raw.startswith("```"):
                    raw = re.sub(r"^```[a-z]*\n?", "", raw)
                    raw = re.sub(r"\n?```$", "", raw)

                parsed = json.loads(raw)
                validated = TriageResult(**parsed)
                return validated.model_dump()

            except Exception as exc:
                last_error = str(exc)

        raise ValueError(
            f"Triage LLM failed to produce valid JSON after 3 attempts. Last error: {last_error}"
        )


triage_agent = TriageAgent()
