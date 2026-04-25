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
  ArrowRight,
  X,
  Loader2,
  Pencil,
  Trash2,
  Receipt,
  UploadCloud,
  FileText,
  BriefcaseMedical
} from 'lucide-react';

interface Case {
  id: string;
  type: string;
  department: string;
  glStatus: 'none' | 'requested' | 'approved';
  claimStatus: 'none' | 'requested' | 'approved';
  totalBill: number;
  hasMedicalBill: boolean;
  medicalBillPrice?: number;
  billUrl?: string;
  doctorDiagnosis?: string;
  diagnosisPdfUrl?: string;
  confidenceScore?: number;
  aiReasoning?: string;
  generatedDocUrl?: string;
  claimType?: string;
  workflowStatus?: string;
}

interface Patient {
  id: string;
  name: string;
  age: number;
  caseCount: number;
  diagnoses: string[];
  insurers: string[];
  doctorInCharge?: string;
  cases: Case[];
  type: 'inpatient' | 'outpatient' | 'emergency';
  policy_url?: string;
}

const HOSPITAL_DEPARTMENTS = [
  'Emergency Department',
  'General Medicine',
  'Pediatrics',
  'Obstetrics & Gynecology',
  'General Surgery',
  'Cardiology',
  'Orthopedics',
  'Oncology',
  'Neurology',
  'Psychiatry',
  'Dermatology',
  'Gastroenterology',
  'Urology',
  'Radiology',
  'Pathology / Laboratory',
  'Pharmacy',
  'Rehabilitation / Physiotherapy',
  'Intensive Care Unit (ICU)',
  'Neonatal ICU (NICU)',
  'Operating Theater',
  'General Practice (GP)',
  'Dental Clinic',
  'Ophthalmology',
  'ENT (Ear, Nose & Throat)',
];

const API = 'http://127.0.0.1:8002';

// ✅ Module-level pure function — no hooks here
const normaliseStatus = (raw: string | null | undefined): 'none' | 'requested' | 'approved' => {
  if (!raw) return 'none';
  const s = raw.toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'none') return 'none';
  return 'requested'; // covers: requested, pending, supervision required, etc.
};

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
        glStatus: normaliseStatus(c.workflow_status),
        claimStatus: 'none',
        totalBill: typeof c.medical_bill_price === 'number' ? c.medical_bill_price : parseFloat(c.medical_bill_price || '0'),
        hasMedicalBill: c.has_medical_bill ?? false,
        billUrl: c.bill_url,
        doctorDiagnosis: c.doctor_diagnosis,
        diagnosisPdfUrl: c.diagnosis_pdf_url,
        confidenceScore: c.confidence_score,
        aiReasoning: c.ai_reasoning,
        generatedDocUrl: c.generated_doc_url,
        claimType: c.claim_type,
        workflowStatus: c.workflow_status
      }));
      return {
        id: p.id,
        name: p.full_name,
        age: p.age ?? 0,
        caseCount: cases.length,
        diagnoses: p.diagnoses ?? [],
        insurers: p.insurers ?? [],
        doctorInCharge: p.doctor_in_charge ?? undefined,
        policy_url: p.policy_url ?? undefined,
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

  // New Case Modal State
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCaseDepartment, setNewCaseDepartment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Patient State
  const [isEditPatientModalOpen, setIsEditPatientModalOpen] = useState(false);
  const [editPatientName, setEditPatientName] = useState('');
  const [editPatientInsurers, setEditPatientInsurers] = useState('');
  const [editPatientDoctorInCharge, setEditPatientDoctorInCharge] = useState('');
  const [editPolicyFile, setEditPolicyFile] = useState<File | null>(null);
  const [isPolicyUploading, setIsPolicyUploading] = useState(false);
  const [policyUploadSuccess, setPolicyUploadSuccess] = useState(false);

  // Edit Case State
  const [isEditCaseModalOpen, setIsEditCaseModalOpen] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editCaseTitle, setEditCaseTitle] = useState('');
  const [editCaseDepartment, setEditCaseDepartment] = useState('');

  // Upload Bill State
  const [isUploadBillModalOpen, setIsUploadBillModalOpen] = useState(false);
  const [uploadingCaseId, setUploadingCaseId] = useState<string | null>(null);
  const [billAmount, setBillAmount] = useState('');
  const [billFile, setBillFile] = useState<File | null>(null);

  const refreshPatients = () => {
    setLoading(true);
    fetchPatients()
      .then(data => {
        setPatients(data);
      })
      .catch(err => console.error('[Patients] Refresh error:', err))
      .finally(() => setLoading(false));
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !newCaseTitle || !newCaseDepartment) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API}/api/patients/${selectedPatientId}/cases`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: newCaseTitle,
          department: newCaseDepartment
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create case');
      }

      // Success
      setIsNewCaseModalOpen(false);
      setNewCaseTitle('');
      setNewCaseDepartment('');
      refreshPatients();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');

      // 1. Update name + insurers
      const response = await fetch(`${API}/api/patients/${selectedPatientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          full_name: editPatientName,
          insurers: editPatientInsurers.split(',').map(i => i.trim()).filter(i => i),
          doctor_in_charge: editPatientDoctorInCharge
        })
      });
      if (!response.ok) throw new Error('Failed to update patient');

      // 2. Upload policy PDF if one was selected
      if (editPolicyFile) {
        setIsPolicyUploading(true);
        const formData = new FormData();
        formData.append('file', editPolicyFile);
        const policyRes = await fetch(`${API}/api/patients/${selectedPatientId}/policy`, {
          method: 'POST',
          headers: { 'Authorization': token ? `Bearer ${token}` : '' },
          body: formData
        });
        setIsPolicyUploading(false);
        if (!policyRes.ok) throw new Error('Patient info saved, but policy PDF upload failed.');
        setPolicyUploadSuccess(true);
        setTimeout(() => setPolicyUploadSuccess(false), 3000);
      }

      setIsEditPatientModalOpen(false);
      setEditPolicyFile(null);
      refreshPatients();
    } catch (err: any) {
      setError(err.message);
      setIsPolicyUploading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCaseId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/cases/${editingCaseId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          title: editCaseTitle,
          department: editCaseDepartment
        })
      });
      if (!response.ok) throw new Error('Failed to update case');
      setIsEditCaseModalOpen(false);
      refreshPatients();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!window.confirm('Are you sure you want to delete this case?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/cases/${caseId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        }
      });
      if (!response.ok) throw new Error('Failed to delete case');
      refreshPatients();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUploadBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingCaseId || !billAmount || !billFile) {
      setError('Please provide both the bill amount and a file.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('total_bill', billAmount);
      if (billFile) {
        formData.append('file', billFile);
      }

      const response = await fetch(`${API}/api/cases/${uploadingCaseId}/bill`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: formData
      });
      if (!response.ok) throw new Error('Failed to upload bill');
      setIsUploadBillModalOpen(false);
      setBillAmount('');
      setBillFile(null);
      refreshPatients();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ Single useEffect — no duplicate fetch
  useEffect(() => {
    setLoading(true);
    fetchPatients()
      .then(data => {
        setPatients(data);
        // Auto-select first patient on load if none selected
        if (data.length > 0 && !selectedPatientId) setSelectedPatientId(data[0].id);
      })
      .catch(err => console.error('[Patients] Load error:', err))
      .finally(() => setLoading(false));
  }, [selectedPatientId]);

  const selectedPatient = patients.find(p => p.id === selectedPatientId) ?? null;

  const renderStatus = (status: 'none' | 'requested' | 'approved', type: 'GL' | 'Claim', p: Patient, c: Case) => {
    const colors = {
      none: { bg: 'var(--neutral-400)', text: 'var(--text-muted)' },
      requested: { bg: '#FFF9C4', text: '#F9A825' },
      approved: { bg: '#E8F5E9', text: '#2E7D32' }
    };
    const current = colors[status];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{
          fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '2px'
        }}>
          {type} STATUS
        </div>
        <div style={{
          padding: '0.35rem 0.75rem', borderRadius: '9999px',
          backgroundColor: current.bg, color: current.text,
          fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize'
        }}>
          {status}
        </div>
        {status === 'requested' && (
          <button 
            onClick={() => {
              navigate('/claims', { 
                state: { 
                  patientName: p.name,
                  patientId: p.id,
                  caseId: c.id,
                  diagnosis: c.doctorDiagnosis || 'Pending Diagnosis',
                  diagnosisPdfUrl: c.diagnosisPdfUrl,
                  confidenceScore: c.confidenceScore,
                  aiReasoning: c.aiReasoning,
                  generatedDocUrl: c.generatedDocUrl,
                  claimType: c.claimType,
                  workflowStatus: c.workflowStatus,
                  insurers: p.insurers,
                  policyUrl: p.policy_url,
                  billUrl: c.billUrl,
                  billPrice: c.totalBill
                } 
              });
            }}
            style={{
              marginTop: '4px', backgroundColor: 'var(--primary)', color: 'white',
              padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.875rem',
              fontWeight: 700, width: '100%', boxShadow: '0 4px 10px rgba(30,136,229,0.2)',
              cursor: 'pointer', border: 'none'
            }}
          >
            Generate
          </button>
        )}
      </div>
    );
  };

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
                  <h2 style={{ fontSize: '2.5rem', color: 'white', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {selectedPatient.name}
                    <button
                      onClick={() => {
                        setEditPatientName(selectedPatient.name);
                        setEditPatientInsurers(selectedPatient.insurers.join(', '));
                        setEditPatientDoctorInCharge(selectedPatient.doctorInCharge || '');
                        setIsEditPatientModalOpen(true);
                      }}
                      style={{ background: 'none', border: 'none', color: 'white', opacity: 0.7, cursor: 'pointer', padding: '4px' }}
                    >
                      <Pencil size={20} />
                    </button>
                  </h2>
                  <div style={{ display: 'flex', gap: '2rem', opacity: 0.9 }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Patient Age</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedPatient.age} Years</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Dr. In Charge</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedPatient.doctorInCharge || 'Unassigned'}</div>
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
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Insurance Policy</div>
                    {selectedPatient.policy_url ? (
                      <button
                        onClick={() => window.open(selectedPatient.policy_url, '_blank')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          backgroundColor: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
                          color: 'white', padding: '6px 14px', borderRadius: '8px',
                          fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        <FileText size={14} /> View Policy PDF
                      </button>
                    ) : (
                      <span style={{ opacity: 0.6, fontSize: '0.875rem' }}>No policy on file</span>
                    )}
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
                    <button
                      className="btn-primary"
                      onClick={() => setIsNewCaseModalOpen(true)}
                      style={{
                        padding: '0.5rem 1rem', fontSize: '0.875rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                      }}
                    >
                      <Plus size={16} /> New Case
                    </button>
                  </div>

                  {selectedPatient.cases.length === 0 && (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No cases found for this patient.
                    </div>
                  )}

                  {selectedPatient.cases.map((c, i) => (
                    <div key={c.id ?? i} className="card" style={{ padding: '0' }}>
                      <div style={{
                        padding: '1.5rem',
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr',
                        gap: '1.5rem',
                        alignItems: 'center'
                      }}>
                        <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/cases/${c.id}`)}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>
                              {c.type}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {c.department} Department
                            </div>
                          </div>
                        </div>

                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(2, 40px)', 
                          gap: '0.5rem', 
                          alignItems: 'center' 
                        }}>
                          <button 
                            onClick={() => {
                              setEditingCaseId(c.id);
                              setEditCaseTitle(c.type);
                              setEditCaseDepartment(c.department);
                              setIsEditCaseModalOpen(true);
                            }}
                            style={{ background: 'var(--neutral-300)', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Edit Case"
                          >
                            <Pencil size={16} />
                          </button>
                          
                          <button 
                            onClick={() => {
                              setUploadingCaseId(c.id);
                              setIsUploadBillModalOpen(true);
                            }}
                            style={{ background: c.hasMedicalBill ? 'var(--primary-fixed)' : 'var(--neutral-300)', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: c.hasMedicalBill ? 'var(--primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Upload Bill"
                          >
                            <Receipt size={16} />
                          </button>

                          {c.hasMedicalBill ? (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (c.billUrl) {
                                  window.open(c.billUrl, '_blank');
                                } else {
                                  alert('Bill URL not found. Please try re-uploading.');
                                }
                              }}
                              style={{ background: 'var(--primary-fixed)', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              title="View Bill PDF"
                            >
                              <FileText size={16} />
                            </button>
                          ) : (
                            <div style={{ width: '40px' }} /> 
                          )}

                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCase(c.id);
                            }}
                            style={{ background: 'rgba(239, 83, 80, 0.1)', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', color: '#ef5350', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Delete Case"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {renderStatus(c.glStatus, 'GL', selectedPatient, c)}
                        {renderStatus(c.claimStatus, 'Claim', selectedPatient, c)}

                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
                            textTransform: 'uppercase', marginBottom: '8px'
                          }}>
                            Total Bill
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {c.totalBill > 0
                              ? `RM ${c.totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
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

      {/* New Case Modal */}
      {isNewCaseModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: '500px', padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Add New Case</h3>
              <button
                onClick={() => setIsNewCaseModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateCase}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  CASE TITLE
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chronic Kidney Disease Follow-up"
                  value={newCaseTitle}
                  onChange={e => setNewCaseTitle(e.target.value)}
                  style={{
                    width: '100%', padding: '0.75rem', borderRadius: '10px',
                    border: '1px solid var(--neutral-400)', outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  DEPARTMENT
                </label>
                <select
                  required
                  value={newCaseDepartment}
                  onChange={e => setNewCaseDepartment(e.target.value)}
                  style={{
                    width: '100%', padding: '0.75rem', borderRadius: '10px',
                    border: '1px solid var(--neutral-400)', outline: 'none',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Select a department</option>
                  {HOSPITAL_DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div style={{
                  padding: '0.75rem', borderRadius: '8px', backgroundColor: '#FEE2E2',
                  color: '#B91C1C', fontSize: '0.875rem', marginBottom: '1.5rem',
                  fontWeight: 600
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsNewCaseModalOpen(false)}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '10px',
                    border: '1px solid var(--neutral-400)', backgroundColor: 'white',
                    fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '10px',
                    border: 'none', backgroundColor: 'var(--primary)',
                    color: 'white', fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                  }}
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {isEditPatientModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Edit Patient Info</h3>
              <button onClick={() => { setIsEditPatientModalOpen(false); setEditPolicyFile(null); setError(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <form onSubmit={handleUpdatePatient}>
              {/* Name */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>FULL NAME</label>
                <input type="text" required value={editPatientName} onChange={e => setEditPatientName(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)' }} />
              </div>
              {/* Insurers */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>INSURERS (comma separated)</label>
                <input type="text" value={editPatientInsurers} onChange={e => setEditPatientInsurers(e.target.value)} placeholder="e.g. Allianz, AIA" style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)' }} />
              </div>
              {/* Doctor In Charge */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>DOCTOR IN CHARGE</label>
                <input type="text" value={editPatientDoctorInCharge} onChange={e => setEditPatientDoctorInCharge(e.target.value)} placeholder="e.g. Dr. John Doe" style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)' }} />
              </div>
              {/* Policy PDF */}
              <div style={{ marginBottom: '1.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>INSURANCE POLICY PDF (optional)</label>
                <div style={{
                  border: `2px dashed ${editPolicyFile ? 'var(--primary)' : 'var(--neutral-400)'}`,
                  padding: '1.5rem', borderRadius: '12px', textAlign: 'center',
                  cursor: 'pointer', backgroundColor: editPolicyFile ? 'var(--primary-fixed)' : 'var(--neutral-100)',
                  position: 'relative', transition: 'all 0.2s'
                }}>
                  <UploadCloud size={28} color={editPolicyFile ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: '0.4rem' }} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: editPolicyFile ? 'var(--primary)' : 'var(--text-main)' }}>
                    {editPolicyFile ? editPolicyFile.name : 'Click to select PDF'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>PDF only · max 10 MB</div>
                  {selectedPatient?.policy_url && !editPolicyFile && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '6px', fontWeight: 600 }}>
                      ✓ Policy already on file — upload to replace
                    </div>
                  )}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setEditPolicyFile(e.target.files ? e.target.files[0] : null)}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                  />
                </div>
              </div>
              {/* Error */}
              {error && (
                <div style={{ marginBottom: '1rem', color: '#ef5350', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>
              )}
              {/* Actions */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => { setIsEditPatientModalOpen(false); setEditPolicyFile(null); setError(null); }}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700 }}
                >Cancel</button>
                <button
                  type="submit"
                  disabled={isSubmitting || isPolicyUploading}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none',
                    backgroundColor: 'var(--primary)', color: 'white', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    cursor: (isSubmitting || isPolicyUploading) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isPolicyUploading ? <><Loader2 size={16} className="animate-spin" /> Uploading PDF...</> :
                   isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Saving...</> :
                   'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Case Modal */}
      {isEditCaseModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Edit Case</h3>
              <button onClick={() => setIsEditCaseModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <form onSubmit={handleUpdateCase}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>CASE TITLE</label>
                <input type="text" required value={editCaseTitle} onChange={e => setEditCaseTitle(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)' }} />
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>DEPARTMENT</label>
                <select required value={editCaseDepartment} onChange={e => setEditCaseDepartment(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)', background: 'white' }}>
                  {HOSPITAL_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setIsEditCaseModalOpen(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={isSubmitting} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 700 }}>{isSubmitting ? <Loader2 className="animate-spin" /> : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Bill Modal */}
      {isUploadBillModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Upload Medical Bill</h3>
              <button onClick={() => setIsUploadBillModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <form onSubmit={handleUploadBill}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>TOTAL BILL AMOUNT (RM)</label>
                <input type="number" step="0.01" required value={billAmount} onChange={e => setBillAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)' }} />
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>SELECT FILE</label>
                <div style={{
                  border: '2px dashed var(--neutral-400)', padding: '2rem', borderRadius: '12px',
                  textAlign: 'center', cursor: 'pointer', backgroundColor: 'var(--neutral-100)',
                  position: 'relative'
                }}>
                  <UploadCloud size={32} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{billFile ? billFile.name : 'Click to select or drag and drop'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PDF, JPG or PNG (max 10MB)</div>
                  <input
                    type="file"
                    onChange={e => setBillFile(e.target.files ? e.target.files[0] : null)}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setIsUploadBillModalOpen(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={isSubmitting} style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 700 }}>{isSubmitting ? <Loader2 className="animate-spin" /> : 'Upload Bill'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LayoutSidebar>
  );
}