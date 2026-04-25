import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import LayoutSidebar from '../components/LayoutSidebar';
import {
  LayoutGrid,
  Pencil,
  Plus,
  Loader2,
  Hospital as HospitalIcon,
  Users,
  CheckCircle,
  XCircle,
  Trash2,
  AlertCircle,
  ChevronDown,
  Clock,
  BookOpen,
  Star,
} from "lucide-react";
import { capacityRoomStyle } from '../utils/capacityRoomStyle';

const API = 'http://127.0.0.1:8002';

const HOSPITAL_DEPARTMENTS = [
  // Core Clinical
  'Emergency Department',
  'General Medicine',
  'Pediatrics',
  'Obstetrics & Gynecology',
  'General Surgery',
  'Cardiology',
  'Orthopedics',
  // Specialized
  'Oncology',
  'Neurology',
  'Psychiatry',
  'Dermatology',
  'Gastroenterology',
  'Urology',
  // Support & Diagnostics
  'Radiology',
  'Pathology / Laboratory',
  'Pharmacy',
  'Rehabilitation / Physiotherapy',
  // Critical Care
  'Intensive Care Unit (ICU)',
  'Neonatal ICU (NICU)',
  'Operating Theater',
  // Primary Care
  'General Practice (GP)',
  'Dental Clinic',
  'Ophthalmology',
  'ENT (Ear, Nose & Throat)',
];

type CatalogDept = { id: string; name: string };
type CatalogDoctor = { id: string; name: string };

type BoardData = {
  departments: any[];
  catalog?: {
    departments: CatalogDept[];
    doctors: CatalogDoctor[];
  };
};

type Toast = { type: 'success' | 'error'; message: string };

export default function Departments() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<'board' | 'manage'>('board');
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Manage forms (add section)
  const [newDeptName, setNewDeptName] = useState('');
  const [newRoomLabel, setNewRoomLabel] = useState('');
  const [newRoomDeptId, setNewRoomDeptId] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocDeptId, setNewDocDeptId] = useState('');
  const [newDocRoomId, setNewDocRoomId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit/Delete state
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Derived: rooms belonging to the selected department for the doctor form
  const availableRoomsForDoctor = newDocDeptId
    ? (board?.departments || []).find((d: any) => d.id === newDocDeptId)?.rooms || []
    : [];

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/capacity/board`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch board');
      const data = await res.json();
      setBoard(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Could not reach clinical state. Ensure you are linked to a hospital.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const addDepartment = async () => {
    if (!newDeptName.trim()) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/admin/departments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newDeptName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const dept = await res.json();
      setNewDeptName('');
      showToast('success', `Department "${dept.name}" created successfully.`);
      await refresh();
    } catch (err: any) {
      showToast('error', `Failed to add department: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const addRoom = async () => {
    if (!newRoomLabel.trim() || !newRoomDeptId) {
      showToast('error', 'Please select a department and enter a room label.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/admin/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ label: newRoomLabel.trim(), department_id: newRoomDeptId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const room = await res.json();
      setNewRoomLabel('');
      setNewRoomDeptId('');
      showToast('success', `Room "${room.label}" registered successfully.`);
      await refresh();
    } catch (err: any) {
      showToast('error', `Failed to add room: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const addDoctor = async () => {
    if (!newDocName.trim() || !newDocDeptId) {
      showToast(
        "error",
        "Please select a department and enter the clinician name.",
      );
      return;
    }

    setSubmitting(true);
    try {
      // Logic: Get the text name of the selected department to store as the specialty
      const selectedDept = deptOptions.find((d) => d.id === newDocDeptId);
      const specialtyValue = selectedDept ? selectedDept.name : null;
      const token = await getToken();
      const res = await fetch(`${API}/api/admin/doctors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newDocName.trim(),
          department_id: newDocDeptId,
          room_id: newDocRoomId || null,
          specialty: specialtyValue, // Using the department name value here
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to onboard");
      }

      setNewDocName("");
      setNewDocDeptId("");
      setNewDocRoomId("");
      showToast("success", "Clinician onboarded successfully.");
      await refresh();
    } catch (err: any) {
      showToast('error', `Failed to onboard clinician: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const updateDoctorRoom = async (doctorId: string, roomId: string | null) => {
    try {
      const token = await getToken();

      // 1. Conflict Check: See if this room is already taken by someone else
      if (roomId) {
        let existingDocName = "";

        // Search through the current board data to find if the room has a doctor
        for (const dept of board?.departments || []) {
          const targetRoom = dept.rooms?.find(
            (r: any) => String(r.id) === String(roomId),
          );

          // If room is found and it's assigned to a DIFFERENT doctor
          if (
            targetRoom?.doctor_id &&
            String(targetRoom.doctor_id) !== String(doctorId)
          ) {
            // Find that doctor's name in the department list
            const otherDoc = dept.doctors?.find(
              (d: any) => String(d.id) === String(targetRoom.doctor_id),
            );
            existingDocName = otherDoc?.full_name || "another clinician";
            break;
          }
        }

        // If occupied, ask for permission to "kick them out"
        if (existingDocName) {
          const proceed = window.confirm(
            `This room is currently assigned to ${existingDocName}. \n\nDo you want to move ${existingDocName} to the lobby and reassign this room?`,
          );
          if (!proceed) return; // User cancelled
        }
      }

      // 2. Cleanup: Remove the current doctor (doctorId) from any room they currently occupy
      // This prevents a doctor from being in two rooms at once.
      for (const dept of board?.departments || []) {
        for (const r of dept.rooms || []) {
          if (String(r.doctor_id) === String(doctorId)) {
            await fetch(`${API}/api/admin/rooms/${r.id}/assign`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ doctor_id: null }),
            });
          }
        }
      }

      // 3. Assignment: Assign the doctor to the new room
      // Note: The backend will automatically handle removing the PREVIOUS doctor
      // from this roomId when you send the new doctorId.
      if (roomId) {
        const res = await fetch(`${API}/api/admin/rooms/${roomId}/assign`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            doctor_id: doctorId,
          }),
        });

        if (!res.ok) throw new Error("Failed to assign room");
      }

      showToast(
        "success",
        roomId ? "Clinician reassigned" : "Clinician moved to lobby",
      );
      await refresh();
    } catch (err: any) {
      console.error(err);
      showToast("error", "Update failed: " + err.message);
    }
  };

  const deleteDoctor = async (doctorId: string, doctorName: string) => {
    if (!confirm(`Delete clinician "${doctorName}"?`)) return;
    try {
      const token = await getToken();
      // Note: You may need to add a DELETE /api/admin/doctors/{id} endpoint
      // For now, using the supabase REST delete endpoint
      const res = await fetch(`${API}/api/admin/doctors/${doctorId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast('success', `Clinician "${doctorName}" deleted.`);
      await refresh();
    } catch (err) {
      showToast('error', 'Failed to delete clinician.');
    }
  };

  const deleteRoom = async (roomId: string, roomLabel: string) => {
    if (!confirm(`Delete room "${roomLabel}"?`)) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/admin/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast('success', `Room "${roomLabel}" deleted.`);
      await refresh();
    } catch (err) {
      showToast('error', 'Failed to delete room.');
    }
  };

  const deleteDepartment = async (deptId: string, deptName: string) => {
    if (!confirm(`Delete department "${deptName}" and all its rooms/doctors?`)) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/admin/departments/${deptId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Delete failed');
      showToast('success', `Department "${deptName}" deleted.`);
      await refresh();
    } catch (err) {
      showToast('error', 'Failed to delete department.');
    }
  };

  // Use catalog departments (has id+name) for the manage dropdowns
  const deptOptions: CatalogDept[] = board?.catalog?.departments || [];

  if (loading && !board) {
    return (
      <LayoutSidebar>
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 className="animate-spin" size={32} color="var(--primary)" />
        </div>
      </LayoutSidebar>
    );
  }

  return (
    <LayoutSidebar>
      <div
        className="responsive-padding departments-page"
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: "fixed",
              top: "1.5rem",
              right: "1.5rem",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              background: toast.type === "success" ? "#f0fdf4" : "#fff5f5",
              border: `1px solid ${toast.type === "success" ? "#bbf7d0" : "#fecaca"}`,
              color: toast.type === "success" ? "#166534" : "#991b1b",
              padding: "0.875rem 1.25rem",
              borderRadius: "12px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              maxWidth: "400px",
              fontWeight: 600,
              fontSize: "0.9rem",
              animation: "fadeIn 0.2s ease",
            }}
          >
            {toast.type === "success" ? (
              <CheckCircle size={18} style={{ flexShrink: 0 }} />
            ) : (
              <XCircle size={18} style={{ flexShrink: 0 }} />
            )}
            {toast.message}
          </div>
        )}

        <header style={{ marginBottom: "2rem" }}>
          <h1
            style={{
              fontSize: "2.25rem",
              fontWeight: 800,
              marginBottom: "0.5rem",
            }}
          >
            Departments & Capacity
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              marginBottom: "1.25rem",
              maxWidth: "720px",
            }}
          >
            Manage real-time clinical flow. Add doctors, allocate rooms, and
            track patient movement across your hospital.
          </p>

          <div
            className="departments-tab-toggle"
            style={{
              display: "inline-flex",
              background: "var(--neutral-200)",
              borderRadius: "12px",
              padding: "4px",
              gap: "4px",
            }}
          >
            <button
              onClick={() => setTab("board")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1.25rem",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.875rem",
                background: tab === "board" ? "white" : "transparent",
                color: tab === "board" ? "var(--primary)" : "var(--text-muted)",
                boxShadow:
                  tab === "board" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <LayoutGrid size={16} /> Live board
            </button>
            <button
              onClick={() => setTab("manage")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1.25rem",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.875rem",
                background: tab === "manage" ? "white" : "transparent",
                color:
                  tab === "manage" ? "var(--primary)" : "var(--text-muted)",
                boxShadow:
                  tab === "manage" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <Pencil size={16} /> Configuration
            </button>
          </div>
        </header>

        {error && (
          <div
            className="card"
            style={{
              padding: "1rem",
              marginBottom: "1.5rem",
              borderColor: "#fecaca",
              background: "#fff5f5",
              color: "#991b1b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{error}</span>
            <button
              onClick={refresh}
              className="btn-primary"
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem" }}
            >
              Retry
            </button>
          </div>
        )}

        {tab === "board" && (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            {(board?.departments || []).length === 0 ? (
              <div
                className="card"
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                <HospitalIcon
                  size={48}
                  style={{ marginBottom: "1rem", opacity: 0.3 }}
                />
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: "1.1rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  No departments yet
                </p>
                <p style={{ fontSize: "0.9rem" }}>
                  Switch to <strong>Configuration</strong> to create your first
                  department.
                </p>
              </div>
            ) : (
              (board?.departments || []).map((dept: any) => (
                <div
                  key={dept.id}
                  className="card"
                  style={{ padding: "1.5rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "1rem",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <h2
                      style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}
                    >
                      {dept.name}
                    </h2>

                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        display: "flex",
                        gap: "1rem",
                        flexWrap: "wrap", // from main
                      }}
                    >
                      <span>
                        Rooms: {dept.metrics?.rooms_occupied}/
                        {dept.metrics?.rooms_total}
                      </span>

                      <span>
                        Clinicians: {dept.metrics?.doctors_in_consult}/
                        {dept.metrics?.doctors_total}
                      </span>

                      <span style={{ color: "var(--primary)" }}>
                        Avg Appt Usage:{" "}
                        {dept.metrics?.total_appointment_usage || 0}m
                      </span>
                    </div>
                  </div>

                  {(dept.rooms || []).length === 0 ? (
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.875rem",
                        fontStyle: "italic",
                      }}
                    >
                      No rooms in this department yet.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: "1rem",
                      }}
                    >
                      {(dept.rooms || []).map((room: any) => {
                        const rs = capacityRoomStyle(room.state);
                        return (
                          <div
                            key={room.id}
                            style={{
                              border: "1px solid var(--neutral-400)",
                              borderRadius: "12px",
                              padding: "1.25rem",
                              background: rs.bg,
                              transition: "all 0.2s",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "0.75rem",
                              }}
                            >
                              <span
                                style={{ fontWeight: 850, fontSize: "1.1rem" }}
                              >
                                {room.label}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 900,
                                  color: rs.color,
                                  textTransform: "uppercase",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  background: "rgba(255,255,255,0.5)",
                                }}
                              >
                                {rs.label}
                              </span>
                            </div>

                            <div
                              style={{
                                fontSize: "0.9rem",
                                marginBottom: "0.5rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                color: room.doctor_name
                                  ? "var(--text-main)"
                                  : "var(--text-muted)",
                              }}
                            >
                              <Users size={14} />{" "}
                              {room.doctor_name || "Unstaffed"}
                            </div>

                            <div style={{ fontSize: '0.8rem', display: 'flex', gap: '0.75rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }} title="Total appointment minutes">
                                <Clock size={12} /> {room.usage_minutes || 0}m usage
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }} title="Scheduled future appointments">
                                <BookOpen size={12} /> {room.appointment_count || 0} appts
                              </span>
                              {dept.rooms.length > 1 && room.usage_minutes === Math.min(...dept.rooms.map((r: any) => r.usage_minutes || 0)) && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#f57c00', fontWeight: 800 }}>
                                  <Star size={12} fill="#f57c00" /> Next in rotation
                                </span>
                              )}
                            </div>

                            {room.in_consult?.length > 0 && (
                              <div
                                style={{
                                  background: "white",
                                  borderRadius: "8px",
                                  padding: "0.75rem",
                                  marginTop: "0.5rem",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 800,
                                    color: "var(--primary)",
                                    marginBottom: "0.5rem",
                                    opacity: 0.7,
                                  }}
                                >
                                  ACTIVE PATIENT
                                </div>
                                {room.in_consult.map((p: any) => (
                                  <div
                                    key={p.id}
                                    style={{
                                      fontWeight: 700,
                                      fontSize: "0.95rem",
                                    }}
                                  >
                                    {p.name}
                                  </div>
                                ))}
                              </div>
                            )}

                            {room.queue?.length > 0 && (
                              <div style={{ marginTop: "0.75rem" }}>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 800,
                                    color: "var(--text-muted)",
                                    marginBottom: "0.5rem",
                                  }}
                                >
                                  QUEUED ({room.queue.length})
                                </div>
                                {room.queue.map((p: any) => (
                                  <div
                                    key={p.id}
                                    style={{
                                      fontSize: "0.85rem",
                                      fontWeight: 600,
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    • {p.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "manage" && (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "2rem",
            }}
          >
            {/* ============= UPPER SECTION: EDIT & DELETE ============= */}
            <section
              style={{
                borderBottom: "2px solid var(--neutral-300)",
                paddingBottom: "2rem",
              }}
            >
              <h2
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <Pencil size={24} color="var(--primary)" /> Edit & Delete
              </h2>

              {(board?.departments || []).length === 0 ? (
                <div
                  className="card"
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--text-muted)",
                  }}
                >
                  <p style={{ fontWeight: 600 }}>
                    No departments yet. Create one in the <strong>Add</strong>{" "}
                    section below.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {(board?.departments || []).map((dept: any) => (
                    <div
                      key={dept.id}
                      className="card"
                      style={{ padding: "1.25rem" }}
                    >
                      <button
                        onClick={() =>
                          setExpandedDeptId(
                            expandedDeptId === dept.id ? null : dept.id,
                          )
                        }
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: "inherit",
                        }}
                      >
                        <h3
                          style={{
                            fontSize: "1.15rem",
                            fontWeight: 800,
                            margin: 0,
                          }}
                        >
                          {dept.name}
                        </h3>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                          }}
                        >
                          {dept.rooms?.length || 0} rooms •{" "}
                          {dept.doctors?.length || 0} clinicians
                        </div>
                      </button>

                      {expandedDeptId === dept.id && (
                        <div
                          style={{
                            marginTop: "1.25rem",
                            paddingTop: "1.25rem",
                            borderTop: "1px solid var(--neutral-300)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "1rem",
                          }}
                        >
                          {/* Rooms */}
                          {dept.rooms?.length > 0 && (
                            <div>
                              <h4
                                style={{
                                  fontSize: "0.95rem",
                                  fontWeight: 700,
                                  color: "var(--primary)",
                                  marginBottom: "0.75rem",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                Rooms
                              </h4>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fill, minmax(250px, 1fr))",
                                  gap: "0.75rem",
                                }}
                              >
                                {dept.rooms.map((room: any) => (
                                  <div
                                    key={room.id}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "0.75rem",
                                      background: "#f9fafb",
                                      borderRadius: "8px",
                                      border: "1px solid var(--neutral-300)",
                                    }}
                                  >
                                    <span style={{ fontWeight: 600 }}>
                                      {room.label}
                                    </span>
                                    <button
                                      onClick={() =>
                                        deleteRoom(room.id, room.label)
                                      }
                                      style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        padding: "4px",
                                        color: "#ef4444",
                                      }}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Doctors/Clinicians */}
                          {dept.doctors?.length > 0 && (
                            <div>
                              <h4
                                style={{
                                  fontSize: "0.95rem",
                                  fontWeight: 700,
                                  color: "#43a047",
                                  marginBottom: "0.75rem",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                Clinicians
                              </h4>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fill, minmax(250px, 1fr))",
                                  gap: "0.75rem",
                                }}
                              >
                                {dept.doctors.map((doc: any) => (
                                  <div
                                    key={doc.id}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "0.75rem",
                                      background: "#f9fafb",
                                      borderRadius: "8px",
                                      border: "1px solid var(--neutral-300)",
                                    }}
                                  >
                                    <span style={{ fontWeight: 600 }}>
                                      {doc.full_name}
                                    </span>
                                    <button
                                      onClick={() =>
                                        deleteDoctor(doc.id, doc.full_name)
                                      }
                                      style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        padding: "4px",
                                        color: "#ef4444",
                                      }}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Clinicians Management Section */}
                          <div className="space-y-4">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-black text-emerald-600 uppercase tracking-wider">
                                Clinician Rostering
                              </h4>
                              <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                                {(dept.doctors || []).length} Active
                              </span>
                            </div>

                            {/* Clinicians List */}
                            <div className="grid gap-3">
                              {(dept.doctors || []).map((doc: any) => {
                                // Safe room lookup (handles string/number mismatch)
                                const assignedRoom = (dept.rooms || []).find(
                                  (r: any) =>
                                    String(r.id) === String(doc.room_id),
                                );

                                return (
                                  <div
                                    key={doc.id}
                                    className="group flex flex-wrap items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-emerald-200 hover:shadow-md transition-all duration-200 gap-4"
                                  >
                                    {/* Left: Avatar + Info */}
                                    <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                                      {/* Avatar: Light blue-ish background, dark grey text, no border */}
                                      <div
                                        style={{
                                          width: "40px",
                                          height: "40px",
                                          borderRadius: "50%",
                                          background: "#eef4f9",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontSize: "0.875rem",
                                          fontWeight: 600,
                                          color: "#475569",
                                        }}
                                      >
                                        {doc.full_name
                                          ?.charAt(0)
                                          ?.toUpperCase() || "?"}
                                      </div>

                                      <div className="flex flex-col">
                                        {/* Name: Bold and Dark, slightly larger */}
                                        <div
                                          style={{
                                            fontWeight: 700,
                                            color: "#1e293b",
                                            fontSize: "0.95rem",
                                            lineHeight: 1.2,
                                          }}
                                        >
                                          {doc.full_name || "Unnamed Clinician"}
                                        </div>

                                        {/* Sub-info: Grey text with dot separator, exactly like the image */}
                                        <div
                                          style={{
                                            fontSize: "0.8rem",
                                            color: "#64748b",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.4rem",
                                            marginTop: "0.1rem",
                                          }}
                                        >
                                          <span>ID: {doc.id.slice(0, 5)}</span>
                                          <span style={{ color: "#cbd5e1" }}>
                                            •
                                          </span>
                                          <span style={{ fontWeight: 500 }}>
                                            {doc.room_id ? (
                                              <span
                                                style={{ color: "#059669" }}
                                              >
                                                Room: {assignedRoom?.label}
                                              </span>
                                            ) : (
                                              <span
                                                style={{ color: "#d97706" }}
                                              >
                                                Awaiting Assignment
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex items-center gap-2">
                                      {/* Room Selector */}
                                      <div
                                        className="relative"
                                        style={{ width: "200px" }}
                                      >
                                        <select
                                          value={doc.room_id ?? ""}
                                          onChange={(e) =>
                                            updateDoctorRoom(
                                              doc.id,
                                              e.target.value || null,
                                            )
                                          }
                                          style={{
                                            width: "100%",
                                            padding: "0.5rem 0.75rem", // Slightly tighter padding for a list view
                                            borderRadius: "8px",
                                            border:
                                              "1px solid var(--neutral-400)",
                                            background: "white",
                                            fontSize: "0.875 r em",
                                            cursor: "pointer",
                                            outline: "none",
                                            color: "inherit",
                                          }}
                                        >
                                          <option value="">
                                            Unassigned (Lobby)
                                          </option>

                                          {(dept.rooms || []).map((r: any) => (
                                            <option key={r.id} value={r.id}>
                                              Assign: {r.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Empty State */}
                              {(!dept.doctors || dept.doctors.length === 0) && (
                                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                                    <Users size={24} />
                                  </div>

                                  <p className="text-sm font-medium text-slate-500">
                                    No clinicians onboarded
                                  </p>

                                  <p className="text-xs text-slate-400 mt-1">
                                    Add a new clinician using the form below
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Delete Department Button */}
                          <button
                            onClick={() => deleteDepartment(dept.id, dept.name)}
                            style={{
                              marginTop: "0.5rem",
                              padding: "0.65rem 1rem",
                              borderRadius: "8px",
                              background: "#fef2f2",
                              color: "#991b1b",
                              border: "1px solid #fecaca",
                              fontWeight: 600,
                              fontSize: "0.875rem",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <Trash2 size={14} /> Delete Department
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ============= LOWER SECTION: ADD NEW ============= */}
            <section>
              <h2
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <Plus size={24} color="#ffa726" /> Add New
              </h2>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                }}
              >
                {/* Add Department */}
                <div className="card" style={{ padding: "1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <div
                      style={{
                        background: "#ffa726",
                        color: "white",
                        padding: "8px",
                        borderRadius: "8px",
                      }}
                    >
                      <HospitalIcon size={20} />
                    </div>
                    <h3
                      style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}
                    >
                      Create Department (Unit)
                    </h3>
                  </div>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <select
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--neutral-400)",
                        background: "white",
                      }}
                    >
                      <option value="">— Select Department Type —</option>
                      {HOSPITAL_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-primary"
                      style={{
                        padding: "0.85rem 1.5rem",
                        background: "#ffa726",
                        borderColor: "#ffa726",
                        opacity: submitting ? 0.7 : 1,
                        cursor: submitting ? "not-allowed" : "pointer",
                      }}
                      onClick={addDepartment}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        "Add Department"
                      )}
                    </button>
                  </div>
                </div>

                {/* Grid: Add Room & Add Doctor */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1.5rem",
                  }}
                >
                  {/* Add Room */}
                  <div className="card" style={{ padding: "1.5rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "1.25rem",
                      }}
                    >
                      <div
                        style={{
                          background: "var(--primary)",
                          color: "white",
                          padding: "8px",
                          borderRadius: "8px",
                        }}
                      >
                        <Plus size={20} />
                      </div>
                      <h3
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 800,
                          margin: 0,
                        }}
                      >
                        Register New Room
                      </h3>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      <select
                        value={newRoomDeptId}
                        onChange={(e) => setNewRoomDeptId(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          borderRadius: "8px",
                          border: "1px solid var(--neutral-400)",
                          background: "white",
                        }}
                      >
                        <option value="">Select Department</option>
                        {deptOptions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={newRoomLabel}
                        onChange={(e) => setNewRoomLabel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addRoom()}
                        placeholder="Room Label (e.g. Consultation A)"
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          borderRadius: "8px",
                          border: "1px solid var(--neutral-400)",
                        }}
                      />
                      <button
                        className="btn-primary"
                        style={{
                          width: "100%",
                          padding: "0.85rem",
                          opacity: submitting ? 0.7 : 1,
                          cursor: submitting ? "not-allowed" : "pointer",
                        }}
                        onClick={addRoom}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          "Add Room Entity"
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Add Doctor */}
                  <div className="card" style={{ padding: "1.5rem" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "1.25rem",
                      }}
                    >
                      <div
                        style={{
                          background: "#43a047",
                          color: "white",
                          padding: "8px",
                          borderRadius: "8px",
                        }}
                      >
                        <Users size={20} />
                      </div>
                      <h3
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 800,
                          margin: 0,
                        }}
                      >
                        Onboard Clinician
                      </h3>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            marginBottom: "0.4rem",
                            display: "block",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          1. Department
                        </label>
                        <select
                          value={newDocDeptId}
                          onChange={(e) => {
                            setNewDocDeptId(e.target.value);
                            setNewDocRoomId("");
                          }}
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            borderRadius: "8px",
                            border: "1px solid var(--neutral-400)",
                            background: "white",
                          }}
                        >
                          <option value="">Select Department</option>
                          {deptOptions.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            marginBottom: "0.4rem",
                            display: "block",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          2. Assign to Room
                        </label>
                        <select
                          value={newDocRoomId}
                          onChange={(e) => setNewDocRoomId(e.target.value)}
                          disabled={
                            !newDocDeptId ||
                            availableRoomsForDoctor.length === 0
                          }
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            borderRadius: "8px",
                            border: "1px solid var(--neutral-400)",
                            background: !newDocDeptId ? "#f9fafb" : "white",
                            color: !newDocDeptId
                              ? "var(--text-muted)"
                              : "inherit",
                          }}
                        >
                          <option value="">
                            {!newDocDeptId
                              ? "Select a department first"
                              : availableRoomsForDoctor.length === 0
                                ? "No rooms — add rooms first"
                                : "Select Room"}
                          </option>
                          {availableRoomsForDoctor.map((r: any) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            marginBottom: "0.4rem",
                            display: "block",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          3. Clinician Name
                        </label>
                        <input
                          value={newDocName}
                          onChange={(e) => setNewDocName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addDoctor()}
                          placeholder="e.g. Dr. Emily Smith"
                          style={{
                            width: "100%",
                            padding: "0.75rem",
                            borderRadius: "8px",
                            border: "1px solid var(--neutral-400)",
                          }}
                        />
                      </div>

                      <button
                        className="btn-primary"
                        style={{
                          width: "100%",
                          padding: "0.85rem",
                          background: "#43a047",
                          borderColor: "#43a047",
                          opacity: submitting ? 0.7 : 1,
                          cursor: submitting ? "not-allowed" : "pointer",
                        }}
                        onClick={addDoctor}
                        disabled={submitting}
                      >
                        {submitting ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          "Onboard Clinician"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </LayoutSidebar>
  );
}
