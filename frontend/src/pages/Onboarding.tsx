import React, { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, ShieldCheck, Stethoscope, ChevronRight, ChevronLeft, MapPin, Loader2 } from 'lucide-react';

export default function Onboarding() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Form State
  const [formData, setFormData] = useState({
    role: '' as 'patient' | 'hospital_staff',
    full_name: user?.fullName || '',
    age: '',
    gender: '',
    location: ''
  });

  const locations = [
    "Kuala Lumpur",
    "Selangor - Petaling Jaya",
    "Selangor - Shah Alam",
    "Selangor - Subang Jaya",
    "Selangor - Klang",
    "Selangor - Puchong",
    "Selangor - Cyberjaya/Putrajaya",
    "Selangor - Kajang",
    "Penang - George Town",
    "Penang - Bayan Lepas",
    "Penang - Seberang Perai",
    "Johor - Johor Bahru",
    "Johor - Muar",
    "Johor - Batu Pahat",
    "Perak - Ipoh",
    "Perak - Taiping",
    "Melaka - Melaka City",
    "Negeri Sembilan - Seremban",
    "Kedah - Alor Setar",
    "Kedah - Sungai Petani",
    "Pahang - Kuantan",
    "Terengganu - Kuala Terengganu",
    "Kelantan - Kota Bharu",
    "Sabah - Kota Kinabalu",
    "Sabah - Sandakan",
    "Sarawak - Kuching",
    "Sarawak - Miri",
    "Perlis - Kangar",
    "Labuan"
  ];

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: formData.full_name || user.fullName || user.username || 'Anonymous',
          role: formData.role,
          location: formData.location,
          age: parseInt(formData.age) || null,
          gender: formData.gender,
          avatar_url: user.imageUrl,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      window.location.href = '/';
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: 'var(--bg-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ maxWidth: '600px', width: '100%', padding: 'var(--container-gap)', position: 'relative', overflow: 'hidden' }}>
        
        {/* Progress Bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', background: 'var(--primary)', width: `${(step / 3) * 100}%`, transition: 'width 0.4s ease' }}></div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          
          {/* STEP 1: ROLE IDENTITY */}
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
                  onClick={() => setStep(3)}
                  disabled={!formData.full_name || !formData.age || !formData.gender}
                  className="btn-primary" 
                  style={{ marginTop: '1rem', width: '100%', padding: '0.875rem' }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: LOCATION */}
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
                    Providing your location allows our AI to recommend medical facilities with shorter wait times and the specific specialties you need.
                  </p>
                </div>

                <button 
                  onClick={handleComplete}
                  disabled={loading || !formData.location}
                  className="btn-primary" 
                  style={{ marginTop: '1rem', width: '100%', padding: '1rem', fontWeight: 700 }}
                >
                  {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                  Complete Setup
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
