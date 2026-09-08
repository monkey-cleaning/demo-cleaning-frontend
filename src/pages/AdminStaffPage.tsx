// pages/admin/AdminStaffPage.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, Search, X, ChevronLeft, ChevronRight,
  Phone, Mail, Pencil, Loader2, AlertCircle, RefreshCw,
  Shield, Car, CalendarOff, DollarSign,
  CalendarDays, Clock, History,
} from "lucide-react";
import RequireAdmin from "../components/admin/RequireAdmin";
import { ScheduleEditorModal } from "../components/admin/ScheduleEditorModal";
import AdminNavbar from '../components/admin/AdminNavbar';
import HistoryDrawer from "../components/admin/HistoryDrawer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  hire_date: string | null;
  is_active: boolean;
  hourly_work_rate: number;
  hourly_travel_rate: number;
  notes: string | null;
  has_license: boolean | null;
  is_team_leader: boolean | null;
  e_transfer_email: string | null;
  gender: "male" | "female" | "other" | null;
  created_at: string | null;
  updated_at: string | null;
  // populated by getEmployee
  availability?: AvailabilityRow[];
  time_off?: TimeOffRow[];
  // computed locally
  weekly_services?: number;
  day_status?: DayStatus;
  team?: string | null;
}

type DayStatus = "active" | "available" | "off";

interface AvailabilityRow {
  day_of_week: number; // 0=Sun … 6=Sat
  start_time: string;
  end_time: string;
}

interface TimeOffRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  notes: string | null;
}

// Simulated appointment shape — adapt to your real API response
interface Appointment {
  id: string;
  date: string;        // ISO date "YYYY-MM-DD"
  start_time: string;  // "HH:MM"
  end_time: string;
  client_name?: string;
  address?: string;
  status: "confirmed" | "pending" | "completed" | "cancelled";
}

interface EmployeeFormData {
  name: string;
  email: string;
  phone: string;
  hire_date: string;
  is_active: boolean;
  hourly_work_rate: string;
  hourly_travel_rate: string;
  has_license: boolean;
  is_team_leader: boolean;
  e_transfer_email: string;
  notes: string;
  gender: "" | "male" | "female" | "other";
}

interface Pagination { page: number; pages: number; total: number; limit: number; }

interface ListEmployeesResponse {
  ok: boolean;
  employees: Employee[];
  pagination: Pagination;
}

// ── API ───────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("admin_blog_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LABELS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function hireDateLabel(hire_date: string | null) {
  if (!hire_date) return null;
  const ms = Date.now() - new Date(hire_date + "T12:00:00").getTime();
  const years = Math.floor(ms / (365.25 * 86_400_000));
  if (years >= 1) return `${years}y`;
  const months = Math.floor(ms / (30.44 * 86_400_000));
  return `${months}mo`;
}

/** Returns Monday and Sunday of the current week (Argentina timezone-safe) */
function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

/**
 * Compute a simple day status from availability + time_off.
 * "active"     → has at least one appointment today (would require real apt data)
 * "available" → has availability today and no time off
 * "off"      → no availability today or time off covers today
 *
 * Without real appointment data from the API we derive it from availability only.
 */
function computeDayStatus(emp: Employee): DayStatus {
  const todayDow = new Date().getDay();
  const todayIso = isoDate(new Date());

  // Check time off
  const onTimeOff = (emp.time_off ?? []).some(
    t => t.start_date <= todayIso && t.end_date >= todayIso
  );
  if (onTimeOff) return "off";

  // Check availability for today
  const hasAvailability = (emp.availability ?? []).some(a => a.day_of_week === todayDow);
  if (!hasAvailability) return "off";

  return "available";
}

/**
 * Count time-off entries that overlap with the next 3 weeks from today.
 * - Includes absences that are currently active (started but not ended yet).
 * - Excludes purely past absences and those starting more than 21 days away.
 */
function countUpcomingTimeOff(timeOff: TimeOffRow[]): number {
  const today = new Date();
  const todayIso = isoDate(today);
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() + 21);
  const cutoffIso = isoDate(cutoff);

  return timeOff.filter(t =>
    t.end_date >= todayIso &&   // not fully in the past
    t.start_date <= cutoffIso     // starts within the next 3 weeks
  ).length;
}

const EMPTY_FORM: EmployeeFormData = {
  name: "", email: "", phone: "", hire_date: "",
  is_active: true,
  hourly_work_rate: "", hourly_travel_rate: "",
  has_license: false, is_team_leader: false,
  e_transfer_email: "", notes: "",
  gender: "",
};

// ── DAY STATUS BADGE ──────────────────────────────────────────────────────────

const DAY_STATUS_MAP: Record<DayStatus, { label: string; className: string; dot: string }> = {
  active: { label: "Active", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", dot: "bg-emerald-500" },
  available: { label: "Available", className: "bg-blue-50 text-blue-600 ring-1 ring-blue-200", dot: "bg-blue-400" },
  off: { label: "Off", className: "bg-gray-100 text-gray-500 ring-1 ring-gray-200", dot: "bg-gray-400" },
};

function DayStatusBadge({ status }: { status: DayStatus }) {
  const cfg = DAY_STATUS_MAP[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── WEEKLY SCHEDULE MODAL ─────────────────────────────────────────────────────

/**
 * Shows the weekly schedule for a single employee.
 * Fetches real appointments from /api/admin/appointments?employee_id=X&start=&end=
 * Falls back gracefully if that endpoint doesn't exist yet.
 */
function WeeklyScheduleModal({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const { start, end } = getCurrentWeekRange();

  // Build array of 7 days (Mon → Sun)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  useEffect(() => {
    async function fetchSchedule() {
      try {
        const params = new URLSearchParams({
          employee_id: employee.id,
          start: isoDate(start),
          end: isoDate(end),
        });
        // Try to fetch from the appointments endpoint — adapt path as needed
        const data = await apiFetch<{ ok: boolean; appointments: Appointment[] }>(
          `/api/admin/appointments?${params}`
        );
        setAppointments(data.appointments ?? []);
      } catch {
        // Endpoint may not exist yet; show availability-based placeholder
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const aptsByDate: Record<string, Appointment[]> = {};
  for (const apt of appointments) {
    if (!aptsByDate[apt.date]) aptsByDate[apt.date] = [];
    aptsByDate[apt.date].push(apt);
  }

  const todayIso = isoDate(new Date());

  const STATUS_COLORS: Record<string, string> = {
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-red-50 text-red-400 border-red-200 line-through opacity-60",
  };

  const STATUS_LABELS: Record<string, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    completed: "Completed",
    cancelled: "Cancelled",
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl flex flex-col max-h-[92vh]">
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Week</p>
            <h2 className="font-bold text-[#031634] text-base mt-0.5">{employee.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatDate(isoDate(start))} → {formatDate(isoDate(end))}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-2">
          {loading ? (
            <div className="py-12 text-center text-gray-300">
              <RefreshCw size={18} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading schedule…</p>
            </div>
          ) : (
            days.map((day, i) => {
              const iso = isoDate(day);
              const isToday = iso === todayIso;
              const dowIdx = day.getDay();
              const hasAvailability = (employee.availability ?? []).some(a => a.day_of_week === dowIdx);
              const dayApts = aptsByDate[iso] ?? [];
              const timeOff = (employee.time_off ?? []).find(t => t.start_date <= iso && t.end_date >= iso);

              return (
                <div key={iso}
                  className={`rounded-xl border px-4 py-3 transition-colors ${isToday
                    ? "border-[#031634]/20 bg-[#031634]/[0.03]"
                    : "border-gray-100 bg-white"
                    }`}>
                  {/* Day header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${isToday ? "text-[#031634]" : "text-gray-400"}`}>
                        {DOW_LABELS_FULL[i === 6 ? 0 : i + 1]}
                      </span>
                      <span className={`text-xs ${isToday ? "font-bold text-[#031634]" : "text-gray-400"}`}>
                        {day.getDate()}/{day.getMonth() + 1}
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-semibold bg-[#031634] text-white px-1.5 py-0.5 rounded-full">TODAY</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {timeOff && (
                        <span className="text-[10px] font-semibold bg-orange-50 text-orange-600 ring-1 ring-orange-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CalendarOff size={9} /> {timeOff.reason ?? "Absent"}
                        </span>
                      )}
                      {!timeOff && hasAvailability && dayApts.length === 0 && (
                        <span className="text-[10px] text-gray-400">No services</span>
                      )}
                      {!timeOff && !hasAvailability && (
                        <span className="text-[10px] text-gray-300">No available</span>
                      )}
                    </div>
                  </div>

                  {/* Appointments */}
                  {dayApts.length > 0 ? (
                    <div className="space-y-1.5">
                      {dayApts.map(apt => (
                        <div key={apt.id}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-xs ${STATUS_COLORS[apt.status] ?? STATUS_COLORS.confirmed}`}>
                          <div className="flex-shrink-0 font-semibold mt-0.5">
                            {apt.start_time} – {apt.end_time}
                          </div>
                          <div className="flex-1 min-w-0">
                            {apt.client_name && <p className="font-semibold truncate">{apt.client_name}</p>}
                            {apt.address && <p className="text-[11px] opacity-70 truncate">{apt.address}</p>}
                          </div>
                          <span className="flex-shrink-0 opacity-70">{STATUS_LABELS[apt.status]}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Placeholder availability bar */
                    hasAvailability && !timeOff && (
                      <div className="h-1 rounded-full bg-gray-100" />
                    )
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400">
            {appointments.length} service{appointments.length !== 1 ? "s" : ""} this week
          </p>
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-[#031634] text-white rounded-xl hover:bg-[#031634]/90 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EmployeeFormModal ─────────────────────────────────────────────────────────

function EmployeeFormModal({
  employee, onClose, onSaved,
}: {
  employee?: Employee;
  onClose: () => void;
  onSaved: (e: Employee) => void;
}) {
  const isEdit = !!employee;
  const [form, setForm] = useState<EmployeeFormData>(() =>
    employee ? {
      name: employee.name,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      hire_date: employee.hire_date ?? "",
      is_active: employee.is_active,
      hourly_work_rate: String(employee.hourly_work_rate),
      hourly_travel_rate: String(employee.hourly_travel_rate),
      has_license: employee.has_license ?? false,
      is_team_leader: employee.is_team_leader ?? false,
      e_transfer_email: employee.e_transfer_email ?? "",
      notes: employee.notes ?? "",
      gender: employee.gender ?? "",
    } : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof EmployeeFormData, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.email.trim()) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Enter a valid email address"); return;
    }
    if (!form.hourly_work_rate || isNaN(parseFloat(form.hourly_work_rate))) {
      setError("Work rate is required"); return;
    }
    if (!form.hourly_travel_rate || isNaN(parseFloat(form.hourly_travel_rate))) {
      setError("Travel rate is required"); return;
    }
    setSaving(true); setError(null);
    try {
      const body = {
        ...form,
        hourly_work_rate: parseFloat(form.hourly_work_rate),
        hourly_travel_rate: parseFloat(form.hourly_travel_rate),
        hire_date: form.hire_date || null,
        email: form.email.trim(),
        phone: form.phone || null,
        e_transfer_email: form.e_transfer_email || null,
        notes: form.notes || null,
        gender: form.gender || null,
      };
      const result = isEdit
        ? await apiFetch<{ employee: Employee }>(`/api/admin/staff/${employee!.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch<{ employee: Employee }>(`/api/admin/staff`, { method: "POST", body: JSON.stringify(body) });
      onSaved(result.employee);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  const inp = "w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-[#031634] text-base">
            {isEdit ? "Edit cleaner" : "New Cleaner"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={13} /> {error}
            </p>
          )}

          <div>
            <label className={lbl}>Full name <span className="text-red-400">*</span></label>
            <input className={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Jane Smith" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Email <span className="text-red-400">*</span></label>
              <input type="email" required className={inp} value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@email.com" />
            </div>
            <div><label className={lbl}>Phone</label>
              <input type="tel" className={inp} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+54 11 1234 5678" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Work rate ($/hr) <span className="text-red-400">*</span></label>
              <input type="number" min="0" step="0.01" className={inp} value={form.hourly_work_rate}
                onChange={e => set("hourly_work_rate", e.target.value)} placeholder="50.00" />
            </div>
            <div><label className={lbl}>Travel rate ($/hr) <span className="text-red-400">*</span></label>
              <input type="number" min="0" step="0.01" className={inp} value={form.hourly_travel_rate}
                onChange={e => set("hourly_travel_rate", e.target.value)} placeholder="25.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Hire date</label>
              <input type="date" className={inp} value={form.hire_date} onChange={e => set("hire_date", e.target.value)} />
            </div>
            <div><label className={lbl}>e-Transfer email</label>
              <input type="email" className={inp} value={form.e_transfer_email}
                onChange={e => set("e_transfer_email", e.target.value)} placeholder="payment@email.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Gender</label>
              <select className={inp} value={form.gender} onChange={e => set("gender", e.target.value)}>
                <option value="">Not set</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "is_team_leader", label: "Team leader", icon: <Shield size={13} /> },
              { id: "has_license", label: "Has license", icon: <Car size={13} /> },
            ] as { id: keyof EmployeeFormData; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
              <button key={id} type="button"
                onClick={() => set(id, !form[id])}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${form[id]
                  ? "bg-[#031634] text-white border-[#031634]"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}>
                {icon} {label}
              </button>
            ))}
          </div>

          {isEdit && (
            <div className="flex items-center gap-3 py-1">
              <input type="checkbox" id="is_active" checked={form.is_active}
                onChange={e => set("is_active", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#031634] focus:ring-[#031634]" />
              <label htmlFor="is_active" className="text-sm text-gray-600 select-none">Active Cleaner</label>
            </div>
          )}

          <div><label className={lbl}>Notes</label>
            <textarea rows={3} className={`${inp} resize-none`} value={form.notes}
              onChange={e => set("notes", e.target.value)} placeholder="Special skills, equipment, preferences…" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-[#031634] text-white rounded-xl hover:bg-[#031634]/90 disabled:opacity-50 transition-colors flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save changes" : "Create cleaner"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── EmployeeDrawer ────────────────────────────────────────────────────────────

function EmployeeDrawer({
  employeeId, onClose, onEdit, onDeactivated,
}: {
  employeeId: string;
  onClose: () => void;
  onEdit: (e: Employee) => void;
  onDeactivated: (id: string) => void;
}) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    apiFetch<{ employee: Employee }>(`/api/admin/staff/${employeeId}`)
      .then(r => setEmployee(r.employee))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [employeeId]);

  async function handleDeactivate() {
    if (!employee) return;
    setDeactivating(true);
    try {
      const r = await apiFetch<{ employee: Employee }>(`/api/admin/staff/${employee.id}`, { method: "DELETE" });
      onDeactivated(r.employee.id);
      onClose();
    } catch (e: any) { alert(`Error: ${e.message}`); setDeactivating(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="bg-white h-full w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0 bg-[#031634] text-white">
          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Cleaner</p>
            {loading ? (
              <div className="h-5 w-36 bg-white/10 rounded animate-pulse" />
            ) : (
              <h3 className="font-bold text-lg leading-tight">{employee?.name ?? "—"}</h3>
            )}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {employee?.is_team_leader && (
                <span className="text-[10px] font-semibold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Shield size={9} /> Leader
                </span>
              )}
              {employee?.has_license && (
                <span className="text-[10px] font-semibold bg-blue-400/20 text-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Car size={9} /> License
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
            <button onClick={() => setShowHistory(true)} title="Change history"
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <History size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {showHistory && employee && (
          <HistoryDrawer
            entityType="employee"
            entityId={employee.id}
            title={employee.name}
            onClose={() => setShowHistory(false)}
          />
        )}

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-xl" />
              ))}
            </div>
          ) : employee ? (
            <div className="space-y-5">
              {/* Contact */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Contact</p>
                <div className="space-y-2">
                  {employee.email && (
                    <a href={`mailto:${employee.email}`}
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#031634] transition-colors">
                      <Mail size={13} className="text-gray-400 flex-shrink-0" />
                      {employee.email}
                    </a>
                  )}
                  {employee.phone && (
                    <a href={`tel:${employee.phone}`}
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#031634] transition-colors">
                      <Phone size={13} className="text-gray-400 flex-shrink-0" />
                      {employee.phone}
                    </a>
                  )}
                  {employee.e_transfer_email && (
                    <p className="flex items-center gap-2 text-sm text-gray-700">
                      <DollarSign size={13} className="text-gray-400 flex-shrink-0" />
                      {employee.e_transfer_email}
                    </p>
                  )}
                </div>
              </section>

              {/* Rates */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Rates</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 font-medium">Work</p>
                    <p className="text-base font-bold text-[#031634] mt-0.5">${Number(employee.hourly_work_rate).toFixed(2)}/hr</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 font-medium">Travel</p>
                    <p className="text-base font-bold text-[#031634] mt-0.5">${Number(employee.hourly_travel_rate).toFixed(2)}/hr</p>
                  </div>
                </div>
              </section>

              {/* Availability */}
              {(employee.availability ?? []).length > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Weekly availability</p>
                  <div className="space-y-1">
                    {employee.availability!.map(a => (
                      <div key={a.day_of_week} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 w-8">{DOW_LABELS[a.day_of_week]}</span>
                        <span className="text-gray-700">{formatTime(a.start_time)} – {formatTime(a.end_time)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Time off */}
              {(employee.time_off ?? []).length > 0 && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Upcoming time off</p>
                  <div className="space-y-1.5">
                    {employee.time_off!.map(t => (
                      <div key={t.id} className="flex items-start gap-2 text-xs bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                        <CalendarOff size={11} className="text-orange-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-orange-700">{formatDate(t.start_date)} → {formatDate(t.end_date)}</p>
                          {t.reason && <p className="text-orange-500 mt-0.5">{t.reason}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Notes */}
              {employee.notes && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Notes</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{employee.notes}</p>
                </section>
              )}

              {/* Meta */}
              <section className="text-xs text-gray-400 space-y-0.5 pt-2 border-t border-gray-50">
                {employee.hire_date && <p>Hired: {formatDate(employee.hire_date)} ({hireDateLabel(employee.hire_date)})</p>}
                {employee.updated_at && <p>Updated: {formatDate(employee.updated_at.split("T")[0])}</p>}
              </section>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">Not found</p>
          )}
        </div>

        {employee && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-shrink-0">
            {confirmDeactivate ? (
              <div className="flex items-center gap-2 w-full">
                <p className="text-xs text-red-500 flex-1">Deactivate {employee.name}?</p>
                <button onClick={() => setConfirmDeactivate(false)}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={handleDeactivate} disabled={deactivating}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50">
                  {deactivating && <Loader2 size={11} className="animate-spin" />} Deactivate
                </button>
              </div>
            ) : (
              <>
                {employee.is_active && (
                  <button onClick={() => setConfirmDeactivate(true)}
                    className="px-3 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    Deactivate
                  </button>
                )}
                <button onClick={() => onEdit(employee)}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#031634] text-white rounded-xl hover:bg-[#031634]/90 transition-colors">
                  <Pencil size={13} /> Edit
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const ACTIVE_FILTERS = [
  { value: "true", label: "Actives" },
  { value: "false", label: "Inactives" },
  { value: "all", label: "All" },
];

export default function AdminStaffPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: 25 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("true");
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  // LAB418 — atajo de historial a nivel fila.
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);

  // CA2: employee whose weekly schedule is being viewed
  const [scheduleEmployee, setScheduleEmployee] = useState<Employee | null>(null);

  // Schedule editor (availability + time-off)
  const [scheduleEditorEmployee, setScheduleEditorEmployee] = useState<Employee | null>(null);

  // Time-off history — opens ScheduleEditorModal directly on the time_off tab
  const [timeOffEditorEmployee, setTimeOffEditorEmployee] = useState<Employee | null>(null);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = search, active = activeFilter, pg = page) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "25", active });
      if (q.trim()) params.set("search", q.trim());
      const data = await apiFetch<ListEmployeesResponse>(`/api/admin/staff?${params}`);

      // Enrich each employee with day_status (availability needed — fetch details async in background)
      // For the list view we show a best-effort status based on is_active only.
      // A separate enrichment pass calls getEmployee to get availability+time_off.
      const enriched: Employee[] = data.employees.map(e => ({
        ...e,
        weekly_services: undefined,   // populated asynchronously
        day_status: e.is_active ? "available" : "off",
        team: null,
      }));

      setEmployees(enriched);
      setPagination(data.pagination);

      // Async enrichment: fetch detail for each employee to get real day_status
      // We fire all requests in parallel but don't block the render.
      enrichEmployees(enriched);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeFilter, page]);

  /**
   * Fetch individual employee details (availability, time_off) in parallel,
   * and weekly service counts in a single batch request instead of N+1 calls.
   */
  async function enrichEmployees(list: Employee[]) {
    const { start, end } = getCurrentWeekRange();

    // ── 1. Batch fetch weekly counts (single request for all employees) ──────
    let weeklySummary: Record<string, number> = {};
    try {
      const summaryParams = new URLSearchParams({
        start: isoDate(start),
        end: isoDate(end),
      });
      const summaryData = await apiFetch<{ ok: boolean; summary: Record<string, number> }>(
        `/api/admin/appointments/weekly-summary?${summaryParams}`
      );
      weeklySummary = summaryData.summary ?? {};
    } catch {
      // Endpoint not available yet — weekly_services will stay as -1 (shows "—")
    }

    // ── 2. Fetch detail per employee (availability + time_off) in parallel ───
    await Promise.allSettled(
      list.map(async (emp) => {
        try {
          const detail = await apiFetch<{ employee: Employee }>(`/api/admin/staff/${emp.id}`);
          const enriched = detail.employee;

          const day_status = emp.is_active ? computeDayStatus(enriched) : "off";
          // If the employee has no entry in the summary map, they have 0 services.
          // Only use -1 (renders as "—") when the whole batch fetch failed.
          const weekly_services = Object.keys(weeklySummary).length > 0
            ? (weeklySummary[emp.id] ?? 0)
            : -1;

          setEmployees(prev =>
            prev.map(e =>
              e.id === emp.id
                ? { ...e, ...enriched, day_status, weekly_services }
                : e
            )
          );
        } catch {
          // silently skip individual failures
        }
      })
    );
  }

  useEffect(() => { load(); }, [load]);

  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); load(v, activeFilter, 1); }, 350);
  }

  function handleActiveFilter(v: string) {
    setActiveFilter(v); setPage(1); load(search, v, 1);
  }

  function handlePageChange(p: number) {
    setPage(p); load(search, activeFilter, p);
  }

  function handleEmployeeSaved(saved: Employee) {
    setEmployees(prev => {
      const i = prev.findIndex(e => e.id === saved.id);
      if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], ...saved }; return n; }
      return [{ ...saved, day_status: "available", weekly_services: undefined }, ...prev];
    });
    setEditingEmployee(null);
    setCreatingNew(false);
  }

  function handleDeactivated(id: string) {
    if (activeFilter === "true") {
      setEmployees(prev => prev.filter(e => e.id !== id));
    } else {
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, is_active: false, day_status: "off" } : e));
    }
    if (selectedId === id) setSelectedId(null);
  }

  const totalActive = employees.filter(e => e.is_active).length;
  const totalInactive = employees.filter(e => !e.is_active).length;

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">

        {/* ── Navbar ── */}
        <AdminNavbar
          title="Cleaners"
          onRefresh={() => load()}
          refreshing={loading}
          rightSlot={
            <button
              onClick={() => setCreatingNew(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-navy text-xs font-semibold rounded-lg hover:bg-white/90 transition-colors"
            >
              <Plus size={13} /> New Cleaner
            </button>
          }
        />

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text" value={search} onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search by name, email or phone number"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all"
              />
              {search && (
                <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ACTIVE_FILTERS.map(f => (
                <button key={f.value} onClick={() => handleActiveFilter(f.value)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeFilter === f.value ? "bg-[#031634] text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-400">{pagination.total} total</span>
              {activeFilter !== "false" && totalActive > 0 && <span className="text-xs font-semibold text-emerald-600">{totalActive} actives</span>}
              {activeFilter !== "true" && totalInactive > 0 && <span className="text-xs font-semibold text-red-400">{totalInactive} inactives</span>}
            </div>
          </div>


          {/* ── CA1: Staff table ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Phone</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden xl:table-cell">Team</th>
                    {/* CA1: new columns */}
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Services this week</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status Today</th>
                    {/* CA2: Ver agenda */}
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading && employees.length === 0 ? (
                    <tr><td colSpan={6} className="py-16 text-center text-gray-300 text-sm">
                      <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-gray-200" />Loading...
                    </td></tr>
                  ) : employees.length === 0 ? (
                    <tr><td colSpan={6} className="py-16 text-center text-gray-300 text-sm">No cleaners</td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id}
                      className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedId(emp.id)}>

                      {/* Nombre */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-semibold text-[#031634] flex items-center gap-1.5">
                              {emp.name}
                              {emp.is_team_leader && <span title="Team leader"><Shield size={11} className="text-amber-500 flex-shrink-0" /></span>}
                              {emp.has_license && <span title="Has license"><Car size={11} className="text-blue-400 flex-shrink-0" /></span>}
                            </p>
                            {emp.email && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px] lg:hidden">{emp.email}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        {emp.phone
                          ? <a href={`tel:${emp.phone}`} onClick={e => e.stopPropagation()}
                            className="text-xs text-gray-600 hover:text-[#031634] flex items-center gap-1 transition-colors">
                            <Phone size={11} className="text-gray-400" /> {emp.phone}
                          </a>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>

                      {/* Equipo */}
                      <td className="px-5 py-3.5 hidden xl:table-cell">
                        {emp.team
                          ? <span className="text-xs text-gray-600">{emp.team}</span>
                          : <span className="text-xs text-gray-300">—</span>}
                      </td>

                      {/* CA1: Servicios esta semana */}
                      <td className="px-5 py-3.5">
                        {emp.weekly_services === undefined ? (
                          <span className="inline-block w-8 h-4 bg-gray-100 rounded animate-pulse" />
                        ) : emp.weekly_services === -1 ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-bold ${emp.weekly_services === 0 ? "text-gray-300" : "text-[#031634]"
                              }`}>{emp.weekly_services}</span>
                            {emp.weekly_services > 0 && (
                              <span className="text-xs text-gray-400">service{emp.weekly_services !== 1 ? "s" : ""}</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* CA1: Day status */}
                      <td className="px-5 py-3.5">
                        {emp.day_status
                          ? <DayStatusBadge status={emp.day_status} />
                          : <span className="inline-block w-16 h-5 bg-gray-100 rounded-full animate-pulse" />}
                      </td>

                      {/* CA2: Ver agenda + edit */}
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setScheduleEditorEmployee(emp)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                            title="Edit schedule & availability">
                            <Clock size={12} /> Schedule
                          </button>
                          {/* Time-off history button — shows badge if there are upcoming absences */}
                          <button
                            onClick={() => setTimeOffEditorEmployee(emp)}
                            className="relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                            title="View & manage time off">
                            <CalendarOff size={12} />
                            Absences
                            {countUpcomingTimeOff(emp.time_off ?? []) > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                                {countUpcomingTimeOff(emp.time_off ?? [])}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => setScheduleEmployee(emp)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#031634]/5 text-[#031634] hover:bg-[#031634]/10 transition-colors"
                            title="See weekly schedule">
                            <CalendarDays size={12} /> See calendar
                          </button>
                          <button onClick={() => setEditingEmployee(emp)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#031634] hover:bg-gray-100 transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setHistoryEmployee(emp)}
                            title="Change history"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#031634] hover:bg-gray-100 transition-colors">
                            <History size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {loading && employees.length === 0 ? (
                <div className="py-16 text-center text-gray-300 text-sm">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-gray-200" />Loading…
                </div>
              ) : employees.length === 0 ? (
                <div className="py-16 text-center text-gray-300 text-sm">No cleaners</div>
              ) : employees.map(emp => (
                <div key={emp.id} className="px-4 py-4 active:bg-gray-50">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3"
                    onClick={() => setSelectedId(emp.id)}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#031634] flex items-center gap-1.5">
                        {emp.name}
                        {emp.is_team_leader && <Shield size={11} className="text-amber-500" />}
                        {emp.has_license && <Car size={11} className="text-blue-400" />}
                      </p>
                      {emp.phone && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Phone size={10} /> {emp.phone}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={13} className="text-gray-300 flex-shrink-0 mt-1" />
                  </div>

                  {/* Bottom row: badges + Ver agenda */}
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    {emp.day_status
                      ? <DayStatusBadge status={emp.day_status} />
                      : <span className="inline-block w-16 h-5 bg-gray-100 rounded-full animate-pulse" />}

                    {emp.weekly_services !== undefined && emp.weekly_services >= 0 && (
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                        {emp.weekly_services} serv. this week
                      </span>
                    )}

                    <button
                      onClick={e => { e.stopPropagation(); setScheduleEditorEmployee(emp); }}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
                      <Clock size={12} /> Schedule
                    </button>
                    {/* Time-off shortcut for mobile */}
                    <button
                      onClick={e => { e.stopPropagation(); setTimeOffEditorEmployee(emp); }}
                      className="relative flex items-center gap-1 text-xs font-semibold text-orange-500 hover:text-orange-700 transition-colors">
                      <CalendarOff size={12} /> Absences
                      {countUpcomingTimeOff(emp.time_off ?? []) > 0 && (
                        <span className="ml-0.5 inline-flex items-center justify-center min-w-[14px] h-3.5 px-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-full leading-none">
                          {countUpcomingTimeOff(emp.time_off ?? [])}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setScheduleEmployee(emp); }}
                      className="ml-auto flex items-center gap-1 text-xs font-semibold text-[#031634]/70 hover:text-[#031634] transition-colors">
                      <CalendarDays size={12} /> See calendar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between text-sm">
                <span className="text-gray-400 text-xs">{pagination.total} cleaners</span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#031634] disabled:opacity-30 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2 text-gray-600 text-xs">{page} / {pagination.pages}</span>
                  <button disabled={page >= pagination.pages} onClick={() => handlePageChange(page + 1)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#031634] disabled:opacity-30 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CA2: Weekly schedule modal */}
      {scheduleEmployee && (
        <WeeklyScheduleModal
          employee={scheduleEmployee}
          onClose={() => setScheduleEmployee(null)}
        />
      )}

      {/* Schedule editor — availability + time off */}
      {scheduleEditorEmployee && (
        <ScheduleEditorModal
          employee={scheduleEditorEmployee}
          onClose={() => setScheduleEditorEmployee(null)}
          onSaved={(updated) => {
            setEmployees(prev =>
              prev.map(e => e.id === updated.id ? { ...e, ...updated } : e)
            );
            setScheduleEditorEmployee(updated);
          }}
        />
      )}

      {/* Time-off history shortcut — same modal, opens on time_off tab directly */}
      {timeOffEditorEmployee && (
        <ScheduleEditorModal
          employee={timeOffEditorEmployee}
          initialTab="time_off"
          onClose={() => setTimeOffEditorEmployee(null)}
          onSaved={(updated) => {
            setEmployees(prev =>
              prev.map(e => e.id === updated.id ? { ...e, ...updated } : e)
            );
            setTimeOffEditorEmployee(updated);
          }}
        />
      )}

      {/* Employee detail drawer */}
      {selectedId && !editingEmployee && (
        <EmployeeDrawer
          employeeId={selectedId}
          onClose={() => setSelectedId(null)}
          onEdit={e => { setEditingEmployee(e); setSelectedId(null); }}
          onDeactivated={handleDeactivated}
        />
      )}

      {/* CA3: Create / edit modal */}
      {(creatingNew || editingEmployee) && (
        <EmployeeFormModal
          employee={editingEmployee ?? undefined}
          onClose={() => { setCreatingNew(false); setEditingEmployee(null); }}
          onSaved={handleEmployeeSaved}
        />
      )}

      {historyEmployee && (
        <HistoryDrawer
          entityType="employee"
          entityId={historyEmployee.id}
          title={historyEmployee.name}
          onClose={() => setHistoryEmployee(null)}
        />
      )}
    </RequireAdmin>
  );
}