import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Calendar, Loader2, CheckCircle2, AlertTriangle, MapPin, ChevronDown } from 'lucide-react';
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
  room_label?: string | null;
};

type PreferredWindow = 'any' | 'morning' | 'afternoon';

type NearbyFacility = {
  id: string;
  name: string;
  address: string;
  contact_number: string;
  facility_type: string;
  matched_departments: string[];
  distance_note: string;
  specialty_match: boolean;
};

type LocationState = {
  triageContext?: TriageContext;
  hospitalId?: string;
  selectedFacility?: {
    id: string;
    name: string;
    address?: string;
  };
};

const SELECTED_FACILITY_KEY = 'selectedFacility';
const SELECTED_FACILITY_SESSION_KEY = 'selectedFacilitySessionId';

function formatSlotTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

const slotChipStyles = `
  .slot-chip:hover {
    border-color: var(--primary) !important;
    background: #f0f7ff !important;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(30, 136, 229, 0.15);
  }
  .slot-chip:active {
    transform: translateY(0);
  }
  .slot-chip.loading {
    opacity: 0.7;
    cursor: wait;
    border-color: var(--primary) !important;
  }
`;

export default function Appointments() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const { state } = useLocation();
  const locationState = (state || {}) as LocationState;

  const [ctx, setCtx] = useState<TriageContext | null>(locationState.triageContext || null);
  const [hospitalId, setHospitalId] = useState<string | null>(locationState.hospitalId || null);
  const [selectedFacility, setSelectedFacility] = useState<LocationState['selectedFacility'] | null>(locationState.selectedFacility || null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Slot | null>(null);
  const [queueTooLong, setQueueTooLong] = useState(false);
  const [queueThreshold, setQueueThreshold] = useState<number | null>(null);
  const [nearbyFacilities, setNearbyFacilities] = useState<NearbyFacility[]>([]);
  const [preferredWindow, setPreferredWindow] = useState<PreferredWindow>('any');
  const [confirmingSlot, setConfirmingSlot] = useState<Slot | null>(null);
  const [activeTimeSlot, setActiveTimeSlot] = useState<string | null>(null);

  const canQuery = useMemo(() => {
    return Boolean(ctx?.recommended_specialist && ctx?.urgency);
  }, [ctx]);

  const groupedSlots = useMemo(() => {
    // 1. Group by Facility (Hospital/Clinic)
    const byFacility = new Map<string, { name: string; address: string; dates: Map<string, Map<string, Slot[]>> }>();

    slots.forEach((slot) => {
      const facilityId = slot.hospital_id;
      if (!byFacility.has(facilityId)) {
        byFacility.set(facilityId, {
          name: slot.clinic_name,
          address: slot.clinic_address,
          dates: new Map<string, Map<string, Slot[]>>(),
        });
      }

      const d = new Date(slot.scheduled_at);
      const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const timeKey = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      
      const facility = byFacility.get(facilityId)!;
      if (!facility.dates.has(dateKey)) {
        facility.dates.set(dateKey, new Map<string, Slot[]>());
      }
      
      const dateMap = facility.dates.get(dateKey)!;
      const timeList = dateMap.get(timeKey) || [];
      timeList.push(slot);
      dateMap.set(timeKey, timeList);
    });

    // 2. Convert to sorted array for rendering
    return Array.from(byFacility.values()).map((facility) => ({
      ...facility,
      sortedDates: Array.from(facility.dates.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, timeMap]) => {
          const firstSlotAtTime = Array.from(timeMap.values())[0][0];
          const date = new Date(firstSlotAtTime.scheduled_at);
          const label = date.toLocaleDateString([], {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
          });

          const sortedTimes = Array.from(timeMap.entries())
            .sort(([a], [b]) => {
               // Parse back to compare time correctly
               const timeA = new Date(`1970/01/01 ${a}`).getTime();
               const timeB = new Date(`1970/01/01 ${b}`).getTime();
               return timeA - timeB;
            })
            .map(([timeLabel, timeSlots]) => ({
              timeLabel,
              slots: timeSlots,
              period: new Date(timeSlots[0].scheduled_at).getHours() < 12 ? 'morning' : 'afternoon'
            }));

          return {
            key: dateKey,
            label,
            times: sortedTimes,
          };
        }),
    }));
  }, [slots]);

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

  useEffect(() => {
    if (locationState.hospitalId) {
      sessionStorage.setItem(SELECTED_FACILITY_KEY, JSON.stringify(locationState.selectedFacility || { id: locationState.hospitalId }));
      if (ctx?.session_id) {
        sessionStorage.setItem(SELECTED_FACILITY_SESSION_KEY, ctx.session_id);
      }
      return;
    }

    if (!hospitalId) {
      const cachedFacility = sessionStorage.getItem(SELECTED_FACILITY_KEY);
      const cachedSessionId = sessionStorage.getItem(SELECTED_FACILITY_SESSION_KEY);

      if (ctx?.session_id && cachedSessionId && cachedSessionId !== ctx.session_id) {
        sessionStorage.removeItem(SELECTED_FACILITY_KEY);
        sessionStorage.removeItem(SELECTED_FACILITY_SESSION_KEY);
        return;
      }

      if (cachedFacility) {
        try {
          const parsed = JSON.parse(cachedFacility) as LocationState['selectedFacility'];
          setHospitalId(parsed?.id || null);
          setSelectedFacility(parsed || null);
        } catch {
          sessionStorage.removeItem(SELECTED_FACILITY_KEY);
          sessionStorage.removeItem(SELECTED_FACILITY_SESSION_KEY);
        }
      }
    }
  }, [ctx?.session_id, hospitalId, locationState.hospitalId, locationState.selectedFacility]);

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
        limit: '300',
        preferred_window: preferredWindow,
        target_date: selectedDate.toISOString(),
      });
      if (hospitalId) {
        params.set('hospital_id', hospitalId);
      }

      const res = await fetch(`http://localhost:8002/appointments/slots?${params.toString()}`, {
        cache: 'no-store',
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
      setQueueTooLong(Boolean(data?.queue_too_long));
      setQueueThreshold(data?.queue_threshold_minutes ?? null);
      setNearbyFacilities(data?.nearby_facilities || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load slots.');
      setSlots([]);
      setQueueTooLong(false);
      setQueueThreshold(null);
      setNearbyFacilities([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (canQuery) {
      fetchSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery, hospitalId, preferredWindow, selectedDate]);

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
          hospital_id: slot.hospital_id,
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
      setSlots((currentSlots) => currentSlots.filter((currentSlot) => !(currentSlot.doctor_id === slot.doctor_id && currentSlot.hospital_id === slot.hospital_id && currentSlot.scheduled_at === slot.scheduled_at)));
      await fetchSlots();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed.');
    } finally {
      setBookingSlotId(null);
    }
  };

  return (
    <LayoutSidebar>
      <style>{slotChipStyles}</style>
      <div className="responsive-padding" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '0.4rem' }}>Live Appointments</h1>
          <p style={{ color: 'var(--text-muted)' }}>Slots are filtered by triage-recommended department/specialty.</p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {queueTooLong && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, color: '#8a6d00' }}>
                  <MapPin size={18} /> Queue is long
                </div>
                <div style={{ fontSize: '0.85rem', color: '#8a6d00' }}>
                  {queueThreshold ? `Waits at or above ${queueThreshold} min.` : 'Current wait times are high.'}
                </div>
              </div>
              {nearbyFacilities.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {nearbyFacilities.map((facility) => (
                    <div key={facility.id} style={{ background: 'white', border: '1px solid #ffe082', borderRadius: '10px', padding: '0.85rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{facility.name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{facility.address}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{facility.distance_note}</div>
                      </div>
                      <button className="btn-secondary" onClick={() => navigate('/nearby-facilities')} style={{ alignSelf: 'center' }}>
                        View Nearby Clinics
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button className="btn-secondary" onClick={() => navigate('/nearby-facilities')} style={{ alignSelf: 'flex-start' }}>
                  Browse Nearby Clinics
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="appt-context-card">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Recommended Specialty</div>
              <div style={{ fontWeight: 700 }}>{ctx?.recommended_specialist || 'Not available'}</div>
            </div>
            <div className="appt-context-card">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Urgency</div>
              <div style={{ fontWeight: 700 }}>{ctx?.urgency || 'Not available'}</div>
            </div>
            <div className="appt-context-card" style={{ flex: 2 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chief Complaint</div>
              <div style={{ fontWeight: 600 }}>{ctx?.chief_complaint || 'Not available'}</div>
            </div>
          </div>

          {selectedFacility && (
            <div style={{ background: '#eef6ff', border: '1px solid #bbdefb', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Selected Facility</div>
                <div style={{ fontWeight: 800 }}>{selectedFacility.name}</div>
                {selectedFacility.address && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedFacility.address}</div>}
              </div>
              <button
                className="btn-secondary"
                onClick={() => {
                  setHospitalId(null);
                  setSelectedFacility(null);
                  sessionStorage.removeItem(SELECTED_FACILITY_KEY);
                  sessionStorage.removeItem(SELECTED_FACILITY_SESSION_KEY);
                }}
              >
                Clear Facility Filter
              </button>
            </div>
          )}

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

          <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date();
              d.setDate(d.getDate() + i);
              const isActive = d.toDateString() === selectedDate.toDateString();
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(d)}
                  className={isActive ? 'btn-primary' : 'btn-secondary'}
                  style={{
                    minWidth: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '12px',
                    gap: '0.1rem'
                  }}
                >
                  <span style={{ fontSize: '0.7rem', opacity: 0.8, textTransform: 'uppercase', fontWeight: 700 }}>
                    {d.toLocaleDateString([], { weekday: 'short' })}
                  </span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                    {d.getDate()}
                  </span>
                  <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                    {d.toLocaleDateString([], { month: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} color="var(--primary)" /> Available Slots
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className={preferredWindow === 'any' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setPreferredWindow('any')}
                disabled={loadingSlots || !canQuery}
              >
                Anytime
              </button>
              <button
                className={preferredWindow === 'morning' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setPreferredWindow('morning')}
                disabled={loadingSlots || !canQuery}
              >
                Morning
              </button>
              <button
                className={preferredWindow === 'afternoon' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setPreferredWindow('afternoon')}
                disabled={loadingSlots || !canQuery}
              >
                Afternoon
              </button>
              <button className="btn-secondary" onClick={fetchSlots} disabled={loadingSlots || !canQuery}>
                {loadingSlots ? 'Refreshing...' : 'Refresh Slots'}
              </button>
            </div>
          </div>

          {loadingSlots ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
              <Loader2 size={16} className="animate-spin" /> Loading slots...
            </div>
          ) : slots.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No live slots found for the suggested department yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              {groupedSlots.map((facility) => (
                <div key={facility.name} className="appt-facility-group">
                  <div style={{ marginBottom: '1rem', borderBottom: '1px solid var(--neutral-400)', paddingBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 800, fontSize: '1.05rem', color: 'var(--secondary)' }}>
                      <MapPin size={18} /> {facility.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '1.5rem' }}>{facility.address}</div>
                  </div>

                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {facility.sortedDates.map((dateGroup) => (
                      <div key={dateGroup.key}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.02rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Calendar size={14} /> {dateGroup.label}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.75rem' }}>
                          {dateGroup.times.map((timeBlock) => {
                            const timeId = `${facility.name}-${dateGroup.key}-${timeBlock.timeLabel}`;
                            const isExpanded = activeTimeSlot === timeId;
                            const hasMultiple = timeBlock.slots.length > 1;
                            const firstSlot = timeBlock.slots[0];
                            
                            return (
                              <div key={timeId} style={{ position: 'relative' }}>
                                <button
                                  className="slot-chip"
                                  onClick={() => {
                                    if (hasMultiple) {
                                      setActiveTimeSlot(isExpanded ? null : timeId);
                                    } else {
                                      setConfirmingSlot(firstSlot);
                                    }
                                  }}
                                  style={{
                                    width: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    padding: '0.75rem 0.5rem',
                                    background: isExpanded ? 'var(--primary-light)' : 'white',
                                    border: `1.5px solid ${isExpanded ? 'var(--primary)' : 'var(--neutral-400)'}`,
                                    borderRadius: '14px',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer',
                                    boxShadow: isExpanded ? '0 4px 12px rgba(var(--primary-rgb), 0.15)' : 'none'
                                  }}
                                >
                                  <div style={{ fontSize: '1rem', fontWeight: 800, color: isExpanded ? 'var(--primary)' : 'var(--text-main)' }}>
                                    {timeBlock.timeLabel}
                                  </div>
                                  {hasMultiple ? (
                                    <div style={{ fontSize: '0.65rem', color: 'var(--primary)', fontWeight: 700, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                      {timeBlock.slots.length} Rooms <ChevronDown size={10} />
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '0.2rem' }}>
                                      {firstSlot.room_label}
                                    </div>
                                  )}
                                </button>

                                {isExpanded && (
                                  <div 
                                    className="shadow-xl"
                                    style={{
                                      position: 'absolute',
                                      top: 'calc(100% + 8px)',
                                      left: 0,
                                      right: 0,
                                      minWidth: '160px',
                                      background: 'white',
                                      border: '1px solid var(--neutral-400)',
                                      borderRadius: '12px',
                                      zIndex: 50,
                                      padding: '0.5rem',
                                      animation: 'fadeInUp 0.2s ease-out'
                                    }}
                                  >
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', padding: '0 0.4rem' }}>SELECT ROOM</div>
                                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                                      {timeBlock.slots.map((s, idx) => (
                                        <button
                                          key={idx}
                                          onClick={() => {
                                            setConfirmingSlot(s);
                                            setActiveTimeSlot(null);
                                          }}
                                          className="btn-ghost"
                                          style={{
                                            justifyContent: 'space-between',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '8px',
                                            fontSize: '0.85rem'
                                          }}
                                        >
                                          <span style={{ fontWeight: 700 }}>{s.room_label}</span>
                                          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{s.estimated_wait_minutes ?? 0}m wait</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmingSlot && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div className="card shadow-lg" style={{ width: '100%', maxWidth: '480px', animation: 'scaleUp 0.3s ease-out' }}>
            <h3 style={{ marginBottom: '1rem', fontWeight: 800 }}>Confirm Appointment</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Are you sure you want to book this slot? Once confirmed, your appointment will be scheduled.
            </p>
            <div style={{ background: '#f5f9ff', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid #e0eaff' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Location</div>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{confirmingSlot.clinic_name}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date & Time</div>
              <div style={{ fontWeight: 700 }}>{formatSlotTime(confirmingSlot.scheduled_at)}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className="btn-secondary"
                onClick={() => setConfirmingSlot(null)}
                style={{ padding: '0.6rem 1.25rem' }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  bookSlot(confirmingSlot);
                  setConfirmingSlot(null);
                }}
                style={{ padding: '0.6rem 2rem' }}
              >
                Book Now
              </button>
            </div>
          </div>
        </div>
      )}

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
                View My Bookings
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutSidebar>
  );
}
