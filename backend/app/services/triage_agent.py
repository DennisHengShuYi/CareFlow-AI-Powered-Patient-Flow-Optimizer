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
from sqlalchemy import select

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

LANGUAGE RULE: Mirror the user's language EXACTLY for all output fields (follow_up_questions, chief_complaint, reasoning_chain). \
If the user writes in English, you MUST respond in English. If they use Bahasa Malaysia, use Bahasa Malaysia. \
If they mix both (Social Media / Manglish style), you may respond with a similar mix, but prioritize clarity.

CHAIN-OF-THOUGHT — You MUST produce exactly 4 reasoning steps in `reasoning_chain`:
  1. List every symptom mentioned.
  2. Identify all red flags explicitly (e.g. jaw radiation, rigors, stroke signs).
  3. Reason about duration and severity of each symptom.
  4. Produce the urgency score P1-P4 with justification.
Never skip to the score without completing steps 1-3.

URGENCY DEFINITIONS:
  P1 = Immediately life-threatening (resuscitation now)
  P2 = Emergent (seen within 15 min)
  P3 = Urgent (seen within 30-60 min)
  P4 = Semi-urgent / non-urgent (can wait)

MEDICAL KNOWLEDGE BASE (top-5 relevant chunks):
{rag_context}

FEW-SHOT EXAMPLES:

--- Example 1 (English, P4 with Follow-up) ---
Input: "My ankle is swollen since this morning."
Output:
{{
  "chief_complaint": "Swollen ankle since this morning",
  "symptoms": [
    {{"name": "Ankle swelling", "severity": "moderate", "duration": "today"}}
  ],
  "red_flags": [],
  "urgency_score": "P4",
  "recommended_specialist": "Orthopaedics",
  "follow_up_questions": ["Can you bear weight on the foot?", "Was there any direct trauma or a 'pop' sound?"],
  "confidence": 0.85,
  "reasoning_chain": [
    "1. Symptoms: Swollen ankle.",
    "2. Red flags: None reported yet, but need to check for weight-bearing status.",
    "3. Moderate severity, very recent onset (today).",
    "4. Urgency P4: Likely a simple sprain, but requires follow-up for safety."
  ],
  "language_detected": "en"
}}

--- Example 2 (English, P1) ---
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
  "recommended_specialist": "Emergency / Cardiology",
  "follow_up_questions": [],
  "confidence": 0.97,
  "reasoning_chain": [
    "1. Symptoms: crushing chest pain, shortness of breath.",
    "2. Red flags: jaw radiation strongly suggests STEMI; crushing quality indicates ischaemia.",
    "3. Acute onset, severe intensity — no mitigating factors reported.",
    "4. Urgency P1: immediate resuscitation intervention required."
  ],
  "language_detected": "en"
}}

--- Example 3 (Code-switched BM+EN, P2) ---
Input: "Demam panas gila for 3 hari dan menggigil teruk (rigors)."
Output:
{{
  "chief_complaint": "High fever with rigors for 3 days",
  "symptoms": [
    {{"name": "Fever", "severity": "high", "duration": "3 days"}},
    {{"name": "Rigors", "severity": "moderate", "duration": "3 days"}}
  ],
  "red_flags": ["Rigors with high fever > 3 days — possible sepsis or malaria"],
  "urgency_score": "P2",
  "recommended_specialist": "General Medicine / Infectious Disease",
  "follow_up_questions": ["Adakah anda baru balik dari kawasan malaria?", "Adakah ada batuk atau sesak nafas?"],
  "confidence": 0.83,
  "reasoning_chain": [
    "1. Symptoms: high fever, rigors.",
    "2. Red flags: rigors + fever > 3 days raises suspicion of sepsis or malaria.",
    "3. Moderate severity persisting 3 days; no reported resolution.",
    "4. Urgency P2: emergent assessment needed within 15 minutes."
  ],
  "language_detected": "mixed"
}}

--- Example 4 (Bahasa Malaysia, P4) ---
Input: "Sakit tekak sikit dari semalam sahaja."
Output:
{{
  "chief_complaint": "Mild sore throat since yesterday",
  "symptoms": [
    {{"name": "Sakit tekak", "severity": "mild", "duration": "1 day"}}
  ],
  "red_flags": [],
  "urgency_score": "P4",
  "recommended_specialist": "General Practice (GP)",
  "follow_up_questions": [],
  "confidence": 0.95,
  "reasoning_chain": [
    "1. Symptoms: mild sore throat.",
    "2. Red flags: none identified.",
    "3. Low severity, very short duration (1 day), no systemic features.",
    "4. Urgency P4: non-urgent, routine GP visit appropriate."
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
# RAG retrieval
# ---------------------------------------------------------------------------
async def _retrieve_rag_context(query: str) -> str:
    try:
        from app.models.db import AsyncSessionLocal, MedicalKBEmbedding

        embedding = await llm.embed(query)
        async with AsyncSessionLocal() as session:
            # pgvector cosine distance operator via ORM expression
            stmt = (
                select(MedicalKBEmbedding.content)
                .order_by(MedicalKBEmbedding.embedding.cosine_distance(embedding))
                .limit(5)
            )
            results = await session.execute(stmt)
            chunks = [row[0] for row in results]

        return "\n---\n".join(chunks) if chunks else "No additional KB context available."
    except Exception as exc:
        # RAG failure should never crash triage — degrade gracefully
        return f"KB unavailable: {exc}"


# ---------------------------------------------------------------------------
# Triage agent
# ---------------------------------------------------------------------------
class TriageAgent:

    async def analyze(
        self,
        user_text: str,
        session_id: str,
        turn_history: list[dict] | None = None,
    ) -> dict:
        """
        Run one triage turn. Returns TriageResult dict.
        Caller is responsible for:
          - Checking follow_up_count in Redis before calling (max 3 turns)
          - Appending turns to Redis after this returns
        """
        safe_input = sanitise(user_text)
        rag_context = await _retrieve_rag_context(user_text)
        system_prompt = _SYSTEM_TEMPLATE.format(rag_context=rag_context)

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
