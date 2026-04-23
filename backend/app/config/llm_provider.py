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
        self._openai_client = None
        self._groq_client = None

        if self.provider == "gemini":
            print(f"DEBUG: Initializing Gemini with model: {settings.MODEL_NAME}")
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._gemini_model_cache = {} # Cache models by name

    def _get_gemini_model(self, model_name: str):
        if model_name not in self._gemini_model_cache:
            self._gemini_model_cache[model_name] = genai.GenerativeModel(model_name)
        return self._gemini_model_cache[model_name]

    def _get_openai_client(self):
        if self._openai_client is None:
            from openai import AsyncOpenAI
            import httpx
            # Set a 45s timeout to prevent extreme hangs
            http_client = httpx.AsyncClient(timeout=45.0)
            self._openai_client = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_API_BASE if settings.OPENAI_API_BASE else None,
                http_client=http_client
            )
        return self._openai_client

    def _get_groq_client(self):
        if self._groq_client is None:
            from openai import AsyncOpenAI
            import httpx
            http_client = httpx.AsyncClient(timeout=30.0)
            self._groq_client = AsyncOpenAI(
                api_key=settings.GROQ_API_KEY,
                base_url="https://api.groq.com/openai/v1",
                http_client=http_client
            )
        return self._groq_client

    # ------------------------------------------------------------------
    # Text generation
    # ------------------------------------------------------------------
    async def generate(
        self,
        prompt: str,
        system: str,
        response_format: str = "text",   # "text" | "json"
        model: str | None = None,        # Optional model override
        provider: str | None = None,     # Optional provider override
    ) -> str:
        target_provider = provider or self.provider
        target_model = model or settings.MODEL_NAME

        if target_provider == "openai":
            return await self._openai_generate(prompt, system, response_format, target_model)
        
        if target_provider == "groq":
            return await self._groq_generate(prompt, system, response_format, target_model)
        
        if target_provider == "gemini":
            return await self._gemini_generate(prompt, system, response_format, target_model)
            
        return await self._zhipu_generate(prompt, system, response_format, target_model)

    async def _openai_generate(self, prompt: str, system: str, response_format: str, model: str) -> str:
        client = self._get_openai_client()
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        
        payload = {
            "model": model,
            "messages": messages,
        }
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}

        response = await client.chat.completions.create(**payload)
        content = response.choices[0].message.content or ""
        
        # Strip markdown fences if model wraps anyway (common in some OpenAI-compatible APIs)
        content = content.strip()
        if content.startswith("```"):
            import re
            content = re.sub(r"^```[a-z]*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)
            content = content.strip()
            
        return content

    async def _groq_generate(self, prompt: str, system: str, response_format: str, model: str) -> str:
        client = self._get_groq_client()
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        
        payload = {
            "model": model,
            "messages": messages,
        }
        if response_format == "json":
            payload["response_format"] = {"type": "json_object"}

        response = await client.chat.completions.create(**payload)
        content = response.choices[0].message.content or ""
        
        # Strip markdown fences
        content = content.strip()
        if content.startswith("```"):
            import re
            content = re.sub(r"^```[a-z]*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)
            content = content.strip()
            
        return content

    async def _gemini_generate(self, prompt: str, system: str, response_format: str, model: str) -> str:
        generation_config = genai.GenerationConfig(
            response_mime_type=(
                "application/json" if response_format == "json" else "text/plain"
            )
        )
        # Combine system and prompt for simplicity in this factory
        full_prompt = f"System Instruction:\n{system}\n\nUser Input:\n{prompt}"
        
        model_obj = self._get_gemini_model(model)
        
        import asyncio
        loop = asyncio.get_event_loop()
        try:
            response = await loop.run_in_executor(
                None,
                lambda: model_obj.generate_content(
                    full_prompt, generation_config=generation_config
                ),
            )
            if not response or not response.text:
                raise ValueError(f"Empty response from Gemini. Finish reason: {response.candidates[0].finish_reason if response.candidates else 'unknown'}")
            return response.text
        except Exception as e:
            print(f"LLM Error (Gemini): {e}")
            raise

    async def _zhipu_generate(self, prompt: str, system: str, response_format: str, model: str) -> str:
        payload: dict = {
            "model": model,
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

    def _get_hf_client(self):
        if not hasattr(self, "_hf_client") or self._hf_client is None:
            from huggingface_hub import AsyncInferenceClient
            self._hf_client = AsyncInferenceClient(token=settings.HUGGINGFACE_API_KEY)
        return self._hf_client

    async def _huggingface_embed(self, text: str | list[str]) -> list[float] | list[list[float]]:
        """Generate embeddings using HuggingFace Inference Client."""
        if not settings.HUGGINGFACE_API_KEY:
             raise ValueError("HUGGINGFACE_API_KEY is not set in .env")

        client = self._get_hf_client()
        
        try:
            # feature_extraction returns the vector(s)
            result = await client.feature_extraction(text, model=settings.EMBEDDING_MODEL)
            
            if hasattr(result, "tolist"):
                return result.tolist()
            
            return result
        except Exception as e:
            print(f"HuggingFace Client Error: {e}")
            raise



# Singleton — imported everywhere
llm = LLMProvider()
