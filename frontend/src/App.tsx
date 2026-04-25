import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, SignUp, RedirectToSignIn, useUser } from '@clerk/clerk-react';
import LiveTriage from './pages/LiveTriage';
import Landing from './pages/Landing';
import Claims from './pages/Claims';
import Intake from './pages/Intake';
import Departments from './pages/Departments';
import Appointments from './pages/Appointments';
import MyAppointments from './pages/MyAppointments';
import MyCases from './pages/MyCases';
import NearbyFacilities from './pages/NearbyFacilities';
import Patients from './pages/Patients';
import CaseDetails from './pages/CaseDetails';
import History from './pages/History';
import Onboarding from './pages/Onboarding';
import { useProfile } from './hooks/useProfile';
import { Loader2 } from 'lucide-react';

// A dispatcher component for the root path '/'
function HomeDispatcher() {
  const { role, loading } = useProfile();

  if (loading) {
    return (
      <div style={{ height: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
        <Loader2 size={40} className="animate-spin text-primary" />
      </div>
    );
  }

  if (role === 'patient') {
    return <Navigate to="/intake" replace />;
  }

  return <LiveTriage />;
}

// A wrapper for protecting routes that require authentication.
function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { role, profile, loading: profileLoading } = useProfile();

  // If still loading Clerk or Supabase profile
  if (!isLoaded || (isSignedIn && profileLoading)) {
    return (
      <div style={{ height: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
        <Loader2 size={40} className="animate-spin text-primary" />
      </div>
    );
  }

  // If not signed in at all
  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  // If signed in but no profile (hasn't picked a role)
  if (isSignedIn && !profile && !profileLoading) {
    const isAtOnboarding = window.location.pathname === '/onboarding';
    if (!isAtOnboarding) {
      return <Navigate to="/onboarding" />;
    }
  }

  // Role-based access control
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect to their respective home if they try to access a forbidden page
    return <Navigate to={role === 'patient' ? '/intake' : '/'} replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/landing" element={<Landing />} />

        {/* Authentication Routes */}
        <Route
          path="/sign-in/*"
          element={
            <div style={{ display: 'flex', width: '100%', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
              <SignIn
                routing="path"
                path="/sign-in"
                signUpUrl="/sign-up"
                forceRedirectUrl="/"
                appearance={{
                  variables: {
                    colorPrimary: '#1E88E5',
                    colorText: '#151c22',
                    colorBackground: '#ffffff',
                    fontFamily: '"Inter", sans-serif',
                  },
                  elements: {
                    card: {
                      boxShadow: '0 20px 40px rgba(227, 242, 253, 0.8)',
                      border: '1px solid var(--neutral-400)',
                      borderRadius: '1rem',
                    },
                    formButtonPrimary: {
                      backgroundColor: '#1E88E5',
                      background: 'linear-gradient(90deg, #1E88E5, #0D47A1)',
                      boxShadow: '0 4px 12px rgba(30, 136, 229, 0.3)',
                    }
                  }
                }}
              />
            </div>
          }
        />
        <Route
          path="/sign-up/*"
          element={
            <div style={{ display: 'flex', width: '100%', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
              <SignUp
                routing="path"
                path="/sign-up"
                signInUrl="/sign-in"
                forceRedirectUrl="/"
                appearance={{
                  variables: {
                    colorPrimary: '#1E88E5',
                    colorText: '#151c22',
                    colorBackground: '#ffffff',
                    fontFamily: '"Inter", sans-serif',
                  },
                  elements: {
                    card: {
                      boxShadow: '0 20px 40px rgba(227, 242, 253, 0.8)',
                      border: '1px solid var(--neutral-400)',
                      borderRadius: '1rem',
                    },
                    formButtonPrimary: {
                      backgroundColor: '#1E88E5',
                      background: 'linear-gradient(90deg, #1E88E5, #0D47A1)',
                      boxShadow: '0 4px 12px rgba(30, 136, 229, 0.3)',
                    }
                  }
                }}
              />
            </div>
          }
        />

        {/* Application Routes - Wrapped in ProtectedRoute to enforce login and roles */}
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

        {/* Hospital Staff Routes */}
        <Route path="/" element={<ProtectedRoute allowedRoles={['hospital_staff']}><HomeDispatcher /></ProtectedRoute>} />
        <Route path="/claims" element={<ProtectedRoute allowedRoles={['hospital_staff']}><Claims /></ProtectedRoute>} />
        <Route path="/patients" element={<ProtectedRoute allowedRoles={['hospital_staff']}><Patients /></ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute allowedRoles={['hospital_staff']}><CaseDetails /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute allowedRoles={['hospital_staff']}><History /></ProtectedRoute>} />

        {/* Patient Routes */}
        <Route path="/intake" element={<ProtectedRoute allowedRoles={['patient']}><Intake /></ProtectedRoute>} />
        <Route path="/departments" element={<ProtectedRoute allowedRoles={['hospital_staff']}><Departments /></ProtectedRoute>} />
        <Route path="/nearby-facilities" element={<ProtectedRoute allowedRoles={['patient']}><NearbyFacilities /></ProtectedRoute>} />
        <Route path="/appointments" element={<ProtectedRoute allowedRoles={['patient']}><Appointments /></ProtectedRoute>} />
        <Route path="/my-appointments" element={<ProtectedRoute allowedRoles={['patient']}><MyAppointments /></ProtectedRoute>} />
        <Route path="/my-cases" element={<ProtectedRoute allowedRoles={['patient']}><MyCases /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
