import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  MapPin,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCw,
  MoreVertical,
  Loader2
} from 'lucide-react';
import { AppointmentCard } from '../components/AppointmentCard';
import type { StandardAppointment, AppointmentStatus } from '../components/AppointmentCard';

// Use StandardAppointment and AppointmentStatus from AppointmentCard.tsx
type Appointment = StandardAppointment;

interface CaseInfo {
  id: string;
  title: string;
  department?: string;
  status?: string;
  workflowStatus?: string;
}

// ── API ────────────────────────────────────────────────────────────────────

const API = 'http://127.0.0.1:8002';

const fetchCaseTimeline = async (
  caseId: string
): Promise<{ caseInfo: CaseInfo; appointments: Appointment[] }> => {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}/api/cases/${caseId}/appointments`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch case timeline');
  const json = await res.json();
  if (!json.success) throw new Error('API returned failure');

  const caseInfo: CaseInfo = {
    id: json.case?.id ?? caseId,
    title: json.case?.title ?? 'Case Details',
    department: json.case?.department,
    status: json.case?.status,
    workflowStatus: json.case?.workflow_status
  };

  const appointments: Appointment[] = (json.data || []).map((a: any): Appointment => ({
    id: a.id,
    // appointment_type from payload
    title: a.appointment_type ?? 'Appointment',
    scheduledAt: a.scheduled_at,
    status: (a.status as AppointmentStatus) ?? 'Scheduled',
    urgencyLevel: a.urgency_level,
    chiefComplaint: a.chief_complaint,
    outcome: a.outcome_summary,
    // API returns `room` (string) for ward location
    ward: a.room ?? a.ward ?? null,
    // API returns `doctors` as nested object { id, full_name } or null
    doctors: a.doctors
      ? { id: a.doctors.id, full_name: a.doctors.full_name }
      : null,
    totalBill: Number(a.total_bill ?? 0),
    billStatus: a.bill_status,
    billFileUrl: a.bill_file_url
  }));

  return { caseInfo, appointments };
};

// ── Helpers ────────────────────────────────────────────────────────────────

// Remove local formatDateTime, normaliseStatus, STATUS_STYLES, getStatusStyle
// as they are now in AppointmentCard.tsx

// ── Component ──────────────────────────────────────────────────────────────

export default function CaseDetails() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    setLoading(true);
    fetchCaseTimeline(caseId)
      .then(({ caseInfo, appointments }) => {
        setCaseInfo(caseInfo);
        setAppointments(appointments);
      })
      .catch(err => {
        console.error('[CaseDetails]', err);
        setError(err.message ?? 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, [caseId]);

  const totalBill = appointments.reduce((sum, a) => sum + a.totalBill, 0);

  return (
    <LayoutSidebar>
      <div style={{ padding: '2rem 3rem', backgroundColor: 'var(--neutral-300)', minHeight: '100%' }}>

        {/* Header */}
        <header style={{ marginBottom: '2.5rem' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: 'var(--text-muted)', fontWeight: 600, marginBottom: '1.5rem',
              transition: 'color 0.2s', background: 'none', border: 'none', cursor: 'pointer', padding: 0
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={18} /> Back to Patients
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{
                fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--primary)', marginBottom: '0.5rem'
              }}>
                {caseInfo?.department ? `${caseInfo.department} · ` : ''}Case Timeline
              </div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>
                {loading ? 'Loading…' : (caseInfo?.title ?? 'Case Details')}
              </h1>
              {caseInfo?.workflowStatus && (
                <div style={{ marginTop: '0.5rem' }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700,
                    textTransform: 'capitalize',
                    backgroundColor: caseInfo.workflowStatus.toLowerCase() === 'approved' ? '#E8F5E9'
                      : caseInfo.workflowStatus.toLowerCase() === 'requested' ? '#FFF9C4'
                        : 'var(--neutral-400)',
                    color: caseInfo.workflowStatus.toLowerCase() === 'approved' ? '#2E7D32'
                      : caseInfo.workflowStatus.toLowerCase() === 'requested' ? '#F9A825'
                        : 'var(--text-muted)'
                  }}>
                    GL: {caseInfo.workflowStatus}
                  </span>
                </div>
              )}
            </div>
            {!loading && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Total Appointments
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                  {appointments.length}
                </div>
                {totalBill > 0 && (
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.25rem' }}>
                    RM {totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })} total
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Body */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6rem', color: 'var(--text-muted)' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginRight: '1rem' }} />
            <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>Loading appointments…</span>
          </div>
        ) : error ? (
          <div className="card" style={{ padding: '4rem', textAlign: 'center', color: '#C62828' }}>
            <XCircle size={48} style={{ opacity: 0.4, marginBottom: '1.5rem' }} />
            <h3>Failed to load case data</h3>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>{error}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {appointments.length > 0 ? (
              appointments.map(apt => (
                <AppointmentCard
                  key={apt.id}
                  appointment={{
                    ...apt,
                    outcome: apt.outcome, // matches prop name
                  } as StandardAppointment}
                />
              ))
            ) : (
              <div className="card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Calendar size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
                <h3>No appointments found for this case.</h3>
              </div>
            )}
          </div>
        )}

      </div>
    </LayoutSidebar>
  );
}