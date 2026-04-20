import LayoutSidebar from '../components/LayoutSidebar';
import { Archive, Search, Filter, Clock } from 'lucide-react';

export default function Archives() {
  const mockArchives = [
    { id: 'a1', patientName: 'John Doe', caseType: 'General Consultation', date: '2024-03-15', status: 'Archived' },
    { id: 'a2', patientName: 'Jane Smith', caseType: 'Dermatology Review', date: '2024-03-10', status: 'Closed' },
  ];

  return (
    <LayoutSidebar>
      <div style={{ padding: 'var(--page-padding)', backgroundColor: 'var(--neutral-300)', minHeight: '100%' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Archives</h1>
          <p style={{ color: 'var(--text-muted)' }}>Search and retrieve historical patient records and closed cases.</p>
        </header>

        <div className="card" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search by patient name, case ID, or date..." 
              style={{ 
                width: '100%', 
                padding: '0.75rem 1rem 0.75rem 2.5rem', 
                borderRadius: '12px', 
                border: '1px solid var(--neutral-400)',
                backgroundColor: 'var(--neutral-200)',
                outline: 'none'
              }} 
            />
          </div>
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={18} /> Filter
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: 'var(--neutral-200)', textAlign: 'left' }}>
              <tr>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Patient Name</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Case Type</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Archived Date</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '1rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {mockArchives.map(item => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--neutral-400)' }}>
                  <td style={{ padding: '1rem', fontWeight: 700 }}>{item.patientName}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{item.caseType}</td>
                  <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={14} /> {item.date}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ backgroundColor: 'var(--neutral-400)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button style={{ color: 'var(--primary)', fontWeight: 700 }}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </LayoutSidebar>
  );
}
