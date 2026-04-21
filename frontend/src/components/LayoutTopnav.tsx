import { Link, useLocation } from 'react-router-dom';

export default function LayoutTopnav({ children, pageType = 'default' }: { children: React.ReactNode, pageType?: 'default' | 'patient' }) {
  const location = useLocation();

  const links = [
    { name: 'Clinical Insights', path: '/' },
    { name: 'Patient Flow', path: '/intake' },
    { name: 'Analytics', path: '/landing' },
    { name: 'Reports', path: '/claims' }
  ];

  return (
    <div className="layout-app flex-col" style={{ backgroundColor: 'var(--neutral-100)' }}>
      <header className="topnav-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>+</div>
          <Link to="/landing"><h2 style={{ fontSize: '1.25rem', color: 'var(--secondary)' }}>MediRoute</h2></Link>
        </div>

        {pageType === 'default' && (
          <nav className="topnav-links">
            <ul>
              {links.map(link => {
                const active = location.pathname === link.path;
                return (
                  <li key={link.name}>
                    <Link to={link.path} style={{
                      color: active ? 'var(--secondary)' : 'var(--text-muted)',
                      fontWeight: active ? 600 : 500,
                      paddingBottom: '0.25rem',
                      borderBottom: active ? '2px solid var(--secondary)' : 'none'
                    }}>
                      {link.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="topnav-actions">
          {pageType === 'default' ? (
            <>
              <button className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>Help</button>
              <button className="btn-primary" style={{ padding: '0.5rem 1.25rem' }}>Emergency Alert</button>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#eee' }}></div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', background: 'var(--neutral-300)', borderRadius: '9999px', padding: '0.25rem' }}>
                <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>EN</button>
                <button style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', color: 'var(--text-muted)' }}>BM</button>
              </div>
              <button className="btn-secondary flex items-center gap-2" style={{ padding: '0.5rem 1rem' }}>
                <span>✕</span> Save & Exit
              </button>
            </>
          )}
        </div>
      </header>

      <main className="layout-main" style={{ backgroundColor: 'var(--neutral-200)' }}>
        {children}
      </main>
    </div>
  );
}
