import httpx
from app.config.settings import settings

class SupabaseRESTClient:
    def __init__(self):
        self.url = settings.SUPABASE_URL
        self.key = settings.SUPABASE_SERVICE_ROLE_KEY
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    async def query_table(self, table: str, params: dict = None):
        """Fetch data from a Supabase table via REST."""
        if not self.url or not self.key:
            return None
            
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            endpoint = f"{self.url}/rest/v1/{table}"
            response = await client.get(endpoint, headers=self.headers, params=params)
            if response.status_code not in [200, 201]:
                print(f"DEBUG: Supabase REST error {response.status_code}: {response.text}")
                return None
            return response.json()

    async def insert_table(self, table: str, data: dict):
        """Insert data into a Supabase table via REST."""
        if not self.url or not self.key:
            return None
            
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            endpoint = f"{self.url}/rest/v1/{table}"
            response = await client.post(endpoint, headers=self.headers, json=data)
            if response.status_code not in [200, 201]:
                print(f"DEBUG: Supabase REST error {response.status_code}: {response.text}")
                return None
            return response.json()

    async def get_profile(self, user_id: str):
        """Fetch a single profile by ID."""
        data = await self.query_table("profiles", {"id": f"eq.{user_id}", "select": "*"})
        if data and len(data) > 0:
            return data[0]
        return None

    async def get_hospital(self, hospital_id: str):
        """Fetch hospital details."""
        data = await self.query_table("hospitals", {"id": f"eq.{hospital_id}", "select": "*"})
        if data and len(data) > 0:
            return data[0]
        return None

    async def get_departments(self, hospital_id: str):
        """Fetch departments for a hospital."""
        return await self.query_table("departments", {"hospital_id": f"eq.{hospital_id}", "select": "*"})

    async def get_doctors(self, hospital_id: str):
        """Fetch doctors for a hospital."""
        return await self.query_table("doctors", {"hospital_id": f"eq.{hospital_id}", "select": "*"})

    async def get_rooms(self, department_id: str):
        """Fetch rooms for a department."""
        return await self.query_table("rooms", {"department_id": f"eq.{department_id}", "select": "*"})

supabase_rest = SupabaseRESTClient()
