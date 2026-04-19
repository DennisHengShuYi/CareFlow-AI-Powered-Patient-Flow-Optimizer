import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def check():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Missing credentials")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    tables = ["hospitals", "departments", "profiles"]
    for table in tables:
        try:
            res = supabase.table(table).select("count", count="exact").limit(1).execute()
            print(f"Table '{table}' exists. Row count: {res.count}")
        except Exception as e:
            print(f"Table '{table}' error: {e}")

if __name__ == "__main__":
    check()
