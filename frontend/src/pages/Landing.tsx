import LayoutSidebar from '../components/LayoutSidebar';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Activity, FileText, CheckCircle2, FlaskConical, Stethoscope, FilePlus2, ChevronRight, Play } from 'lucide-react';

export default function Landing() {
  return (
    <LayoutSidebar>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        
        {/* Hero Section */}
        <section style={{ display: 'flex', flexWrap: 'wrap', padding: '6rem 4rem', gap: '4rem', alignItems: 'center', backgroundColor: 'var(--neutral-100)' }}>
          <div style={{ flex: '1 1 400px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '1.5rem' }}>Editorial Precision in Healthcare</div>
            <h1 style={{ fontSize: '4.5rem', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '1.5rem' }}>
              Intelligence<br/>
              <span style={{ color: 'var(--primary)' }}>Reimagined.</span>
            </h1>
            <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: '2.5rem', maxWidth: '500px', lineHeight: 1.6 }}>
              MediRoute translates complex clinical data into actionable patient pathways. Experience the sanctuary of clarity in every decision.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/intake" className="btn-primary" style={{ padding: '1rem 2rem', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Request Clinical Demo</Link>
              <Link to="/claims" className="btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Explore Analytics</Link>
            </div>
          </div>

          <div style={{ flex: '1 1 400px', display: 'flex', justifyContent: 'center' }}>
            <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ background: 'var(--neutral-300)', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck color="var(--primary)" />
                  </div>
                  <div>
                    <h3 style={{ fontWeight: 700 }}>MediRoute AI Core</h3>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Active Analysis Mode</div>
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.75rem', background: 'var(--neutral-300)', color: 'var(--text-muted)', borderRadius: '9999px' }}>SECURE</span>
              </div>

              <div style={{ background: 'var(--neutral-200)', padding: '1rem 1.5rem', borderRadius: '12px', fontSize: '0.875rem', color: 'var(--text-muted)', alignSelf: 'flex-start', maxWidth: '85%' }}>
                Analyze recent lab results for Patient ID: MR-8492. Flag elevated markers.
              </div>

              <div style={{ background: 'var(--neutral-100)', border: '1px solid var(--neutral-400)', padding: '1rem 1.5rem', borderRadius: '12px', fontSize: '0.875rem', alignSelf: 'flex-end', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                Analysis complete. I've detected an anomaly in the recent panel.
                
                <div style={{ marginTop: '1rem', background: 'var(--neutral-200)', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <div style={{ color: '#ba1a1a' }}>!</div>
                    <div>
                      <div style={{ fontWeight: 700 }}>Hemoglobin A1C</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current: 7.2% (Elevated)</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--neutral-300)', padding: '0.5rem', borderRadius: '12px' }}>
                <input type="text" placeholder="Query clinical database..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '0.5rem', fontSize: '0.875rem' }} />
                <button style={{ width: '32px', height: '32px', background: 'var(--secondary)', color: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pathway Section */}
        <section style={{ backgroundColor: 'var(--neutral-300)', padding: '6rem 4rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>The Intelligent Pathway</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '4rem', maxWidth: '600px', margin: '0 auto 4rem' }}>
            A seamless, automated journey from symptom entry to claim resolution, powered by clinical AI.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
            {[
              { icon: FileText, title: 'Symptom Entry', desc: 'Natural language intake via secure portal.', active: false },
              { icon: Activity, title: 'AI Triage', desc: 'Real-time acuity assessment and routing.', active: false },
              { icon: Stethoscope, title: 'Clinical Review', desc: 'Provider validates AI-generated insights.', active: true },
              { icon: FlaskConical, title: 'Treatment Plan', desc: 'Automated prescription & order routing.', active: false },
              { icon: FilePlus2, title: 'Claim Gen', desc: 'Instant coding and insurance submission.', active: false }
            ].map((step, i) => (
              <div key={i} style={{ width: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: step.active ? 'var(--secondary)' : 'var(--neutral-100)', color: step.active ? 'white' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: step.active ? '0 10px 20px rgba(13, 71, 161, 0.2)' : '0 4px 10px rgba(0,0,0,0.05)', transition: 'all 0.3s' }}>
                  <step.icon size={28} />
                </div>
                <h4 style={{ fontWeight: 700, color: step.active ? 'var(--secondary)' : 'var(--text-main)' }}>{step.title}</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Metrics Section */}
        <section style={{ padding: '6rem 4rem', backgroundColor: 'var(--neutral-100)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
            <div>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Numbers that Matter</h2>
              <p style={{ color: 'var(--text-muted)' }}>Quantifiable improvements in clinical operations.</p>
            </div>
            <Link to="#" style={{ color: 'var(--secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>View Full Report <ChevronRight size={16} /></Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            <div className="card" style={{ padding: '3rem 2rem', background: 'var(--neutral-200)', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2rem' }}>
                <CheckCircle2 size={18} color="var(--primary)" /> ACCURACY
              </div>
              <div style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1, marginBottom: '1rem' }}>99.8<span style={{ fontSize: '2rem', color: 'var(--primary)' }}>%</span></div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Diagnostic coding precision vs traditional manual entry.</p>
            </div>
            <div className="card" style={{ padding: '3rem 2rem', background: 'linear-gradient(135deg, var(--secondary), var(--primary))', color: 'white', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2rem', opacity: 0.9 }}>
                <Zap size={18} /> LATENCY REDUCTION
              </div>
              <div style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1, marginBottom: '1rem' }}>4.2<span style={{ fontSize: '2rem' }}>m</span></div>
              <p style={{ fontSize: '0.875rem', opacity: 0.9 }}>Average time saved per patient encounter documentation.</p>
            </div>
            <div className="card" style={{ padding: '3rem 2rem', background: 'var(--neutral-100)', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2rem' }}>
                <Activity size={18} color="var(--primary)" /> THROUGHPUT
              </div>
              <div style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1, marginBottom: '1rem' }}>+34<span style={{ fontSize: '2rem', color: 'var(--primary)' }}>%</span></div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Increase in daily patient flow capacity for mid-size clinics.</p>
            </div>
          </div>
        </section>

      </div>
    </LayoutSidebar>
  );
}
