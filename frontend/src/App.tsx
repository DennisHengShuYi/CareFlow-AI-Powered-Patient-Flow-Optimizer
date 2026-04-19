import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
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
        <Route path="/" element={<LiveTriage />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/claims" element={<Claims />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/appointments" element={<Appointments />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
