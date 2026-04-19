import LayoutSidebar from '../components/LayoutSidebar';
import { Video, Stethoscope } from 'lucide-react';

export default function Appointments() {
  return (
    <LayoutSidebar>
      <div style={{ padding: '3rem 4rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Appointments</h1>
          <p style={{ color: 'var(--text-muted)' }}>Real-time slot matching across GPs, specialists, and telehealth.</p>
        </div>

        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px', background: 'var(--neutral-200)', padding: '1.5rem', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '1.5rem' }}><Stethoscope size={18} color="var(--primary)"/> General Practice</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>09:00 AM</button>
                <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>10:30 AM</button>
                <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>11:45 AM</button>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: '300px', background: 'var(--neutral-200)', padding: '1.5rem', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '1.5rem' }}><Video size={18} color="var(--tertiary)"/> Telehealth</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>01:15 PM</button>
                <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>02:30 PM</button>
                <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>04:00 PM</button>
              </div>
            </div>
          </div>
          
          <div style={{ background: 'var(--neutral-300)', padding: '1.5rem', borderRadius: '12px', flex: 1 }}>
            <h3 style={{ fontWeight: 700, marginBottom: '1rem' }}>Integrated Clinic Scheduling System</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Automated synchronization with backend provider calendars is active. No-show probability and real-time slot matching are continuously updating.</p>
          </div>
        </div>
      </div>
    </LayoutSidebar>
  );
}
