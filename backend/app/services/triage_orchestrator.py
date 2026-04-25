import asyncio
import time
import re
from typing import List, Dict
from sqlalchemy import select, text as sa_text
from app.models.db import AsyncSessionLocal, MedicalKBEmbedding
from app.config.settings import settings
from app.config.llm_provider import llm
from app.services.agents.clinical_agents import ExtractorAgent, StrategistAgent, CriticAgent



class TriageOrchestrator:
    """The Multi-Agent Orchestrator (Sparse Context Pattern)"""
    
    async def _fetch_all_live_depts(self) -> List[str]:
        """Fetch all unique departments currently available across the network."""
        try:
            async with AsyncSessionLocal() as db:
                stmt = sa_text("SELECT distinct(name) FROM departments ORDER BY name ASC")
                res = await db.execute(stmt)
                return [r[0] for r in res.fetchall()]
        except Exception as e:
            print(f"DEBUG: [DB] Pre-fetch departments failed: {e}")
            return []

    async def _get_rag_context(self, symptoms: List[str] = None, precomputed_vector: List[float] = None) -> str:

        """Fetch clinical context using clean symptoms or a precomputed vector (High Relevance)."""
        if not symptoms and not precomputed_vector:
            return "No specific guidelines available."
            
        try:
            if precomputed_vector:
                vector = precomputed_vector
            else:
                search_query = ", ".join(symptoms)
                vector = await llm.embed(search_query)
            
            async with AsyncSessionLocal() as db:
                stmt = select(MedicalKBEmbedding.content).order_by(
                    MedicalKBEmbedding.embedding.cosine_distance(vector)
                ).limit(3)
                res = await db.execute(stmt)
                chunks = res.scalars().all()
                
                if chunks:
                    source_desc = symptoms if symptoms else "raw intent"
                    print(f"DEBUG: [RAG] Success! {len(chunks)} clinical guideline chunks retrieved for: {source_desc}")
                    return "\n---\n".join(chunks)
                else:
                    return "No specific guidelines available."
        except Exception as e:
            print(f"DEBUG: [RAG] Retrieval Failed: {e}")
            return "NOTE: Official guidelines currently unavailable. Triage proceeding based on AI base knowledge."



    async def run_pipeline(self, user_text: str, language_preference: str = "auto", history: List[Dict] = None):
        t_start = time.time()
        print(f"DEBUG: Starting Global-to-Local Pipeline for: {user_text[:30]}...")
        
        # Phase 1: Tier-1 Parallel Tasking (Concurrent Data Gathering)
        # ----------------------------------------------------
        # We start Extraction, Vectorization, and DB Inventory at the exact same moment.
        print("DEBUG: [Latency] Starting Tier-1 Concurrent Tasks (Extraction + RAG + DB)...")
        
        task_extr = ExtractorAgent.process(user_text, history=history, language_preference=language_preference)
        task_vector = llm.embed(user_text)
        task_depts = self._fetch_all_live_depts()
        
        extraction, vector, live_depts_all = await asyncio.gather(task_extr, task_vector, task_depts)

        
        t_tier1 = time.time() - t_start
        print(f"DEBUG: [Latency] Tier-1 Completed in {t_tier1:.2f}s")
        
        symptoms = extraction.get("symptoms", [])
        print(f"DEBUG: Agent 1 (Extraction) found: {symptoms}")

        # Phase 2: RAG Context Retrieval (Instant since vector is ready)
        # ----------------------------------------------------
        clinical_context = await self._get_rag_context(precomputed_vector=vector)

        # Phase 3: Multi-Agent Clinical Triage (Direct pass with constraints)
        # ----------------------------------------------------
        # We pass the live_depts_all list directly into the first Strategist call.
        # This removes the "Ideal then Verify" double-wait, saving ~40 seconds.
        live_depts = live_depts_all if live_depts_all else ["General Medicine", "Emergency Department"]
        
        print(f"DEBUG: [Stage 3] Strategist analysis (Constraint-Aware) for {len(live_depts)} departments...")
        
        decision = await StrategistAgent.process(
            extraction, 
            clinical_context, 
            valid_departments=live_depts,
            language_preference=language_preference,
            history=history
        )
        
        t_strat = time.time() - t_start
        print(f"DEBUG: [Latency] Tier-2 (Strategist) Completed in {t_strat:.2f}s")
        print(f"DEBUG: [Stage 3] Strategist Reasoning:\n{decision.get('reasoning')}")
        print(f"DEBUG: [Stage 3] Strategist Result -> Specialist: {decision.get('specialist')}")


        specialist_match = True # Always True now since we force-constrained the list


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
                language_preference=language_preference,
                history=history
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
        
        t_total = time.time() - t_start
        print(f"DEBUG: [Latency] TOTAL PIPELINE COMPLETED in {t_total:.2f}s")
        print(f"\n[TRIAGE COMPLETE] Final Outcome: {decision.get('urgency')} {decision.get('specialist')}")



        return {
            "is_validated": final_audit.get("status") == "PASSED" or is_re_audited,
            "extraction": extraction,
            "decision": decision,
            "critique": final_audit.get("critique") if final_audit else "No audit performed",
            "is_fallback": not specialist_match,
            "is_re_audited": is_re_audited
        }





triage_orchestrator = TriageOrchestrator()
