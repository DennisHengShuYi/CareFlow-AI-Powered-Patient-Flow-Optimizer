import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import { 
  Users, 
  ChevronRight, 
  Search, 
  Filter, 
  CreditCard, 
  Activity, 
  Clock, 
  FileCheck, 
  Plus,
  ArrowRight
} from 'lucide-react';

interface Case {
  type: string;
  department: string;
  glStatus: 'none' | 'requested' | 'approved';
  claimStatus: 'none' | 'requested' | 'approved';
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

const MOCK_PATIENTS: Patient[] = [
  {
    id: 'p1',
    name: 'Alex Tan Wei Kiat',
    age: 45,
    caseCount: 2,
    diagnoses: ['Stroke (Ischemic)', 'Hyperlipidemia'],
    insurers: ['AIA Platinum', 'Corporate - Petronas'],
    type: 'inpatient',
    cases: [
      {
        type: 'Stroke Management',
        department: 'Neurology',
        glStatus: 'approved',
        claimStatus: 'requested',
        totalBill: 45200.50
      },
      {
        type: 'Rehabilitation Phase 1',
        department: 'Physiotherapy',
        glStatus: 'requested',
        claimStatus: 'none',
        totalBill: 1200.00
      }
    ]
  },
  {
    id: 'p2',
    name: 'Siti Aminah binti Yusuf',
    age: 62,
    caseCount: 1,
    diagnoses: ['Hypertension', 'Osteoarthritis'],
    insurers: ['Prudential Health'],
    type: 'outpatient',
    cases: [
      {
        type: 'Hypertension Follow-up',
        department: 'General Medicine',
        glStatus: 'none',
        claimStatus: 'none',
        totalBill: 350.00
      }
    ]
  },
  {
    id: 'p3',
    name: 'Rajesh Kumar',
    age: 28,
    caseCount: 1,
    diagnoses: ['Acute Appendicitis'],
    insurers: ['Great Eastern'],
    type: 'emergency',
    cases: [
      {
        type: 'Emergency Surgery',
        department: 'Surgery',
        glStatus: 'requested',
        claimStatus: 'requested',
        totalBill: 18500.00
      }
    ]
  }
];

export default function Patients() {
  const navigate = useNavigate();
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(MOCK_PATIENTS[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  
  const selectedPatient = MOCK_PATIENTS.find(p => p.id === selectedPatientId);

  const renderStatus = (status: 'none' | 'requested' | 'approved', type: 'GL' | 'Claim') => {
    const colors = {
      none: { bg: 'var(--neutral-400)', text: 'var(--text-muted)' },
      requested: { bg: '#FFF9C4', text: '#F9A825' },
      approved: { bg: '#E8F5E9', text: '#2E7D32' }
    };

    const current = colors[status];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ 
          fontSize: '0.65rem', 
          fontWeight: 800, 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em',
          color: 'var(--text-muted)',
          marginBottom: '2px'
        }}>
          {type} STATUS
        </div>
        <div style={{ 
          padding: '0.35rem 0.75rem', 
          borderRadius: '9999px', 
          backgroundColor: current.bg, 
          color: current.text,
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'capitalize'
        }}>
          {status}
        </div>
        {status === 'requested' && (
          <button style={{ 
            marginTop: '4px',
            backgroundColor: 'var(--primary)',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: 700,
            width: '100%',
            boxShadow: '0 4px 10px rgba(30, 136, 229, 0.2)'
          }}>
            Generate
          </button>
        )}
      </div>
    );
  };

  const PatientList = ({ type, title }: { type: 'inpatient' | 'outpatient' | 'emergency', title: string }) => {
    const patients = MOCK_PATIENTS.filter(p => p.type === type && p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (patients.length === 0) return null;

    return (
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ 
          fontSize: '0.75rem', 
          textTransform: 'uppercase', 
          letterSpacing: '0.1em', 
          color: 'var(--text-muted)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {title} <span style={{ backgroundColor: 'var(--neutral-400)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>{patients.length}</span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {patients.map(p => (
            <div 
              key={p.id}
              style={{ 
                padding: '1rem',
                borderRadius: '12px',
                backgroundColor: selectedPatientId === p.id ? 'var(--primary-fixed)' : 'white',
                border: selectedPatientId === p.id ? '1px solid var(--primary)' : '1px solid var(--neutral-400)',
                transition: 'all 0.2s ease',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <button 
                  onClick={() => setSelectedPatientId(p.id)}
                  style={{ 
                    fontWeight: 700, 
                    color: selectedPatientId === p.id ? 'var(--primary)' : 'var(--text-main)', 
                    marginBottom: '0.25rem',
                    textAlign: 'left',
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    fontSize: '1rem',
                    cursor: 'pointer'
                  }}
                >
                  {p.name}
                </button>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                  <span>{p.age} years old</span>
                  <span>•</span>
                  <span>{p.caseCount} cases</span>
                </div>
              </div>
              <ChevronRight size={16} color={selectedPatientId === p.id ? 'var(--primary)' : 'var(--neutral-500)'} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <LayoutSidebar>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        
        {/* Sidebar List */}
        <div style={{ 
          width: '350px', 
          borderRight: '1px solid var(--neutral-400)', 
          display: 'flex', 
          flexDirection: 'column',
          backgroundColor: 'var(--neutral-100)'
        }}>
          <div style={{ padding: '2rem 1.5rem', borderBottom: '1px solid var(--neutral-400)' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1.5rem' }}>Patients</h1>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search patients..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.75rem 1rem 0.75rem 2.5rem', 
                  borderRadius: '12px', 
                  border: '1px solid var(--neutral-400)',
                  backgroundColor: 'var(--neutral-200)',
                  outline: 'none',
                  fontSize: '0.875rem'
                }} 
              />
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
            <PatientList type="emergency" title="Emergency" />
            <PatientList type="inpatient" title="Inpatient" />
            <PatientList type="outpatient" title="Outpatient" />
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, backgroundColor: 'var(--neutral-300)', overflowY: 'auto', padding: '2rem 3rem' }}>
          {selectedPatient ? (
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              
              {/* Patient Header Card */}
              <div className="card" style={{ 
                marginBottom: '2rem', 
                background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)',
                color: 'white',
                padding: '2.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <Activity size={180} style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1, color: 'white' }} />
                
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ 
                    display: 'inline-block', 
                    padding: '4px 12px', 
                    borderRadius: '9999px', 
                    backgroundColor: 'rgba(255,255,255,0.2)', 
                    fontSize: '0.75rem', 
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: '1rem'
                  }}>
                    {selectedPatient.type} Profile
                  </div>
                  <h2 style={{ fontSize: '2.5rem', color: 'white', fontWeight: 800, marginBottom: '0.5rem' }}>{selectedPatient.name}</h2>
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
                      {selectedPatient.insurers.map((ins, i) => (
                        <span key={i} style={{ backgroundColor: 'white', color: 'var(--secondary)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}>
                          {ins}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Primary Diagnosis</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{selectedPatient.diagnoses[0]}</div>
                  </div>
                </div>
              </div>

              {/* Patient Info Detail */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                
                {/* Left Column: Summary */}
                <div className="card" style={{ height: 'fit-content' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileCheck size={18} color="var(--primary)" /> Clinical Summary
                  </h3>
                  
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>All Diagnoses</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedPatient.diagnoses.map((d, i) => (
                        <div key={i} style={{ backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600 }}>
                          {d}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Financial Coverage</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {selectedPatient.insurers.map((ins, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px' }}>
                          <CreditCard size={16} color="var(--primary)" />
                          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{ins}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Cases */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Medical Cases</h3>
                    <button className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Plus size={16} /> New Case
                    </button>
                  </div>

                  {selectedPatient.cases.map((c, i) => (
                    <div key={i} className="card" style={{ padding: '0' }}>
                      <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '1.5rem', alignItems: 'center' }}>
                        
                        {/* Case Type & Dept */}
                        <div 
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/cases/${c.type}`)}
                        >
                          <div style={{ 
                            fontSize: '1.125rem', 
                            fontWeight: 800, 
                            color: 'var(--primary)', 
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            {c.type} <ArrowRight size={14} />
                          </div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {c.department} Department
                          </div>
                        </div>

                        {/* GL Status */}
                        {renderStatus(c.glStatus, 'GL')}

                        {/* Claim Status */}
                        {renderStatus(c.claimStatus, 'Claim')}

                        {/* Total Bill */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Total Bill</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            RM {c.totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>

              </div>

            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Users size={64} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
              <h3>Select a patient to view their records</h3>
            </div>
          )}
        </div>

      </div>
    </LayoutSidebar>
  );
}
