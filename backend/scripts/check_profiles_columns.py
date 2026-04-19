from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

supabase = create_client(supabase_url, supabase_key)

try:
    # Use RPC or just try a query and see if it fails with specific column errors
    res = supabase.from_('profiles').select('*').limit(1).execute()
    print("Profiles data:", res.data)
except Exception as e:
    print("Error querying profiles:", e)
