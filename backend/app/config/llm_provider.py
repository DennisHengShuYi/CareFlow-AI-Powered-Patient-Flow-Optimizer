"""
LLM Provider factory.

Provider selection is 100% driven by LLM_PROVIDER in .env.
No provider-specific code exists outside this file.
"""
import json
import httpx
import google.generativeai as genai

from app.config.settings import settings


class LLMProvider:
    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        self.embedding_provider = getattr(settings, "EMBEDDING_PROVIDER", settings.LLM_PROVIDER)
        self._bge_model = None # Lazy load

        if self.provider == "gemini":
            print(f"DEBUG: Initializing Gemini with model: {settings.MODEL_NAME}")
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._gemini_model = genai.GenerativeModel(settings.MODEL_NAME)

        elif self.provider == "zhipu":
            # We call ZhipuAI via raw httpx to stay fully async
            self._zhipu_base = "https://open.bigmodel.cn/api/paas/v4"
            self._zhipu_headers = {
                "Authorization": f"Bearer {settings.ZHIPU_API_KEY}",
                "Content-Type": "application/json",
            }
        elif self.provider == "bge":
            # If BGE is set as LLM_PROVIDER (unlikely but possible), it has no generate()
            pass
        else:
            raise ValueError(f"Unknown LLM_PROVIDER: '{self.provider}'. Must be 'gemini' or 'zhipu'.")

    # ------------------------------------------------------------------
    # Text generation
    # ------------------------------------------------------------------
    async def generate(
        self,
        prompt: str,
        system: str,
        response_format: str = "text",   # "text" | "json"
    ) -> str:
        if self.provider == "gemini":
            return await self._gemini_generate(prompt, system, response_format)
        return await self._zhipu_generate(prompt, system, response_format)

    async def _gemini_generate(self, prompt: str, system: str, response_format: str) -> str:
        generation_config = genai.GenerationConfig(
            response_mime_type=(
                "application/json" if response_format == "json" else "text/plain"
            )
        )
        # Combine system and prompt for simplicity in this factory
        full_prompt = f"System Instruction:\n{system}\n\nUser Input:\n{prompt}"
        
        import asyncio
        loop = asyncio.get_event_loop()
        try:
            response = await loop.run_in_executor(
                None,
                lambda: self._gemini_model.generate_content(
                    full_prompt, generation_config=generation_config
                ),
            )
            if not response or not response.text:
                raise ValueError(f"Empty response from Gemini. Finish reason: {response.candidates[0].finish_reason if response.candidates else 'unknown'}")
            return response.text
        except Exception as e:
            print(f"LLM Error (Gemini): {e}")
            raise

    async def _zhipu_generate(self, prompt: str, system: str, response_format: str) -> str:
        payload: dict = {
            "model": settings.MODEL_NAME,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        }
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self._zhipu_base}/chat/completions",
                headers=self._zhipu_headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    # ------------------------------------------------------------------
    # Embeddings
    # ------------------------------------------------------------------
    async def embed(self, text: str | list[str]) -> list[float] | list[list[float]]:
        if self.embedding_provider == "huggingface":
            return await self._huggingface_embed(text)
        elif self.embedding_provider == "bge":
            return await self._bge_embed(text)
            
        if self.provider == "gemini":
            return await self._gemini_embed(text)
        return await self._zhipu_embed(text)

    async def _gemini_embed(self, text: str) -> list[float]:
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: genai.embed_content(
                model="models/gemini-embedding-001",
                content=text,
                task_type="retrieval_document",
            ),
        )
        return result["embedding"]

    async def _zhipu_embed(self, text: str) -> list[float]:
        payload = {"model": "embedding-3", "input": text}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._zhipu_base}/embeddings",
                headers=self._zhipu_headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["data"][0]["embedding"]

    async def _bge_embed(self, text: str) -> list[float]:
        """Local BGE embeddings using sentence-transformers."""
        if self._bge_model is None:
            from sentence_transformers import SentenceTransformer
            print(f"DEBUG: Loading local embedding model: {settings.EMBEDDING_MODEL}")
            # This might take time first time
            self._bge_model = SentenceTransformer(settings.EMBEDDING_MODEL)
        
        import asyncio
        loop = asyncio.get_event_loop()
        # encode is synchronous, run in executor
        result = await loop.run_in_executor(
            None,
            lambda: self._bge_model.encode(text, normalize_embeddings=True)
        )
        return result.tolist()

    async def _huggingface_embed(self, text: str | list[str]) -> list[float] | list[list[float]]:
        """Generate embeddings using HuggingFace Inference Client."""
        if not settings.HUGGINGFACE_API_KEY:
             raise ValueError("HUGGINGFACE_API_KEY is not set in .env")

        from huggingface_hub import AsyncInferenceClient
        client = AsyncInferenceClient(token=settings.HUGGINGFACE_API_KEY)
        
        try:
            # feature_extraction returns the vector(s)
            result = await client.feature_extraction(text, model=settings.EMBEDDING_MODEL)
            
            # If it's a single string, result is [dim1, dim2, ...]
            # If it's a list of strings, result is [[dim1, ...], [dim1, ...]]
            
            if hasattr(result, "tolist"):
                return result.tolist()
            
            return result
        except Exception as e:
            print(f"HuggingFace Client Error: {e}")
            raise


# Singleton — imported everywhere
llm = LLMProvider()
