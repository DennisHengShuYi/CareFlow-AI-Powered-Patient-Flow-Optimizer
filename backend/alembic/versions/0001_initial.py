"""
Initial schema — all tables + pgvector + HNSW index + Row Level Security.
Run: alembic upgrade head
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 0. Enable pgvector extension
    # ------------------------------------------------------------------
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # ------------------------------------------------------------------
    # 1. patients
    # ------------------------------------------------------------------
    op.create_table(
        "patients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("ic_number", sa.String(50), nullable=False, unique=True),
        sa.Column("phone", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("date_of_birth", sa.DateTime, nullable=True),
        sa.Column("language_preference", sa.String(10), nullable=False, server_default="en"),
        sa.Column("metadata_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 2. sessions
    # ------------------------------------------------------------------
    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=True),
        sa.Column("conversation_history", postgresql.JSONB, nullable=True),
        sa.Column("triage_result", postgresql.JSONB, nullable=True),
        sa.Column("urgency_level", sa.String(10), nullable=True),
        sa.Column("confidence_score", sa.Float, nullable=True),
        sa.Column("follow_up_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("intake_channel", sa.String(50), nullable=False, server_default="text"),
        sa.Column("language_detected", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 3. providers
    # ------------------------------------------------------------------
    op.create_table(
        "providers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("provider_type", sa.String(50), nullable=False),
        sa.Column("specialties", postgresql.JSONB, nullable=False),
        sa.Column("clinic_name", sa.String(255), nullable=False),
        sa.Column("clinic_address", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("slot_templates", postgresql.JSONB, nullable=True),
        sa.Column("max_advance_booking_days", sa.Integer, server_default="30", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 4. appointments
    # ------------------------------------------------------------------
    op.create_table(
        "appointments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer, server_default="30", nullable=False),
        sa.Column("appointment_type", sa.String(100), server_default="consultation", nullable=False),
        sa.Column("urgency_level", sa.String(10), nullable=False),
        sa.Column("status", sa.String(50), server_default="booked", nullable=False),
        sa.Column("chief_complaint", sa.Text, nullable=False),
        sa.Column("fhir_resource", postgresql.JSONB, nullable=True),
        sa.Column("confirmation_sent_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 5. audit_logs
    # ------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", sa.String(255), nullable=False),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("llm_provider", sa.String(50), nullable=False),
        sa.Column("llm_model", sa.String(100), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("prompt_tokens", sa.Integer, nullable=True),
        sa.Column("completion_tokens", sa.Integer, nullable=True),
        sa.Column("latency_ms", sa.Integer, nullable=False),
        sa.Column("status_code", sa.Integer, nullable=False),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("metadata_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 6. medical_kb_embeddings  (vector column added after table creation)
    # ------------------------------------------------------------------
    op.create_table(
        "medical_kb_embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_ref", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", sa.Text, nullable=True),   # placeholder; cast below
        sa.Column("metadata_data", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # Cast to proper vector type after table creation (pgvector requirement)
    op.execute(
        "ALTER TABLE medical_kb_embeddings "
        "ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536);"
    )

    # HNSW index for fast cosine similarity search
    op.execute(
        "CREATE INDEX ix_medical_kb_embedding_hnsw "
        "ON medical_kb_embeddings "
        "USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64);"
    )

    # ------------------------------------------------------------------
    # 7. Row Level Security on ALL tables
    # ------------------------------------------------------------------
    tables = [
        "patients",
        "sessions",
        "providers",
        "appointments",
        "audit_logs",
        "medical_kb_embeddings",
    ]
    for table in tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(
            f"CREATE POLICY service_role_all ON {table} "
            f"FOR ALL TO service_role USING (true) WITH CHECK (true);"
        )


def downgrade() -> None:
    tables = [
        "medical_kb_embeddings",
        "audit_logs",
        "appointments",
        "providers",
        "sessions",
        "patients",
    ]
    for table in tables:
        op.drop_table(table)
    op.execute("DROP EXTENSION IF EXISTS vector;")
