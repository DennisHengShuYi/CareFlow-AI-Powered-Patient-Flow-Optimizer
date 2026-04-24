import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import {
  Users,
  ChevronRight,
  Search,
  CreditCard,
  Activity,
  FileCheck,
  Plus,
  ArrowRight
} from 'lucide-react';
import { CaseCard, type StandardCase, type CaseStatusType } from '../components/CaseCard';
import { useAuth } from '@clerk/clerk-react';

interface Case {
  rejection_reason: string;
  workflow_status: string;
  id: string;
  type: string;
  department: string;
  glStatus: 'none' | 'requested' | 'approved' | 'rejected';
  claimStatus: 'none' | 'requested' | 'approved' | 'rejected';
  totalBill: number;
}

interface Patient {
  id: string;
  name: string;
  age: number;
  caseCount: number;
  diagnoses: string[];
  insurers: string[];
  cases: Case[];
  type: 'inpatient' | 'outpatient' | 'emergency';
}

const API = 'http://127.0.0.1:8002';

// ✅ Module-level pure function — no hooks here
// Remove local normaliseStatus as it is handled by the data mapping logic or component

const fetchPatients = async (): Promise<Patient[]> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API}/api/patients`, { headers });
  if (!response.ok) throw new Error('Failed to fetch patients');

  const json = await response.json();
  if (!json.success) throw new Error('API returned failure');

  const grouped = json.data;

  const mapGroup = (list: any[], type: Patient['type']): Patient[] =>
    list.map((p: any): Patient => {
      const cases: Case[] = (p.cases || []).map((c: any): Case => ({
        id: c.id,
        type: c.title ?? 'Untitled Case',
        department: c.department ?? 'General',
        glStatus: c.workflow_status,
        claimStatus: 'none',
        totalBill: 0,
        workflow_status: '',
        rejection_reason: c.rejection_reason
      }));
      return {
        id: p.id,
        name: p.full_name,
        age: p.age ?? 0,
        caseCount: cases.length,
        diagnoses: p.diagnoses ?? [],
        insurers: p.insurers ?? [],
        type, // ✅ use group key, not p.category (often null)
        cases
      };
    });

  return [
    ...mapGroup(grouped.emergency || [], 'emergency'),
    ...mapGroup(grouped.inpatient || [], 'inpatient'),
    ...mapGroup(grouped.outpatient || [], 'outpatient'),
  ];
};

export default function Patients() {
  const navigate = useNavigate();

  // ✅ All hooks inside the component
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalCaseBill, setTotalCaseBill] = useState<any>(null);
  const { getToken } = useAuth();

  const loadTotalCaseBill = async (cases: Case[]) => {
    try {
      const token = await getToken();

      const caseIds = cases.map(c => c.id).join(",");

      const res = await fetch(
        `${API}/api/cases/bills/summary?case_ids=${caseIds}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Failed to load bill summary");

      const data = await res.json();
      console.log("Bill summary data:", data);
      console.log("Keys:", Object.keys(data));
      setTotalCaseBill(data);
    } catch (err) {
      console.error(err);
    }
  };

  // ✅ Single useEffect — no duplicate fetch
  useEffect(() => {
    setLoading(true);
    fetchPatients()
      .then(data => {
        setPatients(data);
        // Auto-select first patient on load
        if (data.length > 0) setSelectedPatientId(data[0].id);
      })
      .catch(err => console.error('[Patients] Load error:', err))
      .finally(() => setLoading(false));
  }, []);

  const selectedPatient = patients.find(p => p.id === selectedPatientId) ?? null;

  useEffect(() => {
    if (!selectedPatient) return;

    loadTotalCaseBill(selectedPatient.cases);
  }, [selectedPatient]);

  // Remove local renderStatus as it is now in CaseCard.tsx

  // ✅ PatientList defined inside component so it can close over state
  const PatientList = ({
    type,
    title
  }: {
    type: 'inpatient' | 'outpatient' | 'emergency';
    title: string;
  }) => {
    const filtered = patients.filter(
      p => p.type === type && p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length === 0) return null;

    return (
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{
          fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--text-muted)', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          {title}
          <span style={{
            backgroundColor: 'var(--neutral-400)', padding: '2px 6px',
            borderRadius: '4px', fontSize: '0.65rem'
          }}>
            {filtered.length}
          </span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(p => (
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
                  <span>{p.caseCount} case{p.caseCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <ChevronRight
                size={16}
                color={selectedPatientId === p.id ? 'var(--primary)' : 'var(--neutral-500)'}
              />
            </div>
          ))}
        </div>
      </div>
    );
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
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1.5rem' }}>Patients</h1>
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
          </div>

          {/* ✅ Loading state is scoped to just the list area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', paddingTop: '2rem' }}>
                Loading patients...
              </div>
            ) : (
              <>
                <PatientList type="emergency" title="Emergency" />
                <PatientList type="inpatient" title="Inpatient" />
                <PatientList type="outpatient" title="Outpatient" />
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
                background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)',
                color: 'white', padding: '2.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'relative', overflow: 'hidden'
              }}>
                <Activity
                  size={180}
                  style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1, color: 'white' }}
                />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: '9999px',
                    backgroundColor: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem'
                  }}>
                    {selectedPatient.type} Profile
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
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedPatient.caseCount}</div>
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
                            backgroundColor: 'white', color: 'var(--secondary)',
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
                  <div style={{ marginBottom: '1.5rem' }}>
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

                {/* Right: medical cases */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Medical Cases</h3>
                    <button className="btn-primary" style={{
                      padding: '0.5rem 1rem', fontSize: '0.875rem',
                      display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                      <Plus size={16} /> New Case
                    </button>
                  </div>

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
                        title: c.type, // Patients.tsx uses .type for title
                        department: c.department,
                        status: c.workflow_status,
                        workflow_status: c.workflow_status,
                        gl_status: c.glStatus as CaseStatusType,
                        claim_status: c.claimStatus as CaseStatusType,
                        totalBill: totalCaseBill?.bills?.[c.id] ?? 0,
                        rejection_reason: c.rejection_reason
                      }}
                      onClick={() => navigate(`/cases/${c.id}`)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'
            }}>
              <Users size={64} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
              <h3>Select a patient to view their records</h3>
            </div>
          )}
        </div>
      </div>
    </LayoutSidebar>
  );
}
