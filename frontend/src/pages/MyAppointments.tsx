import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { CalendarClock, Loader2, Clock3, Users, History } from 'lucide-react';
import LayoutSidebar from '../components/LayoutSidebar';

type AppointmentItem = {
  id: string;
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  urgency: string;
  status: string;
  chief_complaint: string;
  doctor_id: string | null;
  room_label: string | null;
  people_before: number;
  live_wait_minutes: number;
};

type MyAppointmentsResponse = {
  current: AppointmentItem | null;
  upcoming: AppointmentItem[];
  history: AppointmentItem[];
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ItemCard({ item, showMeta = true }: { item: AppointmentItem; showMeta?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--neutral-400)', borderRadius: '12px', padding: '0.9rem 1rem', display: 'grid', gap: '0.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700 }}>{fmt(item.scheduled_at)}</div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>Urgency {item.urgency}</div>
      </div>
      <div style={{ fontSize: '0.88rem' }}><strong>Complaint:</strong> {item.chief_complaint}</div>
      {item.room_label && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--neutral-200)', borderRadius: '8px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--secondary)', width: 'fit-content' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
          Room: {item.room_label}
        </div>
      )}
      {showMeta && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock3 size={14} /> Wait {item.live_wait_minutes} min</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Users size={14} /> {item.people_before} before you</div>
          <div>Status: {item.status}</div>
        </div>
      )}
    </div>
  );
}

export default function MyAppointments() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MyAppointmentsResponse>({ current: null, upcoming: [], history: [] });

  const load = async (quiet = false) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8002/appointments/my', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        let msg = 'Unable to load appointments.';
        try {
          const err = await res.json();
          msg = err?.detail || msg;
        } catch {
          // keep fallback
        }
        throw new Error(msg);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load appointments.');
    } finally {
      if (!quiet) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      load(true);
    }, 30000);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LayoutSidebar>
      <div className="responsive-padding" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '0.35rem' }}>My Bookings</h1>
            <p style={{ color: 'var(--text-muted)' }}>See your current booking, assigned room, live waiting time, and queue position.</p>
          </div>
          <button className="btn-secondary" onClick={() => load()} disabled={loading}>
            {loading || refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '10px', padding: '0.8rem 1rem', color: '#b71c1c' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Loader2 size={16} className="animate-spin" /> Loading appointments...
          </div>
        ) : (
          <>
            {refreshing && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Updating live queue position and wait time...
              </div>
            )}

            <div className="card" style={{ display: 'grid', gap: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
                <CalendarClock size={18} color="var(--primary)" /> Current Appointment
              </div>
              {data.current ? (
                <ItemCard item={data.current} />
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>No active upcoming appointment.</div>
              )}
            </div>

            <div className="card" style={{ display: 'grid', gap: '0.8rem' }}>
              <div style={{ fontWeight: 800 }}>Upcoming</div>
              {data.upcoming.length ? (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                  {data.upcoming.map((item) => <ItemCard key={item.id} item={item} />)}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>No upcoming appointments.</div>
              )}
            </div>

            <div className="card" style={{ display: 'grid', gap: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800 }}>
                <History size={17} color="var(--text-muted)" /> Appointment History
              </div>
              {data.history.length ? (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                  {data.history.map((item) => <ItemCard key={item.id} item={item} showMeta={false} />)}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>No history yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </LayoutSidebar>
  );
}
