import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Calendar, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import LayoutSidebar from '../components/LayoutSidebar';

type TriageContext = {
  session_id: string;
  recommended_specialist: string;
  urgency: string;
  chief_complaint: string;
};

type Slot = {
  doctor_id: string;
  hospital_id: string;
  clinic_name: string;
  clinic_address: string;
  department_name: string;
  scheduled_at: string;
  duration_minutes: number;
  urgency: string;
  specialty_match: boolean;
  service_mode?: string;
  estimated_wait_minutes?: number | null;
};

type LocationState = {
  triageContext?: TriageContext;
  hospitalId?: string;
};

function formatSlotTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Appointments() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { state } = useLocation();
  const locationState = (state || {}) as LocationState;

  const [ctx, setCtx] = useState<TriageContext | null>(locationState.triageContext || null);
  const [hospitalId, setHospitalId] = useState<string | null>(locationState.hospitalId || null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Slot | null>(null);

  const canQuery = useMemo(() => {
    return Boolean(ctx?.recommended_specialist && ctx?.urgency);
  }, [ctx]);

  useEffect(() => {
    if (ctx) return;
    const cached = sessionStorage.getItem('latestTriageContext');
    if (!cached) return;
    try {
      setCtx(JSON.parse(cached));
    } catch {
      // Ignore malformed cache.
    }
  }, [ctx]);

  const fetchSlots = async () => {
    if (!ctx?.recommended_specialist || !ctx?.urgency) {
      setError('No triage context found. Please complete triage first.');
      return;
    }

    setLoadingSlots(true);
    setError(null);
    setStatus(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        specialty: ctx.recommended_specialist,
        urgency: ctx.urgency,
      });
      if (hospitalId) {
        params.set('hospital_id', hospitalId);
      }

      const res = await fetch(`http://localhost:8002/appointments/slots?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        let detail = 'Failed to fetch available appointment slots.';
        try {
          const err = await res.json();
          detail = err?.detail || detail;
        } catch {
          // Keep default error.
        }
        throw new Error(detail);
      }

      const data = await res.json();
      setSlots(data?.slots || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load slots.');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (canQuery) {
      fetchSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery, hospitalId]);

  const bookSlot = async (slot: Slot) => {
    if (!ctx) {
      setError('Missing triage context. Please restart from Intake.');
      return;
    }

    setBookingSlotId(slot.doctor_id + slot.scheduled_at);
    setError(null);
    setStatus(null);

    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8002/appointments/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: ctx.session_id,
          provider_id: slot.doctor_id,
          scheduled_at: slot.scheduled_at,
          urgency: ctx.urgency,
          complaint: ctx.chief_complaint,
          recommended_specialist: ctx.recommended_specialist,
          duration_minutes: slot.duration_minutes,
        }),
      });

      if (!res.ok) {
        let detail = 'Booking failed.';
        try {
          const err = await res.json();
          detail = err?.detail || detail;
        } catch {
          // Keep default error.
        }
        throw new Error(detail);
      }

      setStatus(`Appointment confirmed at ${slot.clinic_name} on ${formatSlotTime(slot.scheduled_at)}.`);
      setConfirmation(slot);
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed.');
    } finally {
      setBookingSlotId(null);
    }
  };

  return (
    <LayoutSidebar>
      <div className="responsive-padding" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '0.4rem' }}>Live Appointments</h1>
          <p style={{ color: 'var(--text-muted)' }}>Slots are filtered by triage-recommended department/specialty.</p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px', background: 'var(--neutral-200)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Recommended Specialty</div>
              <div style={{ fontWeight: 700 }}>{ctx?.recommended_specialist || 'Not available'}</div>
            </div>
            <div style={{ flex: 1, minWidth: '160px', background: 'var(--neutral-200)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Urgency</div>
              <div style={{ fontWeight: 700 }}>{ctx?.urgency || 'Not available'}</div>
            </div>
            <div style={{ flex: 2, minWidth: '260px', background: 'var(--neutral-200)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chief Complaint</div>
              <div style={{ fontWeight: 600 }}>{ctx?.chief_complaint || 'Not available'}</div>
            </div>
          </div>

          {!ctx && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '0.85rem 1rem', color: '#8a6d00', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <AlertTriangle size={16} />
              Complete triage first so booking can be enforced against the suggested department.
            </div>
          )}

          {status && (
            <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '10px', padding: '0.85rem 1rem', color: '#1b5e20', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <CheckCircle2 size={16} />
              {status}
            </div>
          )}
          {error && (
            <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '10px', padding: '0.85rem 1rem', color: '#b71c1c' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} color="var(--primary)" /> Available Slots
            </div>
            <button className="btn-secondary" onClick={fetchSlots} disabled={loadingSlots || !canQuery}>
              {loadingSlots ? 'Refreshing...' : 'Refresh Slots'}
            </button>
          </div>

          {loadingSlots ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
              <Loader2 size={16} className="animate-spin" /> Loading slots...
            </div>
          ) : slots.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No live slots found for the suggested department yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {slots.map((slot) => {
                const slotId = slot.doctor_id + slot.scheduled_at;
                const booking = bookingSlotId === slotId;
                return (
                  <div key={slotId} style={{ border: '1px solid var(--neutral-400)', borderRadius: '12px', padding: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: '240px', flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{slot.clinic_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{slot.clinic_address}</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Department: <strong>{slot.department_name || 'N/A'}</strong></div>
                    </div>
                    <div style={{ minWidth: '220px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.55rem' }}>
                      <div style={{ fontWeight: 700 }}>{formatSlotTime(slot.scheduled_at)}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{slot.duration_minutes} min</div>
                      {slot.estimated_wait_minutes != null && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Wait: {slot.estimated_wait_minutes} min
                        </div>
                      )}
                      <button className="btn-primary" onClick={() => bookSlot(slot)} disabled={booking || !ctx}>
                        {booking ? 'Booking...' : 'Book This Slot'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {confirmation && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1rem',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1b5e20', fontWeight: 800 }}>
              <CheckCircle2 size={20} /> Booking Confirmed
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Your appointment has been successfully placed.
            </div>
            <div style={{ background: 'var(--neutral-200)', borderRadius: '10px', padding: '0.9rem' }}>
              <div><strong>Clinic:</strong> {confirmation.clinic_name}</div>
              <div><strong>Department:</strong> {confirmation.department_name || ctx?.recommended_specialist || 'N/A'}</div>
              <div><strong>Time:</strong> {formatSlotTime(confirmation.scheduled_at)}</div>
              {confirmation.estimated_wait_minutes != null && (
                <div><strong>Estimated Wait:</strong> {confirmation.estimated_wait_minutes} min</div>
              )}
              {confirmation.appointment_priority && (
                <div><strong>Priority:</strong> {confirmation.appointment_priority}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => setConfirmation(null)}>Close</button>
              <button
                className="btn-primary"
                onClick={() => {
                  setConfirmation(null);
                  navigate('/my-appointments');
                }}
              >
                View My Appointments
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutSidebar>
  );
}
