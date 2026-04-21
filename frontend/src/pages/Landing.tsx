import LayoutSidebar from '../components/LayoutSidebar';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Activity, FileText, CheckCircle2, FlaskConical, Stethoscope, FilePlus2, ChevronRight, Play } from 'lucide-react';

export default function Landing() {
  return (
    <LayoutSidebar>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        
        {/* Hero Section */}
        <section className="responsive-padding" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--container-gap)', alignItems: 'center', backgroundColor: 'var(--neutral-100)', minHeight: '60vh' }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '1rem' }}>Editorial Precision in Healthcare</div>
            <h1 style={{ fontSize: 'calc(var(--font-h1) * 1.5)', lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '1.5rem' }}>
              Intelligence<br/>
              <span style={{ color: 'var(--primary)' }}>Reimagined.</span>
            </h1>
            <p style={{ fontSize: '1.125rem', color: 'var(--text-muted)', marginBottom: '2.5rem', maxWidth: '500px', lineHeight: 1.6 }}>
              MediRoute translates complex clinical data into actionable patient pathways. Experience clarity in every decision.
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link to="/intake" className="btn-primary" style={{ padding: '0.875rem 1.5rem', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Clinical Demo</Link>
              <Link to="/claims" className="btn-secondary" style={{ padding: '0.875rem 1.5rem', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Explore Analytics</Link>
            </div>
          </div>

          <div style={{ flex: '1 1 320px', display: 'flex', justifyContent: 'center' }}>
            <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ background: 'var(--neutral-300)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck color="var(--primary)" size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontWeight: 700, fontSize: '0.9rem' }}>AI Core</h3>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active Status</div>
                  </div>
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem', background: 'var(--neutral-300)', color: 'var(--text-muted)', borderRadius: '9999px' }}>SECURE</span>
              </div>

              <div style={{ background: 'var(--neutral-200)', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'flex-start', maxWidth: '85%' }}>
                Analyze lab results for Patient ID: MR-8492.
              </div>

              <div style={{ background: 'var(--neutral-100)', border: '1px solid var(--neutral-400)', padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.8rem', alignSelf: 'flex-end', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                Analysis complete. Hemoglobin A1C: 7.2% (Elevated).
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--neutral-300)', padding: '0.4rem', borderRadius: '10px' }}>
                <input type="text" placeholder="Query database..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '0.4rem', fontSize: '0.75rem' }} />
                <button style={{ width: '28px', height: '28px', background: 'var(--secondary)', color: 'white', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={12} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pathway Section */}
        <section className="responsive-padding" style={{ backgroundColor: 'var(--neutral-300)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '1rem' }}>The Intelligent Pathway</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', maxWidth: '600px', margin: '0 auto 3rem', fontSize: '0.9rem' }}>
            A seamless journey from symptom entry to resolution.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { icon: FileText, title: 'Intake', desc: 'Secure symptom portal.', active: false },
              { icon: Activity, title: 'Triage', desc: 'Real-time assessment.', active: false },
              { icon: Stethoscope, title: 'Review', desc: 'Clinical validation.', active: true },
              { icon: FlaskConical, title: 'Treatment', desc: 'Auto RX routing.', active: false },
              { icon: FilePlus2, title: 'Claims', desc: 'Instant GL coding.', active: false }
            ].map((step, i) => (
              <div key={i} style={{ width: '150px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: step.active ? 'var(--secondary)' : 'var(--neutral-100)', color: step.active ? 'white' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: step.active ? '0 10px 20px rgba(13, 71, 161, 0.2)' : '0 4px 10px rgba(0,0,0,0.05)' }}>
                  <step.icon size={24} />
                </div>
                <h4 style={{ fontWeight: 700, fontSize: '0.9rem' }}>{step.title}</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Metrics Section */}
        <section className="responsive-padding" style={{ backgroundColor: 'var(--neutral-100)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '0.25rem' }}>Performance Metrics</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Quantifiable improvements in operations.</p>
            </div>
            <Link to="#" style={{ color: 'var(--secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>Details <ChevronRight size={16} /></Link>
          </div>

          <div className="responsive-grid">
            <div className="card" style={{ padding: '2rem 1.5rem', background: 'var(--neutral-200)', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
                <CheckCircle2 size={16} color="var(--primary)" /> ACCURACY
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1, marginBottom: '0.5rem' }}>99.8<span style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>%</span></div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Diagnostic coding precision.</p>
            </div>
            <div className="card" style={{ padding: '2rem 1.5rem', background: 'linear-gradient(135deg, var(--secondary), var(--primary))', color: 'white', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1.5rem', opacity: 0.9 }}>
                <Zap size={16} /> REDUCTION
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1, marginBottom: '0.5rem' }}>4.2<span style={{ fontSize: '1.5rem' }}>m</span></div>
              <p style={{ fontSize: '0.8rem', opacity: 0.9 }}>Time saved per documentation.</p>
            </div>
            <div className="card" style={{ padding: '2rem 1.5rem', background: 'var(--neutral-100)', border: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
                <Activity size={16} color="var(--primary)" /> THROUGHPUT
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1, marginBottom: '0.5rem' }}>+34<span style={{ fontSize: '1.5rem', color: 'var(--primary)' }}>%</span></div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Daily patient flow capacity.</p>
            </div>
          </div>
        </section>

      </div>
    </LayoutSidebar>
  );
}
