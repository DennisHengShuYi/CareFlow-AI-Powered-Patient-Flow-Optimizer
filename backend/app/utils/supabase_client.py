import httpx
from app.config.settings import settings
from fastapi import HTTPException

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

    async def update_table(self, table: str, data: dict, filters: dict):
        """Update data in a Supabase table via REST."""
        if not self.url or not self.key:
            return None
            
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            endpoint = f"{self.url}/rest/v1/{table}"
            # Filters are passed as query params (e.g. ?id=eq.XXX)
            response = await client.patch(endpoint, headers=self.headers, json=data, params=filters)
            if response.status_code not in [200, 201, 204]:
                print(f"DEBUG: Supabase REST error {response.status_code}: {response.text}")
                return None
            return response.json() if response.status_code != 204 else True

    async def delete_table(self, table: str, filters: dict):
        """Delete data from a Supabase table via REST."""
        if not self.url or not self.key:
            return None
            
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            endpoint = f"{self.url}/rest/v1/{table}"
            response = await client.delete(endpoint, headers=self.headers, params=filters)
            if response.status_code not in [200, 201, 204]:
                print(f"DEBUG: Supabase REST error {response.status_code}: {response.text}")
                return None
            return True

    async def upload_file(self, bucket: str, path: str, file_content: bytes, content_type: str):
        """Upload a file to Supabase Storage via REST."""
        if not self.url or not self.key:
            return None
            
        async with httpx.AsyncClient(verify=False, timeout=60.0) as client:
            # Note: storage endpoint is different from rest/v1
            endpoint = f"{self.url}/storage/v1/object/{bucket}/{path}"
            headers = {
                "Authorization": f"Bearer {self.key}",
                "Content-Type": content_type
            }
            response = await client.post(endpoint, headers=headers, content=file_content)
            if response.status_code not in [200, 201]:
                print(f"DEBUG: Supabase Storage error {response.status_code}: {response.text}")
                return None
            return response.json()

    async def update_table(self, table: str, id: str, data: dict):
        """Update a single record in a Supabase table via REST."""
        if not self.url or not self.key:
            return None

        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            endpoint = f"{self.url}/rest/v1/{table}?id=eq.{id}"
            response = await client.patch(endpoint, headers=self.headers, json=data)
            if response.status_code not in [200, 201, 204]:
                print(f"DEBUG: Supabase REST error {response.status_code}: {response.text}")
                return None
            if response.status_code == 204 or not response.content:
                return {}
            return response.json()

    async def delete_table(self, table: str, id: str):
        """Delete a single record from a Supabase table via REST."""
        if not self.url or not self.key:
            return None

        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            endpoint = f"{self.url}/rest/v1/{table}?id=eq.{id}"
            response = await client.delete(endpoint, headers=self.headers)
            if response.status_code not in [200, 201, 204]:
                print(f"DEBUG: Supabase REST error {response.status_code}: {response.text}")
                return None
            return True

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

    async def upsert_table(self, table: str, data: dict, id: str = None):
        if id:
            result = await self.update_table(table, id, data)
            if result is not None:
                return result
        return await self.insert_table(table, data)

supabase_rest = SupabaseRESTClient()