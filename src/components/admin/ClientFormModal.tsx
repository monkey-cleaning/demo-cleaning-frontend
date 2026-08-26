import { useState } from "react";
import { X, ChevronRight, AlertCircle, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Client {
  id: string;
  name?: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  default_address: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  source: string | null;
  service_type: string | null;
  rate: number | null;
  is_recurring: boolean | null;
  expected_frequency: string | null;
  preferred_days: string[] | null;
  preferred_time: string | null;
  availability_windows: { day: string; start: string; end: string }[] | null;
  last_activity_at: string | null;
  total_services?: number | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string | null;
  transfer_sender_aliases: string[] | null;
  clients_billing_status?: { billing_status: string; total_billed: number; total_paid: number } | null;
}

export interface ClientFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile: string;
  default_address: string;
  city: string;
  state: string;
  zip_code: string;
  service_type: string;
  rate: string;
  is_recurring: boolean;
  expected_frequency: string;
  preferred_days: string[];
  preferred_time: string;
  availability_windows: { day: string; start: string; end: string }[];
  status: string;
  notes: string;
  tags: string[];
  transfer_sender_aliases: string[];
}

export type AvailWindow = { day: string; start: string; end: string };

export const EMPTY_FORM: ClientFormData = {
  first_name: "", last_name: "", email: "", phone: "", mobile: "",
  default_address: "", city: "", state: "", zip_code: "",
  service_type: "", rate: "", is_recurring: false,
  expected_frequency: "", preferred_days: [], preferred_time: "",
  availability_windows: [],
  status: "active", notes: "", tags: [],
  transfer_sender_aliases: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export function clientDisplayName(c: Client): string {
  const fromView = (c as any).name as string | null;
  if (fromView?.trim()) return fromView.trim();
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
}

// ── AvailabilityEditor ────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_OPTIONS = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00",
];

export function AvailabilityEditor({
  value, onChange,
}: {
  value: AvailWindow[];
  onChange: (v: AvailWindow[]) => void;
}) {
  function addRow() { onChange([...value, { day: "Monday", start: "08:00", end: "17:00" }]); }
  function removeRow(i: number) { onChange(value.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, patch: Partial<AvailWindow>) {
    onChange(value.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  const sel = "text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all";

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-gray-400 italic">No windows added yet.</p>
      )}
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <select className={sel} value={row.day} onChange={e => updateRow(i, { day: e.target.value })}>
            {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="text-xs text-gray-400">from</span>
          <select className={sel} value={row.start} onChange={e => updateRow(i, { start: e.target.value })}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-xs text-gray-400">to</span>
          <select className={sel} value={row.end} onChange={e => updateRow(i, { end: e.target.value })}>
            {TIME_OPTIONS.filter(t => t > row.start).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" onClick={() => removeRow(i)}
            className="p-1 rounded-md text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
            <X size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow}
        className="flex items-center gap-1.5 text-xs font-semibold text-[#031634]/70 hover:text-[#031634] transition-colors mt-1">
        <ChevronRight size={13} className="rotate-90" /> Add window
      </button>
    </div>
  );
}

// ── ClientFormModal ───────────────────────────────────────────────────────────

export function ClientFormModal({
  client,
  onClose,
  onSaved,
  // When rendered from inside another modal (e.g. EventFormModal), pass a
  // higher z-index so this modal layers correctly on top.
  zIndex = "z-[80]",
  // Optional: pre-fill the name field when opening from the calendar typeahead
  initialName,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: (c: Client) => void;
  zIndex?: string;
  initialName?: string;
}) {
  const isEdit = !!client;

  const [form, setForm] = useState<ClientFormData>(() => {
    if (client) {
      return {
        first_name: client.first_name ?? "",
        last_name: client.last_name ?? "",
        email: client.email ?? "",
        phone: client.phone ?? "",
        mobile: client.mobile ?? "",
        default_address: client.default_address ?? "",
        city: client.city ?? "",
        state: client.state ?? "",
        zip_code: "",
        service_type: client.service_type ?? "",
        rate: client.rate != null ? String(client.rate) : "",
        is_recurring: client.is_recurring ?? false,
        expected_frequency: client.expected_frequency ?? "",
        preferred_days: client.preferred_days ?? [],
        preferred_time: client.preferred_time ?? "",
        availability_windows: client.availability_windows ?? [],
        status: client.status ?? "active",
        notes: client.notes ?? "",
        tags: client.tags ?? [],
        transfer_sender_aliases: client.transfer_sender_aliases ?? [],
      };
    }
    // Pre-fill name when coming from calendar typeahead
    if (initialName) {
      const parts = initialName.trim().split(/\s+/);
      const first_name = parts[0] ?? "";
      const last_name = parts.slice(1).join(" ");
      return { ...EMPTY_FORM, first_name, last_name };
    }
    return { ...EMPTY_FORM };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof ClientFormData, v: string | boolean | string[] | AvailWindow[]) =>
    setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit() {
    if (!form.first_name.trim()) { setError("First name is required"); return; }
    if (!form.last_name.trim()) { setError("Last name is required"); return; }
    if (!form.email.trim()) { setError("Email is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address"); return;
    }
    setSaving(true); setError(null);
    try {
      const body = {
        ...form,
        rate: form.rate !== "" ? parseFloat(form.rate) : null,
        preferred_days: form.preferred_days.length > 0 ? form.preferred_days : null,
        expected_frequency: form.expected_frequency || null,
        preferred_time: form.preferred_time || null,
        availability_windows: form.availability_windows.length > 0 ? form.availability_windows : null,
      };
      const result = isEdit
        ? await apiFetch<{ client: Client }>(`/api/admin/clients/${client!.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await apiFetch<{ client: Client }>(`/api/admin/clients`, { method: "POST", body: JSON.stringify(body) });
      onSaved(result.client);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  const inp = "w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white";
  const lbl = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4`}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-[#031634] text-base font-montserrat">
            {isEdit ? "Edit client" : "New client"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={13} /> {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>First name <span className="text-red-400">*</span></label>
              <input className={inp} value={form.first_name} onChange={e => set("first_name", e.target.value)} placeholder="Jane" /></div>
            <div><label className={lbl}>Last name <span className="text-red-400">*</span></label>
              <input className={inp} value={form.last_name} onChange={e => set("last_name", e.target.value)} placeholder="Smith" /></div>
          </div>

          <div><label className={lbl}>Email <span className="text-red-400">*</span></label>
            <input type="email" className={inp} value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@example.com" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Phone</label>
              <input className={inp} value={form.phone}
                onChange={e => { const v = e.target.value; if (/^\+?[\d\s]*$/.test(v)) set("phone", v); }}
                placeholder="+1 604..." /></div>
            <div><label className={lbl}>Mobile</label>
              <input className={inp} value={form.mobile}
                onChange={e => { const v = e.target.value; if (/^\+?[\d\s]*$/.test(v)) set("mobile", v); }}
                placeholder="+1 778..." /></div>
          </div>

          <div><label className={lbl}>Address</label>
            <input className={inp} value={form.default_address} onChange={e => set("default_address", e.target.value)} placeholder="123 Main St" /></div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>City</label>
              <input className={inp} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Vancouver" /></div>
            <div><label className={lbl}>State/Prov</label>
              <input className={inp} value={form.state} onChange={e => set("state", e.target.value)} placeholder="BC" /></div>
            <div><label className={lbl}>ZIP</label>
              <input className={inp} value={form.zip_code} onChange={e => set("zip_code", e.target.value)} placeholder="V6B 1A1" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Service type</label>
              <select className={inp} value={form.service_type} onChange={e => set("service_type", e.target.value)}>
                <option value="">— Select —</option>
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Post-construction">Post-construction</option>
                <option value="Move-in/Move-out">Move-in/Move-out</option>
                <option value="Event">Event</option>
              </select>
            </div>
            <div><label className={lbl}>Expected frequency</label>
              <select className={inp} value={form.expected_frequency} onChange={e => set("expected_frequency", e.target.value)}>
                <option value="">— Select —</option>
                <option value="Weekly">Weekly</option>
                <option value="Bi-weekly">Bi-weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="One-time">One-time</option>
                <option value="As needed">As needed</option>
              </select>
            </div>
          </div>

          <div><label className={lbl}>Preferred days</label>
            <div className="flex flex-wrap gap-2">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => {
                const checked = form.preferred_days.includes(day);
                return (
                  <button type="button" key={day}
                    onClick={() => set("preferred_days", checked
                      ? form.preferred_days.filter(d => d !== day)
                      : [...form.preferred_days, day]
                    )}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${checked
                      ? "bg-[#031634] text-white border-[#031634]"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                    }`}>
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Preferred time</label>
              <select className={inp} value={form.preferred_time} onChange={e => set("preferred_time", e.target.value)}>
                <option value="">— Any —</option>
                <option value="Morning (8am–12pm)">Morning (8am–12pm)</option>
                <option value="Afternoon (12pm–5pm)">Afternoon (12pm–5pm)</option>
                <option value="Evening (5pm–8pm)">Evening (5pm–8pm)</option>
              </select>
            </div>
            <div><label className={lbl}>Rate ($/hr)</label>
              <input type="number" min="0" step="0.5" className={inp} value={form.rate}
                onChange={e => set("rate", e.target.value)} placeholder="0.00" /></div>
          </div>

          <div>
            <label className={lbl}>
              Availability windows <span className="font-normal text-gray-400">(for scheduling cleaners)</span>
            </label>
            <AvailabilityEditor value={form.availability_windows} onChange={v => set("availability_windows", v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Status</label>
              <select className={inp} value={form.status} onChange={e => set("status", e.target.value)}>
                <option value="active">Active</option>
                <option value="at_risk">At risk</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="cfm-recurring" checked={form.is_recurring}
                onChange={e => set("is_recurring", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#031634] focus:ring-[#031634]" />
              <label htmlFor="cfm-recurring" className="text-sm text-gray-600 select-none">Recurring client</label>
            </div>
          </div>

          <div><label className={lbl}>Notes</label>
            <textarea rows={3} className={`${inp} resize-none`} value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Access codes, preferences, special instructions…" />
          </div>

          {/* Do Not Rehire toggle */}
          <div>
            <button
              type="button"
              onClick={() => {
                const hasTag = form.tags.includes("Do Not Rehire");
                set("tags", hasTag
                  ? form.tags.filter(t => t !== "Do Not Rehire")
                  : [...form.tags, "Do Not Rehire"]
                );
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-colors ${
                form.tags.includes("Do Not Rehire")
                  ? "bg-red-50 border-red-300 text-red-700"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
              }`}>
              <div className="flex items-center gap-2.5">
                <AlertCircle size={15} className={form.tags.includes("Do Not Rehire") ? "text-red-500" : "text-gray-400"} />
                <div className="text-left">
                  <p className="text-sm font-semibold">Do Not Rehire</p>
                  <p className="text-xs opacity-70">Flag this client as problematic</p>
                </div>
              </div>
              <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                form.tags.includes("Do Not Rehire") ? "bg-red-500 justify-end" : "bg-gray-200 justify-start"
              }`}>
                <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
              </div>
            </button>
          </div>

          <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 space-y-2">
            <div>
              <label className={lbl}>
                E-Transfer Sender Names
                <span className="font-normal text-gray-400 ml-1">(for payment matching)</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Names as they appear in Interac notifications (e.g. "BARBARA BRICKER"). One per line.
              </p>
              <textarea
                className={`${inp} resize-none`}
                rows={3}
                placeholder={"BARBARA BRICKER\nBARB BRICKER"}
                value={(form.transfer_sender_aliases ?? []).join("\n")}
                onChange={(e) => {
                  const aliases = e.target.value
                    .split("\n")
                    .map(s => s.trim().toUpperCase())
                    .filter(Boolean);
                  setForm(prev => ({ ...prev, transfer_sender_aliases: aliases }));
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-semibold bg-[#031634] text-white rounded-xl hover:bg-[#031634]/90 disabled:opacity-50 transition-colors flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save changes" : "Create client"}
          </button>
        </div>
      </div>
    </div>
  );
}