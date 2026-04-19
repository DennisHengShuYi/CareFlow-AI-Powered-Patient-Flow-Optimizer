import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Building, Calendar, HelpCircle, LogOut } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, useClerk } from '@clerk/clerk-react';

export default function LayoutSidebar({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { signOut } = useClerk();

  const links = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Patient data', path: '/intake', icon: Users },
    { name: 'Claims', path: '/claims', icon: FileText },
    { name: 'Departments', path: '/departments', icon: Building },
    { name: 'Appointments', path: '/appointments', icon: Calendar },
  ];

  return (
    <div className="layout-app">
      <aside style={{
        width: 'var(--sidebar-w)',
        minWidth: 'var(--sidebar-w)',
        backgroundColor: 'var(--neutral-100)',
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem 0',
        borderRight: '1px solid var(--neutral-400)',
        transition: 'width 0.3s ease'
      }}>
        <div style={{ padding: '0 2rem', marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
          <div style={{ width: '32px', height: '32px', minWidth: '32px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>+</div>
          <Link to="/landing" style={{ whiteSpace: 'nowrap' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--secondary)' }}>MediRoute</h2>
            <div style={{ fontSize: '0.65rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Healthcare<br/>Intelligence</div>
          </Link>
        </div>

        <div style={{ padding: '0 1.5rem', marginBottom: '2rem', overflow: 'hidden' }}>
          <Link to="/intake" className="btn-primary w-full flex items-center justify-center gap-2" style={{ borderRadius: '12px', display: 'flex', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '1.25rem' }}>+</span> <span>New Analysis</span>
          </Link>
        </div>

        <nav style={{ flex: 1 }}>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {links.map(link => {
              const active = location.pathname === link.path;
              return (
                <li key={link.name}>
                  <Link to={link.path} style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 2rem',
                    color: active ? 'var(--secondary)' : 'var(--text-muted)',
                    backgroundColor: active ? 'var(--neutral-200)' : 'transparent',
                    borderRight: active ? '4px solid var(--primary)' : 'none',
                    fontWeight: active ? 600 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden'
                  }}>
                    <div style={{ minWidth: '20px' }}><link.icon size={20} /></div>
                    <span>{link.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div style={{ padding: '2rem 1.5rem 0', borderTop: '1px solid var(--neutral-400)', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'hidden' }}>
          <div className="flex-col gap-4 text-sm text-muted font-medium ml-2">
            <Link to="#" className="flex items-center gap-2 hover:text-secondary whitespace-nowrap"><HelpCircle size={18} style={{ minWidth: '18px' }}/> <span>Support</span></Link>
            <SignedIn>
              <button onClick={() => signOut()} className="flex items-center gap-2 hover:text-secondary whitespace-nowrap bg-transparent border-none outline-none cursor-pointer text-muted font-medium" style={{ marginTop: '1rem', padding: 0 }}><LogOut size={18} style={{ minWidth: '18px' }}/> <span>Logout</span></button>
            </SignedIn>
          </div>
          
          <SignedIn>
            <div className="flex items-center gap-3">
              <UserButton />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div className="text-sm font-bold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Authorized User</div>
                <div className="text-xs text-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>System Ready</div>
              </div>
            </div>
          </SignedIn>

          <SignedOut>
            <Link to="/sign-in" className="btn-primary flex items-center justify-center w-full" style={{ borderRadius: '8px', padding: '0.75rem', textDecoration: 'none' }}>
              Sign In
            </Link>
          </SignedOut>
        </div>
      </aside>

      <main className="layout-main">
        {children}
      </main>
    </div>
  );
}
