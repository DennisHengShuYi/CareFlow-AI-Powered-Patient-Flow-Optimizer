import React, { useState, useEffect } from 'react';
import LayoutSidebar from '../components/LayoutSidebar';
import {
  Search, Filter, Clock, Loader2,
  ChevronRight, CreditCard, Activity,
  FileCheck, ArrowRight, Users
} from 'lucide-react';

interface ArchivedPatient {
  id: string;
  name: string;
  age: number;
  category: string;
  createdAt: string;
  status: string;
}

interface Case {
  id: string;
  title: string;
  department: string;
  status: string;
  workflowStatus: string;
  hasMedicalBill: boolean;
}

interface Appointment {
  id: string;
  scheduledAt: string;
  appointmentType: string;
  urgencyLevel: string;
  chiefComplaint: string;
  outcomeSummary: string;
  status: string;
  durationMinutes: number;
  ward: string;
  totalBill: number;
  billStatus: string;
}

interface PatientDetail {
  id: string;
  name: string;
  age: number;
  category: string;
  insurers: string[];
  cases: Case[];
}

const API = 'http://127.0.0.1:8002';

const normaliseWorkflow = (raw: string | null | undefined): 'none' | 'requested' | 'approved' => {
  if (!raw) return 'none';
  const s = raw.toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'none') return 'none';
  return 'requested';
};

export default function Archives() {
  const [patients, setPatients] = useState<ArchivedPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Record<string, Appointment[]>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Fetch archived patient list ──────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    setLoadingList(true);
    fetch(`${API}/api/patients/archived`, { headers })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => {
        const raw = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
        setPatients(raw.map((p: any): ArchivedPatient => ({
          id: p.id,
          name: p.full_name || 'Anonymous Patient',
          age: p.age ?? 0,
          category: p.category || 'General',
          createdAt: p.created_at ? p.created_at.split('T')[0] : '—',
          status: p.status || 'archived'
        })));
      })
      .catch(err => console.error('[Archives] list error:', err))
      .finally(() => setLoadingList(false));
  }, []);

  // ── Fetch patient detail + cases when selection changes ──────────────────
  useEffect(() => {
    if (!selectedPatientId) return;
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    setLoadingDetail(true);
    setPatientDetail(null);
    setExpandedCaseId(null);
    setAppointments({});

    fetch(`${API}/api/patients/${selectedPatientId}/cases`, { headers })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => {
        const p = json.patient;
        const cases: Case[] = (json.cases || []).map((c: any): Case => ({
          id: c.id,
          title: c.title ?? 'Untitled Case',
          department: c.department ?? 'General',
          status: c.status ?? '—',
          workflowStatus: c.workflow_status ?? 'none',
          hasMedicalBill: c.has_medical_bill ?? false
        }));
        setPatientDetail({
          id: p.id,
          name: p.full_name,
          age: p.age ?? 0,
          category: p.category || 'General',
          insurers: p.insurers || [],
          cases
        });
      })
      .catch(err => console.error('[Archives] detail error:', err))
      .finally(() => setLoadingDetail(false));
  }, [selectedPatientId]);

  // ── Fetch appointments for a case ────────────────────────────────────────
  const loadAppointments = (caseId: string) => {
    if (appointments[caseId]) {
      // Already loaded — just toggle
      setExpandedCaseId(prev => prev === caseId ? null : caseId);
      return;
    }
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    setLoadingAppointments(caseId);
    setExpandedCaseId(caseId);

    fetch(`${API}/api/cases/${caseId}/appointments`, { headers })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => {
        const apts: Appointment[] = (json.data || []).map((a: any): Appointment => ({
          id: a.id,
          scheduledAt: a.scheduled_at ? new Date(a.scheduled_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          appointmentType: a.appointment_type ?? '—',
          urgencyLevel: a.urgency_level ?? '—',
          chiefComplaint: a.chief_complaint ?? '—',
          outcomeSummary: a.outcome_summary ?? '—',
          status: a.status ?? '—',
          durationMinutes: a.duration_minutes ?? 0,
          ward: a.ward ?? '—',
          totalBill: a.total_bill ?? 0,
          billStatus: a.bill_status ?? '—'
        }));
        setAppointments(prev => ({ ...prev, [caseId]: apts }));
      })
      .catch(err => console.error('[Archives] appointments error:', err))
      .finally(() => setLoadingAppointments(null));
  };

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedMeta = patients.find(p => p.id === selectedPatientId) ?? null;

  // ── Status badge ─────────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const s = normaliseWorkflow(status);
    const colors = {
      none: { bg: 'var(--neutral-400)', text: 'var(--text-muted)' },
      requested: { bg: '#FFF9C4', text: '#F9A825' },
      approved: { bg: '#E8F5E9', text: '#2E7D32' }
    };
    return (
      <span style={{
        padding: '0.3rem 0.7rem', borderRadius: '9999px',
        backgroundColor: colors[s].bg, color: colors[s].text,
        fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize'
      }}>
        {s}
      </span>
    );
  };

  return (
    <LayoutSidebar>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* ── Left: patient list ── */}
        <div style={{
          width: '350px', borderRight: '1px solid var(--neutral-400)',
          display: 'flex', flexDirection: 'column', backgroundColor: 'var(--neutral-100)'
        }}>
          <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--neutral-400)' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Archives</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Historical patient records
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} style={{
                  position: 'absolute', left: '12px', top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text-muted)'
                }} />
                <input
                  type="text"
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem',
                    borderRadius: '12px', border: '1px solid var(--neutral-400)',
                    backgroundColor: 'var(--neutral-200)', outline: 'none', fontSize: '0.875rem'
                  }}
                />
              </div>
              <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem' }}>
                <Filter size={16} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {loadingList ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', paddingTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <Loader2 size={24} className="animate-spin" />
                Loading records...
              </div>
            ) : filteredPatients.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', paddingTop: '2rem' }}>
                No archived patients found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredPatients.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    style={{
                      padding: '1rem', borderRadius: '12px', cursor: 'pointer',
                      backgroundColor: selectedPatientId === p.id ? 'var(--primary-fixed)' : 'white',
                      border: selectedPatientId === p.id ? '1px solid var(--primary)' : '1px solid var(--neutral-400)',
                      transition: 'all 0.2s ease',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{
                        fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem',
                        color: selectedPatientId === p.id ? 'var(--primary)' : 'var(--text-main)'
                      }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                        {p.age > 0 && <span>{p.age} years old</span>}
                        {p.age > 0 && <span>•</span>}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={11} /> {p.createdAt}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={16} color={selectedPatientId === p.id ? 'var(--primary)' : 'var(--neutral-500)'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: detail panel ── */}
        <div style={{ flex: 1, backgroundColor: 'var(--neutral-300)', overflowY: 'auto', padding: '2rem 3rem' }}>
          {!selectedPatientId ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Users size={64} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
              <h3>Select a patient to view their archived records</h3>
            </div>
          ) : loadingDetail ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '1rem' }}>
              <Loader2 size={32} className="animate-spin" />
              <p>Loading patient records...</p>
            </div>
          ) : patientDetail ? (
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

              {/* Patient header card */}
              <div className="card" style={{
                marginBottom: '2rem',
                background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)',
                color: 'white', padding: '2.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'relative', overflow: 'hidden'
              }}>
                <Activity size={180} style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1, color: 'white' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: '9999px',
                    backgroundColor: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem'
                  }}>
                    {patientDetail.category} · Archived
                  </div>
                  <h2 style={{ fontSize: '2.5rem', color: 'white', fontWeight: 800, marginBottom: '0.5rem' }}>
                    {patientDetail.name}
                  </h2>
                  <div style={{ display: 'flex', gap: '2rem', opacity: 0.9 }}>
                    {patientDetail.age > 0 && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Patient Age</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{patientDetail.age} Years</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Total Cases</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{patientDetail.cases.length}</div>
                    </div>
                  </div>
                </div>
                <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Insurers</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    {patientDetail.insurers.length > 0
                      ? patientDetail.insurers.map((ins, i) => (
                        <span key={i} style={{
                          backgroundColor: 'white', color: 'var(--secondary)',
                          padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700
                        }}>{ins}</span>
                      ))
                      : <span style={{ opacity: 0.6, fontSize: '0.875rem' }}>None on record</span>
                    }
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
                      Cases
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {patientDetail.cases.length > 0
                        ? patientDetail.cases.map((c, i) => (
                          <div key={i} style={{
                            backgroundColor: 'var(--neutral-200)', padding: '0.75rem',
                            borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600
                          }}>{c.title}</div>
                        ))
                        : <div style={{ backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          No cases recorded
                        </div>
                      }
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                      Financial Coverage
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {patientDetail.insurers.length > 0
                        ? patientDetail.insurers.map((ins, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px' }}>
                            <CreditCard size={16} color="var(--primary)" />
                            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{ins}</span>
                          </div>
                        ))
                        : <div style={{ backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          No insurers on record
                        </div>
                      }
                    </div>
                  </div>
                </div>

                {/* Right: cases + appointments */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Medical Cases</h3>

                  {patientDetail.cases.length === 0 && (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No cases found for this patient.
                    </div>
                  )}

                  {patientDetail.cases.map((c, i) => (
                    <div key={c.id ?? i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      {/* Case header row */}
                      <div style={{
                        padding: '1.5rem',
                        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr',
                        gap: '1.5rem', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{
                            fontSize: '1.125rem', fontWeight: 800, color: 'var(--primary)',
                            marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem'
                          }}>
                            {c.title}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {c.department} Department
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>GL STATUS</div>
                          <StatusBadge status={c.workflowStatus} />
                        </div>
                        {/* View Appointments toggle */}
                        <div style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => loadAppointments(c.id)}
                            style={{
                              backgroundColor: expandedCaseId === c.id ? 'var(--neutral-300)' : 'var(--primary)',
                              color: expandedCaseId === c.id ? 'var(--text-main)' : 'white',
                              padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem',
                              fontWeight: 700, border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto'
                            }}
                          >
                            {loadingAppointments === c.id
                              ? <><Loader2 size={14} className="animate-spin" /> Loading...</>
                              : <>{expandedCaseId === c.id ? 'Hide' : 'View'} Appointments <ArrowRight size={14} /></>
                            }
                          </button>
                        </div>
                      </div>

                      {/* Appointments panel */}
                      {expandedCaseId === c.id && (
                        <div style={{ borderTop: '1px solid var(--neutral-400)', backgroundColor: 'var(--neutral-200)' }}>
                          {!appointments[c.id] || appointments[c.id].length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                              No appointments recorded for this case.
                            </div>
                          ) : (
                            appointments[c.id].map((apt, ai) => (
                              <div key={apt.id ?? ai} style={{
                                padding: '1.25rem 1.5rem',
                                borderBottom: ai < appointments[c.id].length - 1 ? '1px solid var(--neutral-400)' : 'none',
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                                gap: '1rem', alignItems: 'start'
                              }}>
                                <div>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Date & Type</div>
                                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{apt.scheduledAt}</div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{apt.appointmentType}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Chief Complaint</div>
                                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{apt.chiefComplaint}</div>
                                  {apt.ward !== '—' && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ward: {apt.ward}</div>}
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Outcome</div>
                                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{apt.outcomeSummary}</div>
                                  {apt.durationMinutes > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{apt.durationMinutes} min</div>}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Bill</div>
                                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    {apt.totalBill > 0
                                      ? `RM ${apt.totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                      : '—'}
                                  </div>
                                  {apt.billStatus !== '—' && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{apt.billStatus}</div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </LayoutSidebar>
  );
}