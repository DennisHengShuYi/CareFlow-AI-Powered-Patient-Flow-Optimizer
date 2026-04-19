"""
Upstash Redis REST client — httpx only, no redis-py / aioredis.

Upstash REST API accepts commands as:
  GET  /<CMD>/<arg1>/<arg2>...
  POST / with JSON body: ["CMD", "arg1", "arg2", ...]

We use POST exclusively so multi-argument commands with special chars are URL-safe.
"""
import json
from typing import Any, Optional

import httpx

from app.config.settings import settings


class UpstashRedis:
    def __init__(self):
        self._url = settings.UPSTASH_REDIS_REST_URL.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {settings.UPSTASH_REDIS_REST_TOKEN}",
            "Content-Type": "application/json",
        }

    async def _cmd(self, *args: Any) -> Any:
        """Execute a single Redis command via POST."""
        if "your-endpoint" in self._url:
             # Fast bypass for local mock if no real DB mapped
             return True

        async with httpx.AsyncClient(timeout=60.0, verify=False) as client:
            resp = await client.post(
                self._url,
                headers=self._headers,
                json=list(args),
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"Upstash error: {data['error']}")
            return data.get("result")

    # ------------------------------------------------------------------
    # Session helpers
    # ------------------------------------------------------------------
    async def set_session(self, session_id: str, data: dict) -> None:
        """Store session data as JSON string with TTL."""
        await self._cmd("SET", f"session:{session_id}", json.dumps(data),
                        "EX", settings.SESSION_TTL_SECONDS)

    async def get_session(self, session_id: str) -> Optional[dict]:
        result = await self._cmd("GET", f"session:{session_id}")
        return json.loads(result) if result else None

    async def delete_session(self, session_id: str) -> None:
        await self._cmd("DEL", f"session:{session_id}")
        await self._cmd("DEL", f"session:{session_id}:turns")

    async def refresh_session_ttl(self, session_id: str) -> None:
        """Extend both session keys on every activity."""
        await self._cmd("EXPIRE", f"session:{session_id}", settings.SESSION_TTL_SECONDS)
        await self._cmd("EXPIRE", f"session:{session_id}:turns", settings.SESSION_TTL_SECONDS)

    # ------------------------------------------------------------------
    # Conversation turns — Redis List for atomic append
    # ------------------------------------------------------------------
    async def append_turn(self, session_id: str, turn: dict) -> None:
        """RPUSH turn then refresh TTL so idle sessions expire cleanly."""
        await self._cmd("RPUSH", f"session:{session_id}:turns", json.dumps(turn))
        await self.refresh_session_ttl(session_id)

    async def get_turns(self, session_id: str) -> list[dict]:
        results = await self._cmd("LRANGE", f"session:{session_id}:turns", 0, -1)
        if not results:
            return []
        return [json.loads(r) for r in results]

    async def get_turn_count(self, session_id: str) -> int:
        count = await self._cmd("LLEN", f"session:{session_id}:turns")
        return int(count or 0)

    # ------------------------------------------------------------------
    # Rate limiting — INCR + EXPIRE sliding window
    # ------------------------------------------------------------------
    async def check_rate_limit(self, identifier: str) -> bool:
        """
        Returns True if the request is allowed.
        Uses INCR + EXPIRE: first call sets the window, subsequent calls
        increment. Window resets naturally after RATE_LIMIT_WINDOW_SECONDS.
        """
        key = f"ratelimit:{identifier}"
        current = await self._cmd("INCR", key)
        current = int(current)
        if current == 1:
            # First request in this window — set expiry
            await self._cmd("EXPIRE", key, settings.RATE_LIMIT_WINDOW_SECONDS)
        return current <= settings.RATE_LIMIT_MAX


redis_client = UpstashRedis()
