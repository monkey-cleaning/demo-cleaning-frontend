// ─────────────────────────────────────────────────────────────────────────────
// FILE: ScheduleEditorModal.tsx
//
// Drop-in modal for editing a cleaner's weekly availability, one-off extra
// availability dates, and time-off blocks.
//
// The "Time Off" tab is a UI-level merge of two backend resources:
//   - time_off:   full-day absences over a date range
//   - exceptions: a single day with specific hours blocked (e.g. a morning
//                 medical appointment)
// They're presented as one form + one combined list, but remain two separate
// tables/endpoints under the hood.
//
// BACKEND endpoints consumed:
//   PUT    /api/admin/staff/:id/availability
//   GET    /api/admin/staff/:id/extra-availability
//   POST   /api/admin/staff/:id/extra-availability
//   DELETE /api/admin/staff/:id/extra-availability/:extraId
//   GET    /api/admin/staff/:id/time-off
//   POST   /api/admin/staff/:id/time-off
//   DELETE /api/admin/staff/:id/time-off/:timeOffId
//   GET    /api/admin/staff/:id/exceptions
//   POST   /api/admin/staff/:id/exceptions
//   DELETE /api/admin/staff/:id/exceptions/:exceptionId
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  X, Loader2, AlertCircle, Plus, Clock, CalendarOff,
  CheckCircle2, Save, CalendarPlus, Trash2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmployeeBase {
  id: string;
  name: string;
  availability?: AvailabilityRow[];
  extra_availability?: ExtraAvailabilityRow[];
  time_off?: TimeOffRow[];
  exceptions?: ExceptionRow[];
}

interface AvailabilityRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface ExtraAvailabilityRow {
  id: string;
  date: string;        // "YYYY-MM-DD"
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  notes: string | null;
}

interface TimeOffRow {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  notes: string | null;
}

interface ExceptionRow {
  id: string;
  exception_date: string; // "YYYY-MM-DD"
  all_day: boolean;
  start_time: string | null; // "HH:MM" — null when all_day
  end_time: string | null;
  reason: string | null;
  exception_type: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 22; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function formatDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TimeSelect({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all"
    >
      {TIME_OPTIONS.filter(t => !min || t > min).map(t => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ScheduleEditorModal<T extends EmployeeBase>({
  employee,
  onClose,
  onSaved,
  initialTab = "availability",
}: {
  employee: T;
  onClose: () => void;
  onSaved: (updated: T) => void;
  initialTab?: "availability" | "extra_availability" | "time_off";
}) {
  // ── Tab state ───────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"availability" | "extra_availability" | "time_off">(initialTab);

  // ── Availability state ──────────────────────────────────────────────────────
  type DaySlot = { start_time: string; end_time: string } | null;
  const [slots, setSlots] = useState<Record<number, DaySlot>>(() => {
    const base: Record<number, DaySlot> = {};
    for (let d = 0; d < 7; d++) base[d] = null;
    for (const row of employee.availability ?? []) {
      base[row.day_of_week] = { start_time: row.start_time, end_time: row.end_time };
    }
    return base;
  });
  const [savingAvail, setSavingAvail] = useState(false);
  const [availError,  setAvailError]  = useState<string | null>(null);
  const [availSaved,  setAvailSaved]  = useState(false);

  // ── Extra availability state ────────────────────────────────────────────────
  const [extraEntries,  setExtraEntries]  = useState<ExtraAvailabilityRow[]>(employee.extra_availability ?? []);
  const [loadingExtra,  setLoadingExtra]  = useState(false);
  const [extraError,    setExtraError]    = useState<string | null>(null);
  const [newExtra, setNewExtra] = useState({ date: "", start_time: "08:00", end_time: "17:00", notes: "" });
  const [addingExtra,   setAddingExtra]   = useState(false);
  const [deletingExtra, setDeletingExtra] = useState<string | null>(null);

  // ── Time-off / exceptions state (unified "Time Off" tab) ────────────────────
  // Two backend sources (time_off = full-day date range, exceptions = single-day
  // partial-hours block) are merged into one form + one list at the UI level.
  const [timeOffs,     setTimeOffs]     = useState<TimeOffRow[]>(employee.time_off ?? []);
  const [loadingTO,    setLoadingTO]    = useState(false);
  const [toError,      setToError]      = useState<string | null>(null);
  const [deletingTO,   setDeletingTO]   = useState<string | null>(null);

  const [exceptions,      setExceptions]     = useState<ExceptionRow[]>(employee.exceptions ?? []);
  const [loadingExc,      setLoadingExc]     = useState(false);
  const [deletingExc,     setDeletingExc]    = useState<string | null>(null);

  const [newAbsence, setNewAbsence] = useState({
    start_date: "",
    end_date: "",
    full_day: true,
    start_time: "09:00",
    end_time: "17:00",
    reason: "",
    notes: "",
  });
  const [addingAbsence, setAddingAbsence] = useState(false);

  // A partial-hours block only makes sense for a single day.
  const isSingleDay = newAbsence.start_date && newAbsence.start_date === newAbsence.end_date;

  // ── Fetch fresh data when tab switches ─────────────────────────────────────
  useEffect(() => {
    if (tab === "time_off") {
      setLoadingTO(true);
      apiFetch<{ ok: boolean; time_off: TimeOffRow[] }>(`/api/admin/staff/${employee.id}/time-off`)
        .then(r => setTimeOffs(r.time_off))
        .catch(e => setToError(e.message))
        .finally(() => setLoadingTO(false));

      setLoadingExc(true);
      apiFetch<{ ok: boolean; exceptions: ExceptionRow[] }>(
        `/api/admin/staff/${employee.id}/exceptions`
      )
        .then(r => setExceptions(r.exceptions))
        .catch(e => setToError(e.message))
        .finally(() => setLoadingExc(false));
    }

    if (tab === "extra_availability") {
      setLoadingExtra(true);
      apiFetch<{ ok: boolean; extra_availability: ExtraAvailabilityRow[] }>(
        `/api/admin/staff/${employee.id}/extra-availability`
      )
        .then(r => setExtraEntries(r.extra_availability))
        .catch(e => setExtraError(e.message))
        .finally(() => setLoadingExtra(false));
    }
  }, [tab, employee.id]);

  // ── Availability save ───────────────────────────────────────────────────────
  async function saveAvailability() {
    for (let d = 0; d < 7; d++) {
      const s = slots[d];
      if (s && s.start_time >= s.end_time) {
        setAvailError(`${DOW_LABELS[d]}: end time must be after start time`);
        return;
      }
    }

    setSavingAvail(true); setAvailError(null); setAvailSaved(false);
    try {
      const availability: AvailabilityRow[] = [];
      for (let d = 0; d < 7; d++) {
        if (slots[d]) {
          availability.push({ day_of_week: d, start_time: slots[d]!.start_time, end_time: slots[d]!.end_time });
        }
      }
      await apiFetch(`/api/admin/staff/${employee.id}/availability`, {
        method: "PUT",
        body: JSON.stringify({ availability }),
      });
      setAvailSaved(true);
      setTimeout(() => setAvailSaved(false), 2000);
      onSaved({ ...employee, availability } as T);
    } catch (e: any) { setAvailError(e.message); }
    finally { setSavingAvail(false); }
  }

  // ── Extra availability helpers ──────────────────────────────────────────────
  async function addExtraAvailability() {
    if (!newExtra.date) { setExtraError("Date is required"); return; }
    if (!newExtra.start_time || !newExtra.end_time) { setExtraError("Start and end time are required"); return; }
    if (newExtra.start_time >= newExtra.end_time) { setExtraError("End time must be after start time"); return; }

    setAddingExtra(true); setExtraError(null);
    try {
      const r = await apiFetch<{ ok: boolean; extra_availability: ExtraAvailabilityRow }>(
        `/api/admin/staff/${employee.id}/extra-availability`,
        { method: "POST", body: JSON.stringify(newExtra) }
      );
      const updated = [...extraEntries, r.extra_availability].sort((a, b) =>
        a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
      );
      setExtraEntries(updated);
      setNewExtra({ date: "", start_time: "08:00", end_time: "17:00", notes: "" });
      onSaved({ ...employee, extra_availability: updated } as T);
    } catch (e: any) { setExtraError(e.message); }
    finally { setAddingExtra(false); }
  }

  async function removeExtraAvailability(extraId: string) {
    setDeletingExtra(extraId);
    try {
      await apiFetch(`/api/admin/staff/${employee.id}/extra-availability/${extraId}`, { method: "DELETE" });
      const updated = extraEntries.filter(e => e.id !== extraId);
      setExtraEntries(updated);
      onSaved({ ...employee, extra_availability: updated } as T);
    } catch (e: any) { setExtraError(e.message); }
    finally { setDeletingExtra(null); }
  }

  // ── Unified absence helpers ─────────────────────────────────────────────────
  // Routes to the time-off endpoint for full-day ranges, or the exceptions
  // endpoint for a single-day partial-hours block — two backends, one form.
  async function addAbsence() {
    if (!newAbsence.start_date || !newAbsence.end_date) {
      setToError("Start and end date required");
      return;
    }
    if (newAbsence.end_date < newAbsence.start_date) {
      setToError("End date must be ≥ start date");
      return;
    }
    if (!newAbsence.full_day) {
      if (!isSingleDay) {
        setToError("Partial-hours absences must be a single day — set the same start and end date, or turn on Full day for a multi-day range");
        return;
      }
      if (!newAbsence.start_time || !newAbsence.end_time) {
        setToError("Start and end time are required");
        return;
      }
      if (newAbsence.start_time >= newAbsence.end_time) {
        setToError("End time must be after start time");
        return;
      }
    }

    setAddingAbsence(true); setToError(null);
    try {
      if (newAbsence.full_day) {
        const r = await apiFetch<{ ok: boolean; time_off: TimeOffRow }>(
          `/api/admin/staff/${employee.id}/time-off`,
          {
            method: "POST",
            body: JSON.stringify({
              start_date: newAbsence.start_date,
              end_date: newAbsence.end_date,
              reason: newAbsence.reason,
              notes: newAbsence.notes,
            }),
          }
        );
        const updated = [...timeOffs, r.time_off].sort((a, b) => a.start_date.localeCompare(b.start_date));
        setTimeOffs(updated);
        onSaved({ ...employee, time_off: updated } as T);
      } else {
        const payload = {
          exception_date: newAbsence.start_date,
          all_day: false,
          start_time: newAbsence.start_time,
          end_time: newAbsence.end_time,
          reason: newAbsence.reason || undefined,
          exception_type: "unavailable",
        };
        const r = await apiFetch<{ ok: boolean; exception: ExceptionRow }>(
          `/api/admin/staff/${employee.id}/exceptions`,
          { method: "POST", body: JSON.stringify(payload) }
        );
        const updated = [...exceptions, r.exception].sort((a, b) =>
          a.exception_date.localeCompare(b.exception_date)
        );
        setExceptions(updated);
        onSaved({ ...employee, exceptions: updated } as T);
      }
      setNewAbsence({ start_date: "", end_date: "", full_day: true, start_time: "09:00", end_time: "17:00", reason: "", notes: "" });
    } catch (e: any) { setToError(e.message); }
    finally { setAddingAbsence(false); }
  }

  async function removeTimeOff(timeOffId: string) {
    setDeletingTO(timeOffId);
    try {
      await apiFetch(`/api/admin/staff/${employee.id}/time-off/${timeOffId}`, { method: "DELETE" });
      const updated = timeOffs.filter(t => t.id !== timeOffId);
      setTimeOffs(updated);
      onSaved({ ...employee, time_off: updated } as T);
    } catch (e: any) { setToError(e.message); }
    finally { setDeletingTO(null); }
  }

  async function removeException(excId: string) {
    setDeletingExc(excId);
    try {
      await apiFetch(`/api/admin/staff/${employee.id}/exceptions/${excId}`, { method: "DELETE" });
      const updated = exceptions.filter(e => e.id !== excId);
      setExceptions(updated);
      onSaved({ ...employee, exceptions: updated } as T);
    } catch (e: any) { setToError(e.message); }
    finally { setDeletingExc(null); }
  }

  // ── Day slot helpers ────────────────────────────────────────────────────────
  function toggleDay(d: number) {
    setSlots(prev => ({
      ...prev,
      [d]: prev[d] ? null : { start_time: "09:00", end_time: "17:00" },
    }));
    setAvailSaved(false);
  }

  function updateSlot(d: number, field: "start_time" | "end_time", val: string) {
    setSlots(prev => ({
      ...prev,
      [d]: { ...prev[d]!, [field]: val },
    }));
    setAvailSaved(false);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inp = "w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white";

  const TAB_CONFIG = [
    { key: "availability",       icon: <Clock size={12} />,       label: "Weekly Schedule" },
    { key: "extra_availability", icon: <CalendarPlus size={12} />, label: "Extra Days"     },
    { key: "time_off",           icon: <CalendarOff size={12} />,  label: "Time Off"       },
  ] as const;

  return (
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl flex flex-col max-h-[92vh]">

        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Schedule</p>
            <h2 className="font-bold text-[#031634] text-base mt-0.5">{employee.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
          {TAB_CONFIG.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 pb-3 pt-3 text-xs font-semibold mr-5 border-b-2 transition-colors ${
                tab === key
                  ? "border-[#031634] text-[#031634]"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">

          {/* ── TAB: WEEKLY AVAILABILITY ──────────────────────────────────── */}
          {tab === "availability" && (
            <div className="px-6 py-5 space-y-1.5">
              <p className="text-xs text-gray-400 mb-4">
                Toggle each day and set working hours. Changes only affect future assignment suggestions — confirmed appointments are not modified.
              </p>

              {availError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2 mb-3">
                  <AlertCircle size={12} /> {availError}
                </p>
              )}

              {[0, 1, 2, 3, 4, 5, 6].map(d => {
                const slot = slots[d];
                const isOn = slot !== null;
                return (
                  <div
                    key={d}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                      isOn ? "bg-[#031634]/[0.03] border border-[#031634]/10" : "bg-gray-50 border border-gray-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs transition-colors ${
                        isOn
                          ? "bg-[#031634] text-white"
                          : "bg-gray-200 text-gray-400 hover:bg-gray-300"
                      }`}
                      title={isOn ? "Disable this day" : "Enable this day"}
                    >
                      {DOW_LABELS[d]}
                    </button>

                    {isOn ? (
                      <div className="flex items-center gap-2 flex-1 flex-wrap">
                        <span className="text-xs text-gray-500 flex-shrink-0">from</span>
                        <TimeSelect
                          value={slot.start_time}
                          onChange={v => updateSlot(d, "start_time", v)}
                        />
                        <span className="text-xs text-gray-500 flex-shrink-0">to</span>
                        <TimeSelect
                          value={slot.end_time}
                          onChange={v => updateSlot(d, "end_time", v)}
                          min={slot.start_time}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 flex-1 italic">Day off</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TAB: EXTRA DAYS ───────────────────────────────────────────── */}
          {tab === "extra_availability" && (
            <div className="px-6 py-5 space-y-5">
              <p className="text-xs text-gray-400">
                Add one-off availability for specific dates — e.g. covering a colleague or a special shift.
                These are checked alongside the weekly schedule when assigning appointments.
              </p>

              {extraError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertCircle size={12} /> {extraError}
                </p>
              )}

              {/* Add new extra slot */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Add extra availability</p>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    className={inp}
                    value={newExtra.date}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={e => setNewExtra(p => ({ ...p, date: e.target.value }))}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">From</label>
                    <TimeSelect
                      value={newExtra.start_time}
                      onChange={v => setNewExtra(p => ({ ...p, start_time: v }))}
                    />
                  </div>
                  <span className="text-xs text-gray-400 mt-4 flex-shrink-0">to</span>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">To</label>
                    <TimeSelect
                      value={newExtra.end_time}
                      onChange={v => setNewExtra(p => ({ ...p, end_time: v }))}
                      min={newExtra.start_time}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    className={inp}
                    placeholder="e.g. Covering for Maria, special event…"
                    value={newExtra.notes}
                    onChange={e => setNewExtra(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={addExtraAvailability}
                  disabled={addingExtra || !newExtra.date}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#031634] text-white rounded-xl hover:bg-[#031634]/90 disabled:opacity-50 transition-colors"
                >
                  {addingExtra ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Add extra day
                </button>
              </div>

              {/* Existing extra entries */}
              {loadingExtra ? (
                <div className="space-y-2 animate-pulse">
                  {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl" />)}
                </div>
              ) : extraEntries.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No extra days registered</p>
              ) : (() => {
                const todayIso = new Date().toISOString().split("T")[0];
                const upcoming = extraEntries.filter(e => e.date >= todayIso);
                const past     = extraEntries.filter(e => e.date <  todayIso);
                return (
                  <div className="space-y-5">
                    {upcoming.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Upcoming</p>
                        <div className="space-y-2">
                          {upcoming.map(entry => (
                            <div
                              key={entry.id}
                              className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3"
                            >
                              <CalendarPlus size={14} className="text-blue-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-blue-700">{formatDate(entry.date)}</p>
                                <p className="text-xs text-blue-500 mt-0.5">{entry.start_time} – {entry.end_time}</p>
                                {entry.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{entry.notes}</p>}
                              </div>
                              <button
                                onClick={() => removeExtraAvailability(entry.id)}
                                disabled={deletingExtra === entry.id}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-40"
                                title="Remove"
                              >
                                {deletingExtra === entry.id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <Trash2 size={13} />
                                }
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {past.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">History</p>
                        <div className="space-y-2">
                          {past.map(entry => (
                            <div
                              key={entry.id}
                              className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 opacity-60"
                            >
                              <CalendarPlus size={14} className="text-gray-300 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-500">{formatDate(entry.date)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{entry.start_time} – {entry.end_time}</p>
                                {entry.notes && <p className="text-xs text-gray-300 mt-0.5 italic">{entry.notes}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── TAB: TIME OFF (unifies full-day absences + partial-hour exceptions) ── */}
          {tab === "time_off" && (
            <div className="px-6 py-5 space-y-5">
              <p className="text-xs text-gray-400">
                Register vacations, full-day absences, or a single day with blocked hours — e.g. a medical appointment in the morning.
              </p>

              {toError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertCircle size={12} /> {toError}
                </p>
              )}

              {/* Add new absence */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Add absence</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">From</label>
                    <input
                      type="date"
                      className={inp}
                      value={newAbsence.start_date}
                      onChange={e => setNewAbsence(p => ({
                        ...p,
                        start_date: e.target.value,
                        // Keep end_date valid relative to the new start_date.
                        end_date: p.end_date && p.end_date < e.target.value ? e.target.value : p.end_date,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">To</label>
                    <input
                      type="date"
                      className={inp}
                      value={newAbsence.end_date}
                      min={newAbsence.start_date}
                      onChange={e => setNewAbsence(p => ({ ...p, end_date: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Full-day toggle */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setNewAbsence(p => ({ ...p, full_day: !p.full_day }))}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      newAbsence.full_day ? "bg-[#031634]" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        newAbsence.full_day ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-gray-600 font-medium">Full day absence</span>
                </div>

                {/* Partial-day time pickers — only valid for a single day */}
                {!newAbsence.full_day && (
                  isSingleDay ? (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">From</label>
                        <TimeSelect
                          value={newAbsence.start_time}
                          onChange={v => setNewAbsence(p => ({ ...p, start_time: v }))}
                        />
                      </div>
                      <span className="text-xs text-gray-400 mt-4 flex-shrink-0">to</span>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">To</label>
                        <TimeSelect
                          value={newAbsence.end_time}
                          onChange={v => setNewAbsence(p => ({ ...p, end_time: v }))}
                          min={newAbsence.start_time}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Set the same From and To date to block specific hours on a single day. For a multi-day range, turn Full day back on.
                    </p>
                  )
                )}

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reason <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    className={inp}
                    placeholder="Vacation, medical leave, personal…"
                    value={newAbsence.reason}
                    onChange={e => setNewAbsence(p => ({ ...p, reason: e.target.value }))}
                  />
                </div>

                {newAbsence.full_day && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input
                      className={inp}
                      placeholder="Additional details…"
                      value={newAbsence.notes}
                      onChange={e => setNewAbsence(p => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                )}

                <button
                  onClick={addAbsence}
                  disabled={addingAbsence || !newAbsence.start_date || !newAbsence.end_date}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#031634] text-white rounded-xl hover:bg-[#031634]/90 disabled:opacity-50 transition-colors"
                >
                  {addingAbsence ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Add absence
                </button>
              </div>

              {/* Combined list: time-off ranges + single-day exceptions, merged by date */}
              {loadingTO || loadingExc ? (
                <div className="space-y-2 animate-pulse">
                  {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl" />)}
                </div>
              ) : timeOffs.length === 0 && exceptions.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No absences registered</p>
              ) : (() => {
                type AbsenceItem =
                  | { kind: "time_off"; sortKey: string; endKey: string; row: TimeOffRow }
                  | { kind: "exception"; sortKey: string; endKey: string; row: ExceptionRow };

                const items: AbsenceItem[] = [
                  ...timeOffs.map((row): AbsenceItem => ({
                    kind: "time_off", sortKey: row.start_date, endKey: row.end_date, row,
                  })),
                  ...exceptions.map((row): AbsenceItem => ({
                    kind: "exception", sortKey: row.exception_date, endKey: row.exception_date, row,
                  })),
                ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

                const todayIso = new Date().toISOString().split("T")[0];
                const upcoming = items.filter(i => i.endKey >= todayIso);
                const past     = items.filter(i => i.endKey <  todayIso);

                function AbsenceCard({ item, faded }: { item: AbsenceItem; faded: boolean }) {
                  if (item.kind === "time_off") {
                    const t = item.row;
                    return (
                      <div
                        className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                          faded ? "bg-gray-50 border-gray-100 opacity-70" : "bg-orange-50 border-orange-100"
                        }`}
                      >
                        <CalendarOff size={14} className={`flex-shrink-0 mt-0.5 ${faded ? "text-gray-300" : "text-orange-400"}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${faded ? "text-gray-500" : "text-orange-700"}`}>
                            {formatDate(t.start_date)}
                            {t.start_date !== t.end_date && <> → {formatDate(t.end_date)}</>}
                          </p>
                          <p className={`text-xs mt-0.5 ${faded ? "text-gray-400" : "text-orange-500"}`}>Full day</p>
                          {t.reason && <p className={`text-xs mt-0.5 ${faded ? "text-gray-400" : "text-orange-500"}`}>{t.reason}</p>}
                          {t.notes  && <p className={`text-xs mt-0.5 italic ${faded ? "text-gray-300" : "text-gray-400"}`}>{t.notes}</p>}
                        </div>
                        {!faded && (
                          <button
                            onClick={() => removeTimeOff(t.id)}
                            disabled={deletingTO === t.id}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-100 transition-colors disabled:opacity-40 flex-shrink-0"
                            title="Remove"
                          >
                            {deletingTO === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        )}
                      </div>
                    );
                  }

                  const exc = item.row;
                  return (
                    <div
                      className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                        faded ? "bg-gray-50 border-gray-100 opacity-70" : "bg-red-50 border-red-100"
                      }`}
                    >
                      <CalendarOff size={14} className={`flex-shrink-0 mt-0.5 ${faded ? "text-gray-300" : "text-red-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${faded ? "text-gray-500" : "text-red-700"}`}>
                          {formatDate(exc.exception_date)}
                        </p>
                        <p className={`text-xs mt-0.5 ${faded ? "text-gray-400" : "text-red-500"}`}>
                          {exc.all_day ? "Full day" : `${exc.start_time} – ${exc.end_time}`}
                        </p>
                        {exc.reason && <p className={`text-xs mt-0.5 italic ${faded ? "text-gray-300" : "text-gray-400"}`}>{exc.reason}</p>}
                      </div>
                      {!faded && (
                        <button
                          onClick={() => removeException(exc.id)}
                          disabled={deletingExc === exc.id}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-100 transition-colors disabled:opacity-40 flex-shrink-0"
                          title="Remove"
                        >
                          {deletingExc === exc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="space-y-5">
                    {upcoming.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Upcoming & active</p>
                        <div className="space-y-2">
                          {upcoming.map(item => (
                            <AbsenceCard key={`${item.kind}-${item.row.id}`} item={item} faded={false} />
                          ))}
                        </div>
                      </div>
                    )}

                    {past.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">History</p>
                        <div className="space-y-2">
                          {past.map(item => (
                            <AbsenceCard key={`${item.kind}-${item.row.id}`} item={item} faded={true} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Close
          </button>
          {tab === "availability" && (
            <button
              onClick={saveAvailability}
              disabled={savingAvail}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl transition-colors ${
                availSaved
                  ? "bg-emerald-500 text-white"
                  : "bg-[#031634] text-white hover:bg-[#031634]/90"
              } disabled:opacity-50`}
            >
              {savingAvail ? (
                <Loader2 size={13} className="animate-spin" />
              ) : availSaved ? (
                <CheckCircle2 size={13} />
              ) : (
                <Save size={13} />
              )}
              {availSaved ? "Saved!" : "Save schedule"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}