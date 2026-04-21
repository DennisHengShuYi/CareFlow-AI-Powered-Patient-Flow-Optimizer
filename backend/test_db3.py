import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
async def test():
    try:
        url = 'postgresql+asyncpg://postgres:1tzM0ZzSOS3oicsB@db.guiimyubbbrnzmzncetx.supabase.co:5432/postgres'
        engine = create_async_engine(url, pool_pre_ping=True)
        async with engine.begin() as conn:
            await conn.execute(text('SELECT 1'))
            print('SUCCESS db endpoint')
    except Exception as e:
        print(f'ERROR: {type(e).__name__} - {str(e)}')
asyncio.run(test())
