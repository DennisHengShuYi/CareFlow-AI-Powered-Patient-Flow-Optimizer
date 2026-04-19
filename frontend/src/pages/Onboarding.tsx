import React, { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, ShieldCheck, Stethoscope, ChevronRight, ChevronLeft, MapPin, Loader2, Search, Building2, Plus, Sparkles } from 'lucide-react';

export default function Onboarding() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [hospitals, setHospitals] = useState<{id: string, name: string}[]>([]);
  const [isCreatingHospital, setIsCreatingHospital] = useState(false);
  const [newHospitalName, setNewHospitalName] = useState('');
  const [newHospitalAddress, setNewHospitalAddress] = useState('');
  const [newHospitalContact, setNewHospitalContact] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    role: '',
    full_name: user?.fullName || '',
    age: '',
    gender: '',
    location: '',
    ic_number: '',
    phone: '',
  });

  const locations = ['Kuala Lumpur', 'Petaling Jaya', 'Cyberjaya', 'Penang', 'Johor Bahru', 'Subang Jaya', 'Shah Alam', 'Melaka'];

  // Fetch hospitals when reaching step 4
  React.useEffect(() => {
    if (step === 4 && formData.role === 'hospital_staff') {
      supabase.from('hospitals').select('id, name').eq('is_active', true)
        .then(({ data }) => setHospitals(data || []));
    }
  }, [step]);

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      let finalHospitalId = selectedHospitalId;

      // If creating a new hospital
      if (formData.role === 'hospital_staff' && isCreatingHospital && newHospitalName) {
        const { data: newHosp, error: hospErr } = await supabase
          .from('hospitals')
          .insert({ 
            name: newHospitalName, 
            address: newHospitalAddress || null,
            contact_number: newHospitalContact || null,
            is_active: true 
          })
          .select()
          .single();
        if (hospErr) throw hospErr;
        finalHospitalId = newHosp.id;
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: formData.full_name || user.fullName || user.username || 'Anonymous',
          role: formData.role,
          location: formData.location || null,
          age: parseInt(formData.age) || null,
          gender: formData.gender || null,
          avatar_url: user.imageUrl,
          hospital_id: (formData.role === 'hospital_staff' && finalHospitalId) ? finalHospitalId : null,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      // Automatically create a 'patients' record for clinical flows
      if (formData.role === 'patient') {
        const patientData = {
          ic_number: formData.ic_number.trim() || `P-${user.id.substring(0, 8)}`,
          phone: formData.phone.trim() || '000000000',
          full_name: formData.full_name || user.fullName || user.username || 'Anonymous',
          profile_id: user.id,
          language_preference: 'en'
        };

        const { error: patientErr } = await supabase
          .from('patients')
          .upsert(patientData, { onConflict: 'ic_number' });
        
        if (patientErr) {
          console.error('Failed to create patient record:', patientErr);
          // If upsert fails (e.g. IC number collision or RLS), alert the user but don't block navigation necessarily
          alert(`Note: Profile saved, but patient data record failed: ${patientErr.message}`);
        }
      }

      window.location.href = '/';
    } catch (err: any) {
      console.error('Error saving profile:', err);
      // Show more detailed error info if available
      const msg = err.message || 'Unknown error';
      alert(`Failed to complete onboarding: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 3 && formData.role === 'hospital_staff') {
      setStep(4);
    } else if (step === 3 && formData.role === 'patient') {
      setStep(4); // Patient Verification Step
    } else if (step === 4 && formData.role === 'patient') {
      handleComplete();
    } else {
      setStep((s) => (s + 1) as any);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: 'var(--bg-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ maxWidth: '600px', width: '100%', padding: 'var(--container-gap)', position: 'relative', overflow: 'hidden' }}>
        
        {/* Progress Bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', background: 'var(--primary)', width: `${(step / 4) * 100}%`, transition: 'width 0.4s ease' }}></div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          
          {/* STEP 1: ROLE IDENTITY (Same) */}
          {step === 1 && (
            <div className="animate-in">
              <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: 'var(--font-h1)', fontWeight: 900, marginBottom: '0.75rem' }}>
                  Welcome to <span className="text-gradient">MediRoute</span>
                </h1>
                <p style={{ color: 'var(--text-muted)' }}>How will you be using the platform?</p>
              </div>

              <div style={{ display: 'grid', gap: '1.25rem' }}>
                <div 
                  onClick={() => { setFormData({...formData, role: 'patient'}); setStep(2); }}
                  className="hover-card"
                  style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--neutral-400)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1.25rem' }}
                >
                  <div style={{ height: '48px', width: '48px', borderRadius: '0.75rem', background: 'rgba(30,136,229,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <User size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontWeight: 800 }}>I am a Patient</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>AI triage, records, and care coordination.</p>
                  </div>
                  <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--neutral-500)' }} />
                </div>

                <div 
                  onClick={() => { setFormData({...formData, role: 'hospital_staff'}); setStep(2); }}
                  className="hover-card"
                  style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--neutral-400)', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1.25rem' }}
                >
                  <div style={{ height: '48px', width: '48px', borderRadius: '0.75rem', background: 'rgba(102,187,106,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#43a047' }}>
                    <Stethoscope size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontWeight: 800 }}>Hospital Staff</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Dashboard and department management.</p>
                  </div>
                  <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--neutral-500)' }} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: BASIC INFO */}
          {step === 2 && (
            <div className="animate-in">
              <div style={{ marginBottom: '2rem' }}>
                <button onClick={() => setStep(1)} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem' }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Tell us about yourself</h1>
                <p style={{ color: 'var(--text-muted)' }}>This helps our AI provide personalized medical insights.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Full Name</label>
                  <input 
                    type="text" 
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    placeholder="Enter your name"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--neutral-400)' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Age</label>
                    <input 
                      type="number" 
                      value={formData.age}
                      onChange={(e) => setFormData({...formData, age: e.target.value})}
                      placeholder="e.g. 25"
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--neutral-400)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Gender</label>
                    <select 
                      value={formData.gender}
                      onChange={(e) => setFormData({...formData, gender: e.target.value})}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--neutral-400)', background: 'white' }}
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <button 
                  onClick={() => setStep(formData.role === 'hospital_staff' ? 4 : 3)}
                  disabled={!formData.full_name || !formData.age || !formData.gender}
                  className="btn-primary" 
                  style={{ marginTop: '1rem', width: '100%', padding: '0.875rem' }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: LOCATION (Patient Only) */}
          {step === 3 && (
            <div className="animate-in">
              <div style={{ marginBottom: '2rem' }}>
                <button onClick={() => setStep(2)} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem' }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Where are you located?</h1>
                <p style={{ color: 'var(--text-muted)' }}>We'll use this to find the nearest suitable clinics and hospitals.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Primary Area/City</label>
                  <select 
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    style={{ width: '100%', padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--neutral-400)', background: 'white', fontSize: '1rem' }}
                  >
                    <option value="">Choose your location</option>
                    {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>

                <div style={{ background: 'rgba(30,136,229,0.04)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(30,136,229,0.1)', display: 'flex', gap: '0.75rem' }}>
                  <MapPin size={20} style={{ color: 'var(--primary)', marginTop: '0.125rem' }} />
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Providing your location allows our AI to recommend medical facilities with shorter wait times.
                  </p>
                </div>

                <button 
                  onClick={nextStep}
                  disabled={loading || !formData.location}
                  className="btn-primary" 
                  style={{ marginTop: '1rem', width: '100%', padding: '1rem', fontWeight: 700 }}
                >
                  {loading ? <Loader2 className="animate-spin mr-2" /> : step === 3 && formData.role === 'hospital_staff' ? 'Continue to Hospital' : 'Continue to Verification'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PATIENT VERIFICATION (Patient Only) */}
          {step === 4 && formData.role === 'patient' && (
            <div className="animate-in">
              <div style={{ marginBottom: '2rem' }}>
                <button onClick={() => setStep(3)} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem' }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Medical Identity Verification</h1>
                <p style={{ color: 'var(--text-muted)' }}>MOH regulations require positive identification for clinical features.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>IC Number (MyKad / Passport)</label>
                  <input 
                    type="text" 
                    value={formData.ic_number}
                    onChange={(e) => setFormData({...formData, ic_number: e.target.value})}
                    placeholder="e.g. 980101-01-1234"
                    style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '1px solid var(--neutral-400)' }}
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Mobile Number</label>
                  <input 
                    type="tel" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="e.g. +60123456789"
                    style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '1px solid var(--neutral-400)' }}
                  />
                </div>

                <div style={{ background: 'rgba(102,187,106,0.05)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(102,187,106,0.2)', display: 'flex', gap: '0.75rem' }}>
                  <ShieldCheck size={20} style={{ color: '#43a047', marginTop: '0.125rem' }} />
                  <p style={{ fontSize: '0.875rem', color: '#2e7d32', lineHeight: 1.5 }}>
                    Your data is secured with end-to-end encryption.
                  </p>
                </div>

                <button 
                  onClick={handleComplete}
                  disabled={loading || !formData.ic_number || !formData.phone}
                  className="btn-primary" 
                  style={{ marginTop: '1rem', width: '100%', padding: '1rem', fontWeight: 700 }}
                >
                  {loading ? <Loader2 className="animate-spin mr-2" /> : 'Complete Setup'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: HOSPITAL SELECTION (Staff Only) */}
          {step === 4 && formData.role === 'hospital_staff' && (
            <div className="animate-in">
              <div style={{ marginBottom: '1.5rem' }}>
                <button onClick={() => setStep(formData.role === 'hospital_staff' ? 2 : 3)} style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '1rem' }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>Find your Facility</h1>
                <p style={{ color: 'var(--text-muted)' }}>Select your hospital to start managing your clinical flow.</p>
              </div>

              {!isCreatingHospital ? (
                <>
                  <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                      type="text"
                      placeholder="Search for a hospital or clinic..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ width: '100%', padding: '0.875rem 0.875rem 0.875rem 2.5rem', borderRadius: '0.75rem', border: '1px solid var(--neutral-400)', background: 'white', fontSize: '0.95rem' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', maxHeight: '320px', overflowY: 'auto', padding: '4px' }} className="custom-scrollbar">
                    {/* Search results */}
                    {(hospitals.filter(h => h.name.toLowerCase().includes(searchTerm.toLowerCase())) || []).map(h => (
                      <div 
                        key={h.id}
                        onClick={() => setSelectedHospitalId(h.id)}
                        className="hover-card"
                        style={{ 
                          padding: '1.25rem', 
                          borderRadius: '1rem', 
                          border: `2px solid ${selectedHospitalId === h.id ? 'var(--primary)' : 'var(--neutral-400)'}`,
                          background: selectedHospitalId === h.id ? 'rgba(30,136,229,0.04)' : 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: '0.75rem',
                          transition: 'all 0.2s ease',
                          transform: selectedHospitalId === h.id ? 'translateY(-2px)' : 'none',
                          boxShadow: selectedHospitalId === h.id ? '0 10px 20px rgba(30,136,229,0.08)' : 'none'
                        }}
                      >
                        <div style={{ height: '48px', width: '48px', borderRadius: '12px', background: selectedHospitalId === h.id ? 'var(--primary)' : 'rgba(30,136,229,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: selectedHospitalId === h.id ? 'white' : 'var(--primary)' }}>
                          <Building2 size={24} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>{h.name}</span>
                      </div>
                    ))}

                    {/* Create New Card */}
                    <div 
                      onClick={() => setIsCreatingHospital(true)}
                      className="hover-card"
                      style={{ 
                        padding: '1.25rem', 
                        borderRadius: '1rem', 
                        border: '2px dashed #66bb6a', 
                        background: 'rgba(102,187,106,0.02)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        gap: '0.75rem',
                        minHeight: '140px'
                      }}
                    >
                      <div style={{ height: '40px', width: '40px', borderRadius: '50%', background: 'rgba(102,187,106,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2e7d32' }}>
                        <Plus size={24} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#2e7d32' }}>Register New Facility</span>
                    </div>
                  </div>

                  <button 
                    onClick={handleComplete}
                    disabled={loading || !selectedHospitalId}
                    className="btn-primary" 
                    style={{ marginTop: '2rem', width: '100%', padding: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <>Finish Onboarding <ChevronRight size={18} /></>}
                  </button>
                </>
              ) : (
                <div className="animate-in">
                  <div style={{ background: 'rgba(102,187,106,0.05)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(102,187,106,0.2)', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ height: '40px', width: '40px', borderRadius: '10px', background: '#43a047', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={20} />
                      </div>
                      <h3 style={{ fontWeight: 800, color: '#2e7d32', margin: 0 }}>Create Workspace</h3>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: '#558b2f', marginBottom: '1.25rem' }}>
                      Registering a new facility will automatically designate you as the primary administrator.
                    </p>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#2e7d32', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Facility Name</label>
                      <input 
                        type="text" 
                        autoFocus
                        value={newHospitalName}
                        onChange={(e) => setNewHospitalName(e.target.value)}
                        placeholder="e.g. CareFlow Medical Center"
                        style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '2px solid #a5d6a7', background: 'white', fontSize: '1rem' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#2e7d32', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Location / Address</label>
                      <input 
                        type="text" 
                        value={newHospitalAddress}
                        onChange={(e) => setNewHospitalAddress(e.target.value)}
                        placeholder="Full address of the facility"
                        style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '2px solid #a5d6a7', background: 'white', fontSize: '1rem' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, color: '#2e7d32', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Contact Number</label>
                      <input 
                        type="tel" 
                        value={newHospitalContact}
                        onChange={(e) => setNewHospitalContact(e.target.value)}
                        placeholder="e.g. +603-1234-5678"
                        style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: '2px solid #a5d6a7', background: 'white', fontSize: '1rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      onClick={() => setIsCreatingHospital(false)}
                      style={{ flex: 1, padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Back to list
                    </button>
                    <button 
                      onClick={handleComplete}
                      disabled={loading || !newHospitalName || !newHospitalAddress || !newHospitalContact}
                      className="btn-primary" 
                      style={{ flex: 2, padding: '1rem', fontWeight: 700, background: '#43a047', borderColor: '#43a047' }}
                    >
                      {loading ? <Loader2 className="animate-spin" /> : 'Register & Join'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
