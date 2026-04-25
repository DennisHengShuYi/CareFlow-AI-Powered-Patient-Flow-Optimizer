import React from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  XCircle,
  RotateCw,
  MapPin,
  User,
  MoreVertical
} from 'lucide-react';

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'No-show' | 'Rescheduled' | 'Past' | 'Upcoming' | 'booked';

export interface StandardAppointment {
  id: string;
  title: string;
  scheduledAt: string;
  status: string;
  urgencyLevel?: string;
  chiefComplaint?: string;
  outcome?: string;
  ward?: string;
  doctors?: { id: string; full_name: string } | null;
  totalBill: number;
  billStatus?: string;
  billFileUrl?: string;
  durationMinutes?: number;
  gl_status?: 'none' | 'requested' | 'approved';
}

const STATUS_STYLES: Record<string, { bg: string; text: string; Icon: React.ElementType }> = {
  Scheduled: { bg: '#E3F2FD', text: '#1E88E5', Icon: Clock },
  Completed: { bg: '#E8F5E9', text: '#2E7D32', Icon: CheckCircle2 },
  Cancelled: { bg: '#FFEBEE', text: '#C62828', Icon: XCircle },
  'No-show': { bg: '#FFF3E0', text: '#EF6C00', Icon: AlertCircle },
  Rescheduled: { bg: '#F3E5F5', text: '#7B1FA2', Icon: RotateCw }
};

const getStatusStyle = (status: string) =>
  STATUS_STYLES[status] ?? { bg: '#F5F5F5', text: '#616161', Icon: Clock };

const formatDateTime = (iso: string) => {
  if (!iso) return { datePart: '—', timePart: '' };
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-MY', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  return { datePart, timePart };
};

interface AppointmentCardProps {
  appointment: StandardAppointment;
  showActions?: boolean;
}

export const AppointmentCard: React.FC<AppointmentCardProps> = ({ appointment, showActions = true }) => {
  const { bg, text, Icon: StatusIcon } = getStatusStyle(appointment.status);
  const { datePart, timePart } = formatDateTime(appointment.scheduledAt);

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{ display: 'flex' }}>
        {/* LEFT DATE BLOCK */}
        <div style={{
          width: '120px',
          backgroundColor: 'var(--neutral-200)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid var(--neutral-400)'
        }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)', textAlign: 'center' }}>
            {datePart}
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '4px' }}>
            {timePart}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{
          flex: 1,
          padding: '1.5rem',
          display: 'grid',
          gridTemplateColumns: '2fr 1.5fr 1fr',
          gap: '2rem'
        }}>
          {/* DETAILS */}
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
              {appointment.title}
            </h3>
            {appointment.chiefComplaint && appointment.chiefComplaint !== '—' && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700 }}>Chief complaint: </span>{appointment.chiefComplaint}
              </div>
            )}
            {appointment.outcome && appointment.outcome !== '—' && (
              <div style={{
                backgroundColor: 'var(--neutral-200)', padding: '1rem',
                borderRadius: '12px', fontSize: '0.875rem', color: 'var(--text-muted)',
                lineHeight: '1.5', borderLeft: '4px solid var(--primary)'
              }}>
                <div style={{
                  fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase',
                  marginBottom: '4px', letterSpacing: '0.05em'
                }}>
                  Outcome Summary
                </div>
                {appointment.outcome.replace(/^"|"$/g, '')}
              </div>
            )}
          </div>

          {/* INFO / WARD / DOCTOR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {appointment.ward && appointment.ward !== '—' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <MapPin size={16} color="var(--text-muted)" />
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{appointment.ward}</div>
              </div>
            )}
            {appointment.urgencyLevel && appointment.urgencyLevel !== '—' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <AlertCircle size={16} color="var(--text-muted)" />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Urgency</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'capitalize' }}>{appointment.urgencyLevel}</div>
                </div>
              </div>
            )}
            {appointment.doctors?.full_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <User size={16} color="var(--text-muted)" />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Doctor</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Dr. {appointment.doctors.full_name}</div>
                </div>
              </div>
            )}
            {appointment.durationMinutes && appointment.durationMinutes > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={12} /> {appointment.durationMinutes} min session
              </div>
            )}
          </div>

          {/* STATUS + BILL */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', borderRadius: '9999px',
              backgroundColor: bg, color: text,
              fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase'
            }}>
              <StatusIcon size={14} /> {appointment.status}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
                textTransform: 'uppercase', marginBottom: '4px'
              }}>
                Session Bill
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {appointment.totalBill > 0
                  ? `RM ${appointment.totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : '—'}
              </div>
              {appointment.billStatus && appointment.billStatus !== '—' && (
                <div style={{
                  fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize', marginTop: '2px',
                  color: appointment.billStatus === 'paid' ? '#2E7D32' : '#EF6C00'
                }}>
                  {appointment.billStatus}
                </div>
              )}
              {appointment.billFileUrl && (
                <a
                  href={appointment.billFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, marginTop: '4px'
                  }}
                >
                  <CreditCard size={12} /> View Bill
                </a>
              )}
            </div>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        {showActions && (
          <div style={{
            width: '60px', borderLeft: '1px solid var(--neutral-400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <button style={{ color: 'var(--neutral-500)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <MoreVertical size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
