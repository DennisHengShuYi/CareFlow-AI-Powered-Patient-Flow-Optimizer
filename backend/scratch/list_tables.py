import asyncio
import httpx
from app.config.settings import settings

async def list_tables():
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }
    async with httpx.AsyncClient() as client:
        # Querying the OpenAPI definition to see all tables
        resp = await client.get(f"{url}/rest/v1/", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            # The keys of the 'definitions' or the paths give us the tables
            print("Tables found in REST API:")
            for p in data.get("paths", {}).keys():
                if p != "/":
                    print(f"- {p.strip('/')}")
        else:
            print(f"Error: {resp.status_code} - {resp.text}")

if __name__ == "__main__":
    asyncio.run(list_tables())
