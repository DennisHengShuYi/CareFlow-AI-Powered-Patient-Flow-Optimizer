import React, { useState } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react'; // swap to @clerk/nextjs if using Next.js

export type CaseStatusType = 'none' | 'requested' | 'approved' | 'rejected';

export interface Appointment {
  id: string;
  bill_id: { total_bill: number };
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

// ---------------------------------------------------------------------------
// Status badge + action buttons
// ---------------------------------------------------------------------------
interface StatusBadgeProps {
  type: 'GL' | 'Claim';
  status: CaseStatusType;
  caseId: string;
  getToken: () => Promise<string | null>;
  onStatusChange: (newStatus: CaseStatusType) => void;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  type, status, caseId, getToken, onStatusChange,
}) => {
  const [loading, setLoading] = useState(false);
  const current = STATUS_COLORS[status] ?? STATUS_COLORS.none;
  const endpoint = `${API_BASE}/cases/${caseId}/status?type=gl&status=requested`;

  const updateStatus = async (newStatus: 'requested' | 'none') => {
    setLoading(true);
    try {
      const token = await getToken();

      const res = await fetch(
        `${API_BASE}/cases/${caseId}/status?type=${type.toLowerCase()}&status=${newStatus}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail ?? 'Failed');
      }

      onStatusChange(newStatus);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
      {/* Label */}
      <div style={{
        fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '2px',
      }}>
        {type} STATUS
      </div>

      {/* Bubble */}
      <div style={{
        padding: '0.35rem 0.75rem', borderRadius: '9999px',
        backgroundColor: current.bg, color: current.text,
        fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
      }}>
        {status}
      </div>

      {/* Generate button — existing behaviour, shown when requested */}
      {status === 'requested' && (
        <button style={{
          marginTop: '2px', backgroundColor: 'var(--primary)', color: 'white',
          padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.75rem',
          fontWeight: 700, border: 'none', cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          Generate
        </button>
      )}

      {/* Request — shown for none / rejected */}
      {(status === 'none' || status === 'rejected') && (
        <button
          disabled={loading}
          onClick={(e) => { e.stopPropagation(); updateStatus('requested'); }}
          style={{
            marginTop: '2px',
            backgroundColor: loading ? '#90CAF9' : '#1976D2',
            color: 'white',
            padding: '0.4rem 0.8rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontWeight: 700,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(25,118,210,0.3)',
            transition: 'background-color 0.15s',
          }}
        >
          {loading ? '...' : 'Request'}
        </button>
      )}

      {/* Withdraw — shown only when requested */}
      {status === 'requested' && (
        <button
          disabled={loading}
          onClick={(e) => { e.stopPropagation(); updateStatus('none'); }}
          style={{
            marginTop: '2px',
            backgroundColor: loading ? '#BDBDBD' : '#546E7A',
            color: 'white',
            padding: '0.4rem 0.8rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontWeight: 700,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            transition: 'background-color 0.15s',
          }}
        >
          {loading ? '...' : 'Withdraw'}
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CaseCard
// ---------------------------------------------------------------------------
interface CaseCardProps {
  caseData: StandardCase;
  onClick: () => void;
}

export const CaseCard: React.FC<CaseCardProps> = ({ caseData, onClick }) => {
  const { getToken } = useAuth();

  const [glStatus, setGlStatus] = useState<CaseStatusType>(caseData.gl_status);
  const [claimStatus, setClaimStatus] = useState<CaseStatusType>(caseData.claim_status);

  // Sum appointments if present, otherwise fall back to totalBill prop
  const totalBill =
    caseData.appointments && caseData.appointments.length > 0
      ? caseData.appointments.reduce((sum, appt) => sum + (appt?.bill_id?.total_bill ?? 0), 0)
      : (caseData.totalBill ?? 0);

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{
        padding: '1.5rem',
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1fr',
        gap: '1.5rem',
        alignItems: 'center',
      }}>
        {/* Left Info */}
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

        {/* GL Status */}
        <StatusBadge
          type="GL"
          status={glStatus}
          caseId={caseData.id}
          getToken={getToken}
          onStatusChange={setGlStatus}
        />

        {/* Claim Status */}
        <StatusBadge
          type="Claim"
          status={claimStatus}
          caseId={caseData.id}
          getToken={getToken}
          onStatusChange={setClaimStatus}
        />

        {/* Total Bill / Archived status */}
        <div style={{ textAlign: 'right' }}>
          {caseData.status === 'Archived' ? (
            <>
              <div style={{
                fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
                textTransform: 'uppercase', marginBottom: '8px',
              }}>
                Case Status
              </div>
              <div style={{
                padding: '0.35rem 0.75rem', borderRadius: '9999px',
                backgroundColor: 'var(--neutral-400)', color: '#455A64',
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
                display: 'inline-block',
              }}>
                {caseData.status}
              </div>
            </>
          ) : (
            <>
              <div style={{
                fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
                textTransform: 'uppercase', marginBottom: '8px',
              }}>
                Total Bill
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {totalBill > 0
                  ? `RM ${totalBill.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                  : '—'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
