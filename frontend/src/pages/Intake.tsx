import LayoutSidebar from '../components/LayoutSidebar';
import { Link } from 'react-router-dom';
import { ShieldAlert, HeartPulse, MapPin, CheckCircle2, ChevronRight, ChevronLeft, ArrowLeft, ArrowRight, Mic, Upload, Type } from 'lucide-react';

export default function Intake() {
  return (
    <LayoutSidebar>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', minHeight: '100%' }}>

        <div style={{ alignSelf: 'flex-end', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', background: 'var(--neutral-300)', borderRadius: '9999px', padding: '0.25rem', border: '1px solid var(--neutral-400)' }}>
            <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontWeight: 600 }}>EN</button>
            <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', color: 'var(--text-muted)' }}>BM</button>
            <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Code-switch: Auto</button>
          </div>
        </div>

        {/* Multi-modal Patient Intake Panel */}
        <div className="card" style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', padding: '2rem', marginBottom: '2rem', background: '#ffffff', border: '1px solid var(--neutral-400)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Multi-Modal Patient Intake</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="btn-primary flex items-center justify-center gap-2" style={{ flex: 1, padding: '1rem', background: 'var(--neutral-200)', color: 'var(--secondary)', border: '1px dashed var(--secondary)' }}><Mic size={20} /> Voice Recording / Dictation</button>
            <button className="btn-primary flex items-center justify-center gap-2" style={{ flex: 1, padding: '1rem', background: 'var(--neutral-200)', color: 'var(--secondary)', border: '1px dashed var(--secondary)' }}><Upload size={20} /> Clinical Doc Upload</button>
            <button className="btn-primary flex items-center justify-center gap-2" style={{ flex: 1, padding: '1rem', background: 'var(--neutral-200)', color: 'var(--secondary)', border: '1px dashed var(--secondary)' }}><Type size={20} /> Manual Text Entry</button>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: '800px', marginBottom: '4rem', padding: '0 2rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', top: '12px', left: '0', right: '-100%', height: '2px', background: 'var(--secondary)', zIndex: 0 }}></div>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--secondary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}><CheckCircle2 size={16} /></div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--secondary)', textTransform: 'uppercase' }}>Patient Info</div>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', top: '12px', left: '0', right: '-100%', height: '2px', background: 'var(--secondary)', zIndex: 0 }}></div>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--secondary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}><CheckCircle2 size={16} /></div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--secondary)', textTransform: 'uppercase' }}>Symptoms</div>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', top: '12px', left: '0', right: '0', height: '2px', background: 'var(--neutral-400)', zIndex: 0 }}></div>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ padding: '0.5rem 1rem', borderRadius: '9999px', background: 'var(--secondary)', color: 'white', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem', transform: 'translateY(-6px)' }}>Triage & Schedule</div>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--neutral-300)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>4</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Confirm</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="card" style={{ width: '100%', maxWidth: '1000px', display: 'flex', flexDirection: 'column', padding: '3rem' }}>
          
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>LLM Triage Complete</h1>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)', marginBottom: '3rem', maxWidth: '650px', lineHeight: 1.6 }}>
            Based on multi-modal symptom intake, the LLM Triage Engine has handled conversational ambiguities, assigned a dynamic urgency score, and determined the optimal care pathway.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '2rem', width: '100%' }}>
            
            {/* Triage Summary */}
            <div style={{ background: 'var(--neutral-200)', borderRadius: '1rem', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>ASSESSMENT</div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>AI Triage<br/>Summary</h2>
                </div>
                <div style={{ background: 'linear-gradient(90deg, #A2C9FF, #759EFD)', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 700 }}>
                  <ShieldAlert size={16} /> Moderate Urgency
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Primary Indicators</div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', lineHeight: 1.5 }}>Persistent localized pain, elevated temperature reported over 48 hours.</div>
              </div>

              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recommended Specialty</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-fixed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <HeartPulse size={16} color="var(--primary)" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>General Internal Medicine</div>
                </div>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={16} color="var(--primary)" /> Analysis verified by Clinical Rules Engine v2.4
              </div>
            </div>

            {/* Optimal Location */}
            <div style={{ background: 'var(--neutral-100)', borderRadius: '1rem', padding: '2rem', border: '1px solid var(--neutral-400)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>OPTIMAL LOCATION</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem' }}>MediRoute Central Hospital</h2>
              
              {/* Map Placeholder */}
              <div style={{ width: '100%', height: '200px', background: 'var(--tertiary)', borderRadius: '16px', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                {/* Simulated Map Visual */}
                <div style={{ position: 'absolute', inset: 0, opacity: 0.2, backgroundImage: 'radial-gradient(circle at center, white 2px, transparent 2px)', backgroundSize: '20px 20px' }}></div>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '120px', height: '120px', background: '#d32f2f', borderRadius: '50% 50% 50% 0', transformOrigin: 'center center', rotate: '-45deg' }}></div>
                <div style={{ position: 'absolute', top: '48%', left: '50%', transform: 'translate(-50%, -50%)', width: '40px', height: '40px', background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <HeartPulse size={20} color="#d32f2f" />
                </div>
                
                <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'white', padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  <MapPin size={16} /> 15 mins away
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Address</div>
                  <div style={{ fontWeight: 500 }}>124 Healthcare Avenue,<br/>Medical District, KL 50400</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Facility Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ACC1' }}></div> Accepting Walk-ins
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Select Appointment Time */}
          <div style={{ background: 'var(--neutral-100)', borderRadius: '1rem', padding: '2rem', border: '1px solid var(--neutral-400)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Select Appointment Time</h2>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Showing available slots for Internal Medicine</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neutral-300)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={16} /></button>
                <div style={{ fontWeight: 700 }}>October 2024</div>
                <button style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neutral-300)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={16} /></button>
              </div>
            </div>

            {/* Calendar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
              {[14, 15, 16, 17, 18, 19, 20].map((day, i) => {
                const isSelected = day === 17;
                const isPast = day < 16;
                const hasSlots = day >= 16;
                const labels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
                return (
                  <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>{labels[i]}</div>
                    <div style={{ 
                      width: '64px', height: '64px', borderRadius: '50%', 
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? 'var(--secondary)' : (isPast ? 'transparent' : 'var(--neutral-300)'),
                      color: isSelected ? 'white' : (isPast ? 'var(--neutral-400)' : 'var(--text-main)'),
                      fontWeight: 700, fontSize: '1.25rem',
                      boxShadow: isSelected ? '0 10px 20px rgba(13, 71, 161, 0.3)' : 'none',
                      cursor: isPast ? 'not-allowed' : 'pointer'
                    }}>
                      {day}
                      {hasSlots && !isSelected && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--tertiary)', marginTop: '4px' }}></div>}
                      {isSelected && <div style={{ fontSize: '0.5rem', fontWeight: 600, letterSpacing: '1px', marginTop: '2px', opacity: 0.8 }}>SELECTED</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Slots */}
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Available Slots for Oct 17</div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {['09:00 AM', '10:30 AM', '01:15 PM', '03:00 PM', '04:30 PM'].map(time => (
                  <button key={time} style={{ 
                    padding: '0.5rem 1.25rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600,
                    background: time === '01:15 PM' ? 'var(--primary)' : 'var(--neutral-300)',
                    color: time === '01:15 PM' ? 'white' : 'var(--text-main)'
                  }}>
                    {time}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div style={{ width: '100%', maxWidth: '1000px', display: 'flex', justifyContent: 'space-between', marginTop: '3rem' }}>
          <Link to="/landing" className="btn-secondary flex items-center gap-2" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Back to Symptoms
          </Link>
          <Link to="/" className="btn-primary flex items-center gap-2" style={{ textDecoration: 'none' }}>
            Confirm & Proceed <ArrowRight size={16} />
          </Link>
        </div>

      </div>
    </LayoutSidebar>
  );
}
