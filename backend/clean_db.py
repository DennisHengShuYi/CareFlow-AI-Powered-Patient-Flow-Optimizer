import asyncio
from app.utils.supabase_client import supabase_rest

async def clean_db():
    res = await supabase_rest.query_table('patients', {'select': 'id,full_name,metadata_data'})
    for p in res:
        meta = p.get('metadata_data') or {}
        changed = False

        for k in ['blood_pressure', 'heart_rate', 'oxygen_saturation']:
            v = meta.get(k)
            # Recursively unwrap nested dicts
            depth = 0
            while isinstance(v, dict) and depth < 5:
                v = v.get(k) or next(iter(v.values()), "")
                depth += 1
            if v is not None and not isinstance(v, str):
                v = str(v)
            if isinstance(meta.get(k), dict):
                meta[k] = v or ""
                changed = True

        if changed:
            print(f"Fixing {p.get('full_name', p['id'])}: {meta}")
            await supabase_rest.update_table('patients', {'metadata_data': meta}, str(p['id']))

    print("Done.")

asyncio.run(clean_db())
