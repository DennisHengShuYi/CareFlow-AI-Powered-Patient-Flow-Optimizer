import { useState, useEffect } from 'react';
import LayoutSidebar from '../components/LayoutSidebar';
import { Filter, Mic, CircleDot } from 'lucide-react';

export default function LiveTriage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/triage/overview')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <LayoutSidebar>
        <div style={{ padding: '2rem 3rem', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>Loading live stream...</div>
        </div>
      </LayoutSidebar>
    );
  }

  if (!data) return null;

  return (
    <LayoutSidebar>
      <div style={{ padding: '2rem 3rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header Section */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>Active Duty</h1>
            <p style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Live Clinical Overview</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
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
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Avg Wait</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{data.avg_wait}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
          
          {/* Left Col - Live Triage */}
          <div className="card" style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.5rem' }}>Clinic Analytics & Queue</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Capacity: 84% utilized</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No-shows: 2.1% trend</span>
                <button style={{ color: 'var(--secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  Filter <Filter size={16} />
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', paddingBottom: '1rem', borderBottom: '1px solid var(--neutral-400)', marginBottom: '1rem' }}>
              <div>Time/Urgency</div>
              <div>Patient</div>
              <div>Chief Complaint</div>
              <div style={{ textAlign: 'right' }}>Status</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {data.patients.map((patient: any, idx: number) => {
                const isCritical = patient.level === 1;
                return (
                  <div key={idx} style={{ background: isCritical ? '#fffcfc' : 'var(--neutral-200)', borderRadius: '12px', padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem' }}>{patient.time}</div>
                      <div style={{ color: isCritical ? '#ba1a1a' : (patient.level === 2 ? 'var(--secondary)' : 'var(--primary)'), fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {isCritical && <span>!</span>} LEVEL {patient.level}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>{patient.initials}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{patient.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{patient.details}</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 500 }}>{patient.complaint}</div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ 
                        background: patient.status_color === 'danger' ? '#ffdad6' : 'var(--neutral-400)', 
                        color: patient.status_color === 'danger' ? '#ba1a1a' : 'var(--text-muted)', 
                        padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 
                      }}>{patient.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Col */}
          <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Active Encounter */}
            <div style={{ background: 'linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)', borderRadius: '1rem', padding: '1.5rem', color: 'white', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', background: 'rgba(255,255,255,0.2)', padding: '0.25rem 0.75rem', borderRadius: '9999px' }}>ACTIVE ENCOUNTER</span>
                <button style={{ color: 'white' }}>...</button>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'white', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', fontWeight: 700 }}>
                  {data.active_encounter.initials}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.5rem', color: 'white' }}>{data.active_encounter.name}</h3>
                  <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>{data.active_encounter.details}</div>
                </div>
              </div>
            </div>

            {/* SOAP Note Generation */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                  <Mic size={20} color="var(--primary)" /> SOAP Note Generation
                </div>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CircleDot size={16} color="#ba1a1a" />
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ background: 'var(--neutral-300)', padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', border: '1px solid var(--neutral-400)' }}>
                  {data.ai_scribe.status}
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>SUBJECTIVE</div>
                  <div style={{ background: 'var(--neutral-200)', padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', lineHeight: '1.5' }}>
                    {data.ai_scribe.subjective}
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>OBJECTIVE (IMPORTED VITALS)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ background: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>BP</span>
                      <strong style={{ fontSize: '1rem' }}>{data.ai_scribe.vitals.bp}</strong>
                    </div>
                    <div style={{ background: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>HR</span>
                      <strong style={{ fontSize: '1rem', color: '#ba1a1a' }}>{data.ai_scribe.vitals.hr}</strong>
                    </div>
                    <div style={{ background: 'var(--neutral-200)', padding: '0.75rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>O2</span>
                      <strong style={{ fontSize: '1rem' }}>{data.ai_scribe.vitals.o2}</strong>
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>ASSESSMENT & PLAN</div>
                  <div style={{ background: 'var(--neutral-200)', padding: '1rem', borderRadius: '12px', fontSize: '0.875rem', lineHeight: '1.5', opacity: 0.7 }}>
                    Waiting for clinician finalized note to draft Assessment/Plan.
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--neutral-400)' }}>
                <button className="btn-secondary" style={{ flex: 1, background: 'var(--neutral-100)', border: '1px solid var(--neutral-400)' }}>Care Continuity Loop</button>
                <button className="btn-primary" style={{ flex: 1 }}>Sign & Commit</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </LayoutSidebar>
  );
}
