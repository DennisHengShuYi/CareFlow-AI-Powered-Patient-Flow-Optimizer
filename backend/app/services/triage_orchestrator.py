from typing import List, Dict
from sqlalchemy import select
from app.models.db import AsyncSessionLocal, MedicalKBEmbedding
from app.config.settings import settings
from app.config.llm_provider import llm
from app.services.agents.clinical_agents import ExtractorAgent, StrategistAgent, CriticAgent


class TriageOrchestrator:
    """The Multi-Agent Orchestrator (Sparse Context Pattern)"""
    
    async def _get_rag_context(self, symptoms: List[str]) -> str:
        """Fetch clinical context using clean symptoms (High Relevance)."""
        if not symptoms:
            return "No specific guidelines available."
            
        try:
            search_query = ", ".join(symptoms)
            vector = await llm.embed(search_query)
            
            async with AsyncSessionLocal() as db:
                stmt = select(MedicalKBEmbedding.content).order_by(
                    MedicalKBEmbedding.embedding.cosine_distance(vector)
                ).limit(3)
                res = await db.execute(stmt)
                chunks = res.scalars().all()
                
                if chunks:
                    print(f"DEBUG: [RAG] Success! {len(chunks)} clinical guideline chunks retrieved for: {symptoms}")
                    return "\n---\n".join(chunks)
                else:
                    print(f"DEBUG: [RAG] No relevant guidelines found for: {symptoms}")
                    return "No specific guidelines available."
        except Exception as e:
            print(f"DEBUG: [RAG] Retrieval Failed: {e}")
            return "NOTE: Official guidelines currently unavailable. Triage proceeding based on AI base knowledge."


    async def run_pipeline(self, user_text: str, language_preference: str = "auto"):
        print(f"DEBUG: Starting Global-to-Local Pipeline for: {user_text[:30]}...")
        from app.utils.supabase_client import supabase_rest
        from sqlalchemy import text as sa_text
        
        # Phase 1: Extraction (Gemini Flash-Lite)
        # ----------------------------------------------------
        extraction = await ExtractorAgent.process(user_text, language_preference=language_preference)
        symptoms = extraction.get("symptoms", [])
        print(f"DEBUG: Agent 1 (Extraction) found: {symptoms}")

        # Phase 2: RAG Retrieval (Targeted)
        # ----------------------------------------------------
        print(f"DEBUG: [Stage 2] Searching RAG Guidelines for: {symptoms}")
        clinical_context = await self._get_rag_context(symptoms)

        # Phase 3: Ideal Specialty Discovery (Global List)
        # ----------------------------------------------------
        # We pass None for valid_departments to trigger the GLOBAL_DEPARTMENTS default
        decision = await StrategistAgent.process(extraction, clinical_context, language_preference=language_preference)
        ideal_specialist = decision.get("specialist")
        print(f"DEBUG: [Stage 3] Ideal Discovery -> Specialist: {ideal_specialist}")
        print(f"DEBUG: [Stage 3] Strategist Reasoning:\n{'-'*40}\n{decision.get('reasoning')}\n{'-'*40}")

        # Phase 4: Live Verification (Existence Check)
        # ----------------------------------------------------
        live_depts = None
        async with AsyncSessionLocal() as db:
            # Check if this specialist (or similar) exists in ANY hospital
            stmt = sa_text("SELECT COUNT(*) FROM departments WHERE name ILIKE :name")
            res = await db.execute(stmt, {"name": f"%{ideal_specialist}%"})
            count = res.scalar()
            
            if count == 0:
                print(f"WARNING: [Stage 4] Ideal specialty '{ideal_specialist}' not found in live database.")
                print("DEBUG: [Stage 4] Fetching all distinct live departments for fallback...")
                
                # Fetch all distinct departments currently in the system
                live_res = await db.execute(sa_text("SELECT distinct(name) FROM departments ORDER BY name ASC"))
                live_depts = [r[0] for r in live_res.fetchall()]
                
                if not live_depts:
                    live_depts = ["General Medicine", "Emergency Department"] # Safety floor
                
                print(f"DEBUG: [Stage 4] Live Fallback Mode Triggered. Choose from: {live_depts}")
                
                # Re-audit with the live list
                decision = await StrategistAgent.process(
                    extraction, 
                    clinical_context, 
                    valid_departments=live_depts,
                    is_fallback_mode=True
                    ,language_preference=language_preference
                )
                print(f"DEBUG: [Stage 4] Live Pivot Result -> Specialist: {decision.get('specialist')}")
                print(f"DEBUG: [Stage 4] Fallback Reasoning:\n{'-'*40}\n{decision.get('reasoning')}\n{'-'*40}")
            else:
                print(f"DEBUG: [Stage 4] Live Match Confirmed ({count} facilities found).")

        # Phase 5 & 6: Adversarial Consensus Debate (Gemini vs. Groq)
        # ----------------------------------------------------
        MAX_DEBATE_ROUNDS = 3
        debate_history = ""
        round_count = 0
        final_audit = None

        is_re_audited = False
        language = extraction.get("language", "en")

        while round_count < MAX_DEBATE_ROUNDS:
            round_count += 1
            print(f"\n[TURN {round_count}: AUDIT] Agent: Auditor (Critic), Model: {settings.AGENT_CRITIC_MODEL}")
            
            audit = await CriticAgent.process(symptoms, decision, clinical_context=clinical_context, language=language, language_preference=language_preference)
            final_audit = audit
            
            print(f"DEBUG: [Auditor Reasoning]\n{audit.get('critique')}")

            if audit.get("status") == "PASSED":
                print(f"DEBUG: [Consensus] PASSED: Auditor validated the decision.")
                break
            
            # If rejected, Gemini (Strategist) gets a chance to rebut/concede
            critique = audit.get("critique", "Inconsistent logic")
            debate_history += f"Round {round_count} Auditor Critique: {critique}\n"
            
            print(f"\n[TURN {round_count}: REBUTTAL] Agent: Strategist, Model: {settings.AGENT_STRATEGIST_MODEL}")
            
            decision = await StrategistAgent.process(
                extraction, 
                clinical_context, 
                valid_departments=live_depts, 
                is_fallback_mode=(live_depts is not None),
                debate_history=debate_history,
                language_preference=language_preference
            )
            is_re_audited = True
            print(f"DEBUG: [Strategist Reasoning]\n{decision.get('reasoning')}")
            print(f"DEBUG: [Consensus Round {round_count}] Strategist Result -> {decision.get('urgency')} {decision.get('specialist')}")

        # Final Tie-Breaker
        if final_audit and final_audit.get("status") == "REJECTED":
            print(f"\n[FINAL TIE-BREAKER] Decided by Auditor ({settings.AGENT_CRITIC_MODEL})")
            revised = final_audit.get("revised_decision")
            if revised:
                decision = revised
        
        print(f"\n[TRIAGE COMPLETE] Final Outcome: {decision.get('urgency')} {decision.get('specialist')}")



        return {
            "is_validated": final_audit.get("status") == "PASSED" or is_re_audited,
            "extraction": extraction,
            "decision": decision,
            "critique": final_audit.get("critique") if final_audit else "No audit performed",
            "is_fallback": count == 0,
            "is_re_audited": is_re_audited
        }





triage_orchestrator = TriageOrchestrator()
