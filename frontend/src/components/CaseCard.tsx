import React, { useState, useEffect } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';

export type CaseStatusType = 'none' | 'requested' | 'approved' | 'rejected';
type UserRole = 'patient' | 'hospital_staff' | null;

export interface Appointment {
  id: string;
  bill_id: number;
}

export interface StandardCase {
  id: string;
  title: string;
  department: string;
  status: string;
  workflow_status: string;
  created_at?: string;
  appointments?: Appointment[];
  totalBill?: number;
  gl_status: CaseStatusType;
  claim_status: CaseStatusType;
  rejection_reason: string;
}

const STATUS_COLORS: Record<CaseStatusType, { bg: string; text: string }> = {
  none: { bg: '#ECEFF1', text: '#607D8B' },
  requested: { bg: '#FFF9C4', text: '#F9A825' },
  approved: { bg: '#E8F5E9', text: '#2E7D32' },
  rejected: { bg: '#FFEBEE', text: '#C62828' },
};

const API_BASE = 'http://localhost:8002';

// Normalise whatever the DB returns to lowercase CaseStatusType
const normalise = (s: string): CaseStatusType => {
  const lower = (s ?? '').toLowerCase();
  if (['none', 'requested', 'approved', 'rejected'].includes(lower)) {
    return lower as CaseStatusType;
  }
  return 'none';
};

// ---------------------------------------------------------------------------
// Reject modal
// ---------------------------------------------------------------------------
interface RejectModalProps {
  type: 'GL' | 'Claim';
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const RejectModal: React.FC<RejectModalProps> = ({ type, onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        backgroundColor: 'white', borderRadius: '12px',
        padding: '1.5rem', width: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
          Reject {type} Request
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Please provide a reason for rejection:
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter rejection reason..."
          rows={3}
          style={{
            width: '100%', borderRadius: '8px', border: '1.5px solid #CFD8DC',
            padding: '0.6rem', fontSize: '0.85rem', resize: 'vertical',
            outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.8rem',
              fontWeight: 700, border: '1.5px solid #CFD8DC', background: 'white',
              cursor: 'pointer', color: 'var(--text-muted)',
            }}
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            style={{
              padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.8rem',
              fontWeight: 700, border: 'none',
              cursor: reason.trim() ? 'pointer' : 'not-allowed',
              backgroundColor: reason.trim() ? '#C62828' : '#FFCDD2', color: 'white',
            }}
          >
            Confirm Reject
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Status badge + action buttons
// ---------------------------------------------------------------------------
interface StatusBadgeProps {
  type: 'GL' | 'Claim';
  status: CaseStatusType;      // already normalised
  caseId: string;
  role: UserRole;
  getToken: () => Promise<string | null>;
  onStatusChange: (newStatus: CaseStatusType) => void;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  type, status, caseId, role, getToken, onStatusChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const current = STATUS_COLORS[status] ?? STATUS_COLORS.none;
  const typeParam = type.toLowerCase();

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const handleRequest = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/cases/${caseId}/status?type=${typeParam}&status=requested`,
        { method: 'PATCH', headers: await getAuthHeaders() }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? 'Failed');
      onStatusChange('requested');
    } catch (e) { alert((e as Error).message); }
    finally { setLoading(false); }
  };

  const handleWithdraw = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/cases/${caseId}/status?type=${typeParam}`,
        { method: 'DELETE', headers: await getAuthHeaders() }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? 'Failed');
      onStatusChange('none');
    } catch (e) { alert((e as Error).message); }
    finally { setLoading(false); }
  };

  // handleGenerate logic for z.ai
  const handleGenerate = async () => {
    // setLoading(true);
    // try {
    //   const res = await fetch(
    //     `${API_BASE}/cases/${caseId}/status?type=${typeParam}&status=approved`,
    //     { method: 'PATCH', headers: await getAuthHeaders() }
    //   );
    //   if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? 'Failed');
    //   onStatusChange('approved');
    // } catch (e) { alert((e as Error).message); }
    // finally { setLoading(false); }
  };

  const handleReject = async (reason: string) => {
    setShowRejectModal(false);
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/cases/${caseId}/reject?type=${typeParam}&reason=${encodeURIComponent(reason)}`,
        { method: 'PATCH', headers: await getAuthHeaders() }
      );
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? 'Failed');
      onStatusChange('rejected');
    } catch (e) { alert((e as Error).message); }
    finally { setLoading(false); }
  };

  // Don't render any action buttons until role is resolved
  const showButtons = role !== null;

  return (
    <>
      {showRejectModal && (
        <RejectModal
          type={type}
          onConfirm={handleReject}
          onCancel={() => setShowRejectModal(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{
          fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '2px',
        }}>
          {type} STATUS
        </div>

        <div style={{
          padding: '0.35rem 0.75rem', borderRadius: '9999px',
          backgroundColor: current.bg, color: current.text,
          fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
        }}>
          {status}
        </div>

        {/* ── PATIENT buttons ── */}
        {showButtons && role === 'patient' && (status === 'none' || status === 'rejected') && (
          <button disabled={loading} onClick={(e) => { e.stopPropagation(); handleRequest(); }} style={{
            marginTop: '2px', backgroundColor: loading ? '#90CAF9' : '#1976D2',
            color: 'white', padding: '0.4rem 0.8rem', borderRadius: '8px',
            fontSize: '0.75rem', fontWeight: 700, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(25,118,210,0.3)', transition: 'background-color 0.15s',
          }}>
            {loading ? '...' : 'Request'}
          </button>
        )}

        {showButtons && role === 'patient' && status === 'requested' && (
          <button disabled={loading} onClick={(e) => { e.stopPropagation(); handleWithdraw(); }} style={{
            marginTop: '2px', backgroundColor: loading ? '#BDBDBD' : '#546E7A',
            color: 'white', padding: '0.4rem 0.8rem', borderRadius: '8px',
            fontSize: '0.75rem', fontWeight: 700, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)', transition: 'background-color 0.15s',
          }}>
            {loading ? '...' : 'Withdraw'}
          </button>
        )}

        {/* ── HOSPITAL STAFF buttons ── */}
        {showButtons && role === 'hospital_staff' && status === 'requested' && (
          <>
            <button disabled={loading} onClick={(e) => { e.stopPropagation(); handleGenerate(); }} style={{
              marginTop: '2px', backgroundColor: loading ? '#A5D6A7' : '#2E7D32',
              color: 'white', padding: '0.4rem 0.8rem', borderRadius: '8px',
              fontSize: '0.75rem', fontWeight: 700, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(46,125,50,0.3)', transition: 'background-color 0.15s',
            }}>
              {loading ? '...' : 'Generate'}
            </button>
            <button disabled={loading} onClick={(e) => { e.stopPropagation(); setShowRejectModal(true); }} style={{
              marginTop: '2px', backgroundColor: loading ? '#FFCDD2' : '#C62828',
              color: 'white', padding: '0.4rem 0.8rem', borderRadius: '8px',
              fontSize: '0.75rem', fontWeight: 700, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(198,40,40,0.3)', transition: 'background-color 0.15s',
            }}>
              Reject
            </button>
          </>
        )}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// CaseCard
// ---------------------------------------------------------------------------
interface CaseCardProps {
  caseData: StandardCase;
  onClick: () => void;
  showActions?: boolean;
}

export const CaseCard: React.FC<CaseCardProps> = ({ caseData, onClick, showActions = true }) => {
  const { getToken } = useAuth();
  const [role, setRole] = useState<UserRole>(null);

  // Normalise statuses from DB (handles "Requested", "APPROVED", etc.)
  const [glStatus, setGlStatus] = useState<CaseStatusType>(normalise(caseData.gl_status));
  const [claimStatus, setClaimStatus] = useState<CaseStatusType>(normalise(caseData.claim_status));

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/me/role`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (res.ok) {
          const data = await res.json();
          setRole(data.role as UserRole);
        }
      } catch (e) {
        console.error('Failed to fetch role', e);
      }
    })();
  }, []);

  // const totalBill =
  //   caseData.appointments && caseData.appointments.length > 0
  //     ? caseData.appointments.reduce((sum, appt) => sum + (appt?.bill_id?.total_bill ?? 0), 0)
  //     : (caseData.totalBill ?? 0);

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{
        padding: '1.5rem',
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1fr',
        gap: '1.5rem',
        alignItems: 'start',
      }}>
        <div style={{ cursor: 'pointer' }} onClick={onClick}>
          <div style={{
            fontSize: '1.125rem', fontWeight: 800, color: 'var(--primary)',
            marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            {caseData.title} <ArrowRight size={14} />
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {caseData.department} Department
          </div>
          {caseData.created_at && (
            <div style={{
              fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}>
              <Clock size={12} /> Created {new Date(caseData.created_at).toLocaleDateString()}
            </div>
          )}
        </div>

        <StatusBadge type="GL" status={glStatus} caseId={caseData.id}
          role={showActions ? role : null} getToken={getToken} onStatusChange={setGlStatus} />

        <StatusBadge type="Claim" status={claimStatus} caseId={caseData.id}
          role={showActions ? role : null} getToken={getToken} onStatusChange={setClaimStatus} />

        <div style={{ textAlign: 'right' }}>
          {caseData.status === 'Archived' ? (
            <>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Case Status
              </div>
              <div style={{
                padding: '0.35rem 0.75rem', borderRadius: '9999px',
                backgroundColor: 'var(--neutral-400)', color: '#455A64',
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize', display: 'inline-block',
              }}>
                {caseData.status}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Total Bill
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {caseData.totalBill > 0
                  ? `RM ${caseData.totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : '—'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};