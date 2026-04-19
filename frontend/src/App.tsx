import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { SignIn, SignUp } from '@clerk/clerk-react';
import LiveTriage from './pages/LiveTriage';
import Landing from './pages/Landing';
import Claims from './pages/Claims';
import Intake from './pages/Intake';
import Departments from './pages/Departments';
import Appointments from './pages/Appointments';

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
            <div className="flex h-screen w-full items-center justify-center bg-gray-50">
              <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/" />
            </div>
          } 
        />
        <Route 
          path="/sign-up/*" 
          element={
            <div className="flex h-screen w-full items-center justify-center bg-gray-50">
              <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
            </div>
          } 
        />

        {/* Application Routes - You can optionally wrap these with <SignedIn> to protect them */}
        <Route path="/" element={<LiveTriage />} />
        <Route path="/claims" element={<Claims />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/appointments" element={<Appointments />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
