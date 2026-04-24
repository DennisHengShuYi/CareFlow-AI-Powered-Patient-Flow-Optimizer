import asyncio
import os
import sys

# Add the current directory to sys.path
sys.path.append(os.getcwd())

from app.utils.supabase_client import supabase_rest

async def main():
    print("Checking for related tables...")
    try:
        gl = await supabase_rest.query_table('guarantee_letters', {'limit': 1})
        print(f"GL table exists. Sample: {gl}")
    except:
        print("GL table not found or error.")
        
    try:
        claims = await supabase_rest.query_table('insurance_claims', {'limit': 1})
        print(f"Claims table exists. Sample: {claims}")
    except:
        print("Claims table not found or error.")
        
    try:
        case_info = await supabase_rest.query_table('medical_cases', {'limit': 1})
        print(f"Case sample: {case_info[0]}")
    except:
        print("Error fetching case sample.")

if __name__ == "__main__":
    asyncio.run(main())
