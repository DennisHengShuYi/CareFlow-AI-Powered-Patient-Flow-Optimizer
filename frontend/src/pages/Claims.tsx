import { useLocation } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import {
  FileUp, FileText, BriefcaseMedical, ReceiptText, Bot,
  CheckCircle2, Circle, Lock, Plus, ExternalLink,
  UploadCloud, X, Loader2, Pencil, ShieldCheck
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const API = 'http://127.0.0.1:8002';

interface SupportingDoc {
  id: number;
  label: string;
  filename: string;
  url: string;
}

export default function Claims() {
  const location = useLocation();
  const {
    patientName = 'Unknown Patient',
    patientId,
    caseId,
    diagnosis = 'Pending Diagnosis',
    insurers = [],
    policyUrl: initialPolicyUrl,
    billUrl: initialBillUrl,
    billPrice,
    diagnosisPdfUrl: initialDiagnosisPdfUrl,
    confidenceScore: initialConfidenceScore = 0,
    aiReasoning: initialAiReasoning = null,
    generatedDocUrl: initialGeneratedDocUrl = null,
    claimType: initialClaimType = 'GL',
    workflowStatus: initialWorkflowStatus = null,
  } = location.state || {};

  // ── Document state ──────────────────────────────────────────
  const [policyUrl, setPolicyUrl] = useState<string | undefined>(initialPolicyUrl);
  const [billUrl, setBillUrl]     = useState<string | undefined>(initialBillUrl);
  const [diagnosisPdfUrl, setDiagnosisPdfUrl] = useState<string | undefined>(initialDiagnosisPdfUrl);
  const [diagnosisText, setDiagnosisText]     = useState<string>(diagnosis);
  const [confidenceScore, setConfidenceScore] = useState<number>(initialConfidenceScore);
  const [aiReasoning, setAiReasoning]         = useState<string | null>(initialAiReasoning);
  const [generatedDocUrl, setGeneratedDocUrl] = useState<string | null>(initialGeneratedDocUrl);
  const [workflowStatus, setWorkflowStatus]   = useState<string | null>(initialWorkflowStatus);
  const [supportingDocs, setSupportingDocs]   = useState<SupportingDoc[]>([]);
  const [orchestrationProgress, setOrchestrationProgress] = useState(0);

  // ── Persistence: Fetch latest docs on mount ────────────────
  useEffect(() => {
    async function fetchCaseData() {
      if (!caseId) return;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API}/api/cases/${caseId}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.supporting_docs) {
            setSupportingDocs(data.supporting_docs);
          }
          // Also sync other states if needed
          if (data.generated_doc_url) setGeneratedDocUrl(data.generated_doc_url);
          if (data.diagnosis_pdf_url) setDiagnosisPdfUrl(data.diagnosis_pdf_url);
        }
      } catch (err) {
        console.error('Failed to fetch case data:', err);
      }
    }
    fetchCaseData();
  }, [caseId]);

  // ── Modal state ─────────────────────────────────────────────
  const [modal, setModal] = useState<'policy' | 'bill' | 'support' | 'diagnosis' | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Policy replace
  const [policyFile, setPolicyFile] = useState<File | null>(null);

  // Bill replace
  const [billFile, setBillFile]     = useState<File | null>(null);
  const [billAmount, setBillAmount] = useState(billPrice ? String(billPrice) : '');

  // Supporting doc
  const [docLabel, setDocLabel]   = useState('');
  const [docFile, setDocFile]     = useState<File | null>(null);

  const policyInputRef  = useRef<HTMLInputElement>(null);
  const billInputRef    = useRef<HTMLInputElement>(null);
  const supportInputRef = useRef<HTMLInputElement>(null);

  function closeModal() {
    setModal(null);
    setPolicyFile(null);
    setBillFile(null);
    setDocLabel('');
    setDocFile(null);
    setUploadError(null);
  }

  // ── Upload handlers ─────────────────────────────────────────

  async function handleReplacePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!policyFile || !patientId) return;
    setUploading(true); setUploadError(null);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', policyFile);
      const res = await fetch(`${API}/api/patients/${patientId}/policy`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
      const data = await res.json();
      setPolicyUrl(data.policy_url);
      closeModal();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleReplaceBill(e: React.FormEvent) {
    e.preventDefault();
    if (!billFile || !caseId || !billAmount) return;
    setUploading(true); setUploadError(null);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', billFile);
      fd.append('total_bill', billAmount);
      const res = await fetch(`${API}/api/cases/${caseId}/bill`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
      const data = await res.json();
      setBillUrl(data.file_url);
      closeModal();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAddSupportingDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile || !caseId) return;
    setUploading(true); setUploadError(null);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('label', docLabel || docFile.name);
      const res = await fetch(`${API}/api/cases/${caseId}/supporting-doc`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
      const data = await res.json();
      // Data returns the new doc object
      if (data.doc) {
        setSupportingDocs(prev => [...prev, data.doc]);
      }
      closeModal();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(docId: string | number) {
    if (!caseId || !window.confirm('Delete this supporting document?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/cases/${caseId}/supporting-doc/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!res.ok) throw new Error('Delete failed');
      setSupportingDocs(prev => prev.filter(d => String(d.id) !== String(docId)));
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleGenerateSoap(e: React.FormEvent) {
    e.preventDefault();
    if (!caseId || !diagnosisText) return;
    setUploading(true); setUploadError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/cases/${caseId}/soap-diagnosis`, {
        method: 'POST',
        headers: { 
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ diagnosis_text: diagnosisText }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'SOAP Generation failed');
      const data = await res.json();
      setDiagnosisPdfUrl(data.pdf_url);
      closeModal();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleOrchestrate() {
    if (!caseId) return;
    setOrchestrating(true);
    setUploadError(null);
    setOrchestrationProgress(0);
    
    // Progress simulation
    const timer = setInterval(() => {
      setOrchestrationProgress(prev => {
        if (prev >= 90) return prev;
        return prev + 5;
      });
    }, 800);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/cases/${caseId}/orchestrate`, {
        method: 'POST',
        headers: { 
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          type: initialClaimType,
          supporting_docs: supportingDocs.map(d => d.url)
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Orchestration failed');
      const data = await res.json();
      setOrchestrationProgress(100);
      setTimeout(() => {
        setConfidenceScore(data.confidence_score);
        setAiReasoning(data.ai_reasoning);
        setGeneratedDocUrl(data.generated_doc_url);
        setOrchestrating(false);
      }, 500);
    } catch (err: any) {
      setUploadError(err.message);
      setOrchestrating(false);
    } finally {
      clearInterval(timer);
    }
  }

  async function handleInitiate() {
    if (!caseId || !generatedDocUrl) return;
    setSubmitting(true);
    setUploadError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/cases/${caseId}/initiate`, {
        method: 'POST',
        headers: { 
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: initialClaimType }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Initiation failed');
      const data = await res.json();
      setWorkflowStatus(data.status);
      alert('Request Sent! The documents have been submitted to the insurance company.');
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Shared file drop zone ────────────────────────────────────
  const FileZone = ({
    file, onFile, inputRef, accept = '*/*'
  }: {
    file: File | null;
    onFile: (f: File) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    accept?: string;
  }) => (
    <div
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${file ? 'var(--primary)' : 'var(--neutral-400)'}`,
        borderRadius: '12px', padding: '1.5rem', textAlign: 'center',
        cursor: 'pointer', backgroundColor: file ? 'var(--primary-fixed)' : 'var(--neutral-100)',
        transition: 'all 0.2s',
      }}
    >
      <UploadCloud size={26} color={file ? 'var(--primary)' : 'var(--text-muted)'} style={{ marginBottom: '6px' }} />
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: file ? 'var(--primary)' : 'var(--text-main)' }}>
        {file ? file.name : 'Click to select file'}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>PDF · max 10 MB</div>
      <input
        ref={inputRef} type="file" accept={accept}
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
    </div>
  );

  // ── Document row ─────────────────────────────────────────────
  const DocRow = ({
    icon, title, subtitle, url, onEdit, status, onDelete
  }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    url?: string;
    onEdit?: () => void;
    status?: 'ok' | 'missing';
    onDelete?: () => void;
  }) => (
    <div style={{
      background: 'var(--neutral-300)', padding: '1rem 1.25rem', borderRadius: '14px',
      display: 'flex', alignItems: 'center', gap: '1rem',
      border: `1px solid ${status === 'ok' ? 'rgba(46,125,50,0.2)' : 'var(--neutral-400)'}`,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch', flexShrink: 0 }}>
        {url && (
          <button
            onClick={() => window.open(url, '_blank')}
            title="View"
            style={{ background: 'var(--primary-fixed)', border: 'none', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700 }}
          >
            <ExternalLink size={12} /> View
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            title="Replace"
            style={{ background: 'white', border: '1px solid var(--neutral-400)', padding: '5px 10px', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 600 }}
          >
            <Pencil size={12} /> {url ? 'Replace' : 'Upload'}
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete"
            style={{ background: '#ffebee', border: 'none', padding: '5px', borderRadius: 8, cursor: 'pointer', color: '#c62828', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} />
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
          {status === 'ok'
            ? <CheckCircle2 size={16} color="#2e7d32" />
            : <Circle size={16} color="var(--neutral-500)" />
          }
        </div>
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────
  return (
    <LayoutSidebar>
      <div className="responsive-padding responsive-grid" style={{ height: '100%', overflowY: 'auto' }}>

        {/* ── Left: Document Inputs ─────────────────────────── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
            <div>
              <h2 style={{ fontSize: 'var(--font-h2)' }}>Document Inputs</h2>
              <div style={{ fontSize: '0.875rem', color: 'var(--primary)', fontWeight: 600 }}>{patientName}</div>
            </div>
            <FileUp size={20} color="var(--primary)" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', flex: 1 }}>

            {/* Diagnosis */}
            <DocRow
              icon={<FileText color="var(--secondary)" size={20} />}
              title="Medical Diagnosis"
              subtitle={diagnosisText}
              url={diagnosisPdfUrl}
              onEdit={caseId ? () => { setModal('diagnosis'); } : undefined}
              status={diagnosisPdfUrl ? 'ok' : 'missing'}
            />

            {/* Insurance Policy */}
            <DocRow
              icon={<BriefcaseMedical color="var(--secondary)" size={20} />}
              title="Insurance Policy"
              subtitle={
                insurers.length > 0 ? insurers.join(', ') :
                policyUrl ? 'Policy document on file' : 'No policy uploaded'
              }
              url={policyUrl}
              onEdit={patientId ? () => { setPolicyFile(null); setModal('policy'); } : undefined}
              status={policyUrl ? 'ok' : 'missing'}
            />

            {/* Medical Bill */}
            <DocRow
              icon={<ReceiptText color={billUrl ? 'var(--secondary)' : 'var(--text-muted)'} size={20} />}
              title="Medical Bill"
              subtitle={billUrl ? `RM ${Number(billPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'No bill uploaded'}
              url={billUrl}
              onEdit={caseId ? () => { setBillFile(null); setModal('bill'); } : undefined}
              status={billUrl ? 'ok' : 'missing'}
            />

            {/* Supporting docs */}
            {supportingDocs.map(doc => (
              <DocRow
                key={doc.id}
                icon={<ShieldCheck color="var(--secondary)" size={20} />}
                title={doc.label}
                subtitle={doc.filename}
                url={doc.url}
                status="ok"
                onDelete={() => handleDeleteDoc(doc.id)}
              />
            ))}

            {/* Add document */}
            <button
              onClick={() => { setDocLabel(''); setDocFile(null); setModal('support'); }}
              style={{
                background: 'white', border: '1px dashed var(--neutral-400)',
                padding: '1rem', borderRadius: '14px', color: 'var(--secondary)',
                fontWeight: 600, marginTop: 'auto', display: 'flex',
                justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                cursor: 'pointer', fontSize: '0.875rem',
              }}
            >
              <Plus size={18} /> Add Supporting Document
            </button>
          </div>
        </div>

        {/* ── Middle: AI Orchestrator ───────────────────────── */}
        <div style={{ background: 'var(--bg-gradient)', borderRadius: '1rem', padding: 'var(--container-gap)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
            <Bot size={32} color="var(--secondary)" />
          </div>
          <h2 style={{ fontSize: 'var(--font-h2)', fontWeight: 800, marginBottom: '0.5rem' }}>AI Orchestrator</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.875rem' }}>Analyzing claim variables</p>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, justifyContent: 'center' }}>
            {orchestrating ? (
              <div style={{ textAlign: 'center', padding: '2rem', width: '100%' }}>
                <div style={{ 
                  height: 8, width: '100%', background: 'var(--neutral-400)', borderRadius: 4, overflow: 'hidden', marginBottom: '1.5rem', position: 'relative'
                }}>
                  <div style={{ 
                    height: '100%', background: 'var(--primary)', width: `${orchestrationProgress}%`, transition: 'width 0.4s ease-out'
                  }} />
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                  {orchestrationProgress}%
                </div>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>AI Orchestration in progress...</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {orchestrationProgress < 30 ? 'Fetching clinical evidence...' : 
                   orchestrationProgress < 70 ? 'Synthesizing with policy rules...' : 
                   'Finalizing medical documents...'}
                </div>
              </div>
            ) : generatedDocUrl ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <CheckCircle2 size={48} color="var(--secondary)" style={{ margin: '0 auto 1.5rem' }} />
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Orchestration Complete</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>All clinical variables mapped to {initialClaimType} forms.</div>
                <button 
                  onClick={handleOrchestrate}
                  style={{ background: 'white', border: '1px solid var(--neutral-400)', padding: '8px 16px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Run Again
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                  Ready to process diagnosis, medical bill, and insurance policy for <b>{initialClaimType}</b> generation.
                </div>
                <button 
                  onClick={handleOrchestrate}
                  className="btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Bot size={18} /> Start AI Orchestration
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Claim Output ───────────────────────────── */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: 'var(--font-h2)' }}>Claim Output</h2>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, background: '#e0f2f1', color: '#00695c', padding: '0.25rem 0.5rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Circle fill="currentColor" size={8} /> PROCESSING
            </span>
          </div>

          <div style={{ background: 'var(--neutral-300)', borderRadius: 16, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: 1, color: 'var(--text-muted)' }}>CONFIDENCE SCORE</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{confidenceScore}%</div>
            </div>
            <div style={{ height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 2, marginBottom: '0.75rem' }}>
              <div style={{ height: '100%', width: `${confidenceScore}%`, background: 'var(--secondary)', borderRadius: 2, transition: 'width 1s ease-in-out' }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 500, marginTop: '0.75rem' }}>
              {aiReasoning || 'Start orchestration to see AI analysis.'}
            </div>
          </div>

          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>{initialClaimType} Preview</h3>
          <div style={{ flex: 1, minHeight: 120, background: 'var(--neutral-300)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', marginBottom: '1.5rem', border: generatedDocUrl ? '2px solid var(--secondary)' : 'none' }}>
            {generatedDocUrl ? (
              <div style={{ textAlign: 'center', padding: '1rem', width: '100%' }}>
                <ShieldCheck size={32} color="var(--secondary)" style={{ marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '1rem' }}>Documents Generated</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
                  {generatedDocUrl.split(',').map((url, index) => {
                    if (!url.trim()) return null;
                    const filename = decodeURIComponent(url.split('/').pop() || `Document_${index + 1}.pdf`);
                    return (
                      <button 
                        key={index}
                        onClick={() => window.open(url, '_blank')}
                        style={{ background: 'var(--secondary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', width: '100%', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={filename}
                      >
                        View Form {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <Lock size={24} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                <div style={{ fontSize: '0.75rem', textAlign: 'center', padding: '0 1rem' }}>Preview will unlock after orchestration.</div>
              </>
            )}
          </div>

          <button 
            className="btn-primary" 
            onClick={handleInitiate}
            disabled={!generatedDocUrl || submitting || (workflowStatus === 'GL Requested' || workflowStatus === 'Claim Submitted')}
            style={{ 
              width: '100%', 
              opacity: (!generatedDocUrl || submitting || (workflowStatus === 'GL Requested' || workflowStatus === 'Claim Submitted')) ? 0.5 : 1, 
              cursor: (!generatedDocUrl || submitting || (workflowStatus === 'GL Requested' || workflowStatus === 'Claim Submitted')) ? 'not-allowed' : 'pointer', 
              marginBottom: '0.75rem', 
              fontSize: '0.875rem',
              background: (workflowStatus === 'GL Requested' || workflowStatus === 'Claim Submitted') ? '#2e7d32' : undefined,
              color: (workflowStatus === 'GL Requested' || workflowStatus === 'Claim Submitted') ? 'white' : undefined,
            }}
          >
            {submitting ? (
              <><Loader2 size={16} className="animate-spin" /> Sending...</>
            ) : (workflowStatus === 'GL Requested' || workflowStatus === 'Claim Submitted') ? (
              <><CheckCircle2 size={16} /> {workflowStatus}</>
            ) : (
              `Approve & Initiate ${initialClaimType}`
            )}
          </button>
          <button className="btn-secondary" style={{ width: '100%', background: 'var(--neutral-200)', fontSize: '0.875rem' }}>
            Draft Referral Letter
          </button>
        </div>
      </div>

      {/* ── Modal: Replace Policy ─────────────────────────────── */}
      {modal === 'policy' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.25rem' }}>{policyUrl ? 'Replace' : 'Upload'} Insurance Policy</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            <form onSubmit={handleReplacePolicy}>
              <div style={{ marginBottom: '1.5rem' }}>
                <FileZone file={policyFile} onFile={setPolicyFile} inputRef={policyInputRef} accept="application/pdf" />
              </div>
              {uploadError && <div style={{ color: '#ef5350', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>{uploadError}</div>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={!policyFile || uploading} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: !policyFile || uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : 'Save Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Replace Bill ───────────────────────────────── */}
      {modal === 'bill' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.25rem' }}>{billUrl ? 'Replace' : 'Upload'} Medical Bill</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            <form onSubmit={handleReplaceBill}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>BILL AMOUNT (RM)</label>
                <input type="number" step="0.01" required value={billAmount} onChange={e => setBillAmount(e.target.value)} placeholder="0.00"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--neutral-400)', fontSize: '0.9rem' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <FileZone file={billFile} onFile={setBillFile} inputRef={billInputRef} accept="application/pdf,image/*" />
              </div>
              {uploadError && <div style={{ color: '#ef5350', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>{uploadError}</div>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={!billFile || !billAmount || uploading} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: !billFile || uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : 'Save Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Add Supporting Doc ─────────────────────────── */}
      {modal === 'support' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.25rem' }}>Add Supporting Document</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            <form onSubmit={handleAddSupportingDoc}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>DOCUMENT LABEL</label>
                <input type="text" value={docLabel} onChange={e => setDocLabel(e.target.value)} placeholder="e.g. Referral Letter, Discharge Summary"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--neutral-400)', fontSize: '0.9rem' }} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <FileZone file={docFile} onFile={setDocFile} inputRef={supportInputRef} accept="application/pdf,image/*" />
              </div>
              {uploadError && <div style={{ color: '#ef5350', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>{uploadError}</div>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={!docFile || uploading} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: !docFile || uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading...</> : 'Add Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Modal: Edit Diagnosis & SOAP ──────────────────────── */}
      {modal === 'diagnosis' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.25rem' }}>Edit Diagnosis & Generate SOAP</h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
            </div>
            <form onSubmit={handleGenerateSoap}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>DIAGNOSIS NOTE</label>
                <textarea 
                  required 
                  value={diagnosisText} 
                  onChange={e => setDiagnosisText(e.target.value)} 
                  rows={6}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--neutral-400)', fontSize: '0.9rem', resize: 'vertical' }} 
                  placeholder="Enter medical diagnosis or clinical notes..."
                />
              </div>
              {uploadError && <div style={{ color: '#ef5350', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>{uploadError}</div>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--neutral-400)', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={uploading || !diagnosisText} style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: uploading || !diagnosisText ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {uploading ? <><Loader2 size={16} className="animate-spin" /> Processing AI SOAP...</> : 'Generate SOAP PDF'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LayoutSidebar>
  );
}
