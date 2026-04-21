import React, { useState, useRef } from 'react';
import LayoutSidebar from '../components/LayoutSidebar';
import { Link } from 'react-router-dom';
import { ShieldAlert, HeartPulse, MapPin, CheckCircle2, ChevronRight, ArrowLeft, ArrowRight, Mic, Upload, Type, Loader2, X, FileText } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useProfile } from '../hooks/useProfile';


export default function Intake() {
  const { getToken } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [inputMode, setInputMode] = useState<"none" | "text" | "voice">("text");
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [triageData, setTriageData] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [followUpResponse, setFollowUpResponse] = useState('');
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [followUpInputMode, setFollowUpMode] = useState<"text" | "voice">("text");
  
  // Real-time Voice Transcription
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  
  // Document Attachment State
  const [attachedDocContent, setAttachedDocContent] = useState<string | null>(null);
  const [attachedDocName, setAttachedDocName] = useState<string | null>(null);

  // Recommendation State
  const { profile } = useProfile();
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  const fetchRecommendations = async (triage: any) => {
    setRecLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('http://localhost:8002/api/hospitals/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          specialist: triage.recommended_specialist || '',
          chief_complaint: triage.chief_complaint || '',
          location: profile?.location || '',
        })
      });
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch (err) {
      console.error('Error fetching recommendations:', err);
    } finally {
      setRecLoading(false);
    }
  };

  const resetIntake = () => {
    setStep(1);
    setSessionId(null);
    setTriageData(null);
    setTextInput('');
    setNextAction(null);
    setQuestion(null);
    setFollowUpResponse('');
    setIsFollowingUp(false);
    setInputMode('text');
    setRecommendations([]);
    setAttachedDocContent(null);
    setAttachedDocName(null);
  };


  const [loadingStatus, setLoadingStatus] = useState<string>('');

  const processTriageText = async (text: string) => {
    setLoading(true);
    setLoadingStatus('Analyzing your symptoms...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute patience

    try {
      const token = await getToken();
      
      // Stage 1: Extraction
      setLoadingStatus('Identifying clinical facts...');
      const res = await fetch('http://localhost:8002/intake/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          text,
          session_id: sessionId 
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to process triage');
      }

      const data = await res.json();
      
      setTriageData(data.triage);
      setSessionId(data.session_id);
      setNextAction(data.next_action);
      setQuestion(data.question);

      sessionStorage.setItem('latestTriageContext', JSON.stringify({
        session_id: data.session_id,
        recommended_specialist: data?.triage?.recommended_specialist || '',
        urgency: data?.triage?.urgency_score || '',
        chief_complaint: data?.triage?.chief_complaint || '',
      }));
      
      if (data.triage) {
        fetchRecommendations(data.triage);
      }

      setStep(2);
      setIsFollowingUp(false);
      setFollowUpResponse('');
    } catch (err: any) {
      console.error(err);
      if (err.name === 'AbortError') {
        alert('Triage is taking longer than expected due to high clinical reasoning load. Please try again or proceed to the Emergency Department if this is an emergency.');
      } else {
        alert(`Triage processing failed: ${err.message || 'Connection Reset'}`);
      }
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };


  const handleTextSubmit = () => {
    if (!textInput.trim() && !attachedDocContent) return;
    let combined = textInput;
    if (attachedDocContent) {
      combined += `\n\n[ATTACHED DOCUMENT: ${attachedDocName}]\n${attachedDocContent}`;
    }
    processTriageText(combined);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const fileName = e.target.files[0].name;
    setLoading(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      
      const docRes = await fetch('http://localhost:8002/intake/document', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
      });
      
      if (!docRes.ok) {
        const errorData = await docRes.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(errorData.detail || 'File upload failed');
      }
      
      const docData = await docRes.json();
      
      setAttachedDocContent(docData.content || docData.extracted || "");
      setAttachedDocName(fileName);
      setInputMode('text');
      
    } catch (err: any) {
      console.error(err);
      alert(`Document Error: ${err.message}`);
    } finally {
      setLoading(false);
    }

  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support real-time voice recognition. Please try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      
      setVoiceTranscript(prev => {
        const newTranscript = prev + final;
        if (step === 1) {
          setTextInput(newTranscript);
        } else {
          setFollowUpResponse(newTranscript);
        }
        return newTranscript;
      });
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) recognition.start();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setInputMode('voice');
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const cancelVoice = () => {
    stopListening();
    setVoiceTranscript('');
    setInputMode('text');
  };

  const submitVoice = () => {
    if (!voiceTranscript.trim() && !attachedDocContent) return;
    stopListening();
    
    let combined = voiceTranscript;
    if (attachedDocContent) {
      combined += `\n\n[ATTACHED DOCUMENT: ${attachedDocName}]\n${attachedDocContent}`;
    }
    
    processTriageText(combined);
    setVoiceTranscript('');
  };

  return (
    <LayoutSidebar>
      <div className="intake-page-wrapper">

        {/* Language toggle */}
        <div className="lang-toggle-row">
          <div style={{ display: 'flex', background: 'var(--neutral-300)', borderRadius: '9999px', padding: '0.25rem', border: '1px solid var(--neutral-400)' }}>
            <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontWeight: 600 }}>EN</button>
            <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', color: 'var(--text-muted)' }}>BM</button>
            <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Code-switch: Auto</button>
          </div>
        </div>

        {/* ── STEP 1: Input ── */}
        {step === 1 && (
          <div className="card intake-card">
            <h1 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '1rem' }}>How can we help today?</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Describe your symptoms naturally in English or Bahasa Malaysia. You can type, speak, or upload a medical document.
            </p>

            {/* Mode selector */}
            <div className="intake-mode-buttons">
              <button
                onClick={() => setInputMode('text')}
                className={`btn-primary intake-mode-btn`}
                style={{
                  background: inputMode === 'text' ? 'var(--secondary)' : 'var(--neutral-200)',
                  color: inputMode === 'text' ? 'white' : 'var(--secondary)',
                }}
              >
                <Type size={20} style={{ display: 'inline', marginRight: '0.5rem' }} /> Text Entry
              </button>
              <button
                onClick={isListening ? stopListening : startListening}
                className="btn-primary intake-mode-btn"
                style={{
                  background: isListening ? '#ffebee' : 'var(--neutral-200)',
                  color: isListening ? '#c62828' : 'var(--secondary)',
                  border: isListening ? '1px solid #c62828' : 'none',
                }}
              >
                <Mic size={20} style={{ display: 'inline', marginRight: '0.5rem' }} className={isListening ? 'animate-pulse' : ''} />
                {isListening ? 'Stop Listening' : 'Voice Intake'}
              </button>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*,.pdf" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="btn-primary intake-mode-btn"
                style={{
                  background: attachedDocName ? 'var(--primary-fixed)' : 'var(--neutral-200)',
                  color: 'var(--secondary)',
                  border: attachedDocName ? '1px solid var(--primary)' : 'none',
                }}
              >
                <Upload size={20} style={{ display: 'inline', marginRight: '0.5rem' }} />
                {attachedDocName ? 'Doc Attached' : 'Upload Doc'}
              </button>
            </div>

            {/* Attached doc chip */}
            {attachedDocName && (
              <div style={{
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                background: 'var(--neutral-100)',
                borderRadius: '12px',
                border: '1px solid var(--neutral-400)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <FileText size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedDocName}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>(Content captured)</span>
                </div>
                <button
                  onClick={() => { setAttachedDocContent(null); setAttachedDocName(null); }}
                  style={{ color: 'var(--danger)', padding: '0.25rem', flexShrink: 0 }}
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Text input */}
            {inputMode === 'text' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="e.g. I have a crushing chest pain that radiates to my jaw..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--neutral-400)',
                    background: 'var(--neutral-100)',
                    resize: 'vertical',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '0.9375rem',
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={loading || (!textInput.trim() && !attachedDocContent)}
                  className="btn-primary"
                  style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  {loading ? ' ' + loadingStatus : 'Analyze Symptoms'}
                </button>

              </div>
            )}

            {/* Voice input */}
            {inputMode === 'voice' && (
              <div className="voice-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: isListening ? 'var(--danger)' : 'var(--text-muted)' }}>
                    <Mic size={20} className={isListening ? 'animate-pulse' : ''} />
                    <span style={{ fontWeight: 600 }}>{isListening ? 'Listening...' : 'Microphone Paused'}</span>
                  </div>
                  <button onClick={cancelVoice} style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>Cancel</button>
                </div>

                <div style={{ minHeight: '100px', padding: '1.25rem', background: 'white', borderRadius: '12px', border: '1px solid var(--neutral-400)', fontSize: '1.125rem', lineHeight: 1.5 }}>
                  {voiceTranscript || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Start speaking to see transcription...</span>}
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button onClick={isListening ? stopListening : startListening} className="btn-secondary" style={{ flex: 1, minWidth: '100px' }}>
                    {isListening ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={submitVoice}
                    disabled={!voiceTranscript.trim() || loading}
                    className="btn-primary"
                    style={{ flex: 2, minWidth: '140px', background: 'var(--success)', color: 'white' }}
                  >
                    {loading ? <Loader2 className="animate-spin" style={{ display: 'inline', marginRight: '0.5rem' }} /> : <ChevronRight style={{ display: 'inline', marginRight: '0.5rem' }} />}
                    Analyze Speech
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Triage Results ── */}
        {step === 2 && triageData && (
          <div className="card triage-card">
            <h1 className="triage-card-title" style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '1rem' }}>LLM Triage Complete</h1>
            <p className="triage-card-subtitle" style={{ fontSize: 'var(--font-p)', color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
              Based on your multi-modal symptom intake, the Triage Engine has assigned an urgency score and requested optimal care.
            </p>

            {/* Two-column (stacks on mobile) */}
            <div className="triage-results-grid">

              {/* Left: AI Triage Summary */}
              <div className="triage-summary-col">
                <div className="triage-header-row">
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>ASSESSMENT</div>
                    <h2 style={{ fontSize: 'var(--font-h2)', fontWeight: 800 }}>AI Triage<br/>Summary</h2>
                  </div>
                  <div style={{
                    background: triageData.urgency_score === 'P1' ? '#ffcdd2' : 'linear-gradient(90deg, #A2C9FF, #759EFD)',
                    color: triageData.urgency_score === 'P1' ? '#c62828' : 'var(--secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '9999px',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>
                    <ShieldAlert size={16} /> Urgency: {triageData.urgency_score}
                  </div>
                </div>

                <div className="triage-info-card" style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Chief Complaint</div>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem', lineHeight: 1.5 }}>{triageData.chief_complaint}</div>
                </div>

                <div className="triage-info-card" style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', marginBottom: triageData.red_flags?.length > 0 ? '1rem' : '1.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recommended Specialty</div>
                  <div className="specialty-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-fixed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <HeartPulse size={16} color="var(--primary)" />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{triageData.recommended_specialist}</div>
                  </div>
                </div>

                {/* Hospital Recommendations */}
                <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', marginBottom: triageData.red_flags?.length > 0 ? '1rem' : '0', border: '1px solid var(--neutral-400)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                        <MapPin size={13} /> AI HOSPITAL RECOMMENDATIONS
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Ranked by specialty match &amp; proximity to your location
                      </div>
                    </div>
                    {profile?.location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--neutral-200)', padding: '0.35rem 0.75rem', borderRadius: '9999px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <MapPin size={11} />
                        {profile.location}
                      </div>
                    )}
                  </div>

                  {recLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {[1, 2, 3].map(i => (
                        <div key={i} style={{ height: '80px', background: 'var(--neutral-200)', borderRadius: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      ))}
                    </div>
                  ) : recommendations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      <MapPin size={28} style={{ opacity: 0.3, marginBottom: '0.75rem', display: 'block', margin: '0 auto 0.75rem' }} />
                      No hospitals found. Please ensure your profile location is set.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {recommendations.map((hosp, idx) => {
                        const isTop = idx === 0;
                        return (
                          <div key={hosp.id} style={{
                            border: `1.5px solid ${isTop ? 'var(--primary)' : 'var(--neutral-400)'}`,
                            borderRadius: '14px',
                            padding: '1rem 1.25rem',
                            background: isTop ? 'linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)' : 'white',
                            position: 'relative',
                            transition: 'box-shadow 0.2s',
                          }}>
                            <div className="hosp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div className="hosp-name-block" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                                <div style={{
                                  width: '26px', height: '26px', borderRadius: '50%',
                                  background: isTop ? 'var(--primary)' : 'var(--neutral-300)',
                                  color: isTop ? 'white' : 'var(--text-muted)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.7rem', fontWeight: 800, flexShrink: 0
                                }}>
                                  #{idx + 1}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', wordBreak: 'break-word', lineHeight: 1.3 }}>
                                    {hosp.name}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                    {hosp.address}
                                  </div>
                                </div>
                              </div>

                              <div className="hosp-match-badge" style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                  padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                                  background: hosp.specialty_match ? 'rgba(46,125,50,0.1)' : 'var(--neutral-200)',
                                  color: hosp.specialty_match ? '#2e7d32' : 'var(--text-muted)',
                                }}>
                                  {hosp.specialty_match ? <CheckCircle2 size={11} /> : null}
                                  {hosp.specialty_match ? 'Specialty Match' : 'General'}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                  {hosp.distance_note}
                                </div>
                              </div>
                            </div>

                            {hosp.matched_departments.length > 0 && (
                              <div className="hosp-dept-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.65rem' }}>
                                {hosp.matched_departments.map((d: string, i: number) => (
                                  <span key={i} style={{
                                    background: 'rgba(25,118,210,0.1)', color: 'var(--primary)',
                                    padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600
                                  }}>
                                    <HeartPulse size={9} style={{ display: 'inline', marginRight: '3px' }} />
                                    {d}
                                  </span>
                                ))}
                              </div>
                            )}

                            {hosp.all_departments.length > 0 && (
                              <div className="hosp-dept-text" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                Departments: {hosp.all_departments.join(' · ')}
                              </div>
                            )}

                            <div className="hosp-footer-row">
                              {hosp.contact_number ? (
                                <a href={`tel:${hosp.contact_number}`} style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  📞 {hosp.contact_number}
                                </a>
                              ) : <span />}
                              <Link
                                to="/appointments"
                                state={{
                                  triageContext: {
                                    session_id: sessionId,
                                    recommended_specialist: triageData?.recommended_specialist || '',
                                    urgency: triageData?.urgency_score || '',
                                    chief_complaint: triageData?.chief_complaint || '',
                                  },
                                  hospitalId: hosp.id,
                                }}
                                className="btn-primary"
                                style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: isTop ? 'var(--primary)' : 'var(--neutral-300)', color: isTop ? 'white' : 'var(--text-main)', borderRadius: '9999px' }}
                              >
                                Book Here <ChevronRight size={13} />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {triageData.red_flags?.length > 0 && (
                  <div style={{ background: '#ffebee', borderRadius: '16px', padding: '1.5rem', marginTop: '1.5rem', border: '1px solid #ffcdd2' }}>
                    <div style={{ fontSize: '0.75rem', color: '#c62828', marginBottom: '0.5rem', fontWeight: 700 }}>RED FLAGS DETECTED</div>
                    <ul style={{ paddingLeft: '1.5rem', color: '#c62828', fontSize: '0.875rem', margin: 0 }}>
                      {triageData.red_flags.map((flag: string, i: number) => <li key={i}>{flag}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Right: Clinical Reasoning */}
              <div className="triage-reasoning-col">
                <div className="reasoning-label" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>CHAIN OF THOUGHT</div>
                <h2 className="reasoning-title" style={{ fontSize: 'var(--font-h2)', fontWeight: 800, marginBottom: '1.5rem' }}>Clinical Reasoning</h2>

                <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', fontSize: '0.875rem' }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {triageData.reasoning_chain?.map((step: string, i: number) => (
                      <li key={i} style={{
                        display: 'flex',
                        gap: '0.6rem',
                        alignItems: 'flex-start',
                        padding: '0.6rem 0.75rem',
                        background: 'var(--neutral-200)',
                        borderRadius: '8px',
                        lineHeight: 1.5,
                      }}>
                        <span style={{
                          minWidth: '20px', height: '20px',
                          borderRadius: '50%',
                          background: 'var(--primary)',
                          color: 'white',
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: '1px',
                        }}>{i + 1}</span>
                        <span>{step.replace(/^\d+\.\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: '2rem' }}>
                  {nextAction === 'question' && question ? (
                    <div style={{ background: 'var(--primary-fixed)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--primary)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CheckCircle2 size={18} /> Further Details Requested:
                      </div>
                      <div style={{ fontSize: '1rem', color: 'var(--secondary)', marginBottom: '1.5rem', fontStyle: 'italic', lineHeight: 1.5 }}>
                        "{question}"
                      </div>

                      {!isFollowingUp ? (
                        <button
                          onClick={() => setIsFollowingUp(true)}
                          className="btn-primary"
                          style={{ width: '100%', background: 'var(--secondary)', color: 'white' }}
                        >
                          Respond to AI Question
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div style={{ display: 'flex', background: 'var(--neutral-300)', borderRadius: '8px', padding: '0.25rem', width: 'fit-content', border: '1px solid var(--neutral-400)' }}>
                            <button
                              onClick={() => { stopListening(); setFollowUpMode('text'); }}
                              style={{ padding: '0.4rem 1rem', borderRadius: '6px', background: followUpInputMode === 'text' ? 'white' : 'transparent', boxShadow: followUpInputMode === 'text' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none', fontWeight: followUpInputMode === 'text' ? 600 : 400, fontSize: '0.75rem' }}
                            >
                              Text Response
                            </button>
                            <button
                              onClick={() => { setFollowUpMode('voice'); setVoiceTranscript(followUpResponse); }}
                              style={{ padding: '0.4rem 1rem', borderRadius: '6px', background: followUpInputMode === 'voice' ? 'white' : 'transparent', boxShadow: followUpInputMode === 'voice' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none', fontWeight: followUpInputMode === 'voice' ? 600 : 400, fontSize: '0.75rem' }}
                            >
                              Voice Mode
                            </button>
                          </div>

                          {followUpInputMode === 'text' ? (
                            <textarea
                              value={followUpResponse}
                              onChange={(e) => setFollowUpResponse(e.target.value)}
                              placeholder="Type your response here..."
                              rows={3}
                              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--neutral-400)', fontSize: '0.875rem', fontFamily: 'Inter, sans-serif' }}
                            />
                          ) : (
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--neutral-400)', fontSize: '0.875rem', minHeight: '80px' }}>
                              {voiceTranscript || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Start speaking...</span>}
                              {isListening && <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontSize: '0.7rem', fontWeight: 700 }}>
                                <Mic size={12} className="animate-pulse" /> LISTENING...
                              </div>}
                            </div>
                          )}

                          <div className="followup-actions">
                            <button
                              onClick={() => { stopListening(); setIsFollowingUp(false); setFollowUpMode('text'); }}
                              className="btn-secondary"
                              style={{ fontSize: '0.875rem' }}
                            >
                              Cancel
                            </button>

                            {followUpInputMode === 'voice' && !isListening && (
                              <button
                                onClick={startListening}
                                className="btn-secondary"
                                style={{ fontSize: '0.875rem', background: 'var(--primary-fixed)', color: 'var(--primary)' }}
                              >
                                Resume Voice
                              </button>
                            )}

                            {followUpInputMode === 'voice' && isListening && (
                              <button
                                onClick={stopListening}
                                className="btn-secondary"
                                style={{ fontSize: '0.875rem', background: '#ffebee', color: '#c62828' }}
                              >
                                Pause Voice
                              </button>
                            )}

                            <button
                              onClick={() => { stopListening(); processTriageText(followUpResponse); }}
                              disabled={loading || !followUpResponse.trim()}
                              className="btn-primary"
                              style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flex: 2 }}
                            >
                              {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                              {loading ? ' ' + loadingStatus : 'Submit Response'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--neutral-100)', padding: '2rem', borderRadius: '1.5rem', border: '2px dashed var(--success)', textAlign: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                        <CheckCircle2 size={24} color="var(--success)" />
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Triage Assessment Finalized</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        The AI engine has gathered all necessary clinical details. You can now proceed to select an available appointment slot.
                      </p>
                      <button
                        className="btn-primary"
                        style={{
                          width: '100%',
                          padding: '1rem',
                          fontSize: '1.125rem',
                          background: 'var(--success)',
                          color: 'white',
                          fontWeight: 700,
                          boxShadow: '0 4px 12px rgba(46, 125, 50, 0.3)'
                        }}
                      >
                        Proceed to Appointment Booking
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="intake-footer-row">
              <button
                onClick={resetIntake}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowLeft size={16} /> Retake Assessment
              </button>
            </div>

          </div>
        )}

      </div>
    </LayoutSidebar>
  );
}
