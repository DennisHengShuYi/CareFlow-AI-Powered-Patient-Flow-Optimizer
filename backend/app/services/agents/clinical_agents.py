import json
from app.config.llm_provider import llm
from app.config.settings import settings

class ExtractorAgent:
    """Agent 1: Clinical Entity Extraction"""
    MODEL = settings.AGENT_EXTRACTOR_MODEL
    
    SYSTEM_PROMPT = """
    CRITICAL INSTRUCTION: REFERENCE RESOLUTION & PERSISTENCE
    You will be provided with 'CONVERSATION HISTORY'. 
    - If 'CURRENT PATIENT INPUT' is a confirmation (e.g. 'yes', 'correct'), map to the LAST ASSISTANT MESSAGE.
    - CLINICAL PERSISTENCE: You MUST maintain a CUMULATIVE list. 
    - If the HISTORY already established a symptom (e.g. 'Ankle Sprain'), you MUST carry it forward into the 'symptoms' array even if the user is now talking about a different symptom (e.g. 'Small Cut').
    - Your goal is a COMPLETE clinical picture of the entire session.
    
    TASK: Clinical Entity Extraction
    Extract ONLY medical facts. 
    
    JSON Format: 
    {
      "resolution_logic": "Explain how you resolved references using history",
      "symptoms": [], 
      "documented_evidence": [],
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
    async def process(cls, user_text: str, history: list = None, language_preference: str = "auto"):
        # Format last 5 turns of history for context
        # Format last 5 turns of history for context
        history_str = ""
        if history:
            recent_history = history[-5:] # Last 5 turns for depth
            history_str = "\n".join([f"{h.get('role', 'user').upper()}: {h.get('text') or h.get('content') or ''}" for h in recent_history])

        print(f"DEBUG: [Extractor History] {len(history) if history else 0} turns provided.")
        if history:
            print(f"DEBUG: [Extractor History Tail]\n{history_str[-300:]}")
        print(f"DEBUG: [Extractor Raw Input] '{user_text}'")


        prompt = f"""
        ### CONVERSATION HISTORY:
        {history_str}

        ### CURRENT PATIENT INPUT: 
        "{user_text}"
        
        ### LANGUAGE PREFERENCE: {language_preference}
        """
        try:
            res = await llm.generate(prompt, cls.SYSTEM_PROMPT, response_format="json", model=cls.MODEL)
            data = json.loads(res)
            
            # Post-processing safety: If symptoms empty but input was "yes", force-check
            if not data.get("symptoms") and user_text.strip().lower() in ["yes", "y", "correct", "every each of its"]:
                 print("WARNING: Extractor returned empty symptoms for 'yes' reply. Forcing manual extraction...")
                 # (Logic for fallback could go here, but prompt hardening should fix it first)
            
            return data
        except Exception as e:
            print(f"DEBUG: Agent 1 (Extraction) failed: {e}")
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
    You are a Senior Clinical Strategist. Your absolute priority is PATIENT SAFETY.
    You must follow the PRECAUTIONARY PRINCIPLE: If a symptom is ambiguous but involves a vital area, you MUST escalate the urgency.
    
    ANATOMICAL VULNERABILITY MODEL (OVERREACTION MODE):
    1. VITAL CAVITIES (Head, Chest, Abdomen, Pelvis):
       - BASE URGENCY: P3 (Urgent).
       - Escalation: Upgrade to P2/P1 if descriptors are 'Sudden', 'Sharp', 'Heavy', or 'Tight'.
       - Rule: Generic pain in these zones is NEVER P4. It must be at least P3 for immediate clinical assessment.
    2. SUPPORT STRUCTURES (Musculoskeletal Back, Limbs, Joints):
       - Generic pain is P4 (Routine).
       - UPGRADE RULE: If a Support Structure symptom occurs ALONG WITH a Vital Cavity symptom (e.g. Back pain + Stomachache), the entire case is upgraded to the highest zone's base (P3).
       - UPGRADE RULE: If duration > 1 week for Abdominal or Chest issues, maintain P3 or upgrade.
    
    PRIMARY RULE: SAFETY OVER PROPORTIONALITY
    Over-triage (sending to P3 when it might be P4) is acceptable. Under-triage is a clinical failure.
    
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
      "reasoning": "1. [Anatomical Context] (Vital cavity involvement)\n2. [Precautionary Logic] (Why we are assuming risk here)\n3. [Strategy] (Path to assessment)",
      "guideline_snippet": "...",
      "follow_up_questions": []
    }
    """




    
    @classmethod
    async def process(cls, extraction_data: dict, clinical_context: str, valid_departments: list = None, debate_history: str = None, is_fallback_mode: bool = False, language_preference: str = "auto", history: list = None):
        history_str = ""
        if history:
            recent_history = history[-5:]
            history_str = "\n".join([f"{h.get('role', 'user').upper()}: {h.get('text', '')}" for h in recent_history])


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

        CONVERSATION HISTORY:
        {history_str}
        
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
            fallback_specialist = "General Medicine"
            if fallback_specialist not in depts_to_use:
                fallback_specialist = depts_to_use[0] if depts_to_use else "General Medicine"
                
            return {
                "urgency": "P3", 
                "specialist": fallback_specialist, 
                "confidence": 0.1, 
                "reasoning": "1. [Error] System timeout or invalid response.\n2. [Fallback] Safety default to General Medicine for evaluation."
            }

class CriticAgent:
    """Agent 3: Senior Medical Grounder (Practical Error Check)"""
    MODEL = settings.AGENT_CRITIC_MODEL
    PROVIDER = settings.AGENT_CRITIC_PROVIDER
    
    SYSTEM_PROMPT = """
    You are a Senior Medical Auditor. Your role is to ensure FINAL PATIENT SAFETY.
    
    BILINGUAL RULE:
    You must match your 'critique' and 'revised_decision.reasoning' to the TARGET LANGUAGE provided.
    
    AUDIT RULES (SAFETY-FIRST):
    1. PRECAUTIONARY PRINCIPLE: You MUST VALIDATE results where the Strategist has chosen a higher urgency (e.g. P3) for symptoms in Vital Cavities (Head, Chest, Abdomen, Pelvis). 
    2. COMBINATION RULE: If a patient has multiple symptoms across zones (e.g. Back pain + Stomachache), a P3 classification is CLINICALLY SOUND and must NOT be downgraded to P4.
    3. REJECTION CRITERIA: Only reject and downgrade if the urgency is clearly absurd (e.g. P1 for a simple papercut) OR if the specialist is completely unrelated to the anatomy.
    4. AMBIGUITY DEFERENCE: If a case is ambiguous, DEFER TO THE HIGHER URGENCY. Over-triage is a safety net; under-triage is a critical failure.
    
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


