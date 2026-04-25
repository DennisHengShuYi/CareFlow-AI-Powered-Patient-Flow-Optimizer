import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import {
  History as HistoryIcon,
  ChevronRight,
  Search,
  CreditCard,
  FileCheck,
  Clock,
  Loader2,
  ChevronLeft,
  Users,
  Activity
} from 'lucide-react';
import { CaseCard, type StandardCase, type CaseStatusType } from '../components/CaseCard';
import { AppointmentCard, type StandardAppointment } from '../components/AppointmentCard';

// ── Types ──────────────────────────────────────────────────────────────────

interface HistoryCase {
  id: string;
  title: string;
  department: string;
  status: string;
  workflowStatus: string;
  createdAt: string;
  rejection_reason: string;
  glStatus: string;
  claimStatus: string;
  totalBill: number;
  billUrl?: string;
}

interface HistoryPatient {
  id: string;
  name: string;
  age: number;
  status: string; // 'active' or 'archived'
  caseCount: number;
  diagnoses: string[];
  insurers: string[];
  cases: HistoryCase[];
}

interface Appointment {
  id: string;
  scheduled_at: string;
  appointment_type: string;
  urgency_level: string;
  chief_complaint: string;
  outcome_summary: string;
  status: string;
  duration_minutes: number;
  ward: string;
  total_bill: number;
  bill_status: string;
  bill_file_url?: string;
}

const API = 'http://127.0.0.1:8002';

// ── Data Fetching ──────────────────────────────────────────────────────────

const fetchHistoryPatients = async (): Promise<HistoryPatient[]> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API}/api/patients/history`, { headers });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const json = await response.json();
  const rawData: any[] = json.data || [];

  return rawData.map((p: any): HistoryPatient => {
    const cases: HistoryCase[] = (p.cases || []).map((c: any): HistoryCase => ({
      id: String(c.id || ''),
      title: c.title ?? 'Untitled Case',
      department: c.department ?? 'General',
      status: c.status ?? 'active',
      workflowStatus: c.workflow_status ?? 'none',
      createdAt: c.created_at ? c.created_at.split('T')[0] : '—',
      rejection_reason: c.rejection_reason ?? '',
      glStatus: c.gl?.status ?? 'none',
      claimStatus: c.claims?.status ?? 'none',
      totalBill: c.medical_bill_price ?? 0,
      billUrl: c.bill_url,
    }));

    return {
      id: String(p.id || ''),
      name: p.full_name || 'Anonymous Patient',
      age: p.age ?? 0,
      status: p.status || 'unknown',
      caseCount: cases.length,
      insurers: p.insurers ?? [],
      diagnoses: p.diagnoses ?? cases.map(c => c.title),
      cases
    };
  });
};

// ── Main Component ─────────────────────────────────────────────────────────

export default function History() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState<HistoryPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Record<string, Appointment[]>>({});
  const [loadingApts, setLoadingApts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchHistoryPatients()
      .then(data => {
        setPatients(data);
        if (data.length > 0) setSelectedPatientId(data[0].id);
      })
      .catch(err => console.error('[History] Load error:', err))
      .finally(() => setLoading(false));
  }, []);

  const loadAppointments = async (caseId: string) => {
    if (appointments[caseId]) return;
    setLoadingApts(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/cases/${caseId}/appointments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load appointments.');
      const json = await res.json();
      setAppointments(prev => ({ ...prev, [caseId]: json.data || [] }));
    } catch (e) {
      console.error('Error loading appointments:', e);
    } finally {
      setLoadingApts(false);
    }
  };

  const handleSelectCase = async (caseId: string) => {
    setSelectedCaseId(caseId);
    await loadAppointments(caseId);
  };

  const selectedPatient = patients.find(p => p.id === selectedPatientId) ?? null;

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return { bg: '#E3F2FD', text: '#1E88E5', label: 'Active' };
      case 'archived':
        return { bg: '#F5F5F5', text: '#616161', label: 'Archived' };
      default:
        return { bg: '#ECEFF1', text: '#455A64', label: status };
    }
  };

  return (
    <LayoutSidebar>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* ── Left sidebar list ── */}
        <div style={{
          width: '350px', borderRight: '1px solid var(--neutral-400)',
          display: 'flex', flexDirection: 'column', backgroundColor: 'var(--neutral-100)'
        }}>
          <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--neutral-400)' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <HistoryIcon size={28} color="var(--primary)" /> History
            </h1>
            <div style={{ position: 'relative' }}>
              <Search
                size={18}
                style={{
                  position: 'absolute', left: '12px', top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text-muted)'
                }}
              />
              <input
                type="text"
                placeholder="Search patient records..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem',
                  borderRadius: '12px', border: '1px solid var(--neutral-400)',
                  backgroundColor: 'var(--neutral-200)', outline: 'none', fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', paddingTop: '2rem' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.5 }} />
                Loading history...
              </div>
            ) : filteredPatients.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', paddingTop: '2rem' }}>
                No records found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredPatients.map(p => {
                  const statusInfo = getStatusStyle(p.status);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedPatientId(p.id);
                        setSelectedCaseId(null);
                      }}
                      style={{
                        padding: '1rem', borderRadius: '12px',
                        backgroundColor: selectedPatientId === p.id ? 'var(--primary-fixed)' : 'white',
                        border: selectedPatientId === p.id
                          ? '1px solid var(--primary)'
                          : '1px solid var(--neutral-400)',
                        transition: 'all 0.2s ease',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <div style={{
                            fontWeight: 700,
                            color: selectedPatientId === p.id ? 'var(--primary)' : 'var(--text-main)',
                            fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {p.name}
                          </div>
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                            backgroundColor: statusInfo.bg, color: statusInfo.text, textTransform: 'uppercase'
                          }}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                          <span>{p.age} yrs</span>
                          <span>•</span>
                          <span>{p.caseCount} case{p.caseCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        color={selectedPatientId === p.id ? 'var(--primary)' : 'var(--neutral-500)'}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{
          flex: 1, backgroundColor: 'var(--neutral-300)',
          overflowY: 'auto', padding: '2rem 3rem'
        }}>
          {selectedPatient ? (
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

              {/* Patient header card */}
              <div className="card" style={{
                marginBottom: '2rem',
                background: selectedPatient.status === 'active' 
                  ? 'linear-gradient(135deg, #1E88E5 0%, #0D47A1 100%)'
                  : 'linear-gradient(135deg, #546E7A 0%, #37474F 100%)',
                color: 'white', padding: '2.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'relative', overflow: 'hidden'
              }}>
                <HistoryIcon
                  size={180}
                  style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1, color: 'white' }}
                />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                    padding: '4px 12px', borderRadius: '9999px',
                    backgroundColor: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem'
                  }}>
                    {selectedPatient.status === 'active' ? <Activity size={12} /> : <Clock size={12} />} 
                    {selectedPatient.status} Record
                  </div>
                  <h2 style={{ fontSize: '2.5rem', color: 'white', fontWeight: 800, marginBottom: '0.5rem' }}>
                    {selectedPatient.name}
                  </h2>
                  <div style={{ display: 'flex', gap: '2rem', opacity: 0.9 }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Age</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedPatient.age} Years</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Records</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedPatient.caseCount} Cases</div>
                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Financial Coverage</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      {selectedPatient.insurers.length > 0
                        ? selectedPatient.insurers.map((ins, i) => (
                          <span key={i} style={{
                            backgroundColor: 'white', color: '#37474F',
                            padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700
                          }}>
                            {ins}
                          </span>
                        ))
                        : <span style={{ opacity: 0.6, fontSize: '0.875rem' }}>None on record</span>
                      }
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Primary Diagnosis</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                      {selectedPatient.diagnoses[0] ?? '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detail grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>

                {/* Left: clinical summary */}
                <div className="card" style={{ height: 'fit-content' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileCheck size={18} color="var(--primary)" /> Clinical Summary
                  </h3>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                      All Diagnoses
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedPatient.diagnoses.length > 0
                        ? selectedPatient.diagnoses.map((d, i) => (
                          <div key={i} style={{
                            backgroundColor: 'var(--neutral-200)', padding: '0.75rem',
                            borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600
                          }}>
                            {d}
                          </div>
                        ))
                        : <div style={{
                          backgroundColor: 'var(--neutral-200)', padding: '0.75rem',
                          borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)',
                          fontStyle: 'italic'
                        }}>
                          No diagnoses recorded
                        </div>
                      }
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                      Insurers
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedPatient.insurers.length > 0
                        ? selectedPatient.insurers.map((ins, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px'
                          }}>
                            <CreditCard size={16} color="var(--primary)" />
                            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{ins}</span>
                          </div>
                        ))
                        : <div style={{
                          backgroundColor: 'var(--neutral-200)', padding: '0.75rem',
                          borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)',
                          fontStyle: 'italic'
                        }}>
                          No insurers on record
                        </div>
                      }
                    </div>
                  </div>
                </div>

                {/* Right: archived cases or appointments */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {selectedCaseId ? (
                    <div>
                      <button
                        onClick={() => setSelectedCaseId(null)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          background: 'none', border: 'none', color: 'var(--primary)',
                          fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                          marginBottom: '1.5rem', padding: '0.5rem 0'
                        }}
                      >
                        <ChevronLeft size={18} /> Back to Case Records
                      </button>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Case Appointments</h3>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {appointments[selectedCaseId]?.length ?? 0} historical events
                        </div>
                      </div>

                      {loadingApts ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                          <Loader2 size={28} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto' }} />
                          <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Loading appointments...</div>
                        </div>
                      ) : (appointments[selectedCaseId] || []).length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <Clock size={40} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>No appointments found</h3>
                          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>No historical events found for this case.</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {(appointments[selectedCaseId] || []).map(apt => (
                            <AppointmentCard
                              key={apt.id}
                              appointment={{
                                id: apt.id,
                                title: apt.appointment_type,
                                scheduledAt: apt.scheduled_at,
                                status: apt.status,
                                urgencyLevel: apt.urgency_level,
                                chiefComplaint: apt.chief_complaint,
                                outcome: apt.outcome_summary,
                                ward: apt.ward,
                                totalBill: apt.total_bill,
                                billStatus: apt.bill_status,
                                billFileUrl: apt.bill_file_url,
                                durationMinutes: apt.duration_minutes
                              } as StandardAppointment}
                              showActions={false}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Medical Cases</h3>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          {selectedPatient.caseCount} total
                        </div>
                      </div>

                      {selectedPatient.cases.length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <FileCheck size={40} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                          <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>No case history</h3>
                          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>This patient has no medical cases.</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {selectedPatient.cases.map((c, i) => (
                            <CaseCard
                              key={c.id ?? i}
                              caseData={{
                                id: c.id,
                                title: c.title,
                                department: c.department,
                                gl_status: c.glStatus as CaseStatusType,
                                claim_status: c.claimStatus as CaseStatusType,
                                totalBill: c.totalBill,
                                rejection_reason: c.rejection_reason,
                                created_at: c.createdAt,
                                status: c.status === 'archived' ? 'Archived' : 'Active',
                                workflow_status: c.workflowStatus
                              }}
                              onClick={() => handleSelectCase(c.id)}
                              showActions={false}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : !loading ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'
            }}>
              <Users size={64} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Select a Patient</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>Browse the clinical history for any patient</p>
            </div>
          ) : null}
        </div>
      </div>
    </LayoutSidebar>
  );
}
