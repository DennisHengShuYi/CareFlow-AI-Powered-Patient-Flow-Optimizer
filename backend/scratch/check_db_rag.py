import asyncio
from app.utils.supabase_client import supabase
import sys

async def check():
    try:
        # Check departments
        res = await supabase.from_("departments").select("name").execute()
        print(f"DEPARTMENTS FOUND: {[d['name'] for d in res.data]}")
        
        # Check guidelines
        res2 = await supabase.from_("moh_guidelines").select("id").limit(5).execute()
        print(f"MOH_GUIDELINES SAMPLE COUNT: {len(res2.data)}")
        
        # Check if vectors are there (optional but helpful)
        res3 = await supabase.rpc("match_clinical_guidelines", {
            "query_embedding": [0.1] * 3072, # Dummy vector
            "match_threshold": 0.0,
            "match_count": 1
        }).execute()
        print(f"VECTOR SEARCH (match_clinical_guidelines): {'RPC Works' if res3 else 'RPC Fails'}")

    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(check())
