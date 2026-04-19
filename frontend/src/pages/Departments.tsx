import LayoutSidebar from '../components/LayoutSidebar';

export default function Departments() {
  return (
    <LayoutSidebar>
      <div style={{ padding: '3rem 4rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '2rem' }}>Departments</h1>
        <p style={{ color: 'var(--text-muted)' }}>Department analytics and cross-functional capacity utilization will be routed here.</p>
      </div>
    </LayoutSidebar>
  );
}
