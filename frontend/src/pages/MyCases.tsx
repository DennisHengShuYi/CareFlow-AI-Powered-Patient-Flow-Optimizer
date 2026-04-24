import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  Loader2,
  Clock,
  Calendar,
  Stethoscope,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  FileCheck,
  Activity,
  ChevronLeft,
  XCircle,
  RotateCw,
  Edit2,
  User,
  Phone,
  Mail,
  Plus,
  Trash2,
  Save
} from 'lucide-react';
import LayoutSidebar from '../components/LayoutSidebar';
import { AppointmentCard } from '../components/AppointmentCard';
import { CaseCard, type StandardCase, type CaseStatusType } from '../components/CaseCard';
import type { StandardAppointment, AppointmentStatus } from '../components/AppointmentCard';

interface MedicalCase {
  totalCaseBill: number;
  claim_status: string;
  rejection_reason: string;
  total_bill: number;
  id: string;
  title: string;
  department: string;
  status: string;
  workflow_status: string;
  has_medical_bill: boolean;
  created_at: string;
  gl?: {
    rejection_reason: string; status: string; file_url?: string
  }[];
  claim?: {
    rejection_reason: string; status: string; file_url?: string
  }[];
}

interface PatientProfile {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  age: number;
  insurers: string[];
  diagnoses?: string[];
  cases: MedicalCase[];
}

// Use StandardAppointment from AppointmentCard.tsx
type Appointment = StandardAppointment;

const API = 'http://localhost:8002';

// Remove local helpers and styles as they are now in AppointmentCard.tsx



export default function MyCases() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Record<string, Appointment[]>>({});
  const [loadingApts, setLoadingApts] = useState(false);
  const [totalCaseBill, setTotalCaseBill] = useState<any>(null);

  // Edit Profile States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    insurers: [] as string[]
  });
  const [newInsurer, setNewInsurer] = useState('');

  const loadTotalCaseBill = async (cases: MedicalCase[]) => {
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
      setTotalCaseBill(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      console.log('Token:', token);
      const res = await fetch(`${API}/api/my/cases`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        if (res.status === 404) throw new Error('Patient profile not found.');
        const err = await res.json();
        throw new Error('Failed to load your medical cases.' + err.detail);
      }

      const json = await res.json();

      setProfile({
        id: json.id ?? '',
        full_name: json.full_name ?? 'My Profile',
        phone: json.phone ?? '',
        email: json.email ?? '',
        age: json.age ?? 0,
        insurers: json.insurers ?? [],
        diagnoses: json.diagnoses ?? [],
        cases: json.cases ?? [],
      });

      setEditFormData({
        full_name: json.full_name ?? '',
        phone: json.phone ?? '',
        email: json.email ?? '',
        insurers: json.insurers ?? []
      });

      await loadTotalCaseBill(json.cases);
      console.log('totalCaseBill:', totalCaseBill);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async (caseId: string) => {
    if (appointments[caseId]) return;
    setLoadingApts(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/cases/${caseId}/appointments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load appointments.');
      const json = await res.json();

      const apts: Appointment[] = (json.data || []).map((a: any): Appointment => ({
        id: a.id,
        scheduledAt: a.scheduled_at,
        title: a.appointment_type ?? '—',
        urgencyLevel: a.urgency_level ?? '—',
        chiefComplaint: a.chief_complaint ?? '—',
        outcome: a.outcome_summary ?? '—',
        status: a.status ?? '—',
        durationMinutes: a.duration_minutes ?? 0,
        ward: a.ward ?? '—',
        totalBill: a.total_bill ?? 0,
        billStatus: a.bill_status ?? '—',
        billFileUrl: a.bill_file_url
      }));

      console.log("DEBUG: Response data type: ", typeof (apts))
      console.log("DEBUG: Data: ", apts)

      setAppointments(prev => ({ ...prev, [caseId]: apts }));
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

  const handleBack = () => setSelectedCaseId(null);

  const handleUpdateProfile = async () => {
    setIsSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/my/patientInfo`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editFormData)
      });

      if (!res.ok) throw new Error('Failed to update profile');

      await loadProfile();
      setIsEditModalOpen(false);
    } catch (e) {
      console.error('Error updating profile:', e);
      alert('Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const addInsurer = () => {
    if (newInsurer.trim() && !editFormData.insurers.includes(newInsurer.trim())) {
      setEditFormData(prev => ({
        ...prev,
        insurers: [...prev.insurers, newInsurer.trim()]
      }));
      setNewInsurer('');
    }
  };

  const removeInsurer = (index: number) => {
    setEditFormData(prev => ({
      ...prev,
      insurers: prev.insurers.filter((_, i) => i !== index)
    }));
  };

  useEffect(() => { loadProfile(); }, []);

  // Remove local renderStatus as it is now in CaseCard.tsx

  if (loading) {
    return (
      <LayoutSidebar>
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
          <Loader2 size={40} className="animate-spin" color="var(--primary)" />
          <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Loading your medical profile...</div>
        </div>
      </LayoutSidebar>
    );
  }

  if (error) {
    return (
      <LayoutSidebar>
        <div style={{ padding: '2rem' }}>
          <div style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.3)', borderRadius: '16px', padding: '1rem 1.5rem', color: '#e53935', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle size={20} /> {error}
          </div>
        </div>
      </LayoutSidebar>
    );
  }

  if (!profile) return null;

  const selectedCase = profile.cases.find(c => c.id === selectedCaseId) ?? null;
  const caseAppointments = selectedCaseId ? (appointments[selectedCaseId] ?? []) : [];

  return (
    <LayoutSidebar>
      <div style={{ backgroundColor: 'var(--neutral-300)', minHeight: '100%', overflowY: 'auto', padding: '2rem 3rem' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

          {/* ── Patient header card ── */}
          <div className="card" style={{
            marginBottom: '2rem',
            background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)',
            color: 'white', padding: '2.5rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            position: 'relative', overflow: 'hidden'
          }}>
            <Activity size={180} style={{ position: 'absolute', right: '-40px', bottom: '-40px', opacity: 0.1, color: 'white' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '9999px', backgroundColor: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
                My Profile
              </div>
              <h2 style={{ fontSize: '2.5rem', color: 'white', fontWeight: 800, marginBottom: '0.5rem' }}>
                {profile.full_name}
              </h2>
              <div style={{ display: 'flex', gap: '2rem', opacity: 0.9 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Age</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{profile.age} Years</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase' }}>Total Cases</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{profile.cases.length}</div>
                </div>
              </div>
            </div>
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Insurers</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  {profile.insurers.length > 0
                    ? profile.insurers.map((ins, i) => (
                      <span key={i} style={{ backgroundColor: 'white', color: 'var(--secondary)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {ins}
                      </span>
                    ))
                    : <span style={{ opacity: 0.6, fontSize: '0.875rem' }}>None on record</span>
                  }
                </div>
              </div>
              {profile.diagnoses && profile.diagnoses.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Primary Diagnosis</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{profile.diagnoses[0]}</div>
                </div>
              )}
            </div>

            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="btn-glass"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <Edit2 size={16} /> Edit Profile
              </button>
            </div>
          </div>

          {/* ── Case detail drill-in ── */}
          {selectedCase ? (
            <div>
              <button
                onClick={handleBack}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', marginBottom: '1.5rem', padding: 0 }}
              >
                <ChevronLeft size={18} /> Back to Cases
              </button>

              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Stethoscope size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>{selectedCase.title}</h3>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {selectedCase.department} · Created {new Date(selectedCase.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>GL Status</div>
                  <div style={{
                    padding: '0.35rem 0.8rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
                    background: selectedCase.workflow_status?.toLowerCase() === 'approved' ? '#E8F5E9' : selectedCase.workflow_status?.toLowerCase() === 'requested' ? '#FFF9C4' : 'var(--neutral-200)',
                    color: selectedCase.workflow_status?.toLowerCase() === 'approved' ? '#2E7D32' : selectedCase.workflow_status?.toLowerCase() === 'requested' ? '#F9A825' : 'var(--text-muted)'
                  }}>
                    {selectedCase.workflow_status || 'None'}
                  </div>
                </div>
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>Appointments</h3>
              {loadingApts ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  <Loader2 size={24} className="animate-spin" color="var(--primary)" />
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Fetching appointments...</span>
                </div>
              ) : caseAppointments.length === 0 ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No appointments found for this case.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {caseAppointments.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      showActions={false}
                    />
                  ))}
                </div>
              )}
            </div>

          ) : (
            /* ── Cases overview ── */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>

              {/* Left: clinical summary */}
              <div className="card" style={{ height: 'fit-content' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileCheck size={18} color="var(--primary)" /> Clinical Summary
                </h3>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>All Diagnoses</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(profile.diagnoses ?? []).length > 0
                      ? profile.diagnoses!.map((d, i) => (
                        <div key={i} style={{ backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600 }}>{d}</div>
                      ))
                      : <div style={{ backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No diagnoses recorded</div>
                    }
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Financial Coverage</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {profile.insurers.length > 0
                      ? profile.insurers.map((ins, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px' }}>
                          <CreditCard size={16} color="var(--primary)" />
                          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{ins}</span>
                        </div>
                      ))
                      : <div style={{ backgroundColor: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No insurers on record</div>
                    }
                  </div>
                </div>
              </div>

              {/* Right: cases list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Medical Cases</h3>

                {profile.cases.length === 0 && (
                  <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No cases found.
                  </div>
                )}

                {profile.cases.map((c, i) => {
                  const gl = Array.isArray(c.gl) ? c.gl[0] : c.gl;
                  const claim = Array.isArray(c.claim) ? c.claim[0] : c.claim;

                  return (
                    <CaseCard
                      key={c.id ?? i}
                      caseData={{
                        id: c.id,
                        title: c.title,
                        department: c.department,
                        status: c.status,
                        workflow_status: c.workflow_status,
                        gl_status: (gl?.status ?? 'none') as CaseStatusType,
                        claim_status: (claim?.status ?? 'none') as CaseStatusType,
                        rejection_reason: c.rejection_reason ?? '',
                        totalBill: totalCaseBill?.bills?.[c.id] ?? 0,
                        created_at: c.created_at,
                      }}
                      onClick={() => handleSelectCase(c.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Edit Profile Modal ── */}
      {isEditModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: '550px', padding: 0, overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.5rem 2rem',
              background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)',
              color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ padding: '8px', background: 'rgba(255,255,255,0.2)', borderRadius: '10px' }}>
                  <User size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Edit Patient Information</h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.8 }}
              >
                <XCircle size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '2rem', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Full Name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      value={editFormData.full_name}
                      onChange={(e) => setEditFormData(prev => ({ ...prev, full_name: e.target.value }))}
                      placeholder="Enter your full name"
                      style={{
                        width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '12px',
                        border: '2px solid var(--neutral-400)', background: 'var(--neutral-200)',
                        fontSize: '0.95rem', fontWeight: 600, outline: 'none', transition: 'border-color 0.2s'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  {/* Phone */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phone Number</label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="tel"
                        value={editFormData.phone}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+60123456789"
                        style={{
                          width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '12px',
                          border: '2px solid var(--neutral-400)', background: 'var(--neutral-200)',
                          fontSize: '0.95rem', fontWeight: 600, outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="patient@example.com"
                        style={{
                          width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '12px',
                          border: '2px solid var(--neutral-400)', background: 'var(--neutral-200)',
                          fontSize: '0.95rem', fontWeight: 600, outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Insurers List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>List of Insurers</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      value={newInsurer}
                      onChange={(e) => setNewInsurer(e.target.value)}
                      placeholder="Add new insurer..."
                      onKeyPress={(e) => e.key === 'Enter' && addInsurer()}
                      style={{
                        flex: 1, padding: '0.75rem 1rem', borderRadius: '12px',
                        border: '2px solid var(--neutral-400)', background: 'var(--neutral-200)',
                        fontSize: '0.95rem', fontWeight: 600, outline: 'none'
                      }}
                    />
                    <button
                      onClick={addInsurer}
                      style={{
                        padding: '0 1rem', borderRadius: '12px', background: 'var(--primary)',
                        color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center'
                      }}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {editFormData.insurers.map((ins, index) => (
                      <div key={index} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '6px 12px', background: 'var(--neutral-300)',
                        borderRadius: '8px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--secondary)'
                      }}>
                        {ins}
                        <button
                          onClick={() => removeInsurer(index)}
                          style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', padding: 0, display: 'flex' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {editFormData.insurers.length === 0 && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic', padding: '0.5rem 0' }}>No insurers added yet.</div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.5rem 2rem', background: 'var(--neutral-200)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button
                onClick={() => setIsEditModalOpen(false)}
                style={{
                  padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none',
                  background: 'none', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateProfile}
                disabled={isSaving}
                className="btn-primary"
                style={{
                  padding: '0.75rem 2rem', borderRadius: '12px', border: 'none',
                  background: 'var(--primary)', color: 'white', fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  boxShadow: '0 4px 12px rgba(30, 136, 229, 0.3)',
                  opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutSidebar>
  );
}