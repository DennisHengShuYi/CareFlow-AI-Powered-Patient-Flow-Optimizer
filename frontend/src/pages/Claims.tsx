import { useLocation } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import { FileUp, FileText, BriefcaseMedical, ReceiptText, Bot, CheckCircle2, Circle, Lock, Plus, Pencil } from 'lucide-react';
import { useState } from 'react';

export default function Claims() {
  const location = useLocation();
  const { 
    patientName = 'Unknown Patient', 
    diagnosis = 'Medical_Diagnosis.pdf', 
    insurers = ['Patient_Policy.pdf'], 
    billUrl, 
    billPrice 
  } = location.state || {};

  const [documents, setDocuments] = useState([
    { id: 1, name: diagnosis.endsWith('.pdf') ? diagnosis : 'Medical_Diagnosis.pdf', content: diagnosis, type: 'diagnosis', icon: <FileText color="var(--secondary)" size={20} /> },
    { id: 2, name: 'Patient_Policy.pdf', content: insurers.join(', '), type: 'policy', icon: <BriefcaseMedical color="var(--secondary)" size={20} /> },
    { id: 3, name: 'Medical_Bill.pdf', content: billUrl ? `RM ${billPrice}` : 'Awaiting Integration', type: 'bill', url: billUrl, icon: <ReceiptText color={billUrl ? "var(--secondary)" : "var(--text-muted)"} size={20} /> }
  ]);

  return (
    <LayoutSidebar>
      <div className="responsive-padding responsive-grid" style={{ height: '100%', overflowY: 'auto' }}>
        
        {/* Left Column - Document Inputs */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-h2)' }}>Document Inputs</h2>
              <div style={{ fontSize: '0.875rem', color: 'var(--primary)', fontWeight: 600 }}>{patientName}</div>
            </div>
            <FileUp size={20} color="var(--primary)" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{ background: 'var(--neutral-300)', padding: '1.25rem', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid var(--neutral-400)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {doc.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{doc.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                    {doc.content}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} title="Edit">
                    <Pencil size={16} color="var(--text-muted)" />
                  </button>
                  {doc.type === 'bill' && doc.url ? (
                    <CheckCircle2 color="#2e7d32" size={20} onClick={() => window.open(doc.url, '_blank')} style={{ cursor: 'pointer' }} />
                  ) : (
                    <CheckCircle2 color="#2e7d32" size={20} />
                  )}
                </div>
              </div>
            ))}

            <button style={{ background: 'white', border: '1px solid var(--neutral-400)', padding: '1.25rem', borderRadius: '9999px', color: 'var(--secondary)', fontWeight: 600, marginTop: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={20} /> Add Document
            </button>
          </div>
        </div>

        {/* Middle Column - AI Orchestrator */}
        <div style={{ background: 'var(--bg-gradient)', borderRadius: '1rem', padding: 'var(--container-gap)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            <Bot size={32} color="var(--secondary)" />
          </div>
          <h2 style={{ fontSize: 'var(--font-h2)', fontWeight: 800, marginBottom: '0.5rem' }}>AI Orchestrator</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.875rem' }}>Analyzing claim variables</p>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '11px', top: '24px', bottom: '24px', width: '2px', background: 'var(--neutral-400)', zIndex: 0 }}></div>
            
            <div style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '24px', height: '24px', minWidth: '24px', borderRadius: '50%', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 color="white" size={14} />
              </div>
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.9rem' }}>Auto Claim Generation</h4>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ICD-10 codes mapped</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '24px', height: '24px', minWidth: '24px', borderRadius: '50%', background: 'white', border: '3px solid var(--secondary)' }}></div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontWeight: 700, color: 'var(--secondary)', fontSize: '0.9rem' }}>Validation Engine</h4>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Querying insurer database</div>
                
                <div style={{ background: 'white', borderRadius: '12px', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {'> Checking coverage limits...'}<br/>
                  {'> Matching Diagnosis to Policy...'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '24px', height: '24px', minWidth: '24px', borderRadius: '50%', background: 'var(--neutral-400)' }}></div>
              <div style={{ opacity: 0.5 }}>
                <h4 style={{ fontWeight: 700, fontSize: '0.9rem' }}>GL Pre-auth</h4>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Awaiting policy clearance</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Claim Output */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: 'var(--font-h2)' }}>Claim Output</h2>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1px', background: '#e0f2f1', color: '#00695c', padding: '0.25rem 0.5rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Circle fill="currentColor" size={8} /> PROCESSING
            </span>
          </div>

          <div style={{ background: 'var(--neutral-300)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)' }}>CONFIDENCE SCORE</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>94%</div>
            </div>
            <div style={{ height: '4px', background: 'rgba(0,0,0,0.05)', borderRadius: '2px', marginBottom: '0.75rem' }}>
              <div style={{ height: '100%', width: '94%', background: 'var(--secondary)', borderRadius: '2px' }}></div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>High probability of automatic approval.</div>
          </div>

          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>GL Preview</h3>
          <div style={{ flex: 1, minHeight: '120px', background: 'var(--neutral-300)', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            <Lock size={24} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
            <div style={{ fontSize: '0.75rem', textAlign: 'center', padding: '0 1rem' }}>Preview will unlock after validation.</div>
          </div>

          <button className="btn-primary" style={{ width: '100%', opacity: 0.5, cursor: 'not-allowed', marginBottom: '0.75rem', fontSize: '0.875rem' }}>Approve & Initiate GL</button>
          <button className="btn-secondary" style={{ width: '100%', background: 'var(--neutral-200)', fontSize: '0.875rem' }}>Draft Referral Letter</button>
        </div>

      </div>
    </LayoutSidebar>
  );
}
