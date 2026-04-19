import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import LayoutSidebar from '../components/LayoutSidebar';
import { LayoutGrid, Pencil } from 'lucide-react';
import { capacityRoomStyle } from '../utils/capacityRoomStyle';

const API = 'http://127.0.0.1:8000';

type Layout = {
  departments: { id: string; name: string }[];
  doctors: { id: string; name: string; department_id: string }[];
  rooms: { id: string; department_id: string; label: string; doctor_id: string | null }[];
};

export default function Departments() {
  const [tab, setTab] = useState<'board' | 'manage'>('board');
  const [layout, setLayout] = useState<Layout | null>(null);
  const [board, setBoard] = useState<{ departments: any[] } | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [newRoomLabel, setNewRoomLabel] = useState('');
  const [newRoomDeptId, setNewRoomDeptId] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocDeptId, setNewDocDeptId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    return Promise.all([
      fetch(`${API}/api/capacity/layout`).then((r) => r.json()),
      fetch(`${API}/api/capacity/board`).then((r) => r.json()),
    ])
      .then(([l, b]) => {
        setLayout(l);
        setBoard(b);
        setError(null);
      })
      .catch(() => setError('Could not reach API. Is the backend running?'));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!layout?.departments?.length) return;
    setNewRoomDeptId((prev) => (prev ? prev : layout.departments[0].id));
    setNewDocDeptId((prev) => (prev ? prev : layout.departments[0].id));
  }, [layout]);

  const addDepartment = async () => {
    if (!newDeptName.trim()) return;
    const res = await fetch(`${API}/api/capacity/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDeptName.trim() }),
    });
    const j = await res.json();
    if (j.layout) {
      setLayout(j.layout);
      setNewDeptName('');
    }
    refresh();
  };

  const addRoom = async () => {
    if (!newRoomLabel.trim() || !newRoomDeptId) return;
    await fetch(`${API}/api/capacity/departments/${newRoomDeptId}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newRoomLabel.trim() }),
    });
    setNewRoomLabel('');
    refresh();
  };

  const addDoctor = async () => {
    if (!newDocName.trim() || !newDocDeptId) return;
    await fetch(`${API}/api/capacity/doctors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDocName.trim(), department_id: newDocDeptId }),
    });
    setNewDocName('');
    refresh();
  };

  const parseApiError = async (res: Response) => {
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') return j.detail;
      if (Array.isArray(j.detail)) return j.detail.map((x: { msg?: string }) => x.msg || JSON.stringify(x)).join('; ');
      if (j.error) return j.error;
    } catch {
      /* ignore */
    }
    return `Request failed (${res.status})`;
  };

  const assignDoctorToRoom = async (roomId: string, doctorId: string | '') => {
    try {
      const res = await fetch(`${API}/api/capacity/rooms/${roomId}/doctor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id: doctorId || null }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        await refresh();
        setError(msg);
        return;
      }
      setError(null);
      await refresh();
    } catch {
      await refresh();
      setError('Could not save room assignment. Check the API and try again.');
    }
  };

  const doctorsInDept = (deptId: string) => layout?.doctors.filter((d) => d.department_id === deptId) || [];
  const roomsInDept = (deptId: string) => layout?.rooms.filter((r) => r.department_id === deptId) || [];

  const otherRoomLabelForDoctor = (docId: string, excludeRoomId: string) => {
    if (!layout) return null;
    const r = layout.rooms.find((x) => x.id !== excludeRoomId && x.doctor_id === docId);
    return r?.label ?? null;
  };

  return (
    <LayoutSidebar>
      <div style={{ padding: '2rem 3rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <header style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>Departments & Capacity</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', maxWidth: '720px' }}>
            Manage departments, rooms, and clinicians. The live board stays in sync with the{' '}
            <Link to="/" style={{ color: 'var(--primary)', fontWeight: 700 }}>dashboard Capacity tab</Link> and triage patient assignments.
          </p>
          <div style={{ display: 'inline-flex', background: 'var(--neutral-200)', borderRadius: '12px', padding: '4px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setTab('board')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1.25rem',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.875rem',
                background: tab === 'board' ? 'white' : 'transparent',
                color: tab === 'board' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: tab === 'board' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <LayoutGrid size={16} /> Live board
            </button>
            <button
              type="button"
              onClick={() => setTab('manage')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1.25rem',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.875rem',
                background: tab === 'manage' ? 'white' : 'transparent',
                color: tab === 'manage' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: tab === 'manage' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <Pencil size={16} /> Manage
            </button>
          </div>
        </header>

        {error && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: '#fecaca', background: '#fff5f5', color: '#991b1b' }}>
            {error}
          </div>
        )}

        {tab === 'board' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {(board?.departments || []).map((dept: any) => (
              <div key={dept.id} className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>{dept.name}</h2>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    In session {dept.metrics?.rooms_occupied ?? 0} · Waiting list {dept.metrics?.rooms_with_queue ?? 0} · Staffed open{' '}
                    {dept.metrics?.rooms_ready ?? 0} · Doctors in consult {dept.metrics?.doctors_in_consult ?? 0}/{dept.metrics?.doctors_total ?? 0}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {(dept.rooms || []).map((room: any) => {
                    const rs = capacityRoomStyle(room.state);
                    return (
                      <div key={room.id} style={{ border: '1px solid var(--neutral-400)', borderRadius: '10px', padding: '0.85rem', background: rs.bg }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 800 }}>{room.label}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: rs.color }}>{rs.label}</div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', maxWidth: '120px' }}>{rs.hint}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                          {room.doctor_name || 'No clinician assigned'}
                        </div>
                        {room.in_consult?.length > 0 && (
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>In session</div>
                        )}
                        {room.in_consult?.map((p: any) => (
                          <div key={p.id} style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                            {p.name} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({p.status})</span>
                          </div>
                        ))}
                        {room.queue?.length > 0 && (
                          <>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', margin: '0.35rem 0 0.25rem' }}>Waiting</div>
                            <ol style={{ margin: 0, paddingLeft: '1rem', fontSize: '0.8rem', fontWeight: 600 }}>
                              {room.queue.map((p: any) => (
                                <li key={p.id}>
                                  {p.name} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({p.status})</span>
                                </li>
                              ))}
                            </ol>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'manage' && layout && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <section className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Add department</h3>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="e.g. Department of Pediatricians"
                  style={{ flex: '1 1 280px', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--neutral-400)', fontSize: '0.9rem' }}
                />
                <button type="button" className="btn-primary" style={{ padding: '0.65rem 1.25rem', fontWeight: 700 }} onClick={addDepartment}>
                  Add department
                </button>
              </div>
            </section>

            {layout.departments.map((dept) => (
              <section key={dept.id} className="card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.25rem' }}>{dept.name}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Rooms and doctors listed for this department.</p>

                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Doctors</h4>
                <ul style={{ margin: '0 0 1rem 1rem', fontSize: '0.9rem' }}>
                  {doctorsInDept(dept.id).map((doc) => (
                    <li key={doc.id}>{doc.name}</li>
                  ))}
                  {doctorsInDept(dept.id).length === 0 && <li style={{ color: 'var(--text-muted)' }}>No doctors yet</li>}
                </ul>

                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Rooms & assignment</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', maxWidth: '720px' }}>
                  Each clinician can only be assigned to one room. Choosing someone who is already in another room moves them here automatically.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {roomsInDept(dept.id).map((room) => (
                    <div
                      key={room.id}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        alignItems: 'center',
                        padding: '0.65rem 0.85rem',
                        background: 'var(--neutral-100)',
                        borderRadius: '8px',
                        border: '1px solid var(--neutral-400)',
                      }}
                    >
                      <span style={{ fontWeight: 700, minWidth: '88px' }}>{room.label}</span>
                      <select
                        value={room.doctor_id || ''}
                        onChange={(e) => assignDoctorToRoom(room.id, e.target.value)}
                        style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--neutral-400)', fontSize: '0.85rem', minWidth: '200px' }}
                      >
                        <option value="">No clinician</option>
                        {doctorsInDept(dept.id).map((doc) => {
                          const fromRoom = otherRoomLabelForDoctor(doc.id, room.id);
                          return (
                            <option key={doc.id} value={doc.id}>
                              {doc.name}
                              {fromRoom ? ` (moves from ${fromRoom})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ))}
                  {roomsInDept(dept.id).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No rooms yet — add one below.</div>}
                </div>
              </section>
            ))}

            <section className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Add room</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  value={newRoomDeptId}
                  onChange={(e) => setNewRoomDeptId(e.target.value)}
                  style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--neutral-400)' }}
                >
                  {layout.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newRoomLabel}
                  onChange={(e) => setNewRoomLabel(e.target.value)}
                  placeholder="Room label (e.g. Room 4)"
                  style={{ flex: '1 1 200px', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--neutral-400)' }}
                />
                <button type="button" className="btn-primary" style={{ padding: '0.65rem 1.25rem', fontWeight: 700 }} onClick={addRoom}>
                  Add room
                </button>
              </div>
            </section>

            <section className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>Add doctor</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                <select
                  value={newDocDeptId}
                  onChange={(e) => setNewDocDeptId(e.target.value)}
                  style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid var(--neutral-400)' }}
                >
                  {layout.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  placeholder="e.g. Dr. Abc"
                  style={{ flex: '1 1 200px', padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--neutral-400)' }}
                />
                <button type="button" className="btn-primary" style={{ padding: '0.65rem 1.25rem', fontWeight: 700 }} onClick={addDoctor}>
                  Add doctor
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </LayoutSidebar>
  );
}
