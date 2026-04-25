import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, ForeignKey, DateTime, Text, Boolean, Enum as SAEnum, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from pgvector.sqlalchemy import Vector


from app.config.settings import settings

# ---------------------------------------------------------------------------
# SQLAlchemy declarative base
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Engine and Session
# ---------------------------------------------------------------------------
_DB_URL = settings.DATABASE_URL or settings.DATABASE_URL_DIRECT
if not _DB_URL:
    raise RuntimeError("DATABASE_URL (or DATABASE_URL_DIRECT) is missing in .env")

engine = create_async_engine(
    _DB_URL,
    pool_pre_ping=True
)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------
APPOINTMENT_STATUS_SCHEDULED = "Upcoming"
APPOINTMENT_STATUS_COMPLETED = "Past"
APPOINTMENT_STATUS_CANCELLED = "Cancelled"
APPOINTMENT_STATUS_NO_SHOW = "No-show"
APPOINTMENT_STATUS_RESCHEDULED = "Rescheduled"
APPOINTMENT_STATUS_CURRENT = "Current"
APPOINTMENT_STATUS_VALUES = (
    APPOINTMENT_STATUS_SCHEDULED,
    APPOINTMENT_STATUS_COMPLETED,
    APPOINTMENT_STATUS_CANCELLED,
    APPOINTMENT_STATUS_NO_SHOW,
    APPOINTMENT_STATUS_RESCHEDULED,
    APPOINTMENT_STATUS_CURRENT,
)


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    profile_id: Mapped[str | None] = mapped_column(ForeignKey("profiles.id"), nullable=True)
    ic_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    language_preference: Mapped[str] = mapped_column(String(10), default="en")  # en/ms/mixed
    metadata_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("patients.id"), nullable=True)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id"), nullable=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctors.id"), nullable=True)
    conversation_history: Mapped[list] = mapped_column(JSONB, default=list)
    triage_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    urgency_level: Mapped[str | None] = mapped_column(String(10), nullable=True)   # P1-P4
    status: Mapped[str] = mapped_column(String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    specialty_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    # ID matches Clerk user id (string)
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id"), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="patient") # patient, doctor, hospital_staff
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hospital_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True)
    usage_minutes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Appointment(Base):

    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"), nullable=False)
    hospital_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("hospitals.id", ondelete="SET NULL"), nullable=True)
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("doctors.id", ondelete="SET NULL"), nullable=True)
    room_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    appointment_type: Mapped[str] = mapped_column(String(100), default="consultation")
    urgency_level: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum(*APPOINTMENT_STATUS_VALUES, name="appointment_status"),
        default=APPOINTMENT_STATUS_SCHEDULED,
        nullable=False,
    )
    chief_complaint: Mapped[str] = mapped_column(Text, nullable=False)
    fhir_resource: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    confirmation_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    llm_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    llm_model: Mapped[str] = mapped_column(String(100), nullable=False)
    input_hash: Mapped[str] = mapped_column(String(64), nullable=False)     # SHA-256 only
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class IntakeLog(Base):
    """
    Stores each conversation turn from the Patient Data (triage intake) page.
    One row per user↔AI exchange. Linked to sessions → patients.
    """
    __tablename__ = "intake_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # matches sessions.id (UUID as string)
    clerk_user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # Clerk sub
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1-indexed
    user_prompt: Mapped[str] = mapped_column(Text, nullable=False)          # Raw patient input
    ai_triage_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Full triage JSON
    ai_reply: Mapped[str | None] = mapped_column(Text, nullable=True)        # Follow-up question, or "Triage complete"
    urgency_score: Mapped[str | None] = mapped_column(String(10), nullable=True)  # P1-P4
    recommended_specialist: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    input_channel: Mapped[str] = mapped_column(String(50), default="text")   # text | voice | document
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MedicalKBEmbedding(Base):
    """
    Stores clinical guidelines (e.g. from MOH PDFs) as chunked text with 
    vector embeddings for semantic retrieval.
    """
    __tablename__ = "medical_kb_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1024)) # BGE-M3 is 1024
    metadata_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True) # {source: pdf, page: X, chapter: Y}
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
