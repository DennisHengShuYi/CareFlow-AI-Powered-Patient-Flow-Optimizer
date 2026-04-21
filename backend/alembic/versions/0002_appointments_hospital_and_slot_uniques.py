"""
Add appointments.hospital_id and enforce active-slot uniqueness.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_appointments_hospital_and_slot_uniques"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "appointments",
        sa.Column("hospital_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_appointments_hospital_id_hospitals",
        "appointments",
        "hospitals",
        ["hospital_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Backfill hospital_id for doctor-linked appointments.
    op.execute(
        """
        UPDATE appointments a
        SET hospital_id = d.hospital_id
        FROM doctors d
        WHERE a.doctor_id = d.id
          AND a.hospital_id IS NULL;
        """
    )

    # Remove duplicate active doctor slots before applying unique index.
    op.execute(
        """
        DELETE FROM appointments a
        USING appointments b
        WHERE a.id > b.id
          AND a.status = 'Scheduled'
          AND b.status = 'Scheduled'
          AND a.doctor_id IS NOT NULL
          AND b.doctor_id IS NOT NULL
          AND a.doctor_id = b.doctor_id
          AND a.scheduled_at = b.scheduled_at;
        """
    )

    # Remove duplicate active queue slots (hospital-scoped) before unique index.
    op.execute(
        """
        DELETE FROM appointments a
        USING appointments b
        WHERE a.id > b.id
          AND a.status = 'Scheduled'
          AND b.status = 'Scheduled'
          AND a.doctor_id IS NULL
          AND b.doctor_id IS NULL
          AND a.hospital_id IS NOT NULL
          AND b.hospital_id IS NOT NULL
          AND a.hospital_id = b.hospital_id
          AND a.scheduled_at = b.scheduled_at;
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_doctor_scheduled_active
        ON appointments (doctor_id, scheduled_at)
        WHERE doctor_id IS NOT NULL AND status = 'Scheduled';
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_queue_hospital_scheduled_active
        ON appointments (hospital_id, scheduled_at)
        WHERE doctor_id IS NULL AND hospital_id IS NOT NULL AND status = 'Scheduled';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_appointments_queue_hospital_scheduled_active;")
    op.execute("DROP INDEX IF EXISTS ux_appointments_doctor_scheduled_active;")
    op.drop_constraint("fk_appointments_hospital_id_hospitals", "appointments", type_="foreignkey")
    op.drop_column("appointments", "hospital_id")
