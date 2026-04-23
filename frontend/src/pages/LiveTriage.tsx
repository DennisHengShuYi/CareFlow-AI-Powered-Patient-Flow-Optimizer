import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import LayoutSidebar from '../components/LayoutSidebar';
import { capacityRoomStyle } from '../utils/capacityRoomStyle';
import { Filter, Mic, CircleDot, UserPlus, Search, LayoutGrid, Users, Square } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const API = 'http://127.0.0.1:8002';

export default function LiveTriage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [objectiveNote, setObjectiveNote] = useState("");
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [viewMode, setViewMode] = useState<'queue' | 'encounter'>('queue');
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllPatients, setShowAllPatients] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newComplaint, setNewComplaint] = useState("");
  const [newLevel, setNewLevel] = useState<number>(3);
  const [newIcNumber, setNewIcNumber] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isNewPatientMode, setIsNewPatientMode] = useState(false);
  const [addPatientErrors, setAddPatientErrors] = useState<{[key: string]: string}>({});
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overridePatient, setOverridePatient] = useState<any>(null);
  const [overrideLevel, setOverrideLevel] = useState(3);
  const [overrideDiagnosis, setOverrideDiagnosis] = useState("");
  const [overrideDeptId, setOverrideDeptId] = useState("");
  const [overrideDocId, setOverrideDocId] = useState("");
  const [overrideBP, setOverrideBP] = useState("");
  const [overrideHR, setOverrideHR] = useState("");
  const [overrideO2, setOverrideO2] = useState("");
  const [allDoctors, setAllDoctors] = useState<any[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<any[]>([]);
  const [overrideErrors, setOverrideErrors] = useState<{[key: string]: string}>({});

  const [dashboardTab, setDashboardTab] = useState<'flow' | 'capacity'>('flow');
  const [boardData, setBoardData] = useState<{ departments: any[] } | null>(null);
  const [facilityCatalog, setFacilityCatalog] = useState<{ departments: string[]; doctors: { name: string; department: string }[] }>({
    departments: [],
    doctors: [],
  });

  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingPaused, setRecordingPaused] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const [overview, board] = await Promise.all([
        fetch(`${API}/api/triage/overview`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${API}/api/capacity/board`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);

      setData(overview);
      setBoardData(board);
      if (board.catalog) {
        setFacilityCatalog(board.catalog);
      }
      setLoading(false);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }, [getToken]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Timer effect for recording
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (recordingActive && !recordingPaused) {
      timer = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recordingActive, recordingPaused]);

  const openOverrideModal = async (patient: any) => {
    setOverridePatient(patient);
    setOverrideLevel(patient.level);
    setOverrideDiagnosis(patient.diagnosis || "");
    setOverrideBP(patient.blood_pressure || "");
    setOverrideHR(patient.heart_rate || "");
    setOverrideO2(patient.oxygen_saturation || "");
    setOverrideDeptId(patient.department_id || "");
    setOverrideDocId(patient.doctor_id || "");
    setOverrideErrors({});

    // Load doctors from database
    try {
      const token = await getToken();
      const response = await fetch(`${API}/api/doctors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setAllDoctors(data.doctors || []);

      // Filter doctors by department if set
      if (patient.department_id) {
        const filtered = (data.doctors || []).filter(
          (d: any) => d.department_id === patient.department_id
        );
        setFilteredDoctors(filtered);
      } else {
        setFilteredDoctors(data.doctors || []);
      }
    } catch (e) {
      console.error('Failed to load doctors:', e);
    }

    setShowOverrideModal(true);
  };

  const handleOverrideSubmit = async () => {
    if (!overridePatient) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API}/api/triage/override/${overridePatient.id}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          level: overrideLevel,
          diagnosis: overrideDiagnosis,
          department_id: overrideDeptId || null,
          doctor_id: overrideDocId || null,
          status: overridePatient.status,
          blood_pressure: overrideBP || null,
          heart_rate: overrideHR || null,
          oxygen_saturation: overrideO2 || null
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Override error:', error);
        setOverrideErrors({ submit: 'Failed to update patient' });
        return;
      }

      // Also update vitals separately if they changed
      if (overrideBP || overrideHR || overrideO2) {
        await fetch(`${API}/api/patients/${overridePatient.id}/vitals`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            blood_pressure: overrideBP,
            heart_rate: overrideHR,
            oxygen_saturation: overrideO2
          })
        });
      }

      setShowOverrideModal(false);
      setOverrideErrors({});
      fetchData();
    } catch (e) {
      console.error('Override error:', e);
      setOverrideErrors({ submit: 'Error updating patient' });
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^[0-9\s\-\+\(\)]{7,}$/;
    return phoneRegex.test(phone.trim());
  };

  const validateAddPatient = (): boolean => {
    const errors: {[key: string]: string} = {};

    if (!newName.trim()) errors.name = "Patient name is required";
    if (!newIcNumber.trim()) errors.icNumber = "IC number is required";
    if (!newPhone.trim()) errors.phone = "Phone number is required";
    else if (!validatePhone(newPhone)) errors.phone = "Invalid phone number format";
    if (newEmail.trim() && !validateEmail(newEmail)) errors.email = "Invalid email format";
    if (!newComplaint.trim()) errors.complaint = "Chief complaint is required";

    setAddPatientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddPatient = async () => {
    if (!validateAddPatient()) return;

    try {
      const token = await getToken();
      const response = await fetch(`${API}/api/triage/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name: newName, 
          complaint: newComplaint, 
          level: newLevel,
          ic_number: newIcNumber,
          phone: newPhone,
          email: newEmail
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Registration error:', error);
        setAddPatientErrors({ submit: 'Failed to register patient. Please try again.' });
        return;
      }

      setShowAddModal(false);
      setNewName("");
      setNewComplaint("");
      setNewLevel(3);
      setNewIcNumber("");
      setNewPhone("");
      setNewEmail("");
      setIsNewPatientMode(false);
      setAddPatientErrors({});
      setSearchResults([]);
      fetchData();
    } catch (e) {
      console.error('Add patient error:', e);
      setAddPatientErrors({ submit: 'Error registering patient' });
    }
  };

  const handleSelectPatient = async (patientId: string) => {
    // This now updates the status to 'In Consult' in Supabase via the API
    try {
      const token = await getToken();
      await fetch(`${API}/api/triage/override/${patientId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'In Consult' })
      });
      setAssessment("");
      setPlan("");
      setObjectiveNote("");
      setViewMode('encounter');
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSignNote = async () => {
    if (!data?.active_encounter) return;
    try {
      const token = await getToken();
      await fetch(`${API}/api/triage/override/${data.active_encounter.id}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'signed' })
      });
      setAssessment("");
      setPlan("");
      setObjectiveNote("");
      setViewMode('queue');
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelEncounter = async () => {
    // Return to waiting status
    setViewMode('queue');
  };


  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const openRecordingModal = () => {
    setRecordingSeconds(0);
    setRecordingActive(false);
    setRecordingModalOpen(true);
  };

  const closeRecordingModal = () => {
    if (recordingActive && !window.confirm('Discard this recording?')) return;
    setRecordingModalOpen(false);
    setRecordingActive(false);
    setRecordingPaused(false);
    setRecordingSeconds(0);
  };

  const startRecording = () => {
    setRecordingSeconds(0);
    setRecordingPaused(false);
    setRecordingActive(true);
  };

  const pauseRecording = () => {
    setRecordingPaused(true);
  };

  const resumeRecording = () => {
    setRecordingPaused(false);
  };

  const stopRecordingAndInsert = () => {
    const stamp = formatRecTime(recordingSeconds);
    const snippet = `[Dictation ${stamp}] Further history on ROS; denies recent travel; family history reviewed (simulated transcript).\n`;
    setObjectiveNote((prev) => (prev ? `${prev.trim()}\n\n${snippet}` : snippet));
    setRecordingActive(false);
    setRecordingPaused(false);
    setRecordingModalOpen(false);
    setRecordingSeconds(0);
  };

  if (loading) {
    return (
      <LayoutSidebar>
        <div style={{ padding: '2rem 3rem', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>Loading live stream... Ensure backend is running.</div>
        </div>
      </LayoutSidebar>
    );
  }

  if (!data) return null;

  const currentUtilization = Math.min(100, Math.round((data.queue_active / 20) * 100));
  
  const chartData = [
    { time: '08:00', utilization: 45 },
    { time: '10:00', utilization: 85 },
    { time: '12:00', utilization: 60 },
    { time: '14:00', utilization: 92 },
    { time: '16:00', utilization: 75 },
    { time: 'Now', utilization: currentUtilization },
  ];

  const triageData = [
    { name: 'Self-Care', value: 35, color: '#9ca3af' },
    { name: 'GP Clinic', value: 45, color: '#60a5fa' },
    { name: 'Specialist', value: 15, color: 'var(--primary)' },
    { name: 'Emergency', value: 5, color: '#ba1a1a' },
  ];

  const staffData = [
    { label: 'Physicians', current: 12, total: 15, color: 'var(--primary)' },
    { label: 'Nursing Staff', current: 28, total: 30, color: 'var(--secondary)' },
    { label: 'Triage Officers', current: 4, total: 5, color: '#f59e0b' },
    { label: 'Pharmacy', current: 6, total: 8, color: '#10b981' },
  ];

  return (
    <LayoutSidebar>
      <div style={{ padding: '2rem 3rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header Section */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>Active Duty</h1>
            <p style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '1rem' }}>Live Clinical Overview</p>
            {viewMode === 'queue' && (
              <div style={{ display: 'inline-flex', background: 'var(--neutral-200)', borderRadius: '12px', padding: '4px', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setDashboardTab('flow')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    background: dashboardTab === 'flow' ? 'white' : 'transparent',
                    color: dashboardTab === 'flow' ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: dashboardTab === 'flow' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Users size={16} /> Patient flow
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardTab('capacity')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '10px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    background: dashboardTab === 'capacity' ? 'white' : 'transparent',
                    color: dashboardTab === 'capacity' ? 'var(--primary)' : 'var(--text-muted)',
                    boxShadow: dashboardTab === 'capacity' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <LayoutGrid size={16} /> Capacity
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={() => setShowAddModal(true)}
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 700 }}
            >
              <UserPlus size={16} /> Add Patient
            </button>
            <div className="card" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '9999px' }}>
              <div style={{ color: '#ba1a1a', background: '#ffdad6', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>!</div>
              <div>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Critical</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>0{data.critical}</div>
              </div>
            </div>
            <div className="card" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '9999px' }}>
              <div>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Queue</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{data.queue_active} Active</div>
              </div>
            </div>
            <div className="card" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '9999px' }}>
              <div>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Daily Clinic Load</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>45 / 50 <span style={{fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-muted)'}}>Booked</span></div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
          
          {/* Queue View */}
          {viewMode === 'queue' && dashboardTab === 'flow' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', flex: 1, minWidth: 0 }}>
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem' }}>Patient Queue</h2>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Capacity: {currentUtilization}% utilized</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No-shows: 2.1% trend</span>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderRadius: '12px', padding: '0.75rem 1rem', border: '1px solid var(--neutral-400)', flex: 1, maxWidth: '400px' }}>
                    <Search size={18} color="var(--text-muted)" style={{ marginRight: '0.75rem' }} />
                    <input 
                      type="text" 
                      placeholder="Search patient name, complaint..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem', width: '100%', color: 'var(--text-main)' }}
                    />
                  </div>

                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                      style={{ color: filterLevel !== null ? 'var(--primary)' : 'var(--secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'white', borderRadius: '12px', padding: '0.75rem 1.5rem', border: '1px solid var(--neutral-400)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' }}
                    >
                      {filterLevel !== null ? `Level ${filterLevel}` : 'Filter'} <Filter size={16} />
                    </button>
                    {showFilterMenu && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', background: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid var(--neutral-400)', zIndex: 10, minWidth: '160px', overflow: 'hidden' }}>
                        <button onClick={() => { setFilterLevel(null); setShowFilterMenu(false); }} style={{ width: '100%', padding: '0.75rem 1rem', textAlign: 'left', background: filterLevel === null ? 'var(--neutral-200)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>All Patients</button>
                        <button onClick={() => { setFilterLevel(1); setShowFilterMenu(false); }} style={{ width: '100%', padding: '0.75rem 1rem', textAlign: 'left', background: filterLevel === 1 ? 'var(--neutral-200)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#ba1a1a', fontWeight: 600 }}>Level 1 (Critical)</button>
                        <button onClick={() => { setFilterLevel(2); setShowFilterMenu(false); }} style={{ width: '100%', padding: '0.75rem 1rem', textAlign: 'left', background: filterLevel === 2 ? 'var(--neutral-200)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--secondary)', fontWeight: 600 }}>Level 2 (Urgent)</button>
                        <button onClick={() => { setFilterLevel(3); setShowFilterMenu(false); }} style={{ width: '100%', padding: '0.75rem 1rem', textAlign: 'left', background: filterLevel === 3 ? 'var(--neutral-200)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--primary)', fontWeight: 600 }}>Level 3 (Standard)</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 2fr 1fr auto', gap: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', paddingBottom: '1rem', borderBottom: '1px solid var(--neutral-400)', marginBottom: '1rem' }}>
                <div>Urgency</div>
                <div>Patient</div>
                <div>Diagnosis & Complaint</div>
                <div>Status & Assignment</div>
                <div style={{ width: '50px' }}></div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
                {(() => {
                  let filteredPatients = data.patients?.filter((p: any) => {
                    const matchesLevel = filterLevel === null || p.level === filterLevel;
                    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.complaint.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesLevel && matchesSearch;
                  }) || [];
                  
                  // Sort by level (1 Critical -> 3 Standard)
                  filteredPatients.sort((a: any, b: any) => a.level - b.level);

                  const displayedPatients = showAllPatients ? filteredPatients : filteredPatients.slice(0, 5);

                  return (
                    <>
                      {displayedPatients.map((patient: any) => {
                        const isCritical = patient.level === 1;
                        const isActiveEncounter =
                          !!(data.active_encounter?.id && patient.id === data.active_encounter.id);
                  return (
                    <div 
                      key={patient.id} 
                      onClick={() => handleSelectPatient(patient.id)}
                      style={{ 
                        background: isCritical ? '#fffcfc' : 'white', 
                        border: isActiveEncounter
                          ? '2px solid var(--primary)'
                          : isCritical
                            ? '2px solid #ba1a1a'
                            : '1px solid var(--neutral-400)',
                        borderLeft: isActiveEncounter
                          ? '6px solid var(--primary)'
                          : isCritical
                            ? '6px solid #ba1a1a'
                            : '1px solid var(--neutral-400)',
                        borderRadius: '12px', padding: '1rem', 
                        display: 'grid', gridTemplateColumns: '1fr 1.5fr 2fr 1fr auto', alignItems: 'center', gap: '1rem',
                        boxShadow: isActiveEncounter ? '0 0 0 3px rgba(59, 130, 246, 0.2)' : '0 2px 4px rgba(0,0,0,0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = isActiveEncounter
                          ? '0 0 0 3px rgba(59, 130, 246, 0.28), 0 4px 12px rgba(0,0,0,0.1)'
                          : '0 4px 12px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = isActiveEncounter
                          ? '0 0 0 3px rgba(59, 130, 246, 0.2)'
                          : '0 2px 4px rgba(0,0,0,0.05)';
                      }}
                    >
                      <div>
                        <div style={{ color: isCritical ? '#ba1a1a' : (patient.level === 2 ? 'var(--secondary)' : 'var(--primary)'), fontSize: '0.875rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {isCritical && <span style={{ background: '#ba1a1a', color: 'white', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '0.65rem' }}>!</span>} 
                          LEVEL {patient.level}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Arrived {patient.time}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <div style={{ width: '32px', height: '32px', minWidth: '32px', borderRadius: '50%', background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>{patient.initials}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{patient.details}</div>
                        </div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                         <div style={{ fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.diagnosis || 'Pending Eval'}</div>
                         <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{patient.complaint}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{patient.department || 'Triage'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{patient.assigned_doctor || 'Unassigned'} • {patient.status}</div>
                        {isActiveEncounter && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active encounter</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button 
                          onClick={(e) => { e.stopPropagation(); openOverrideModal(patient); }}
                          style={{ background: 'var(--neutral-200)', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neutral-300)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--neutral-200)'; }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredPatients.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No patients match your search or filter.
                  </div>
                )}
                {filteredPatients.length > 5 && (
                  <div style={{ textAlign: 'center', marginTop: '0.5rem', marginBottom: '1rem' }}>
                    <button 
                      onClick={() => setShowAllPatients(!showAllPatients)}
                      style={{ 
                        background: '#f0f4f8', 
                        border: '1px solid var(--primary)', 
                        color: 'var(--primary)', 
                        padding: '0.5rem 1.5rem', 
                        borderRadius: '9999px', 
                        fontSize: '0.875rem', 
                        fontWeight: 600, 
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = 'white'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#f0f4f8'; e.currentTarget.style.color = 'var(--primary)'; }}
                    >
                      {showAllPatients ? 'Show Less' : `Show More (${filteredPatients.length - 5} hidden)`}
                    </button>
                  </div>
                )}
                </>
              );
            })()}
              </div>
            </div>

              {/* Analytics Row */}
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', paddingBottom: '2rem' }}>
                
                {/* Chart Card */}
                <div className="card" style={{ padding: '1.5rem', flex: '1 1 500px' }}>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 700 }}>Clinic Capacity Utilization</h2>
                  <div style={{ height: '240px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--neutral-400)" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          itemStyle={{ color: 'var(--primary)', fontWeight: 700 }}
                          formatter={(value) => [`${Number(value ?? 0)}%`, 'Utilization']}
                        />
                        <Area type="monotone" dataKey="utilization" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Donut Chart Card */}
                <div className="card" style={{ padding: '1.5rem', flex: '1 1 300px' }}>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 700 }}>AI Triage Conversion</h2>
                  <div style={{ height: '240px', width: '100%', position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={triageData}
                          cx="50%"
                          cy="45%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {triageData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          itemStyle={{ fontWeight: 700, color: 'var(--text-main)' }}
                          formatter={(value) => [`${Number(value ?? 0)}%`, 'Conversion']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    
                    {/* Custom Legend */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '-30px', padding: '0 1rem' }}>
                      {triageData.map((entry, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }}></div>
                          {entry.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              <div className="card" style={{ padding: '1.5rem', flex: '1 1 500px' }}>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 700 }}>Current Staffing Load</h2>
                  <div className="space-y-4">
                  {staffData.map((item, i) => {
                    const percent = (item.current / item.total) * 100;
                    return (
                      <div key={i} style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                            {item.label}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>
                            {item.current}/{item.total}
                          </span>
                        </div>
                        <div style={{ height: 6, background: 'var(--neutral-300)', borderRadius: 6 }}>
                          <div style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: item.color,
                            borderRadius: 6
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
          
              </div>
            </div>
          )}

          {viewMode === 'queue' && dashboardTab === 'capacity' && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '720px' }}>
                  {
                    "Each room lists patients who match that room's department and assigned doctor. In session means status is In Consult or In Resus. Other statuses (e.g. Awaiting Labs, Room 4) count as the waiting list. Opening an encounter sets that patient to In Consult; the previous In Consult patient returns to Waiting for Doctor. "
                  }
                  <Link to="/departments" style={{ color: 'var(--primary)', fontWeight: 700 }}>Departments</Link>
                  {' '}for room staffing.
                </p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {(boardData?.departments || []).map((dept: any) => (
                  <div key={dept.id} className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{dept.name}</h2>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span className="card" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '9999px' }}>
                          In session {dept.metrics?.rooms_occupied ?? 0} · Waiting list {dept.metrics?.rooms_with_queue ?? 0} · Open {dept.metrics?.rooms_ready ?? 0}
                        </span>
                        <span className="card" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '9999px' }}>
                          {dept.metrics?.doctors_in_consult ?? 0}/{dept.metrics?.doctors_total ?? 0} doctors in consult
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                          {dept.metrics?.rooms_staffed ?? 0} staffed rooms
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                      {(dept.rooms || []).map((room: any) => {
                        const rs = capacityRoomStyle(room.state);
                        return (
                          <div
                            key={room.id}
                            style={{
                              border: `1px solid var(--neutral-400)`,
                              borderRadius: '12px',
                              padding: '1rem',
                              background: rs.bg,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{room.label}</span>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: rs.label }}>{rs.label}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, maxWidth: '140px' }}>{rs.hint}</div>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                              {room.doctor_name ? (
                                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{room.doctor_name}</span>
                              ) : (
                                <span>No clinician assigned</span>
                              )}
                            </div>
                            {room.in_consult?.length > 0 && (
                              <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>IN CONSULT</div>
                                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                  {room.in_consult.map((p: any) => (
                                    <li key={p.id}>
                                      {p.name}{' '}
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({p.status})</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>PATIENT QUEUE</div>
                              {room.queue?.length ? (
                                <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                  {room.queue.map((p: any) => (
                                    <li key={p.id}>
                                      {p.name}{' '}
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({p.status})</span>
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No patients waiting</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {(!boardData?.departments || boardData.departments.length === 0) && (
                  <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No capacity data. Confirm the API is running at {API}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Encounter View */}
          {viewMode === 'encounter' && (
            <>
              {/* Left Col - Patient Info */}
              <div className="card" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div>
                   <button type="button" onClick={handleCancelEncounter} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0 }}>&larr; Back to Queue</button>
                </div>
                
                <div>
                   <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Patient Information</h2>
                   <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Review active encounter details prior to assessment. Cancel or Back to Queue discards this session and returns the patient to waiting if they were marked In Consult.</div>
                </div>
                
                <div style={{ background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)', borderRadius: '12px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                   <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'white', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                     {data.active_encounter?.initials || "-"}
                   </div>
                   <div>
                     <h3 style={{ fontSize: '1.5rem', color: 'white', marginBottom: '0.25rem' }}>{data.active_encounter?.name || "Unknown Patient"}</h3>
                     <div style={{ opacity: 0.9 }}>{data.active_encounter?.details || "No details available"}</div>
                   </div>
                </div>

                <div>
                   <h3 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Chief Complaint</h3>
                   <div style={{ background: '#f0f4f8', border: '1px solid #d9e2ec', color: '#102a43', borderRadius: '12px', padding: '1.25rem', fontSize: '1.125rem', fontWeight: 600 }}>
                     {data.active_encounter?.complaint || "No complaint recorded."}
                   </div>
                </div>

                <div>
                   <h3 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Triage Vitals Summary</h3>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                     <div style={{ background: 'var(--neutral-200)', padding: '1.25rem', borderRadius: '12px' }}>
                       <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>BLOOD PRESSURE</div>
                       <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                         {data.active_encounter?.metadata_data?.blood_pressure || data.ai_scribe?.vitals?.bp || "-"}
                       </div>
                     </div>
                     <div style={{ background: 'var(--neutral-200)', padding: '1.25rem', borderRadius: '12px' }}>
                       <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>HEART RATE</div>
                       <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ba1a1a' }}>
                         {data.active_encounter?.metadata_data?.heart_rate || data.ai_scribe?.vitals?.hr || "-"}
                       </div>
                     </div>
                     <div style={{ background: 'var(--neutral-200)', padding: '1.25rem', borderRadius: '12px' }}>
                       <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>OXYGEN SAT.</div>
                       <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                         {data.active_encounter?.metadata_data?.oxygen_saturation || data.ai_scribe?.vitals?.o2 || "-"}
                       </div>
                     </div>
                   </div>
                </div>

                <div>
                   <h3 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CircleDot size={12}/> Z.ai Triage Reasoning</h3>
                   <div style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#0369a1', borderRadius: '12px', padding: '1.25rem', fontSize: '0.875rem', fontWeight: 600, lineHeight: '1.5' }}>
                     {data.active_encounter?.ai_reasoning || "AI reasoning unavailable for this patient."}
                   </div>
                </div>
              </div>

              {/* Right Col - SOAP Note Generation */}
              <div className="card" style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <Mic size={20} color="var(--primary)" /> SOAP Note Generation
                  </div>
                  <button
                    type="button"
                    onClick={openRecordingModal}
                    className="btn-primary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 1.1rem',
                      borderRadius: '9999px',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Mic size={18} /> Record
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{ background: 'var(--neutral-300)', padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', color: 'var(--text-muted)', border: '1px solid var(--neutral-400)' }}>
                    {data.ai_scribe?.status || "Waiting..."}
                  </div>

                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>SUBJECTIVE</div>
                    <div style={{ background: 'var(--neutral-200)', padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', lineHeight: '1.5' }}>
                      {data.ai_scribe?.subjective || "N/A"}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>OBJECTIVE</div>
                    <textarea 
                      style={{ 
                        width: '100%', minHeight: '60px', background: 'var(--neutral-200)', 
                        padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', 
                        lineHeight: '1.5', border: '1px solid var(--neutral-400)', outline: 'none',
                        resize: 'vertical', fontFamily: 'inherit'
                      }} 
                      placeholder="Enter physical exam findings or additional objective data..."
                      value={objectiveNote}
                      onChange={(e) => setObjectiveNote(e.target.value)}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>ASSESSMENT</div>
                    <textarea 
                      style={{ 
                        width: '100%', minHeight: '80px', background: 'var(--neutral-200)', 
                        padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', 
                        lineHeight: '1.5', border: '1px solid var(--neutral-400)', outline: 'none',
                        resize: 'vertical', fontFamily: 'inherit'
                      }} 
                      placeholder="Enter clinical assessment..."
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>PLAN</div>
                    <textarea 
                      style={{ 
                        width: '100%', minHeight: '80px', background: 'var(--neutral-200)', 
                        padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', 
                        lineHeight: '1.5', border: '1px solid var(--neutral-400)', outline: 'none',
                        resize: 'vertical', fontFamily: 'inherit'
                      }} 
                      placeholder="Enter treatment plan..."
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                    />
                  </div>

                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--neutral-400)' }}>
                  <button type="button" className="btn-secondary" onClick={handleCancelEncounter} style={{ flex: 1, background: 'var(--neutral-100)', border: '1px solid var(--neutral-400)' }}>Cancel</button>
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1 }}
                    onClick={handleSignNote}
                  >
                    Sign & Commit
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SOAP dictation / recording modal */}
      {recordingModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRecordingModal();
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '2rem',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.35rem' }}>Dictation capture</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Simulated in-browser session for demo. Start speaking when recording is active; stop to append a draft block into the Objective field.
            </p>

            <div
              style={{
                borderRadius: '12px',
                padding: '1.25rem',
                marginBottom: '1.25rem',
                background: recordingActive ? '#fff5f5' : 'var(--neutral-100)',
                border: recordingActive ? '1px solid #fecaca' : '1px solid var(--neutral-400)',
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: recordingActive ? '#dc2626' : '#94a3b8',
                    flexShrink: 0,
                    boxShadow: recordingActive ? '0 0 0 4px rgba(220,38,38,0.25)' : 'none',
                  }}
                />
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: recordingActive ? '#991b1b' : 'var(--text-muted)' }}>
                  {recordingActive ? 'Recording…' : 'Ready'}
                </span>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>
                {formatRecTime(recordingSeconds)}
              </div>
              {recordingActive && (
                <div style={{ marginTop: '0.75rem', height: '36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3px' }}>
                  {[8, 14, 10, 18, 12, 20, 9, 15, 11].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: 4,
                        height: `${h}px`,
                        borderRadius: 2,
                        background: 'var(--primary)',
                        opacity: 0.85,
                        transformOrigin: 'center bottom',
                        animation: `careflow-meter 0.9s ease-in-out ${i * 0.07}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <style>{`
              @keyframes careflow-meter {
                from { transform: scaleY(0.4); opacity: 0.45; }
                to { transform: scaleY(1); opacity: 1; }
              }
            `}</style>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {!recordingActive ? (
                <button type="button" className="btn-primary" style={{ padding: '0.75rem', fontWeight: 700 }} onClick={startRecording}>
                  Start recording
                </button>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    <button
                      type="button"
                      onClick={recordingPaused ? resumeRecording : pauseRecording}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        fontWeight: 700,
                        borderRadius: '10px',
                        border: '1px solid var(--neutral-400)',
                        background: recordingPaused ? 'var(--primary)' : '#fff3cd',
                        color: recordingPaused ? 'white' : '#332701',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {recordingPaused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={stopRecordingAndInsert}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        fontWeight: 700,
                        borderRadius: '10px',
                        border: '1px solid var(--neutral-400)',
                        background: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      <Square size={16} fill="currentColor" /> Stop & append
                    </button>
                  </div>
                </>
              )}
              <button type="button" className="btn-secondary" style={{ padding: '0.65rem', fontWeight: 700 }} onClick={closeRecordingModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Patient Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '550px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            {/* Header */}
            <div style={{ padding: '2rem 2rem 1rem 2rem', borderBottom: '1px solid var(--neutral-400)' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 700 }}>Add New Patient</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>Register a new patient and add to the queue</p>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Error Message */}
              {addPatientErrors.submit && (
                <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600 }}>
                  {addPatientErrors.submit}
                </div>
              )}

              {/* Patient Name with Search */}
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Patient Name *</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setAddPatientErrors({ ...addPatientErrors, name: '' });
                    // Search in existing patients from queue
                    if (e.target.value.length > 0 && data?.patients) {
                      const results = data.patients.filter((p: any) => 
                        p.name.toLowerCase().includes(e.target.value.toLowerCase())
                      );
                      setSearchResults(results);
                      setShowSearchResults(results.length > 0);
                    } else {
                      setShowSearchResults(false);
                    }
                  }}
                  placeholder="Start typing patient name..."
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem 1rem', 
                    borderRadius: '8px', 
                    border: addPatientErrors.name ? '2px solid #dc2626' : '1px solid var(--neutral-400)', 
                    fontSize: '1rem', 
                    outline: 'none', 
                    background: 'var(--neutral-100)' 
                  }}
                />
                {addPatientErrors.name && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 500 }}>{addPatientErrors.name}</div>}
                
                {/* Search Results Dropdown */}
                {showSearchResults && searchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--neutral-400)', borderRadius: '8px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                    {searchResults.map((patient: any) => (
                      <div 
                        key={patient.id}
                        onClick={() => {
                          setNewName(patient.name);
                          setNewComplaint(patient.complaint || '');
                          setNewLevel(patient.level || 3);
                          setShowSearchResults(false);
                          setAddPatientErrors({});
                        }}
                        style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--neutral-200)', fontSize: '0.875rem', fontWeight: 600 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neutral-100)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {patient.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>Level {patient.level}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* IC Number */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>IC Number *</label>
                <input 
                  type="text" 
                  value={newIcNumber} 
                  onChange={(e) => {
                    setNewIcNumber(e.target.value);
                    setAddPatientErrors({ ...addPatientErrors, icNumber: '' });
                  }}
                  placeholder="National ID or IC number..."
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem 1rem', 
                    borderRadius: '8px', 
                    border: addPatientErrors.icNumber ? '2px solid #dc2626' : '1px solid var(--neutral-400)', 
                    fontSize: '1rem', 
                    outline: 'none', 
                    background: 'var(--neutral-100)' 
                  }}
                />
                {addPatientErrors.icNumber && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 500 }}>{addPatientErrors.icNumber}</div>}
              </div>

              {/* Phone and Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Phone *</label>
                  <input 
                    type="tel" 
                    value={newPhone} 
                    onChange={(e) => {
                      setNewPhone(e.target.value);
                      setAddPatientErrors({ ...addPatientErrors, phone: '' });
                    }}
                    placeholder="Contact number..."
                    style={{ 
                      width: '100%', 
                      padding: '0.75rem 1rem', 
                      borderRadius: '8px', 
                      border: addPatientErrors.phone ? '2px solid #dc2626' : '1px solid var(--neutral-400)', 
                      fontSize: '1rem', 
                      outline: 'none', 
                      background: 'var(--neutral-100)' 
                    }}
                  />
                  {addPatientErrors.phone && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 500 }}>{addPatientErrors.phone}</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Email (Optional)</label>
                  <input 
                    type="email" 
                    value={newEmail} 
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setAddPatientErrors({ ...addPatientErrors, email: '' });
                    }}
                    placeholder="user@example.com"
                    style={{ 
                      width: '100%', 
                      padding: '0.75rem 1rem', 
                      borderRadius: '8px', 
                      border: addPatientErrors.email ? '2px solid #dc2626' : '1px solid var(--neutral-400)', 
                      fontSize: '1rem', 
                      outline: 'none', 
                      background: 'var(--neutral-100)' 
                    }}
                  />
                  {addPatientErrors.email && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 500 }}>{addPatientErrors.email}</div>}
                </div>
              </div>

              {/* Chief Complaint */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Chief Complaint *</label>
                <textarea 
                  value={newComplaint} 
                  onChange={(e) => {
                    setNewComplaint(e.target.value);
                    setAddPatientErrors({ ...addPatientErrors, complaint: '' });
                  }}
                  placeholder="Describe symptoms briefly..."
                  style={{ 
                    width: '100%', 
                    minHeight: '60px', 
                    padding: '0.75rem 1rem', 
                    borderRadius: '8px', 
                    border: addPatientErrors.complaint ? '2px solid #dc2626' : '1px solid var(--neutral-400)', 
                    fontSize: '1rem', 
                    outline: 'none', 
                    resize: 'none', 
                    background: 'var(--neutral-100)', 
                    fontFamily: 'inherit' 
                  }}
                />
                {addPatientErrors.complaint && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 500 }}>{addPatientErrors.complaint}</div>}
              </div>

              {/* Urgency Level */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Assigned Urgency Level</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button 
                    onClick={() => setNewLevel(1)} 
                    style={{ flex: 1, padding: '1rem 0.5rem', borderRadius: '8px', border: newLevel === 1 ? '2px solid #ba1a1a' : '1px solid var(--neutral-400)', background: newLevel === 1 ? '#ffdad6' : 'white', color: newLevel === 1 ? '#ba1a1a' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.875rem' }}
                  >Level 1<br/><span style={{ fontSize: '0.75rem', fontWeight: 500 }}>(Critical)</span></button>
                  <button 
                    onClick={() => setNewLevel(2)} 
                    style={{ flex: 1, padding: '1rem 0.5rem', borderRadius: '8px', border: newLevel === 2 ? '2px solid var(--secondary)' : '1px solid var(--neutral-400)', background: newLevel === 2 ? '#e0f2fe' : 'white', color: newLevel === 2 ? 'var(--secondary)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.875rem' }}
                  >Level 2<br/><span style={{ fontSize: '0.75rem', fontWeight: 500 }}>(Urgent)</span></button>
                  <button 
                    onClick={() => setNewLevel(3)} 
                    style={{ flex: 1, padding: '1rem 0.5rem', borderRadius: '8px', border: newLevel === 3 ? '2px solid var(--primary)' : '1px solid var(--neutral-400)', background: newLevel === 3 ? '#dbeafe' : 'white', color: newLevel === 3 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.875rem' }}
                  >Level 3<br/><span style={{ fontSize: '0.75rem', fontWeight: 500 }}>(Standard)</span></button>
                </div>
              </div>
            </div>

            {/* Footer with Buttons */}
            <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--neutral-400)', display: 'flex', gap: '1rem' }}>
              <button 
                className="btn-secondary" 
                onClick={() => { 
                  setShowAddModal(false);
                  setNewName(""); setNewComplaint(""); setNewLevel(3); 
                  setNewIcNumber(""); setNewPhone(""); setNewEmail("");
                  setAddPatientErrors({});
                  setSearchResults([]);
                }} 
                style={{ flex: 1, padding: '0.75rem', background: 'var(--neutral-200)', border: 'none', fontWeight: 700 }}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handleAddPatient} 
                style={{ flex: 2, padding: '0.75rem', fontWeight: 700 }}
              >
                Add to Live Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Patient Modal */}
      {showOverrideModal && overridePatient && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            {/* Header */}
            <div style={{ padding: '2rem 2rem 1rem 2rem', borderBottom: '1px solid var(--neutral-400)' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 700 }}>Edit Patient: {overridePatient.name}</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>Update clinical information and assignment</p>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Error Message */}
              {overrideErrors.submit && (
                <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '1rem', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600 }}>
                  {overrideErrors.submit}
                </div>
              )}

              {/* Urgency Level */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Urgency Level</label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {[1, 2, 3].map(level => (
                    <button 
                      key={level}
                      onClick={() => setOverrideLevel(level)}
                      style={{ 
                        flex: 1, 
                        padding: '0.75rem', 
                        borderRadius: '8px', 
                        border: overrideLevel === level ? `2px solid ${level === 1 ? '#ba1a1a' : level === 2 ? 'var(--secondary)' : 'var(--primary)'}` : '1px solid var(--neutral-400)',
                        background: overrideLevel === level ? (level === 1 ? '#ffdad6' : level === 2 ? '#e0f2fe' : '#dbeafe') : 'white',
                        color: overrideLevel === level ? (level === 1 ? '#ba1a1a' : level === 2 ? 'var(--secondary)' : 'var(--primary)') : 'var(--text-muted)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontSize: '0.875rem'
                      }}
                    >
                      L{level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Diagnosis */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Diagnosis</label>
                <input 
                  type="text" 
                  value={overrideDiagnosis} 
                  onChange={e => setOverrideDiagnosis(e.target.value)}
                  placeholder="Clinical diagnosis..."
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--neutral-400)', fontSize: '1rem', outline: 'none', background: 'var(--neutral-100)' }}
                />
              </div>

              {/* Vitals Section */}
              <div style={{ borderTop: '1px solid var(--neutral-400)', paddingTop: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1rem' }}>Triage Vitals</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Blood Pressure</label>
                    <input 
                      type="text" 
                      value={overrideBP} 
                      onChange={e => setOverrideBP(e.target.value)}
                      placeholder="e.g., 120/80"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--neutral-400)', fontSize: '0.875rem', outline: 'none', background: 'var(--neutral-100)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Heart Rate</label>
                    <input 
                      type="text" 
                      value={overrideHR} 
                      onChange={e => setOverrideHR(e.target.value)}
                      placeholder="e.g., 72 bpm"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--neutral-400)', fontSize: '0.875rem', outline: 'none', background: 'var(--neutral-100)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>O2 Sat</label>
                    <input 
                      type="text" 
                      value={overrideO2} 
                      onChange={e => setOverrideO2(e.target.value)}
                      placeholder="e.g., 98%"
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--neutral-400)', fontSize: '0.875rem', outline: 'none', background: 'var(--neutral-100)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Department & Doctor */}
              <div style={{ borderTop: '1px solid var(--neutral-400)', paddingTop: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1rem' }}>Assignment</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Department</label>
                    <select 
                      value={overrideDeptId} 
                      onChange={(e) => {
                        setOverrideDeptId(e.target.value);
                        // Filter doctors by selected department
                        const filtered = allDoctors.filter((d: any) => d.department_id === e.target.value);
                        setFilteredDoctors(filtered);
                        setOverrideDocId("");
                      }}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--neutral-400)', fontSize: '0.875rem', outline: 'none', background: 'var(--neutral-100)' }}
                    >
                      <option value="">Select Department</option>
                      {(boardData?.departments || []).map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Doctor</label>
                    <select 
                      value={overrideDocId} 
                      onChange={(e) => {
                        setOverrideDocId(e.target.value);
                        // Auto-select department when doctor is selected
                        const selectedDoctor = allDoctors.find((d: any) => d.id === e.target.value);
                        if (selectedDoctor && selectedDoctor.department_id) {
                          setOverrideDeptId(selectedDoctor.department_id);
                        }
                      }}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--neutral-400)', fontSize: '0.875rem', outline: 'none', background: 'var(--neutral-100)' }}
                    >
                      <option value="">Select Doctor</option>
                      {filteredDoctors.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ padding: '1.5rem 2rem', borderTop: '1px solid var(--neutral-400)', display: 'flex', gap: '1rem' }}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowOverrideModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'var(--neutral-200)', border: 'none', fontWeight: 700 }}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handleOverrideSubmit}
                style={{ flex: 2, padding: '0.75rem', fontWeight: 700 }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </LayoutSidebar>
  );
}
