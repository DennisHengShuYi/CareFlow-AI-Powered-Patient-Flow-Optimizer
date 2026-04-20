import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Building, Calendar } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, useClerk } from '@clerk/clerk-react';
import { useProfile } from '../hooks/useProfile';
import { ShieldCheck } from 'lucide-react';

export default function LayoutSidebar({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { role, profile, loading: profileLoading } = useProfile();

  const allLinks = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['hospital_staff'] },
    { name: 'Patient data', path: '/intake', icon: Users, roles: ['patient'] },
    { name: 'Claims', path: '/claims', icon: FileText, roles: ['hospital_staff'] },
    { name: 'Departments', path: '/departments', icon: Building, roles: ['hospital_staff'] },
    { name: 'Appointments', path: '/appointments', icon: Calendar, roles: ['patient'] },
    { name: 'My Appointments', path: '/my-appointments', icon: Calendar, roles: ['patient'] },
  ];

  // Filter links based on role
  const links = allLinks.filter(link => !link.roles || (role && link.roles.includes(role)));

  return (
    <div className="layout-app">
      {/* ── Sidebar (hidden on mobile, shown on tablet+) ─────── */}
      <aside
        className="sidebar-hide-mobile"
        style={{
          width: 'var(--sidebar-w)',
          minWidth: 'var(--sidebar-w)',
          backgroundColor: 'var(--neutral-100)',
          display: 'flex',
          flexDirection: 'column',
          padding: '2rem 0',
          borderRight: '1px solid var(--neutral-400)',
          transition: 'width 0.3s ease',
        }}
      >
        <div
          style={{ padding: '0 2rem', marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}
          className="center-on-mobile"
        >
          <div style={{ width: '32px', height: '32px', minWidth: '32px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>+</div>
          <Link to="/" style={{ whiteSpace: 'nowrap' }} className="hide-on-mobile">
            <h2 style={{ fontSize: '1.25rem', color: 'var(--secondary)' }}>CareFlow</h2>
            <div style={{ fontSize: '0.65rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Healthcare<br/>Intelligence</div>
          </Link>
        </div>

        {role === 'patient' && (
          <div style={{ padding: '0 1.5rem', marginBottom: '2rem', overflow: 'hidden' }} className="center-on-mobile">
            <Link
              to="/intake"
              className="btn-primary w-full flex items-center justify-center gap-2"
              style={{ borderRadius: '12px', display: 'flex', textDecoration: 'none', whiteSpace: 'nowrap', padding: '0.75rem' }}
            >
              <span style={{ fontSize: '1.25rem' }}>+</span> <span className="hide-on-mobile">New Analysis</span>
            </Link>
          </div>
        )}

        <nav style={{ flex: 1 }}>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {links.map(link => {
              const active = location.pathname === link.path;
              return (
                <li key={link.name}>
                  <Link
                    to={link.path}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem',
                      padding: '1rem 2rem',
                      color: active ? 'var(--secondary)' : 'var(--text-muted)',
                      backgroundColor: active ? 'var(--neutral-200)' : 'transparent',
                      borderRight: active ? '4px solid var(--primary)' : 'none',
                      fontWeight: active ? 600 : 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                    className="center-on-mobile"
                  >
                    <div style={{ minWidth: '20px' }}><link.icon size={20} /></div>
                    <span className="hide-on-mobile">{link.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div style={{ padding: '2rem 1.5rem 0', borderTop: '1px solid var(--neutral-400)', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'hidden' }}>
          <SignedIn>
            <div className="flex items-center gap-3 center-on-mobile">
              <UserButton />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }} className="hide-on-mobile">
                <div className="text-sm font-bold" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile?.full_name || 'Authorized User'}
                </div>
                <div className="text-xs text-muted font-medium flex items-center gap-1">
                  <ShieldCheck size={12} className="text-primary" />
                  {role === 'hospital_staff' ? 'Medical Staff' : 'Patient Account'}
                </div>
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

      {/* ── Main content ──────────────────────────────────────── */}
      <main className="layout-main">
        {children}
      </main>

      {/* ── Mobile Bottom Navigation Bar ─────────────────────── */}
      <nav className="mobile-bottom-nav">
        {links.map(link => {
          const active = location.pathname === link.path;
          return (
            <Link
              key={link.name}
              to={link.path}
              className={active ? 'active' : ''}
            >
              <link.icon size={22} />
              <span>{link.name}</span>
            </Link>
          );
        })}
        <SignedIn>
          {/* This div inherits mobile-bottom-nav > * styles (flex:1, column, center) */}
          <div>
            <UserButton />
            <span>Profile</span>
          </div>
        </SignedIn>
      </nav>
    </div>
  );
}
