import json
from app.config.llm_provider import llm
from app.config.settings import settings

class ExtractorAgent:
    """Agent 1: Clinical Entity Extraction"""
    MODEL = settings.AGENT_EXTRACTOR_MODEL
    
    SYSTEM_PROMPT = """
    You are a clinical extraction specialist. Extract only the medical facts from the patient input.
    Ignore administrative noise or unrelated chatter.
    
    SPECIAL SOURCE HANDLING:
    If the input contains [ATTACHED DOCUMENT] or [DOC_TYPE], extract these facts into 'documented_evidence'.
    
    LANGUAGE DETECTION:
    Identify if the input is primarily English (en) or Bahasa Malaysia (ms).
    
    In addition to extraction, provide a 'first_impression' based on quick intuition.
    Output JSON format: 
    {
      "symptoms": [], 
      "documented_evidence": ["facts from labs/prescriptions/notes"],
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
    async def process(cls, user_text: str, language_preference: str = "auto"):
        prompt = f"""
        LANGUAGE PREFERENCE: {language_preference}
        Extract clinical facts from: {user_text}
        If LANGUAGE PREFERENCE is ms, prefer Bahasa Malaysia in structured fields where possible.
        If LANGUAGE PREFERENCE is auto, preserve the user's language and code-switch style.
        """
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
    You are a Senior Clinical Strategist focused on PATHOPHYSIOLOGICAL MECHANISMS.
    Your absolute priority is PATIENT SAFETY, balanced with CLINICAL PROPORTIONALITY.
    
    ANATOMICAL VULNERABILITY MODEL:
    1. VITAL CAVITIES (Head, Chest, Abdomen, Pelvis):
       - High sensitivity. Descriptors like 'Sharp', 'Heavy', 'Tight', or 'Sudden' here are P1/P2/P3.
       - The Precautionary Principle is dominant here.
    2. SUPPORT STRUCTURES (Musculoskeletal Back, Limbs, Joints):
       - Moderate sensitivity. Generic pain is P4 (Routine).
       - ONLY upgrade to P3/P2 if there are 'Neurological Red Flags' (Numbness, loss of motor control, incontinence) or 'High-Velocity Trauma'.
    
    PRIMARY RULE: REASONING OVER KEYWORDS
    Analysis of descriptors depends on context (Location + Onset + Association).
    
    BILINGUAL RULE:
    You MUST respond using the same language as the patient (English or Melayu).
    - If language='ms', your 'reasoning' and 'follow_up_questions' must be in MELAYU.
    - If language='en', your 'reasoning' and 'follow_up_questions' must be in ENGLISH.
    
    STRICT CONSTRAINT:
    If a 'VALID DEPARTMENTS' list is provided, you MUST ONLY choose a specialist from that specific list. 
    
    YOUR JOB:
    - Output JSON: 
    {
      "urgency": "P1-P4", 
      "specialist": "...", 
      "confidence": 0.0-1.0,
      "reasoning": "1. [Anatomical Context] (Vital vs Support zone)\n2. [Mechanism] (Why this descriptor is risky/routine)\n3. [Logic] (Decision pathway)",
      "guideline_snippet": "...",
      "follow_up_questions": []
    }
    """



    
    @classmethod
    async def process(cls, extraction_data: dict, clinical_context: str, valid_departments: list = None, debate_history: str = None, is_fallback_mode: bool = False, language_preference: str = "auto"):
        language = extraction_data.get("language", "en")
        first_imp = extraction_data.get("first_impression", {})
        depts_to_use = valid_departments if valid_departments else cls.GLOBAL_DEPARTMENTS
        depts_str = ", ".join(depts_to_use)
        
        mode_instruction = "### MODE: LIVE FALLBACK" if is_fallback_mode else "### MODE: IDEAL DISCOVERY"
        re_audit_context = f"\n\n### DEBATE HISTORY & CRITIQUE (CRITICAL):\n{debate_history}\n\nRE-EVALUATE AND EITHER CONCEDE OR DEFEND YOUR POSITION." if debate_history else ""
        
        prompt = f"""
        {mode_instruction}
        TARGET LANGUAGE: {language}
        USER LANGUAGE PREFERENCE: {language_preference}
        - If preference is ms, respond in Bahasa Malaysia unless the user clearly uses English.
        - If preference is en, respond in English.
        - If preference is auto, mirror the patient's language and code-switch naturally.
        
        VALID DEPARTMENTS: {depts_str}

        
        AUDIT DATA:
        - Initial Imp: {first_imp.get('urgency')} / {first_imp.get('specialist')}
        {re_audit_context}
        
        GUIDELINES (RAG):
        {clinical_context}
        
        PATIENT DATA:
        - Symptoms: {extraction_data.get('symptoms')}
        - Objective Evidence: {extraction_data.get('documented_evidence')}
        - details: {extraction_data}
        """



        provider = getattr(settings, "AGENT_STRATEGIST_PROVIDER", "gemini")

        try:
            res = await llm.generate(prompt, cls.SYSTEM_PROMPT, response_format="json", model=cls.MODEL, provider=provider)
            return json.loads(res, strict=False)
        except Exception as e:

            print(f"DEBUG: Agent 2 (Strategist) failed: {e}")
            return {"urgency": "P2", "specialist": depts_to_use[0], "confidence": 0.3, "reasoning": "1. [Error] System timeout.\n2. [Fallback] Safety default."}

class CriticAgent:
    """Agent 3: Senior Medical Grounder (Practical Error Check)"""
    MODEL = settings.AGENT_CRITIC_MODEL
    PROVIDER = settings.AGENT_CRITIC_PROVIDER
    
    SYSTEM_PROMPT = """
    You are a Senior Medical Auditor (Clinical Logic Validator). 
    Your role is to verify REASONING and enforce PROPORTIONALITY.
    
    BILINGUAL RULE:
    You must match your 'critique' and 'revised_decision.reasoning' to the TARGET LANGUAGE provided.
    
    AUDIT RULES:
    1. PROPORTIONALITY CHECK: You must REJECT 'Over-Triage' of musculoskeletal symptoms. 
       - If the patient has 'Back Pain' or 'Leg Pain' without neurological deficits (numbness/weakness/loss of control), the urgency MUST be P4 (Routine).
       - If the Strategist suggests P3 for generic back pain, you MUST REJECT and downgrade to P4.
    2. PATHOPHYSIOLOGICAL VALIDATION: Maintain high urgency for Vital Cavities (Chest/Head/Abdomen). Do not downgrade these unless a definitive minor cause is proven.
    3. RED FLAG PROTECTION: You are forbidden from downgrading a 'Red Flag' (Chest pain, breathing difficulty, neurological loss, sudden confusion) to P4.
    
    OUTPUT FORMAT:
    You must output valid JSON only:
    {
      "status": "PASSED" | "REJECTED",
      "critique": "A critique in the target language.",
      "revised_decision": {
         "urgency": "P1" | "P2" | "P3" | "P4",
         "specialist": "String",
         "reasoning": "A revised reasoning summary in the target language."
      }
    }
    """


    
    @classmethod

    async def process(cls, symptoms: list, decision: dict, clinical_context: str = "", language: str = "en", language_preference: str = "auto"):
        prompt = f"""
        TARGET LANGUAGE: {language}
        USER LANGUAGE PREFERENCE: {language_preference}
        
        SYMPTOMS: {symptoms}
        PROPOSED DECISION: {decision}
        
        GUIDELINES (RAG):
        {clinical_context}
        """

        try:
            res = await llm.generate(prompt, cls.SYSTEM_PROMPT, response_format="json", model=cls.MODEL, provider=cls.PROVIDER)
            return json.loads(res, strict=False)
        except Exception as e:

            print(f"DEBUG: Agent 3 (Critic) failed: {e}")
            return {"status": "PASSED", "critique": "System bypass."}


