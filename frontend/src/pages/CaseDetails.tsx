import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  FileText, 
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCw,
  MoreVertical
} from 'lucide-react';

interface Appointment {
  id: string;
  title: string;
  date: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'No-show' | 'Rescheduled';
  doctor: string;
  specialty: string;
  facility: string;
  outcome?: string;
  bill: number;
}

const MOCK_APPOINTMENTS: Record<string, Appointment[]> = {
  'Stroke Management': [
    {
      id: 'a1',
      title: 'Initial Emergency Assessment',
      date: '2024-04-10 08:30 AM',
      status: 'Completed',
      doctor: 'Dr. Sarah Lim',
      specialty: 'Neurology',
      facility: 'ER - Ward 1A',
      outcome: 'Patient stabilized after ischemic stroke. Commenced thrombolysis protocol.',
      bill: 8500.00
    },
    {
      id: 'a2',
      title: 'MRI Brain Scan',
      date: '2024-04-10 11:00 AM',
      status: 'Completed',
      doctor: 'Dr. Robert Chen',
      specialty: 'Radiology',
      facility: 'Radiology Suite 2',
      outcome: 'Infarct confirmed in left middle cerebral artery territory.',
      bill: 2200.00
    },
    {
      id: 'a3',
      title: 'Daily Neurology Review',
      date: '2024-04-11 09:00 AM',
      status: 'Completed',
      doctor: 'Dr. Sarah Lim',
      specialty: 'Neurology',
      facility: 'ICU - Bed 4',
      outcome: 'GCS 14/15. Motor power improving on right side.',
      bill: 450.00
    },
    {
      id: 'a4',
      title: 'Post-Stroke Follow-up',
      date: '2024-04-25 02:00 PM',
      status: 'Scheduled',
      doctor: 'Dr. Sarah Lim',
      specialty: 'Neurology',
      facility: 'Clinic Block B',
      bill: 350.00
    }
  ],
  'Hypertension Follow-up': [
    {
      id: 'b1',
      title: 'Quarterly Review',
      date: '2024-01-15 10:00 AM',
      status: 'Completed',
      doctor: 'Dr. James Ng',
      specialty: 'General Medicine',
      facility: 'Outpatient Clinic 4',
      outcome: 'BP 138/85. Continue current dosage of Amlodipine.',
      bill: 150.00
    },
    {
      id: 'b2',
      title: 'Medication Adjustment',
      date: '2024-04-20 11:30 AM',
      status: 'Rescheduled',
      doctor: 'Dr. James Ng',
      specialty: 'General Medicine',
      facility: 'Outpatient Clinic 4',
      bill: 0
    }
  ]
};

export default function CaseDetails() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const appointments = MOCK_APPOINTMENTS[caseId || ''] || [];

  const getStatusStyle = (status: Appointment['status']) => {
    switch (status) {
      case 'Scheduled': return { bg: '#E3F2FD', text: '#1E88E5', icon: Clock };
      case 'Completed': return { bg: '#E8F5E9', text: '#2E7D32', icon: CheckCircle2 };
      case 'Cancelled': return { bg: '#FFEBEE', text: '#C62828', icon: XCircle };
      case 'No-show': return { bg: '#FFF3E0', text: '#EF6C00', icon: AlertCircle };
      case 'Rescheduled': return { bg: '#F3E5F5', text: '#7B1FA2', icon: RotateCw };
      default: return { bg: '#F5F5F5', text: '#616161', icon: Clock };
    }
  };

  return (
    <LayoutSidebar>
      <div style={{ padding: '2rem 3rem', backgroundColor: 'var(--neutral-300)', minHeight: '100%' }}>
        
        {/* Header */}
        <header style={{ marginBottom: '2.5rem' }}>
          <button 
            onClick={() => navigate(-1)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              color: 'var(--text-muted)', 
              fontWeight: 600,
              marginBottom: '1.5rem',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <ArrowLeft size={18} /> Back to Patients
          </button>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div style={{ 
                fontSize: '0.75rem', 
                fontWeight: 800, 
                textTransform: 'uppercase', 
                letterSpacing: '0.1em', 
                color: 'var(--primary)',
                marginBottom: '0.5rem'
              }}>
                Case Timeline
              </div>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>{caseId}</h1>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Appointments</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{appointments.length} Sessions</div>
            </div>
          </div>
        </header>

        {/* Appointments List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {appointments.length > 0 ? (
            appointments.map((apt) => {
              const statusStyle = getStatusStyle(apt.status);
              const StatusIcon = statusStyle.icon;
              
              return (
                <div key={apt.id} className="card" style={{ padding: '0', overflow: 'hidden' }}>
                  <div style={{ display: 'flex' }}>
                    
                    {/* Date Sidebar */}
                    <div style={{ 
                      width: '120px', 
                      backgroundColor: 'var(--neutral-200)', 
                      padding: '1.5rem', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      borderRight: '1px solid var(--neutral-400)'
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {apt.date.split(' ')[0].split('-')[1]}/{apt.date.split(' ')[0].split('-')[2]}
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
                         {apt.date.split(' ')[0].split('-')[0]}
                      </div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        {apt.date.split(' ').slice(1).join(' ')}
                      </div>
                    </div>

                    {/* Main Content */}
                    <div style={{ flex: 1, padding: '1.5rem', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: '2rem' }}>
                      
                      {/* Title & Outcome */}
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-main)' }}>{apt.title}</h3>
                        {apt.outcome && (
                          <div style={{ 
                            backgroundColor: 'var(--neutral-200)', 
                            padding: '1rem', 
                            borderRadius: '12px', 
                            fontSize: '0.875rem',
                            color: 'var(--text-muted)',
                            lineHeight: '1.5',
                            borderLeft: '4px solid var(--primary)'
                          }}>
                            <div style={{ fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>Outcome Summary</div>
                            {apt.outcome}
                          </div>
                        )}
                      </div>

                      {/* Provider & Facility */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={16} color="var(--text-muted)" />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>{apt.doctor}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{apt.specialty}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MapPin size={16} color="var(--text-muted)" />
                          </div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{apt.facility}</div>
                        </div>
                      </div>

                      {/* Status & Bill */}
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          padding: '0.5rem 1rem', 
                          borderRadius: '9999px', 
                          backgroundColor: statusStyle.bg, 
                          color: statusStyle.text,
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          textTransform: 'uppercase'
                        }}>
                          <StatusIcon size={14} /> {apt.status}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Session Bill</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            RM {apt.bill.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Quick Actions */}
                    <div style={{ width: '60px', borderLeft: '1px solid var(--neutral-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button style={{ color: 'var(--neutral-500)' }}><MoreVertical size={20} /></button>
                    </div>

                  </div>
                </div>
              );
            })
          ) : (
            <div className="card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Calendar size={48} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
              <h3>No appointments found for this case.</h3>
            </div>
          )}
        </div>

      </div>
    </LayoutSidebar>
  );
}
