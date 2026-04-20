"""
Multi-modal intake pipeline.
Produces a normalised IntakePayload before the triage agent.
"""
import io
from typing import Optional

# Heavy imports moved to lazy loaders to save memory
from langdetect import detect, LangDetectException
from pydantic import BaseModel, Field

from app.config.llm_provider import llm

# ---------------------------------------------------------------------------
# Whisper model — loaded once at import time (medium, CPU int8)
# ---------------------------------------------------------------------------
_whisper: Optional["WhisperModel"] = None


def _get_whisper() -> "WhisperModel":
    global _whisper
    if _whisper is None:
        print("DEBUG: Lazy loading Whisper model (Memory Intensive)...")
        from faster_whisper import WhisperModel
        _whisper = WhisperModel("medium", device="cpu", compute_type="int8")
    return _whisper


# ---------------------------------------------------------------------------
# Normalised output model
# ---------------------------------------------------------------------------
class IntakePayload(BaseModel):
    content: str
    modality: str                             # text | voice | document
    detected_language: str
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Pipeline class
# ---------------------------------------------------------------------------
class IntakePipeline:

    @staticmethod
    def _detect_language(text: str) -> str:
        try:
            return detect(text)
        except LangDetectException:
            return "unknown"

    # ------ TEXT ----------------------------------------------------------
    async def process_text(self, text: str) -> IntakePayload:
        """Detect language, no gating — pass through as-is."""
        lang = self._detect_language(text)
        return IntakePayload(content=text, modality="text", detected_language=lang)

    # ------ VOICE ---------------------------------------------------------
    async def process_voice(self, audio_bytes: bytes) -> IntakePayload:
        """Transcribe with faster-whisper; language auto-detected by model."""
        model = _get_whisper()
        segments, info = model.transcribe(
            io.BytesIO(audio_bytes),
            beam_size=5,
            language=None,          # auto-detect
        )
        transcript = " ".join(seg.text for seg in segments).strip()
        return IntakePayload(
            content=transcript,
            modality="voice",
            detected_language=info.language,
            metadata={"whisper_language_prob": round(info.language_probability, 3)},
        )

    # ------ DOCUMENT ------------------------------------------------------
    async def process_document(self, file_bytes: bytes, mime_type: str) -> IntakePayload:
        """
        1. Extract text via pdfplumber (embedded) or pytesseract (scanned image).
        2. Run LLM OCR correction pass to fix scanning artefacts.
        """
        raw_text = ""

        try:
            if mime_type == "application/pdf":
                import pdfplumber
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t:
                            raw_text += t + "\n"
            elif mime_type.startswith("image/"):
                from PIL import Image
                import pytesseract
                image = Image.open(io.BytesIO(file_bytes))
                try:
                    raw_text = pytesseract.image_to_string(image, lang="eng+msa")
                except Exception as e:
                    print(f"DEBUG: Tesseract not found or failed: {e}")
                    raise ValueError("Image OCR engine (Tesseract) is not installed on this system. Please upload a searchable PDF.")
            else:
                raise ValueError(f"Unsupported document MIME type: {mime_type}")
        except Exception as e:
            print(f"DEBUG: Document processing failed: {e}")
            if isinstance(e, ValueError): raise e
            raise ValueError(f"Failed to extract text from document: {str(e)}")

        if not raw_text.strip():
            print("DEBUG: Document contains no extractable text (likely scanned image).")
            raise ValueError("This document appears to be a scanned image or contains no readable text. Please upload a searchable version or type the notes manually.")

        # LLM identification and correction pass
        correction_system = (
            "You are a medical document specialist. "
            "1. IDENTIFY: Determine if this is a Lab Report, Prescription, Doctor's Note, or General Document. "
            "2. CLEAN: Fix scanning artefacts, typos, and broken lines. "
            "3. FORMAT: Prepend the identification as [DOC_TYPE: TYPE]. "
            "Preserve all Bahasa Malaysia and English content. "
            "Output ONLY the [DOC_TYPE] header followed by the cleaned clinical text."
        )
        try:
            corrected = await llm.generate(raw_text[:4000], correction_system, response_format="text")
        except Exception as e:
            print(f"DEBUG: OCR Correction LLM pass failed: {e}")
            corrected = raw_text # Fallback to raw OCR

        lang = self._detect_language(corrected)
        return IntakePayload(
            content=corrected,
            modality="document",
            detected_language=lang,
            metadata={"original_length": len(raw_text), "mime_type": mime_type},
        )



intake_pipeline = IntakePipeline()
