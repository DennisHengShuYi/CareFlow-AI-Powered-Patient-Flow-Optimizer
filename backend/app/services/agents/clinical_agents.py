import json
from app.config.llm_provider import llm
from app.config.settings import settings

class ExtractorAgent:
    """Agent 1: Clinical Entity Extraction"""
    MODEL = settings.AGENT_EXTRACTOR_MODEL
    
    SYSTEM_PROMPT = """
    You are a clinical extraction specialist. Extract only the medical facts from the patient input.
    Ignore administrative noise or unrelated chatter.
    
    In addition to extraction, provide a 'first_impression' based on quick intuition.
    Output JSON format: 
    {
      "symptoms": [], 
      "vitals": {}, 
      "duration": "",
      "language": "en" | "ms",
      "first_impression": {
        "urgency": "P1-P4",
        "specialist": "..."
      }
    }
    """


    
    @classmethod
    async def process(cls, user_text: str):
        prompt = f"Extract clinical facts from: {user_text}"
        try:
            res = await llm.generate(prompt, cls.SYSTEM_PROMPT, response_format="json", model=cls.MODEL)
            return json.loads(res)
        except Exception as e:
            print(f"DEBUG: Agent 1 (Extraction) failed: {e}")
            # Fallback: Just return the raw text as the symptom
            return {"symptoms": [user_text], "vitals": {}, "duration": "unknown", "fallback": True}

class StrategistAgent:
    """Agent 2: Senior Clinical Auditor (RAG-Enabled)"""
    MODEL = settings.AGENT_STRATEGIST_MODEL
    
    # Global Master List of standard medical departments
    GLOBAL_DEPARTMENTS = [
        'Emergency Department', 'General Medicine', 'Pediatrics', 'Obstetrics & Gynecology',
        'General Surgery', 'Cardiology', 'Orthopedics', 'Oncology', 'Neurology', 'Psychiatry',
        'Dermatology', 'Gastroenterology', 'Urology', 'Radiology', 'Pathology / Laboratory',
        'Pharmacy', 'Rehabilitation / Physiotherapy', 'Intensive Care Unit (ICU)',
        'Neonatal ICU (NICU)', 'Operating Theater', 'General Practice (GP)', 'Dental Clinic',
        'Ophthalmology', 'ENT (Ear, Nose & Throat)'
    ]

    SYSTEM_PROMPT = """
    You are a Senior Clinical Strategist operating under THE PRECAUTIONARY PRINCIPLE.
    Your absolute priority is PATIENT SAFETY (Recall > Precision).
    
    PRIMARY RULE: THE PRECAUTIONARY PRINCIPLE
    If a symptom has ANY association with high-risk events (e.g. sudden onset, neurological change, chest pressure), you MUST OVERREACT and lean towards a higher urgency (P1/P2). It is better to over-triage for safety than to miss a critical event. Look for 'Hidden Dangers'.
    
    DEBATE MODE:
    You are part of a clinical consensus loop. If a 'Medical Auditor' (Grounder) critiques your choice, you must:
    1. CONCEDE if their point is clinically definitive for a minor case.
    2. DEFEND if you believe the 'Precautionary Principle' outweighs their 'Practicality' concern for this specific patient.
    Explain your rebuttal clearly in your reasoning.
    
    BILINGUAL RULE:
    You MUST respond using the same language as the patient (English or Melayu).
    - If language='ms', your 'reasoning' and 'follow_up_questions' must be in MELAYU.
    - If language='en', your 'reasoning' and 'follow_up_questions' must be in ENGLISH.
    
    YOUR JOB:
    - Output JSON: 
    {
      "urgency": "P1-P4", 
      "specialist": "...", 
      "confidence": 0.0-1.0,
      "reasoning": "1. [Assessment] ...\n2. [Logic] ...",
      "guideline_snippet": "...",
      "follow_up_questions": []
    }
    """

    
    @classmethod
    async def process(cls, extraction_data: dict, clinical_context: str, valid_departments: list = None, debate_history: str = None, is_fallback_mode: bool = False):
        first_imp = extraction_data.get("first_impression", {})
        depts_to_use = valid_departments if valid_departments else cls.GLOBAL_DEPARTMENTS
        depts_str = ", ".join(depts_to_use)
        
        mode_instruction = "### MODE: LIVE FALLBACK" if is_fallback_mode else "### MODE: IDEAL DISCOVERY"
        re_audit_context = f"\n\n### DEBATE HISTORY & CRITIQUE (CRITICAL):\n{debate_history}\n\nRE-EVALUATE AND EITHER CONCEDE OR DEFEND YOUR POSITION." if debate_history else ""
        
        prompt = f"""
        {mode_instruction}
        
        VALID DEPARTMENTS: {depts_str}
        
        AUDIT DATA:
        - Initial Imp: {first_imp.get('urgency')} / {first_imp.get('specialist')}
        {re_audit_context}
        
        GUIDELINES (RAG):
        {clinical_context}
        
        PATIENT DATA:
        {extraction_data}
        """


        provider = getattr(settings, "AGENT_STRATEGIST_PROVIDER", "gemini")

        try:
            res = await llm.generate(prompt, cls.SYSTEM_PROMPT, response_format="json", model=cls.MODEL, provider=provider)
            return json.loads(res)
        except Exception as e:
            print(f"DEBUG: Agent 2 (Strategist) failed: {e}")
            return {"urgency": "P2", "specialist": depts_to_use[0], "confidence": 0.3, "reasoning": "1. [Error] System timeout.\n2. [Fallback] Safety default."}

class CriticAgent:
    """Agent 3: Senior Medical Grounder (Practical Error Check)"""
    MODEL = settings.AGENT_CRITIC_MODEL
    PROVIDER = settings.AGENT_CRITIC_PROVIDER
    
    SYSTEM_PROMPT = """
    You are a Senior Medical Auditor (The Voice of Reason). 
    Your role is to GROUND the 'Senior Strategist' by enforcing CLINICAL PROPORTIONALITY.
    
    BILINGUAL RULE:
    You must match your 'critique' and 'revised_decision.reasoning' to the language of the patient (English or Melayu).
    
    AUDIT RULES:
    1. REJECT PARANOIA: The Strategist is designed to overreact for safety. You must REJECT that overreaction if it is clinically unreasonable. 
       - Example: 'Poor sleep' should NOT be P1/P2/P3 unless there are clear red flags (e.g. chest pain, severe breathlessness). If the Strategist suggests P3 for 'poor sleep', you MUST DOWNGRADE it to P4 (Routine).
    2. ENFORCE PRACTICALITY: We must not overwhelm the hospital with 'safety defaults'. If the symptom is common/mild (e.g. itch, minor headache, fatigue), the final urgency must be P4.
    3. SPECIALIST OVERKILL: If the Strategist suggests a Specialist (e.g. Cardiology) for a non-specific symptom without red flags, REJECT it and force 'General Medicine' or 'GP'.
    
    OUTPUT FORMAT:
    You must output valid JSON only:
    {
      "status": "PASSED" | "REJECTED",
      "critique": "A critique in the user's language.",
      "revised_decision": {
         "urgency": "P1" | "P2" | "P3" | "P4",
         "specialist": "String",
         "reasoning": "A reasoning summary in the user's language."
      }
    }
    """

    
    @classmethod
    async def process(cls, symptoms: list, decision: dict, clinical_context: str = ""):
        prompt = f"""
        SYMPTOMS: {symptoms}
        PROPOSED DECISION: {decision}
        
        GUIDELINES (RAG):
        {clinical_context}
        """
        try:
            res = await llm.generate(prompt, cls.SYSTEM_PROMPT, response_format="json", model=cls.MODEL, provider=cls.PROVIDER)
            return json.loads(res)
        except Exception as e:
            print(f"DEBUG: Agent 3 (Critic) failed: {e}")
            return {"status": "PASSED", "critique": "System bypass."}


