import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { SignIn, SignUp, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import LiveTriage from './pages/LiveTriage';
import Landing from './pages/Landing';
import Claims from './pages/Claims';
import Intake from './pages/Intake';
import Departments from './pages/Departments';
import Appointments from './pages/Appointments';

// A wrapper for protecting routes that require authentication.
// If the user is unauthenticated, they will be instantly redirected to the login page.
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn signInUrl="/sign-in" />
      </SignedOut>
    </>
  );
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
            <div style={{ display: 'flex', width: '100vw', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
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
            <div style={{ display: 'flex', width: '100vw', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
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

        {/* Application Routes - Wrapped in ProtectedRoute to enforce login */}
        <Route path="/" element={<ProtectedRoute><LiveTriage /></ProtectedRoute>} />
        <Route path="/claims" element={<ProtectedRoute><Claims /></ProtectedRoute>} />
        <Route path="/intake" element={<ProtectedRoute><Intake /></ProtectedRoute>} />
        <Route path="/departments" element={<ProtectedRoute><Departments /></ProtectedRoute>} />
        <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
