import LayoutSidebar from '../components/LayoutSidebar';

export default function Departments() {
  return (
    <LayoutSidebar>
      <div className="responsive-padding">
        <h1 style={{ fontSize: 'var(--font-h1)', fontWeight: 800, marginBottom: '2rem' }}>Departments</h1>
        <p style={{ color: 'var(--text-muted)' }}>Department analytics and cross-functional capacity utilization will be routed here.</p>
      </div>
    </LayoutSidebar>
  );
}
