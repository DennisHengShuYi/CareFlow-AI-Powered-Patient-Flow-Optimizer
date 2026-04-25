import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import LayoutSidebar from "../components/LayoutSidebar";
import { capacityRoomStyle } from "../utils/capacityRoomStyle";
import {
  Filter,
  Mic,
  CircleDot,
  UserPlus,
  Search,
  LayoutGrid,
  Users,
  Square,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const API = "http://127.0.0.1:8002";

export default function LiveTriage() {
  type Toast = { type: "success" | "error"; message: string };
  const { getToken } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [objectiveNote, setObjectiveNote] = useState("");
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [viewMode, setViewMode] = useState<"queue" | "encounter">("queue");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllPatients, setShowAllPatients] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newComplaint, setNewComplaint] = useState("");
  const [newLevel, setNewLevel] = useState<number>(3);
  const [newIcNumber, setNewIcNumber] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addPatientErrors, setAddPatientErrors] = useState<{
    [key: string]: string;
  }>({});
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overridePatient, setOverridePatient] = useState<any>(null);
  const [overrideLevel, setOverrideLevel] = useState(3);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [overrideDiagnosis, setOverrideDiagnosis] = useState("");
  const [overrideDeptId, setOverrideDeptId] = useState("");
  const [overrideDocId, setOverrideDocId] = useState("");
  const [overrideBP, setOverrideBP] = useState("");
  const [overrideHR, setOverrideHR] = useState("");
  const [overrideO2, setOverrideO2] = useState("");
  const [aiScribe, setAiScribe] = useState<any>(null);
  const [aiStatus, setAiStatus] = useState<string>("Waiting...");
  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false);
  const [allDoctors, setAllDoctors] = useState<any[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<any[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [overrideErrors, setOverrideErrors] = useState<{
    [key: string]: string;
  }>({});

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };
  const [dashboardTab, setDashboardTab] = useState<"flow" | "capacity">("flow");
  const [boardData, setBoardData] = useState<{ departments: any[] } | null>(
    null,
  );
  const [utilizationHistory, setUtilizationHistory] = useState<
    Array<{ time: string; utilization: number }>
  >([]);

  useEffect(() => {
    if (boardData?.departments) {
      const doctors = boardData.departments.flatMap((dept: any) =>
        (dept.doctors || []).map((doc: any) => ({
          ...doc,
          department_id: dept.id, // VERY IMPORTANT
        })),
      );

      setAllDoctors(doctors);
    }
  }, [boardData]);

  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingCancelledRef = useRef(false);

  const searchPatients = async (query: string) => {
    try {
      console.log("1. Starting search for:", query);
      const token = await getToken();

      if (!token) {
        console.error("2. No token found!");
        return;
      }

      const url = `${API}/api/patients/search?q=${encodeURIComponent(query)}`;
      console.log("3. Fetching URL:", url);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Check if response is actually okay before parsing JSON
      if (!res.ok) {
        const errorText = await res.text(); // Get raw error message from server
        console.error(`4. Server Error (${res.status}):`, errorText);
        return;
      }

      const data = await res.json();
      console.log("5. Data received:", data);

      const results = data.patients || data;
      setSearchResults(Array.isArray(results) ? results : []);
      setShowSearchResults(results.length > 0);
    } catch (err) {
      console.error("6. Request failed entirely:", err);
      setShowSearchResults(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const [overview, board] = await Promise.all([
        fetch(`${API}/api/triage/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
        fetch(`${API}/api/capacity/board`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
      ]);

      setData(overview);
      setBoardData(board);

      const nextUtilization = Math.min(
        100,
        Math.round((overview.queue_active / 20) * 100),
      );
      const nowLabel = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      setUtilizationHistory((prev) => {
        const next = [
          ...prev,
          { time: nowLabel, utilization: nextUtilization },
        ];
        return next.slice(-6);
      });

      if (board.catalog) {
        // keep board data for future facility catalog features
      }
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [getToken]);

  const [board, setBoard] = useState<any>(null);

  // =========================
  // Fetch capacity board
  // =========================
  useEffect(() => {
    const fetchBoard = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/api/capacity/board`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Failed to fetch board");

        const data = await res.json();
        setBoard(data);
      } catch (err) {
        console.error("Board fetch error:", err);
      }
    };

    fetchBoard();

    // optional: auto refresh every 10s (silent)
    const t = setInterval(fetchBoard, 10000);
    return () => clearInterval(t);
  }, [getToken]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Timer effect for recording
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (recordingActive && !recordingPaused) {
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recordingActive, recordingPaused]);

  const openOverrideModal = async (patient: any) => {
    setOverridePatient(patient);
    setOverrideLevel(patient.level);
    setOverrideDiagnosis(patient.diagnosis || "");
    setOverrideBP(patient.metadata_data?.blood_pressure || "");
    setOverrideHR(patient.metadata_data?.heart_rate || "");
    setOverrideO2(patient.metadata_data?.oxygen_saturation || "");
    setOverrideDeptId(patient.department_id || "");
    setOverrideDocId(patient.doctor_id || "");
    setOverrideErrors({});

    try {
      const token = await getToken();

      const response = await fetch(`${API}/api/doctors`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      const doctors = data.doctors || [];

      // 1. set ALL doctors
      setAllDoctors(doctors);

      // 2. filter immediately using SAME source
      let filtered = doctors;

      if (patient.department_id) {
        filtered = doctors.filter(
          (d: any) => d.department_id === patient.department_id,
        );
      }

      setFilteredDoctors(filtered);

      // 3. ONLY open modal after data ready
      setShowOverrideModal(true);
    } catch (e) {
      console.error("Failed to load doctors:", e);

      // still open modal (fallback)
      setShowOverrideModal(true);
    }
  };

  const handleOverrideSubmit = async () => {
    if (!overridePatient) return;
    try {
      const token = await getToken();
      const response = await fetch(
        `${API}/api/triage/override/${overridePatient.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            level: overrideLevel,
            diagnosis: overrideDiagnosis,
            department_id: overrideDeptId || null,
            doctor_id: overrideDocId || null,
            status: overridePatient.status,
            blood_pressure: overrideBP || null,
            heart_rate: overrideHR || null,
            oxygen_saturation: overrideO2 || null,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        console.error("Override error:", error);
        setOverrideErrors({ submit: "Failed to update patient" });
        return;
      }

      // Also update vitals separately if they changed
      if (overrideBP || overrideHR || overrideO2) {
        const patientId = overridePatient.patient_id || overridePatient.id;
        await fetch(`${API}/api/patients/${patientId}/vitals`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            blood_pressure: overrideBP,
            heart_rate: overrideHR,
            oxygen_saturation: overrideO2,
          }),
        });
      }

      setShowOverrideModal(false);
      setOverrideErrors({});
      fetchData();
    } catch (e) {
      console.error("Override error:", e);
      setOverrideErrors({ submit: "Error updating patient" });
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^[0-9\s\-\+\(\)]{7,}$/;
    return phoneRegex.test(phone.trim());
  };

  const validateAddPatient = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!newName.trim()) errors.name = "Patient name is required";
    if (!newIcNumber.trim()) errors.icNumber = "IC number is required";
    if (!newPhone.trim()) errors.phone = "Phone number is required";
    else if (!validatePhone(newPhone))
      errors.phone = "Invalid phone number format";
    if (newEmail.trim() && !validateEmail(newEmail))
      errors.email = "Invalid email format";
    if (!newComplaint.trim()) errors.complaint = "Chief complaint is required";

    setAddPatientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddPatient = async () => {
    if (!validateAddPatient()) return;

    try {
      const token = await getToken();

      const response = await fetch(`${API}/api/triage/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName,
          complaint: newComplaint,
          level: newLevel,
          ic_number: newIcNumber,
          phone: newPhone,
          email: newEmail,
        }),
      });

      const data = await response.json().catch(() => ({}));

      // ❌ FAIL CASE
      if (!response.ok) {
        console.error("Registration error:", data);

        showToast("error", data?.detail || "Failed to register patient");

        return; // 🚨 DO NOT CLOSE MODAL
      }

      // ⚠️ CASE: already in queue (you handled in backend)
      if (data?.status === "exists") {
        showToast("error", "Patient already in queue");
        return;
      }

      // ✅ SUCCESS
      showToast("success", "Patient added to queue");

      // ✅ NOW ONLY close modal
      setShowAddModal(false);

      // reset form
      setNewName("");
      setNewComplaint("");
      setNewLevel(3);
      setNewIcNumber("");
      setNewPhone("");
      setNewEmail("");
      setAddPatientErrors({});
      setSearchResults([]);

      await fetchData();
    } catch (e) {
      console.error("Add patient error:", e);
      showToast("error", "Network error. Please try again.");
    }
  };

  const handleSelectPatient = async (patientId: string) => {
    // This auto-assigns a department and available doctor using AI, then moves the patient to In Consult
    try {
      const token = await getToken();
      const response = await fetch(
        `${API}/api/triage/auto_assign/${patientId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        console.error("Auto assign failed", response.status);
        showToast(
          "error",
          "Unable to auto assign patient. Falling back to consult status.",
        );
        await fetch(`${API}/api/triage/override/${patientId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "In Consult" }),
        });
      } else {
        const data = await response.json();
        const assignment = data.assignment;
        if (assignment) {
          showToast(
            "success",
            `Assigned to ${assignment.department_name} with ${assignment.doctor_name}`,
          );
        }
      }

      setSelectedSessionId(patientId);
      setAssessment("");
      setPlan("");
      setObjectiveNote("");
      setViewMode("encounter");
      fetchData();
    } catch (e) {
      console.error(e);
      showToast("error", "Patient selection failed. Please try again.");
    }
  };

  const handleSignNote = async () => {
    const encounterToSign = selectedEncounter || data?.active_encounter;
    if (!encounterToSign) return;
    try {
      const token = await getToken();
      const response = await fetch(
        `${API}/api/triage/sign_note/${encounterToSign.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            assessment_plan: `${assessment}\n\n${plan}`.trim(),
            subjective: aiSource?.subjective || "",
            objective_note: objectiveNote,
            assessment,
            plan,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Sign note failed:", errorText);
        showToast("error", "Failed to submit SOAP note.");
        return;
      }

      showToast("success", "SOAP note submitted and stored successfully.");
      setAssessment("");
      setPlan("");
      setObjectiveNote("");
      setAiScribe(null);
      setAiStatus("Waiting...");
      setViewMode("queue");
      setSelectedSessionId(null);
      fetchData();
    } catch (e) {
      console.error(e);
      showToast("error", "Error submitting SOAP note.");
    }
  };

  const handleCancelEncounter = async () => {
    const encounterId = selectedSessionId || selectedEncounter?.id;
    if (encounterId) {
      try {
        const token = await getToken();
        await fetch(`${API}/api/triage/override/${encounterId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "Waiting for Doctor" }),
        });
      } catch (error) {
        console.error("Cancel encounter failed:", error);
      }
    }

    setViewMode("queue");
    setSelectedSessionId(null);
    setAssessment("");
    setPlan("");
    setObjectiveNote("");
    fetchData();
  };

  const handleGenerateSoap = async (overrideObjective?: string) => {
    const encounterId = selectedEncounter?.id || data?.active_encounter?.id;
    if (!encounterId) {
      showToast("error", "No encounter selected for SOAP generation.");
      return;
    }

    const payloadObjective = overrideObjective ?? objectiveNote ?? "";
    setIsGeneratingSoap(true);
    setAiStatus("Generating SOAP...");

    try {
      const token = await getToken();
      const response = await fetch(
        `${API}/api/triage/generate_soap/${encounterId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ objective_note: payloadObjective }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Generate SOAP failed:", errorText);
        setAiStatus("SOAP generation failed.");
        showToast("error", "AI SOAP generation failed.");
        return;
      }

      const json = await response.json();
      setAiScribe(json);
      setAiStatus("SOAP draft generated.");
      setAssessment(json.assessment || "");
      setPlan(json.plan || "");
      if (json.subjective) {
        setAiScribe((prev: any) => ({ ...prev, subjective: json.subjective }));
      }
      if (json.objective) {
        setObjectiveNote(json.objective);
      }
    } catch (err) {
      console.error("Generate SOAP error:", err);
      setAiStatus("SOAP generation error.");
      showToast("error", "Unable to generate SOAP note.");
    } finally {
      setIsGeneratingSoap(false);
    }
  };

  const selectedEncounter =
    data?.patients?.find((p: any) => p.id === selectedSessionId) ||
    data?.active_encounter;
  const aiSource = aiScribe ||
    data?.ai_scribe || { status: aiStatus, subjective: null };

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const cleanupRecording = () => {
    try {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.warn("Failed to stop media tracks", e);
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
    recordingCancelledRef.current = false;
  };

  const openRecordingModal = () => {
    setRecordingSeconds(0);
    setRecordingError(null);
    setRecordingActive(false);
    setRecordingModalOpen(true);
  };

  const closeRecordingModal = () => {
    if (recordingActive) {
      if (!window.confirm("Discard this recording?")) return;
      recordingCancelledRef.current = true;
      mediaRecorderRef.current?.stop();
      setRecordingModalOpen(false);
      setRecordingActive(false);
      setRecordingPaused(false);
      setRecordingSeconds(0);
      return;
    }

    setRecordingModalOpen(false);
    setRecordingActive(false);
    setRecordingPaused(false);
    setRecordingSeconds(0);
    cleanupRecording();
  };

  const handleTranscribeAndGenerateSoap = async (audioBlob: Blob) => {
    const encounterId = selectedEncounter?.id || data?.active_encounter?.id;
    if (!encounterId) {
      showToast("error", "Select a patient before transcribing.");
      return;
    }

    setTranscribing(true);
    setAiStatus("Transcribing audio...");

    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", audioBlob, "dictation.webm");

      const intakeRes = await fetch(`${API}/intake/voice`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!intakeRes.ok) {
        const errorText = await intakeRes.text();
        throw new Error(errorText || "Audio transcription failed");
      }

      const intakeJson = await intakeRes.json();
      const transcript = intakeJson.content?.trim();
      if (!transcript) {
        throw new Error("No transcript returned from audio intake.");
      }

      const appendedText = objectiveNote
        ? `${objectiveNote.trim()}\n\n${transcript}`
        : transcript;
      setObjectiveNote(appendedText);

      setAiStatus("Generating SOAP from transcript...");
      const soapRes = await fetch(
        `${API}/api/triage/generate_soap/${encounterId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ objective_note: appendedText }),
        },
      );

      if (!soapRes.ok) {
        const errorText = await soapRes.text();
        throw new Error(errorText || "SOAP generation failed");
      }

      const soapJson = await soapRes.json();
      setAiScribe(soapJson);
      setAiStatus("Transcription complete — SOAP draft generated.");
      setAssessment(soapJson.assessment || "");
      setPlan(soapJson.plan || "");
      if (soapJson.subjective) {
        setAiScribe((prev: any) => ({
          ...prev,
          subjective: soapJson.subjective,
        }));
      }
      if (soapJson.objective) {
        setObjectiveNote(soapJson.objective);
      }
      showToast("success", "Audio transcribed and SOAP note generated.");
    } catch (err) {
      console.error("Transcription/ SOAP error:", err);
      setAiStatus("Transcription or SOAP generation failed.");
      showToast("error", "Unable to transcribe and generate SOAP.");
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    setRecordingSeconds(0);
    setRecordingPaused(false);
    setRecordingError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      recordingCancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setRecordingActive(false);
        setRecordingPaused(false);

        if (recordingCancelledRef.current) {
          cleanupRecording();
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        cleanupRecording();
        await handleTranscribeAndGenerateSoap(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingActive(true);
    } catch (err) {
      console.error("Failed to start audio recording:", err);
      setRecordingError(
        "Unable to access microphone. Please allow microphone permission.",
      );
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setRecordingPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingPaused(false);
    }
  };

  const stopRecordingAndInsert = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setRecordingModalOpen(false);
      setRecordingActive(false);
      setRecordingPaused(false);
      setRecordingSeconds(0);
      return;
    }

    setRecordingModalOpen(false);
    setRecordingActive(false);
    setRecordingPaused(false);
    setRecordingSeconds(0);
    cleanupRecording();
  };

  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (loading) {
    return (
      <LayoutSidebar>
        <div
          style={{
            padding: "2rem 3rem",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: "1.25rem", color: "var(--text-muted)" }}>
            Loading live stream... Ensure backend is running.
          </div>
        </div>
      </LayoutSidebar>
    );
  }

  if (!data) return null;

  const totalClinicCapacity =
    boardData?.departments?.reduce((sum: number, dept: any) => {
      const roomCount = dept.metrics?.rooms_total ?? dept.rooms?.length ?? 0;
      return sum + roomCount;
    }, 0) ?? 0;

  const effectiveClinicCapacity = totalClinicCapacity > 0 ? totalClinicCapacity : 50;

  const currentUtilization = Math.min(
    100,
    Math.round((data.queue_active / effectiveClinicCapacity) * 100),
  );

  const chartData =
    utilizationHistory.length > 0
      ? utilizationHistory
      : [
          { time: "08:00", utilization: 45 },
          { time: "10:00", utilization: 85 },
          { time: "12:00", utilization: 60 },
          { time: "14:00", utilization: 92 },
          { time: "16:00", utilization: 75 },
          { time: "Now", utilization: currentUtilization },
        ];

  const totalPatients = data.patients?.length || 0;
  const routedPatients =
    data.patients?.filter(
      (p: any) =>
        p.assigned_doctor &&
        p.assigned_doctor !== "Unassigned" &&
        p.department &&
        p.department !== "Triage Queue",
    ).length || 0;
  const conversionPercent = totalPatients
    ? Math.round((routedPatients / totalPatients) * 100)
    : 0;

  const triageData = [
    { name: "AI routed", value: conversionPercent, color: "#60a5fa" },
    {
      name: "Awaiting routing",
      value: Math.max(0, 100 - conversionPercent),
      color: "#9ca3af",
    },
  ];

  // =========================
  // Build staffing data
  // =========================
  // Build dynamic staff data from board
  const staffData =
    board?.departments.map((dept: any) => {
      const totalDoctors =
        dept.doctors?.length || dept.metrics?.doctors_total || 0;
      const busyRoomsCount =
        dept.metrics?.doctors_in_consult ??
        (dept.rooms || []).reduce((count: number, r: any) => {
          return count + (r.in_consult && r.in_consult.length > 0 ? 1 : 0);
        }, 0);

      const busyPatientCount =
        data?.patients?.filter(
          (p: any) =>
            p.status === "In Consult" &&
            String(p.department || "").toLowerCase() ===
              String(dept.name || "").toLowerCase(),
        ).length || 0;

      const busyCount = Math.max(busyRoomsCount, busyPatientCount);
      const availableDoctors = Math.max(totalDoctors - busyCount, 0);

      return {
        label: dept.name,
        current: availableDoctors,
        total: totalDoctors,
        color: "var(--primary)",
      };
    }) || [];

  return (
    <LayoutSidebar>
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

      <div
        style={{
          padding: "2rem 3rem",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header Section */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "2rem",
            flexWrap: "wrap",
            gap: "1.5rem",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "2.5rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: "0.25rem",
              }}
            >
              Active Duty
            </h1>
            <p
              style={{
                fontSize: "0.875rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                marginBottom: "1rem",
              }}
            >
              Live Clinical Overview
            </p>
            {viewMode === "queue" && (
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--neutral-200)",
                  borderRadius: "12px",
                  padding: "4px",
                  gap: "4px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setDashboardTab("flow")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "10px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    background:
                      dashboardTab === "flow" ? "white" : "transparent",
                    color:
                      dashboardTab === "flow"
                        ? "var(--primary)"
                        : "var(--text-muted)",
                    boxShadow:
                      dashboardTab === "flow"
                        ? "0 1px 3px rgba(0,0,0,0.08)"
                        : "none",
                  }}
                >
                  <Users size={16} /> Patient flow
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardTab("capacity")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "10px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    background:
                      dashboardTab === "capacity" ? "white" : "transparent",
                    color:
                      dashboardTab === "capacity"
                        ? "var(--primary)"
                        : "var(--text-muted)",
                    boxShadow:
                      dashboardTab === "capacity"
                        ? "0 1px 3px rgba(0,0,0,0.08)"
                        : "none",
                  }}
                >
                  <LayoutGrid size={16} /> Capacity
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.5rem",
                borderRadius: "9999px",
                fontWeight: 700,
              }}
            >
              <UserPlus size={16} /> Add Patient
            </button>
            <div
              className="card"
              style={{
                padding: "0.75rem 1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                borderRadius: "9999px",
              }}
            >
              <div
                style={{
                  color: "#ba1a1a",
                  background: "#ffdad6",
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                !
              </div>
              <div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  Critical
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                  0{data.critical}
                </div>
              </div>
            </div>
            <div
              className="card"
              style={{
                padding: "0.75rem 1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                borderRadius: "9999px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  Queue
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                  {data.queue_active} Active
                </div>
              </div>
            </div>
            <div
              className="card"
              style={{
                padding: "0.75rem 1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                borderRadius: "9999px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  Daily Clinic Load
                </div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                  {data.queue_active} / {effectiveClinicCapacity}{" "}
                  <span
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      color: "var(--text-muted)",
                    }}
                  >
                    Booked
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div
          style={{
            display: "flex",
            gap: "2rem",
            flex: 1,
            minHeight: 0,
            flexWrap: "wrap",
          }}
        >
          {/* Queue View */}
          {viewMode === "queue" && dashboardTab === "flow" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2rem",
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                className="card"
                style={{ flex: 1, display: "flex", flexDirection: "column" }}
              >
                <div style={{ marginBottom: "1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "1rem",
                      flexWrap: "wrap",
                      gap: "1rem",
                    }}
                  >
                    <h2 style={{ fontSize: "1.5rem" }}>Patient Queue</h2>
                    <div style={{ display: "flex", gap: "1rem" }}>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        Capacity: {currentUtilization}% utilized
                      </span>
                      <span
                        style={{
                          fontSize: "0.875rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        No-shows: 2.1% trend
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        background: "white",
                        borderRadius: "12px",
                        padding: "0.75rem 1rem",
                        border: "1px solid var(--neutral-400)",
                        flex: 1,
                        maxWidth: "400px",
                      }}
                    >
                      <Search
                        size={18}
                        color="var(--text-muted)"
                        style={{ marginRight: "0.75rem" }}
                      />
                      <input
                        type="text"
                        placeholder="Search patient name, complaint..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          border: "none",
                          background: "transparent",
                          outline: "none",
                          fontSize: "0.875rem",
                          width: "100%",
                          color: "var(--text-main)",
                        }}
                      />
                    </div>

                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setShowFilterMenu(!showFilterMenu)}
                        style={{
                          color:
                            filterLevel !== null
                              ? "var(--primary)"
                              : "var(--secondary)",
                          display: "flex",
                          gap: "0.5rem",
                          alignItems: "center",
                          background: "white",
                          borderRadius: "12px",
                          padding: "0.75rem 1.5rem",
                          border: "1px solid var(--neutral-400)",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: "0.875rem",
                        }}
                      >
                        {filterLevel !== null
                          ? `Level ${filterLevel}`
                          : "Filter"}{" "}
                        <Filter size={16} />
                      </button>
                      {showFilterMenu && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            right: 0,
                            marginTop: "0.5rem",
                            background: "white",
                            borderRadius: "8px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            border: "1px solid var(--neutral-400)",
                            zIndex: 10,
                            minWidth: "160px",
                            overflow: "hidden",
                          }}
                        >
                          <button
                            onClick={() => {
                              setFilterLevel(null);
                              setShowFilterMenu(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "0.75rem 1rem",
                              textAlign: "left",
                              background:
                                filterLevel === null
                                  ? "var(--neutral-200)"
                                  : "transparent",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "0.875rem",
                            }}
                          >
                            All Patients
                          </button>
                          <button
                            onClick={() => {
                              setFilterLevel(1);
                              setShowFilterMenu(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "0.75rem 1rem",
                              textAlign: "left",
                              background:
                                filterLevel === 1
                                  ? "var(--neutral-200)"
                                  : "transparent",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "0.875rem",
                              color: "#ba1a1a",
                              fontWeight: 600,
                            }}
                          >
                            Level 1 (Critical)
                          </button>
                          <button
                            onClick={() => {
                              setFilterLevel(2);
                              setShowFilterMenu(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "0.75rem 1rem",
                              textAlign: "left",
                              background:
                                filterLevel === 2
                                  ? "var(--neutral-200)"
                                  : "transparent",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "0.875rem",
                              color: "var(--secondary)",
                              fontWeight: 600,
                            }}
                          >
                            Level 2 (Urgent)
                          </button>
                          <button
                            onClick={() => {
                              setFilterLevel(3);
                              setShowFilterMenu(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "0.75rem 1rem",
                              textAlign: "left",
                              background:
                                filterLevel === 3
                                  ? "var(--neutral-200)"
                                  : "transparent",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "0.875rem",
                              color: "var(--primary)",
                              fontWeight: 600,
                            }}
                          >
                            Level 3 (Standard)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.5fr 2fr 1fr auto",
                    gap: "1rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    paddingBottom: "1rem",
                    borderBottom: "1px solid var(--neutral-400)",
                    marginBottom: "1rem",
                  }}
                >
                  <div>Urgency</div>
                  <div>Patient</div>
                  <div>Diagnosis & Complaint</div>
                  <div>Status & Assignment</div>
                  <div style={{ width: "50px" }}></div>
                </div>

                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                    paddingRight: "0.5rem",
                  }}
                >
                  {(() => {
                    let filteredPatients =
                      data.patients?.filter((p: any) => {
                        const matchesLevel =
                          filterLevel === null || p.level === filterLevel;
                        const matchesSearch =
                          p.name
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()) ||
                          p.complaint
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase());
                        return matchesLevel && matchesSearch;
                      }) || [];

                    // Sort by level first, then earliest arrival time within each level.
                    filteredPatients.sort((a: any, b: any) => {
                      const levelDiff = (a.level || 3) - (b.level || 3);
                      if (levelDiff !== 0) return levelDiff;

                      const timeA = a.time || "";
                      const timeB = b.time || "";

                      // If time is formatted as HH:MM, compare lexicographically.
                      if (
                        /^\d{2}:\d{2}$/.test(timeA) &&
                        /^\d{2}:\d{2}$/.test(timeB)
                      ) {
                        return timeA.localeCompare(timeB);
                      }

                      // Fallback to stable ordering if arrival time isn't available.
                      return 0;
                    });

                    const displayedPatients = showAllPatients
                      ? filteredPatients
                      : filteredPatients.slice(0, 5);

                    return (
                      <>
                        {displayedPatients.map((patient: any) => {
                          const isCritical = patient.level === 1;
                          const isActiveEncounter = !!(selectedSessionId
                            ? patient.id === selectedSessionId
                            : data.active_encounter?.id &&
                              patient.id === data.active_encounter.id);
                          return (
                            <div
                              key={patient.id}
                              onClick={() => handleSelectPatient(patient.id)}
                              style={{
                                background: isCritical ? "#fffcfc" : "white",
                                border: "1px solid var(--neutral-400)",
                                borderLeft: "1px solid var(--neutral-400)",
                                borderRadius: "12px",
                                padding: "1rem",
                                display: "grid",
                                gridTemplateColumns: "1fr 1.5fr 2fr 1fr auto",
                                alignItems: "center",
                                gap: "1rem",
                                boxShadow: isActiveEncounter
                                  ? "0 0 0 3px rgba(59, 130, 246, 0.2)"
                                  : "0 2px 4px rgba(0,0,0,0.05)",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                position: "relative",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform =
                                  "translateY(-2px)";
                                e.currentTarget.style.boxShadow =
                                  isActiveEncounter
                                    ? "0 0 0 3px rgba(59, 130, 246, 0.28), 0 4px 12px rgba(0,0,0,0.1)"
                                    : "0 4px 12px rgba(0,0,0,0.1)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "none";
                                e.currentTarget.style.boxShadow =
                                  isActiveEncounter
                                    ? "0 0 0 3px rgba(59, 130, 246, 0.2)"
                                    : "0 2px 4px rgba(0,0,0,0.05)";
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    color: isCritical
                                      ? "#ba1a1a"
                                      : patient.level === 2
                                        ? "var(--secondary)"
                                        : "var(--primary)",
                                    fontSize: "0.875rem",
                                    fontWeight: 800,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                  }}
                                >
                                  {isCritical && (
                                    <span
                                      style={{
                                        background: "#ba1a1a",
                                        color: "white",
                                        width: "16px",
                                        height: "16px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderRadius: "50%",
                                        fontSize: "0.65rem",
                                      }}
                                    >
                                      !
                                    </span>
                                  )}
                                  LEVEL {patient.level}
                                </div>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                    marginTop: "0.25rem",
                                  }}
                                >
                                  {patient.time}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.75rem",
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    width: "32px",
                                    height: "32px",
                                    minWidth: "32px",
                                    borderRadius: "50%",
                                    background: "var(--neutral-400)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  {patient.initials}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {patient.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--text-muted)",
                                    }}
                                  >
                                    {patient.details}
                                  </div>
                                </div>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: "var(--text-main)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {patient.diagnosis || "Pending Eval"}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {patient.complaint}
                                </div>
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: "0.875rem",
                                  }}
                                >
                                  {patient.department || "Triage"}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  {patient.assigned_doctor || "Unassigned"} •{" "}
                                  {patient.status}
                                </div>
                                {isActiveEncounter && (
                                  <div
                                    style={{
                                      marginTop: "0.35rem",
                                      fontSize: "0.65rem",
                                      fontWeight: 800,
                                      color: "var(--primary)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                    }}
                                  >
                                    Active encounter
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openOverrideModal(patient);
                                  }}
                                  style={{
                                    background: "var(--neutral-200)",
                                    border: "none",
                                    padding: "0.5rem 1rem",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    color: "var(--text-muted)",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                      "var(--neutral-300)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                      "var(--neutral-200)";
                                  }}
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {filteredPatients.length === 0 && (
                          <div
                            style={{
                              textAlign: "center",
                              color: "var(--text-muted)",
                              padding: "2rem",
                            }}
                          >
                            No patients match your search or filter.
                          </div>
                        )}
                        {filteredPatients.length > 5 && (
                          <div
                            style={{
                              textAlign: "center",
                              marginTop: "0.5rem",
                              marginBottom: "1rem",
                            }}
                          >
                            <button
                              onClick={() =>
                                setShowAllPatients(!showAllPatients)
                              }
                              style={{
                                background: "#f0f4f8",
                                border: "1px solid var(--primary)",
                                color: "var(--primary)",
                                padding: "0.5rem 1.5rem",
                                borderRadius: "9999px",
                                fontSize: "0.875rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background =
                                  "var(--primary)";
                                e.currentTarget.style.color = "white";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#f0f4f8";
                                e.currentTarget.style.color = "var(--primary)";
                              }}
                            >
                              {showAllPatients
                                ? "Show Less"
                                : `Show More (${filteredPatients.length - 5} hidden)`}
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Analytics Row */}
              <div
                style={{
                  display: "flex",
                  gap: "2rem",
                  flexWrap: "wrap",
                  paddingBottom: "2rem",
                }}
              >
                {/* Chart Card */}
                <div
                  className="card"
                  style={{ padding: "1.5rem", flex: "1 1 500px" }}
                >
                  <h2
                    style={{
                      fontSize: "1.25rem",
                      marginBottom: "1.5rem",
                      fontWeight: 700,
                    }}
                  >
                    Clinic Capacity Utilization
                  </h2>
                  <div style={{ height: "240px", width: "100%" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="colorUv"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--primary)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--primary)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--neutral-400)"
                        />
                        <XAxis
                          dataKey="time"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                          dy={10}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                          domain={[0, 100]}
                          ticks={[0, 25, 50, 75, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          }}
                          itemStyle={{
                            color: "var(--primary)",
                            fontWeight: 700,
                          }}
                          formatter={(value) => [
                            `${Number(value ?? 0)}%`,
                            "Utilization",
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey="utilization"
                          stroke="var(--primary)"
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#colorUv)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Donut Chart Card */}
                <div
                  className="card"
                  style={{ padding: "1.5rem", flex: "1 1 300px" }}
                >
                  <h2
                    style={{
                      fontSize: "1.25rem",
                      marginBottom: "1.5rem",
                      fontWeight: 700,
                    }}
                  >
                    AI Triage Conversion
                  </h2>
                  <div
                    style={{
                      height: "240px",
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={triageData}
                          cx="50%"
                          cy="45%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {triageData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          }}
                          itemStyle={{
                            fontWeight: 700,
                            color: "var(--text-main)",
                          }}
                          formatter={(value) => [
                            `${Number(value ?? 0)}%`,
                            "Conversion",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Custom Legend */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.75rem",
                        marginTop: "-30px",
                        padding: "0 1rem",
                      }}
                    >
                      {triageData.map((entry, index) => (
                        <div
                          key={index}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                          }}
                        >
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: entry.color,
                            }}
                          ></div>
                          {entry.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div
                  className="card"
                  style={{ padding: "1.5rem", flex: "1 1 500px" }}
                >
                  <h2
                    style={{
                      fontSize: "1.25rem",
                      marginBottom: "1.5rem",
                      fontWeight: 700,
                    }}
                  >
                    Current Staffing Load
                  </h2>
                  <div className="space-y-4">
                    {(staffData || []).map((item: any, i: number) => {
                      const percent =
                        item.total > 0 ? (item.current / item.total) * 100 : 0;
                      return (
                        <div key={i} style={{ marginBottom: "1.25rem" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "0.25rem",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--text-muted)",
                              }}
                            >
                              {item.label}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                              {item.current} available / {item.total}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 6,
                              background: "var(--neutral-300)",
                              borderRadius: 6,
                            }}
                          >
                            <div
                              style={{
                                width: `${percent}%`,
                                height: "100%",
                                background: item.color,
                                borderRadius: 6,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === "queue" && dashboardTab === "capacity" && (
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    color: "var(--text-muted)",
                    maxWidth: "720px",
                  }}
                >
                  {
                    "Each room lists patients who match that room's department and assigned doctor. In session means status is In Consult or In Resus. Other statuses (e.g. Awaiting Labs, Room 4) count as the waiting list. Opening an encounter sets that patient to In Consult; the previous In Consult patient returns to Waiting for Doctor. "
                  }
                  <Link
                    to="/departments"
                    style={{ color: "var(--primary)", fontWeight: 700 }}
                  >
                    Departments
                  </Link>{" "}
                  for room staffing.
                </p>
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  paddingRight: "0.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                }}
              >
                {(boardData?.departments || []).map((dept: any) => (
                  <div
                    key={dept.id}
                    className="card"
                    style={{ padding: "1.5rem" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "1.25rem",
                        flexWrap: "wrap",
                        gap: "1rem",
                      }}
                    >
                      <h2
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 700,
                          margin: 0,
                        }}
                      >
                        {dept.name}
                      </h2>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          className="card"
                          style={{
                            padding: "0.35rem 0.75rem",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            borderRadius: "9999px",
                          }}
                        >
                          In session {dept.metrics?.rooms_occupied ?? 0} ·
                          Waiting list {dept.metrics?.rooms_with_queue ?? 0} ·
                          Open {dept.metrics?.rooms_ready ?? 0}
                        </span>
                        <span
                          className="card"
                          style={{
                            padding: "0.35rem 0.75rem",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            borderRadius: "9999px",
                          }}
                        >
                          {dept.metrics?.doctors_in_consult ?? 0}/
                          {dept.metrics?.doctors_total ?? 0} doctors in consult
                        </span>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            alignSelf: "center",
                          }}
                        >
                          {dept.metrics?.rooms_staffed ?? 0} staffed rooms
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: "1rem",
                      }}
                    >
                      {(dept.rooms || []).map((room: any) => {
                        const rs = capacityRoomStyle(room.state);
                        return (
                          <div
                            key={room.id}
                            style={{
                              border: `1px solid var(--neutral-400)`,
                              borderRadius: "12px",
                              padding: "1rem",
                              background: rs.bg,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "0.5rem",
                                gap: "0.5rem",
                              }}
                            >
                              <span
                                style={{ fontWeight: 800, fontSize: "0.95rem" }}
                              >
                                {room.label}
                              </span>
                              <div style={{ textAlign: "right" }}>
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    fontWeight: 800,
                                    textTransform: "uppercase",
                                    color: rs.label,
                                  }}
                                >
                                  {rs.label}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.65rem",
                                    color: "var(--text-muted)",
                                    fontWeight: 600,
                                    maxWidth: "140px",
                                  }}
                                >
                                  {rs.hint}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--text-muted)",
                                marginBottom: "0.75rem",
                              }}
                            >
                              {room.doctor_name ? (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: "var(--text-main)",
                                  }}
                                >
                                  {room.doctor_name}
                                </span>
                              ) : (
                                <span>No clinician assigned</span>
                              )}
                            </div>
                            {room.in_consult?.length > 0 && (
                              <div style={{ marginBottom: "0.75rem" }}>
                                <div
                                  style={{
                                    fontSize: "0.65rem",
                                    fontWeight: 800,
                                    letterSpacing: "0.06em",
                                    color: "var(--text-muted)",
                                    marginBottom: "0.35rem",
                                  }}
                                >
                                  IN CONSULT
                                </div>
                                <ul
                                  style={{
                                    margin: 0,
                                    paddingLeft: "1.1rem",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  {room.in_consult.map((p: any) => (
                                    <li key={p.id}>
                                      {p.name}{" "}
                                      <span
                                        style={{
                                          color: "var(--text-muted)",
                                          fontWeight: 500,
                                        }}
                                      >
                                        ({p.status})
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div>
                              <div
                                style={{
                                  fontSize: "0.65rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.06em",
                                  color: "var(--text-muted)",
                                  marginBottom: "0.35rem",
                                }}
                              >
                                PATIENT QUEUE
                              </div>
                              {room.queue?.length ? (
                                <ol
                                  style={{
                                    margin: 0,
                                    paddingLeft: "1.1rem",
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  {room.queue.map((p: any) => (
                                    <li key={p.id}>
                                      {p.name}{" "}
                                      <span
                                        style={{
                                          color: "var(--text-muted)",
                                          fontWeight: 500,
                                        }}
                                      >
                                        ({p.status})
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "var(--text-muted)",
                                    fontStyle: "italic",
                                  }}
                                >
                                  No patients waiting
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {(!boardData?.departments ||
                  boardData.departments.length === 0) && (
                  <div
                    className="card"
                    style={{
                      padding: "2rem",
                      textAlign: "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    No capacity data. Confirm the API is running at {API}.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Encounter View */}
          {viewMode === "encounter" && (
            <>
              {/* Left Col - Patient Info */}
              <div
                className="card"
                style={{
                  flex: "1 1 400px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2rem",
                }}
              >
                <div>
                  <button
                    type="button"
                    onClick={handleCancelEncounter}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: 0,
                    }}
                  >
                    &larr; Back to Queue
                  </button>
                </div>

                <div>
                  <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
                    Patient Information
                  </h2>
                  <div
                    style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}
                  >
                    Review active encounter details prior to assessment. Cancel
                    or Back to Queue discards this session and returns the
                    patient to waiting if they were marked In Consult.
                  </div>
                </div>

                <div
                  style={{
                    background:
                      "linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%)",
                    borderRadius: "12px",
                    padding: "1.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    color: "white",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                >
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: "white",
                      color: "var(--secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.5rem",
                      fontWeight: 700,
                    }}
                  >
                    {selectedEncounter?.initials || "-"}
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: "1.5rem",
                        color: "white",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {selectedEncounter?.name || "Unknown Patient"}
                    </h3>
                    <div style={{ opacity: 0.9 }}>
                      {selectedEncounter?.details || "No details available"}
                    </div>
                  </div>
                </div>

                <div>
                  <h3
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Chief Complaint
                  </h3>
                  <div
                    style={{
                      background: "#f0f4f8",
                      border: "1px solid #d9e2ec",
                      color: "#102a43",
                      borderRadius: "12px",
                      padding: "1.25rem",
                      fontSize: "1.125rem",
                      fontWeight: 600,
                    }}
                  >
                    {selectedEncounter?.complaint || "No complaint recorded."}
                  </div>
                </div>

                <div>
                  <h3
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Triage Vitals Summary
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "1rem",
                    }}
                  >
                    <div
                      style={{
                        background: "var(--neutral-200)",
                        padding: "1.25rem",
                        borderRadius: "12px",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          marginBottom: "0.25rem",
                        }}
                      >
                        BLOOD PRESSURE
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                        {selectedEncounter?.metadata_data?.blood_pressure ||
                          aiSource?.vitals?.bp ||
                          "-"}
                      </div>
                    </div>
                    <div
                      style={{
                        background: "var(--neutral-200)",
                        padding: "1.25rem",
                        borderRadius: "12px",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          marginBottom: "0.25rem",
                        }}
                      >
                        HEART RATE
                      </div>
                      <div
                        style={{
                          fontSize: "1.5rem",
                          fontWeight: 700,
                          color: "#ba1a1a",
                        }}
                      >
                        {selectedEncounter?.metadata_data?.heart_rate ||
                          aiSource?.vitals?.hr ||
                          "-"}
                      </div>
                    </div>
                    <div
                      style={{
                        background: "var(--neutral-200)",
                        padding: "1.25rem",
                        borderRadius: "12px",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          marginBottom: "0.25rem",
                        }}
                      >
                        OXYGEN SAT.
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                        {selectedEncounter?.metadata_data?.oxygen_saturation ||
                          aiSource?.vitals?.o2 ||
                          "-"}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      color: "var(--primary)",
                      marginBottom: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <CircleDot size={12} /> Z.ai Triage Reasoning
                  </h3>
                  <div
                    style={{
                      background: "#e0f2fe",
                      border: "1px solid #7dd3fc",
                      color: "#0369a1",
                      borderRadius: "12px",
                      padding: "1.25rem",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      lineHeight: "1.5",
                    }}
                  >
                    {selectedEncounter?.ai_reasoning ||
                      "AI reasoning unavailable for this patient."}
                  </div>
                </div>
              </div>

              {/* Right Col - SOAP Note Generation */}
              <div
                className="card"
                style={{
                  flex: "1 1 500px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1.5rem",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      fontWeight: 600,
                    }}
                  >
                    <Mic size={20} color="var(--primary)" /> SOAP Note
                    Generation
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={openRecordingModal}
                      className="btn-primary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 1.1rem",
                        borderRadius: "9999px",
                        fontWeight: 700,
                        fontSize: "0.875rem",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <Mic size={18} /> Record
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerateSoap()}
                      className="btn-secondary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 1.1rem",
                        borderRadius: "9999px",
                        fontWeight: 700,
                        fontSize: "0.875rem",
                        border: "1px solid var(--neutral-400)",
                        background: isGeneratingSoap ? "#e2e8f0" : "white",
                        cursor: "pointer",
                      }}
                      disabled={isGeneratingSoap}
                    >
                      {isGeneratingSoap ? "Generating..." : "Generate SOAP"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      background: "var(--neutral-300)",
                      padding: "1rem",
                      borderRadius: "12px",
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                      border: "1px solid var(--neutral-400)",
                    }}
                  >
                    {aiSource?.status || "Waiting..."}
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "1px",
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      SUBJECTIVE
                    </div>
                    <div
                      style={{
                        background: "var(--neutral-200)",
                        padding: "1rem",
                        borderRadius: "12px",
                        fontSize: "0.875rem",
                        lineHeight: "1.5",
                      }}
                    >
                      {aiSource?.subjective || "N/A"}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "1px",
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      OBJECTIVE
                    </div>
                    <textarea
                      style={{
                        width: "100%",
                        minHeight: "60px",
                        background: "var(--neutral-200)",
                        padding: "1rem",
                        borderRadius: "12px",
                        fontSize: "0.875rem",
                        lineHeight: "1.5",
                        border: "1px solid var(--neutral-400)",
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                      placeholder="Enter physical exam findings or additional objective data..."
                      value={objectiveNote}
                      onChange={(e) => setObjectiveNote(e.target.value)}
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "1px",
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      ASSESSMENT
                    </div>
                    <textarea
                      style={{
                        width: "100%",
                        minHeight: "80px",
                        background: "var(--neutral-200)",
                        padding: "1rem",
                        borderRadius: "12px",
                        fontSize: "0.875rem",
                        lineHeight: "1.5",
                        border: "1px solid var(--neutral-400)",
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                      placeholder="Enter clinical assessment..."
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "1px",
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      PLAN
                    </div>
                    <textarea
                      style={{
                        width: "100%",
                        minHeight: "80px",
                        background: "var(--neutral-200)",
                        padding: "1rem",
                        borderRadius: "12px",
                        fontSize: "0.875rem",
                        lineHeight: "1.5",
                        border: "1px solid var(--neutral-400)",
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                      placeholder="Enter treatment plan..."
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    marginTop: "1.5rem",
                    paddingTop: "1.5rem",
                    borderTop: "1px solid var(--neutral-400)",
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCancelEncounter}
                    style={{
                      flex: 1,
                      background: "var(--neutral-100)",
                      border: "1px solid var(--neutral-400)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleSignNote}
                  >
                    Sign & Commit
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SOAP dictation / recording modal */}
      {recordingModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 110,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRecordingModal();
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "440px",
              padding: "2rem",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                marginBottom: "0.35rem",
              }}
            >
              Dictation capture
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                marginBottom: "1.5rem",
              }}
            >
              Speak into your microphone. When stopped, the recording will be
              transcribed and used to generate a SOAP draft automatically.
            </p>

            {recordingError && (
              <div
                style={{
                  marginBottom: "1rem",
                  color: "#b91c1c",
                  fontWeight: 600,
                }}
              >
                {recordingError}
              </div>
            )}

            <div
              style={{
                borderRadius: "12px",
                padding: "1.25rem",
                marginBottom: "1.25rem",
                background: recordingActive ? "#fff5f5" : "var(--neutral-100)",
                border: recordingActive
                  ? "1px solid #fecaca"
                  : "1px solid var(--neutral-400)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: recordingActive ? "#dc2626" : "#94a3b8",
                    flexShrink: 0,
                    boxShadow: recordingActive
                      ? "0 0 0 4px rgba(220,38,38,0.25)"
                      : "none",
                  }}
                />
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: "0.9rem",
                    color: recordingActive ? "#991b1b" : "var(--text-muted)",
                  }}
                >
                  {recordingActive ? "Recording…" : "Ready"}
                </span>
              </div>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.05em",
                }}
              >
                {formatRecTime(recordingSeconds)}
              </div>
              {recordingActive && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    height: "36px",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    gap: "3px",
                  }}
                >
                  {[8, 14, 10, 18, 12, 20, 9, 15, 11].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: 4,
                        height: `${h}px`,
                        borderRadius: 2,
                        background: "var(--primary)",
                        opacity: 0.85,
                        transformOrigin: "center bottom",
                        animation: `careflow-meter 0.9s ease-in-out ${i * 0.07}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
              )}
              {transcribing && (
                <div
                  style={{
                    marginTop: "1rem",
                    fontSize: "0.9rem",
                    color: "var(--text-muted)",
                  }}
                >
                  Transcribing audio and generating SOAP...
                </div>
              )}
            </div>

            <style>{`
              @keyframes careflow-meter {
                from { transform: scaleY(0.4); opacity: 0.45; }
                to { transform: scaleY(1); opacity: 1; }
              }
            `}</style>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
              }}
            >
              {!recordingActive ? (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: "0.75rem", fontWeight: 700 }}
                  onClick={startRecording}
                >
                  Start recording
                </button>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "0.65rem" }}>
                    <button
                      type="button"
                      onClick={
                        recordingPaused ? resumeRecording : pauseRecording
                      }
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.75rem",
                        fontWeight: 700,
                        borderRadius: "10px",
                        border: "1px solid var(--neutral-400)",
                        background: recordingPaused
                          ? "var(--primary)"
                          : "#fff3cd",
                        color: recordingPaused ? "white" : "#332701",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      {recordingPaused ? "▶ Resume" : "⏸ Pause"}
                    </button>
                    <button
                      type="button"
                      onClick={stopRecordingAndInsert}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.75rem",
                        fontWeight: 700,
                        borderRadius: "10px",
                        border: "1px solid var(--neutral-400)",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      <Square size={16} fill="currentColor" /> Stop & append
                    </button>
                  </div>
                </>
              )}
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "0.65rem", fontWeight: 700 }}
                onClick={closeRecordingModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Patient Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "550px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow:
                "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "2rem 2rem 1rem 2rem",
                borderBottom: "1px solid var(--neutral-400)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  marginBottom: "0.5rem",
                  fontWeight: 700,
                }}
              >
                Add New Patient
              </h2>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                Register a new patient and add to the queue
              </p>
            </div>

            {/* Scrollable Content */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              {/* Error Message */}
              {addPatientErrors.submit && (
                <div
                  style={{
                    background: "#fee2e2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "1rem",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                  }}
                >
                  {addPatientErrors.submit}
                </div>
              )}

              {/* Patient Name with Search */}
              <div style={{ position: "relative" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Patient Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    const value = e.target.value;

                    setNewName(value);
                    setAddPatientErrors((prev) => ({ ...prev, name: "" }));

                    if (value.length > 1) {
                      searchPatients(value);
                    } else {
                      setSearchResults([]);
                      setShowSearchResults(false);
                    }
                  }}
                  placeholder="Start typing patient name..."
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    border: addPatientErrors.name
                      ? "2px solid #dc2626"
                      : "1px solid var(--neutral-400)",
                    fontSize: "1rem",
                    outline: "none",
                    background: "var(--neutral-100)",
                  }}
                />
                {addPatientErrors.name && (
                  <div
                    style={{
                      color: "#dc2626",
                      fontSize: "0.75rem",
                      marginTop: "0.25rem",
                      fontWeight: 500,
                    }}
                  >
                    {addPatientErrors.name}
                  </div>
                )}

                {/* Search Results Dropdown */}
                {showSearchResults && searchResults.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "white",
                      border: "1px solid var(--neutral-400)",
                      borderRadius: "8px",
                      marginTop: "4px",
                      zIndex: 10,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    {searchResults.map((patient: any) => (
                      <div
                        key={patient.id}
                        onClick={() => {
                          setNewName(patient.name);
                          setNewComplaint(patient.complaint || "");
                          setNewLevel(patient.level || 3);
                          setNewIcNumber(patient.ic_number || "");
                          setNewPhone(patient.phone || "");
                          setNewEmail(patient.email || "");
                          setShowSearchResults(false);
                          setAddPatientErrors({});
                        }}
                        style={{
                          padding: "0.75rem 1rem",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--neutral-200)",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "var(--neutral-100)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {patient.name}{" "}
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontWeight: 400,
                            fontSize: "0.75rem",
                          }}
                        >
                          Level {patient.level}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* IC Number */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  IC Number *
                </label>
                <input
                  type="text"
                  value={newIcNumber}
                  onChange={(e) => {
                    setNewIcNumber(e.target.value);
                    setAddPatientErrors({ ...addPatientErrors, icNumber: "" });
                  }}
                  placeholder="National ID or IC number..."
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    border: addPatientErrors.icNumber
                      ? "2px solid #dc2626"
                      : "1px solid var(--neutral-400)",
                    fontSize: "1rem",
                    outline: "none",
                    background: "var(--neutral-100)",
                  }}
                />
                {addPatientErrors.icNumber && (
                  <div
                    style={{
                      color: "#dc2626",
                      fontSize: "0.75rem",
                      marginTop: "0.25rem",
                      fontWeight: 500,
                    }}
                  >
                    {addPatientErrors.icNumber}
                  </div>
                )}
              </div>

              {/* Phone and Email */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => {
                      setNewPhone(e.target.value);
                      setAddPatientErrors({ ...addPatientErrors, phone: "" });
                    }}
                    placeholder="Contact number..."
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      border: addPatientErrors.phone
                        ? "2px solid #dc2626"
                        : "1px solid var(--neutral-400)",
                      fontSize: "1rem",
                      outline: "none",
                      background: "var(--neutral-100)",
                    }}
                  />
                  {addPatientErrors.phone && (
                    <div
                      style={{
                        color: "#dc2626",
                        fontSize: "0.75rem",
                        marginTop: "0.25rem",
                        fontWeight: 500,
                      }}
                    >
                      {addPatientErrors.phone}
                    </div>
                  )}
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setAddPatientErrors({ ...addPatientErrors, email: "" });
                    }}
                    placeholder="user@example.com"
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      border: addPatientErrors.email
                        ? "2px solid #dc2626"
                        : "1px solid var(--neutral-400)",
                      fontSize: "1rem",
                      outline: "none",
                      background: "var(--neutral-100)",
                    }}
                  />
                  {addPatientErrors.email && (
                    <div
                      style={{
                        color: "#dc2626",
                        fontSize: "0.75rem",
                        marginTop: "0.25rem",
                        fontWeight: 500,
                      }}
                    >
                      {addPatientErrors.email}
                    </div>
                  )}
                </div>
              </div>

              {/* Chief Complaint */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Chief Complaint *
                </label>
                <textarea
                  value={newComplaint}
                  onChange={(e) => {
                    setNewComplaint(e.target.value);
                    setAddPatientErrors({ ...addPatientErrors, complaint: "" });
                  }}
                  placeholder="Describe symptoms briefly..."
                  style={{
                    width: "100%",
                    minHeight: "60px",
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    border: addPatientErrors.complaint
                      ? "2px solid #dc2626"
                      : "1px solid var(--neutral-400)",
                    fontSize: "1rem",
                    outline: "none",
                    resize: "none",
                    background: "var(--neutral-100)",
                    fontFamily: "inherit",
                  }}
                />
                {addPatientErrors.complaint && (
                  <div
                    style={{
                      color: "#dc2626",
                      fontSize: "0.75rem",
                      marginTop: "0.25rem",
                      fontWeight: 500,
                    }}
                  >
                    {addPatientErrors.complaint}
                  </div>
                )}
              </div>

              {/* Urgency Level */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Assigned Urgency Level
                </label>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <button
                    onClick={() => setNewLevel(1)}
                    style={{
                      flex: 1,
                      padding: "1rem 0.5rem",
                      borderRadius: "8px",
                      border:
                        newLevel === 1
                          ? "2px solid #ba1a1a"
                          : "1px solid var(--neutral-400)",
                      background: newLevel === 1 ? "#ffdad6" : "white",
                      color: newLevel === 1 ? "#ba1a1a" : "var(--text-muted)",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "0.875rem",
                    }}
                  >
                    Level 1<br />
                    <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                      (Critical)
                    </span>
                  </button>
                  <button
                    onClick={() => setNewLevel(2)}
                    style={{
                      flex: 1,
                      padding: "1rem 0.5rem",
                      borderRadius: "8px",
                      border:
                        newLevel === 2
                          ? "2px solid var(--secondary)"
                          : "1px solid var(--neutral-400)",
                      background: newLevel === 2 ? "#e0f2fe" : "white",
                      color:
                        newLevel === 2
                          ? "var(--secondary)"
                          : "var(--text-muted)",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "0.875rem",
                    }}
                  >
                    Level 2<br />
                    <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                      (Urgent)
                    </span>
                  </button>
                  <button
                    onClick={() => setNewLevel(3)}
                    style={{
                      flex: 1,
                      padding: "1rem 0.5rem",
                      borderRadius: "8px",
                      border:
                        newLevel === 3
                          ? "2px solid var(--primary)"
                          : "1px solid var(--neutral-400)",
                      background: newLevel === 3 ? "#dbeafe" : "white",
                      color:
                        newLevel === 3 ? "var(--primary)" : "var(--text-muted)",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      fontSize: "0.875rem",
                    }}
                  >
                    Level 3<br />
                    <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                      (Standard)
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer with Buttons */}
            <div
              style={{
                padding: "1.5rem 2rem",
                borderTop: "1px solid var(--neutral-400)",
                display: "flex",
                gap: "1rem",
              }}
            >
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddModal(false);
                  setNewName("");
                  setNewComplaint("");
                  setNewLevel(3);
                  setNewIcNumber("");
                  setNewPhone("");
                  setNewEmail("");
                  setAddPatientErrors({});
                  setSearchResults([]);
                }}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  background: "var(--neutral-200)",
                  border: "none",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleAddPatient}
                style={{ flex: 2, padding: "0.75rem", fontWeight: 700 }}
              >
                Add to Live Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Patient Modal */}
      {showOverrideModal && overridePatient && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "2rem 2rem 1rem 2rem",
                borderBottom: "1px solid var(--neutral-400)",
              }}
            >
              <h2
                style={{
                  fontSize: "1.5rem",
                  marginBottom: "0.5rem",
                  fontWeight: 700,
                }}
              >
                Edit Patient: {overridePatient.name}
              </h2>
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  margin: 0,
                }}
              >
                Update clinical information and assignment
              </p>
            </div>

            {/* Scrollable Content */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "2rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.5rem",
              }}
            >
              {/* Error Message */}
              {overrideErrors.submit && (
                <div
                  style={{
                    background: "#fee2e2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "1rem",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                  }}
                >
                  {overrideErrors.submit}
                </div>
              )}

              {/* Urgency Level */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Urgency Level
                </label>
                <div style={{ display: "flex", gap: "1rem" }}>
                  {[1, 2, 3].map((level) => (
                    <button
                      key={level}
                      onClick={() => setOverrideLevel(level)}
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border:
                          overrideLevel === level
                            ? `2px solid ${level === 1 ? "#ba1a1a" : level === 2 ? "var(--secondary)" : "var(--primary)"}`
                            : "1px solid var(--neutral-400)",
                        background:
                          overrideLevel === level
                            ? level === 1
                              ? "#ffdad6"
                              : level === 2
                                ? "#e0f2fe"
                                : "#dbeafe"
                            : "white",
                        color:
                          overrideLevel === level
                            ? level === 1
                              ? "#ba1a1a"
                              : level === 2
                                ? "var(--secondary)"
                                : "var(--primary)"
                            : "var(--text-muted)",
                        fontWeight: 700,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        fontSize: "0.875rem",
                      }}
                    >
                      L{level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Diagnosis */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Diagnosis
                </label>
                <input
                  type="text"
                  value={overrideDiagnosis}
                  onChange={(e) => setOverrideDiagnosis(e.target.value)}
                  placeholder="Clinical diagnosis..."
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--neutral-400)",
                    fontSize: "1rem",
                    outline: "none",
                    background: "var(--neutral-100)",
                  }}
                />
              </div>

              {/* Vitals Section */}
              <div
                style={{
                  borderTop: "1px solid var(--neutral-400)",
                  paddingTop: "1rem",
                }}
              >
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "1rem",
                  }}
                >
                  Triage Vitals
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Blood Pressure
                    </label>
                    <input
                      type="text"
                      value={overrideBP}
                      onChange={(e) => setOverrideBP(e.target.value)}
                      placeholder="e.g., 120/80"
                      style={{
                        width: "100%",
                        padding: "0.6rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid var(--neutral-400)",
                        fontSize: "0.875rem",
                        outline: "none",
                        background: "var(--neutral-100)",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Heart Rate
                    </label>
                    <input
                      type="text"
                      value={overrideHR}
                      onChange={(e) => setOverrideHR(e.target.value)}
                      placeholder="e.g., 72 bpm"
                      style={{
                        width: "100%",
                        padding: "0.6rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid var(--neutral-400)",
                        fontSize: "0.875rem",
                        outline: "none",
                        background: "var(--neutral-100)",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      O2 Sat
                    </label>
                    <input
                      type="text"
                      value={overrideO2}
                      onChange={(e) => setOverrideO2(e.target.value)}
                      placeholder="e.g., 98%"
                      style={{
                        width: "100%",
                        padding: "0.6rem 0.8rem",
                        borderRadius: "6px",
                        border: "1px solid var(--neutral-400)",
                        fontSize: "0.875rem",
                        outline: "none",
                        background: "var(--neutral-100)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Department & Doctor */}
              <div
                style={{
                  borderTop: "1px solid var(--neutral-400)",
                  paddingTop: "1rem",
                }}
              >
                <h3
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    marginBottom: "1rem",
                  }}
                >
                  Assignment
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Department
                    </label>
                    <select
                      value={overrideDeptId}
                      onChange={(e) => {
                        const deptId = e.target.value;
                        setOverrideDeptId(deptId);

                        if (!deptId) {
                          // ✅ NO department → show ALL doctors
                          setFilteredDoctors(allDoctors);
                        } else {
                          // ✅ filter doctors
                          const filtered = allDoctors.filter(
                            (d: any) => d.department_id === deptId,
                          );
                          setFilteredDoctors(filtered);
                        }

                        setOverrideDocId("");
                      }}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--neutral-400)",
                        fontSize: "0.875rem",
                        outline: "none",
                        background: "var(--neutral-100)",
                      }}
                    >
                      <option value="">Select Department</option>
                      {(boardData?.departments || []).map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.875rem",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Doctor
                    </label>
                    <select
                      value={overrideDocId}
                      onChange={(e) => {
                        const docId = e.target.value;
                        setOverrideDocId(docId);

                        const selectedDoctor = allDoctors.find(
                          (d: any) => d.id === docId,
                        );

                        if (selectedDoctor) {
                          // ✅ AUTO SET department
                          setOverrideDeptId(selectedDoctor.department_id);

                          // ✅ ALSO filter doctor list to that department
                          const filtered = allDoctors.filter(
                            (d: any) =>
                              d.department_id === selectedDoctor.department_id,
                          );
                          setFilteredDoctors(filtered);
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--neutral-400)",
                        fontSize: "0.875rem",
                        outline: "none",
                        background: "var(--neutral-100)",
                      }}
                    >
                      <option value="">Select Doctor</option>
                      {filteredDoctors.map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.name ||
                            d.full_name ||
                            d.user?.full_name ||
                            "Unknown Doctor"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div
              style={{
                padding: "1.5rem 2rem",
                borderTop: "1px solid var(--neutral-400)",
                display: "flex",
                gap: "1rem",
              }}
            >
              <button
                className="btn-secondary"
                onClick={() => setShowOverrideModal(false)}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  background: "var(--neutral-200)",
                  border: "none",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleOverrideSubmit}
                style={{ flex: 2, padding: "0.75rem", fontWeight: 700 }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutSidebar>
  );
}
