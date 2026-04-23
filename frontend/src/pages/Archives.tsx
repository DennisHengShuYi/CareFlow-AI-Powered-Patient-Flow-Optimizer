import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import {
  Archive,
  ChevronRight,
  Search,
  CreditCard,
  Activity,
  FileCheck,
  Clock,
  Loader2,
  ChevronLeft
} from 'lucide-react';
import { CaseCard, type CaseStatusType } from '../components/CaseCard';
import { AppointmentCard, type StandardAppointment } from '../components/AppointmentCard';

interface ArchivedCase {
  rejection_reason: string;
  id: string;
  title: string;
  department: string;
  status: string;
  workflowStatus: string;
  createdAt: string;
}

interface ArchivedPatient {
  id: string;
  name: string;
  age: number;
  category: string;
  insurers: string[];
  diagnoses: string[];
  cases: ArchivedCase[];
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

// Remove local normaliseStatus as it is in CaseCard/AppointmentCard helper imports if needed
// Actually CaseCard doesn't export normaliseStatus, but we can inline it or export it.
// I'll just use the logic in CaseCard.

const fetchArchivedPatients = async (): Promise<ArchivedPatient[]> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API}/api/patients/archived`, { headers });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const json = await response.json();
  const rawData: any[] = json.data || json;

  if (!Array.isArray(rawData)) throw new Error('Data is not an array');

  return rawData.map((p: any): ArchivedPatient => {
    const cases: ArchivedCase[] = (p.medical_cases || []).map((c: any): ArchivedCase => ({
      id: String(c.id || ''),
      title: c.title ?? 'Untitled Case',
      department: c.department ?? 'General',
      status: c.status ?? 'archived',
      workflowStatus: c.workflow_status ?? 'none',
      createdAt: c.created_at ? c.created_at.split('T')[0] : '—',
      rejection_reason: c.rejection_reason ?? '',
    }));

    return {
      id: String(p.id || ''),
      name: p.full_name || 'Anonymous Patient',
      age: p.age ?? 0,
      category: p.category || 'outpatient',
      insurers: p.insurers ?? [],
      diagnoses: p.diagnoses ?? cases.map(c => c.title),
      cases
    };
  });
};

export default function Archives() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState<ArchivedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Record<string, Appointment[]>>({});
  const [loadingApts, setLoadingApts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchArchivedPatients()
      .then(data => {
        setPatients(data);
        if (data.length > 0) setSelectedPatientId(data[0].id);
      })
      .catch(err => console.error('[Archives] Load error:', err))
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

  // Remove local renderWorkflowStatus as it is now in CaseCard.tsx

  return (
    <LayoutSidebar>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* ── Left sidebar list ── */}
        <div style={{
          width: '350px', borderRight: '1px solid var(--neutral-400)',
          display: 'flex', flexDirection: 'column', backgroundColor: 'var(--neutral-100)'
        }}>
          <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--neutral-400)' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Archives</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Historical patient records
            </p>
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
                placeholder="Search archived patients..."
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
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: '2rem' }}>
                <Loader2 size={24} style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                <span style={{ fontSize: '0.875rem' }}>Loading records...</span>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', paddingTop: '2rem' }}>
                No archived patients found.
              </div>
            ) : (
              <>
                <h3 style={{
                  fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: 'var(--text-muted)', marginBottom: '1rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                  Archived Patients
                  <span style={{
                    backgroundColor: 'var(--neutral-400)', padding: '2px 6px',
                    borderRadius: '4px', fontSize: '0.65rem'
                  }}>
                    {filteredPatients.length}
                  </span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {filteredPatients.map(p => (
                    <div
                      key={p.id}
                      style={{
                        padding: '1rem', borderRadius: '12px',
                        backgroundColor: selectedPatientId === p.id ? 'var(--primary-fixed)' : 'white',
                        border: selectedPatientId === p.id
                          ? '1px solid var(--primary)'
                          : '1px solid var(--neutral-400)',
                        transition: 'all 0.2s ease',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <button
                          onClick={() => setSelectedPatientId(p.id)}
                          style={{
                            fontWeight: 700,
                            color: selectedPatientId === p.id ? 'var(--primary)' : 'var(--text-main)',
                            marginBottom: '0.25rem', textAlign: 'left',
                            padding: 0, background: 'none', border: 'none',
                            fontSize: '1rem', cursor: 'pointer'
                          }}
                        >
                          {p.name}
                        </button>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                          <span>{p.age} years old</span>
                          <span>•</span>
                          <span>{p.cases.length} case{p.cases.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        color={selectedPatientId === p.id ? 'var(--primary)' : 'var(--neutral-500)'}
                      />
                    </div>
                  ))}
                </div>
              </>
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
                background: 'linear-gradient(135deg, #546E7A 0%, #37474F 100%)',
                color: 'white', padding: '2.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'relative', overflow: 'hidden'
              }}>
                {/* Archived badge watermark */}
                <Archive
                  size={180}
                  style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1, color: 'white' }}
                />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    padding: '4px 12px', borderRadius: '9999px',
                    backgroundColor: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem'
                  }}>
                    <Archive size={12} /> Archived • {selectedPatient.category}
                  </div>
                  <h2 style={{ fontSize: '2.5rem', color: 'white', fontWeight: 800, marginBottom: '0.5rem' }}>
                    {selectedPatient.name}
                  </h2>
                  <div style={{ display: 'flex', gap: '2rem', opacity: 0.9 }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Patient Age</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedPatient.age} Years</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Total Cases</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedPatient.cases.length}</div>
                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Insurers</div>
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
                          borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)'
                        }}>
                          No diagnoses recorded
                        </div>
                      }
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                      Financial Coverage
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
                          borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)'
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
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', marginBottom: '1.5rem', padding: 0 }}
                      >
                        <ChevronLeft size={18} /> Back to Cases
                      </button>

                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>Case Appointments</h3>

                      {loadingApts ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                          <Loader2 size={24} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto' }} />
                          <div style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>Loading appointments...</div>
                        </div>
                      ) : (appointments[selectedCaseId] || []).length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No archived appointments found for this case.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Medical Cases</h3>

                      {selectedPatient.cases.length === 0 && (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No cases found for this patient.
                        </div>
                      )}

                      {selectedPatient.cases.map((c, i) => (
                        <CaseCard
                          key={c.id ?? i}
                          caseData={{
                            id: c.id,
                            title: c.title,
                            department: c.department,
                            status: 'Archived',
                            workflow_status: c.workflowStatus,
                            gl_status: (c.workflowStatus === 'approved' ? 'approved' : c.workflowStatus === 'requested' ? 'requested' : 'none') as CaseStatusType,
                            claim_status: 'none',
                            totalBill: 0,
                            rejection_reason: c.rejection_reason,
                            created_at: c.createdAt,
                          }}
                          onClick={() => handleSelectCase(c.id)}
                        />
                      ))}
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
              <Archive size={64} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
              <h3>Select a patient to view their archived records</h3>
            </div>
          ) : null}
        </div>
      </div>
    </LayoutSidebar>
  );
}