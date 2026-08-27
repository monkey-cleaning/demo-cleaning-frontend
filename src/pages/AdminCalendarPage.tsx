import { useEffect, useState, useCallback, useRef, useMemo, forwardRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar, X, Plus, Pencil, Trash2, Users, Loader2, AlertTriangle, UserX, Clock, ArrowRight, Copy, Search, PanelTopClose, PanelTopOpen } from "lucide-react";
import AdminNavbar from "../components/admin/AdminNavbar";
import RequireAdmin from "../components/admin/RequireAdmin";
import TeamHeader from "../components/admin/TeamHeader";
import TeamAutoAssignModal from "../components/admin/TeamAutoAssignModal";
import { useClientPreferences } from "../hooks/useClientPreferences";
import { ScheduleEditorModal } from "../components/admin/ScheduleEditorModal";
import { useSearchParams } from 'react-router-dom';
import { ClientFormModal, clientDisplayName, type Client } from "../components/admin/ClientFormModal";
import { findTeamOverlaps, findOverCapacity, findLunchIssues, type LunchIssueFlag } from "../lib/conflictDetection";
import { suggestTeamOverlapFix, suggestTeamOverlapFixForced, suggestOverCapacityFix, groupOverCapacityClusters, isLunchSummary, type TeamOverlapSuggestion, type OverCapacitySuggestion } from "../lib/conflictResolution";
import { generateCandidateSlots, type RecurrenceInput } from "../api/calendar";
import { DateTime } from "luxon";

// ── Responsive: mobile breakpoint ───────────────────────────────────────────

const MOBILE_BREAKPOINT_QUERY = "(max-width: 767px)";

// Tracks whether the viewport is currently below the mobile breakpoint (<768px).
// Uses matchMedia (not a resize listener) so it also reacts to orientation
// changes and devtools device toggling without extra work.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

// ── Conflict types ────────────────────────────────────────────────────────────

type ConflictType = 'unassigned' | 'schedule' | 'lunch' | 'team_overlap' | 'over_capacity';

const SEVERE_TYPES = new Set<ConflictType>(['team_overlap', 'over_capacity']);

const BANNER_DEFS: { type: ConflictType; label: string; severe: boolean }[] = [
  { type: 'unassigned', label: 'No team assigned', severe: false },
  { type: 'schedule', label: 'Schedule conflict', severe: false },
  { type: 'lunch', label: 'Lunch coverage', severe: false },
  { type: 'team_overlap', label: 'Team double-booked', severe: true },
  { type: 'over_capacity', label: 'More services than teams', severe: true },
];

const CLIENT_ID_RE = /client_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
function extractClientId(event: CalEvent): string | null {
  return event.description?.match(CLIENT_ID_RE)?.[1] ?? null;
}

// The Google Calendar event description doubles as storage for a hidden
// "client_id: <uuid>" marker line (used to associate the event back to a
// client). These two helpers let the UI show/edit only the freeform text
// (the "event notes") while preserving that marker on save.
const CLIENT_ID_LINE_RE = /^.*client_id:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}.*$/im;
function stripClientIdLine(description: string | null | undefined): string {
  if (!description) return "";
  return description.replace(CLIENT_ID_LINE_RE, "").replace(/\n{2,}/g, "\n").trim();
}
function withClientIdLine(eventNotes: string, clientId: string | null): string {
  const text = eventNotes.trim();
  if (!clientId) return text;
  const line = `client_id: ${clientId}`;
  return text ? `${text}\n${line}` : line;
}

// Some events (e.g. those created via Zoho/GCal integrations) store their
// description as inner HTML (<p>, <strong>, <br>, …) instead of plain text.
// This converts that HTML into readable plain text — preserving paragraph
// breaks and emojis, dropping the tags — so it never leaks into the UI as
// literal "<p>", "<strong>", etc. Safe to run on already-plain descriptions
// (no-op if there are no tags to strip).
function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  if (!/<[a-z][\s\S]*>/i.test(html)) return html; // no HTML tags, leave as-is
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n\n")
    .replace(/<(p|div|li)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
// ── Types ─────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  color: string;
  colorId: string | null;
  teamId: string | null;
  teamLabel: string | null;
  teamEmoji: string | null;
  isNonService: boolean;
  isIndividualAssignment: boolean;
  // cleaner names extracted from "Team: …" in description by the backend
  assignedCleaners: string[];
  isAllDay: boolean;
  startIso: string;
  endIso: string;
  startDate: string;
  startHour: number;
  endHour: number;
  durationH: number;
  clientId: string | null;
  // seriesId apunta al maestro de la serie (se auto-referencia si el propio
  // evento ES el maestro); isSeriesMaster distingue maestro de instancia.
  seriesId: string | null;
  isSeriesMaster: boolean;
  recurrence: string[] | null;
  createdIso: string | null;
}

interface EventInput {
  summary: string;
  description?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string;
  colorId?: string | null;
  recurrence?: RecurrenceInput | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("admin_blog_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// Parses an ISO string and returns its parts in Vancouver time,
// regardless of the browser's local timezone.
function vanParts(iso: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === "24" ? 0 : Number(get("hour")),
    minute: Number(get("minute")),
  };
}

// Converts a "YYYY-MM-DDTHH:MM:SS" string expressed in Vancouver time
// to a proper UTC ISO string (handles DST automatically).
// Used by cell-click and drag-drop to build ISO strings without relying
// on Date.setHours(), which uses the browser's local timezone.
function vanStringToIso(vanLocal: string): string {
  const asUtc = new Date(vanLocal + "Z");
  if (isNaN(asUtc.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(asUtc);
  const vg = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  const vanHour = vg("hour") === "24" ? "00" : vg("hour");
  const vanAsUtc = new Date(`${vg("year")}-${vg("month")}-${vg("day")}T${vanHour}:${vg("minute")}:${vg("second")}Z`);
  const offsetMs = vanAsUtc.getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offsetMs).toISOString();
}

function normalizeEvent(e: CalEvent): CalEvent {
  const s = vanParts(e.startIso);
  const en = vanParts(e.endIso);
  const pad = (n: string | number) => String(n).padStart(2, "0");
  const startDate = `${s.year}-${pad(s.month)}-${pad(s.day)}`;
  const startHour = s.hour + s.minute / 60;
  const endHour = en.hour + en.minute / 60;
  const durationH = (new Date(e.endIso).getTime() - new Date(e.startIso).getTime()) / 3_600_000;
  const assignedCleaners = e.assignedCleaners ?? [];
  return { ...e, startDate, startHour, endHour, durationH, assignedCleaners };
}

async function fetchEvents(timeMin: string, timeMax: string): Promise<CalEvent[]> {
  const url = `${API_BASE}/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.events as CalEvent[]).map(normalizeEvent);
}

async function apiCreateEvent(input: EventInput): Promise<CalEvent> {
  const res = await fetch(`${API_BASE}/api/calendar/events`, {
    method: "POST", headers: authHeaders(), body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return normalizeEvent(data.event as CalEvent);
}

async function apiUpdateEvent(
  id: string,
  input: Partial<EventInput> & { employeeIds?: string[] },
  scope: "single" | "following" | "all" = "single",
): Promise<CalEvent> {
  const res = await fetch(`${API_BASE}/api/calendar/events/${id}`, {
    method: "PATCH", headers: authHeaders(), body: JSON.stringify({ ...input, scope }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return normalizeEvent(data.event as CalEvent);
}

interface SeriesRecurrenceInfo {
  freq: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  endType: "never" | "count" | "until";
  count: number | null;
  until: string | null; // ISO date
}

async function apiFetchSeriesRecurrence(masterId: string): Promise<SeriesRecurrenceInfo | null> {
  const res = await fetch(`${API_BASE}/api/calendar/series/${masterId}/recurrence`, { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.recurrence as SeriesRecurrenceInfo;
}

async function apiDeleteEvent(id: string, scope: "single" | "following" | "all" = "single"): Promise<void> {
  const res = await fetch(`${API_BASE}/api/calendar/events/${id}?scope=${scope}`, {
    method: "DELETE", headers: authHeaders(),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `HTTP ${res.status}`); }
}

async function apiFetchEmployee(id: string): Promise<{ id: string; name: string; availability?: unknown[]; time_off?: unknown[]; extra_availability?: unknown[] }> {
  const res = await fetch(`${API_BASE}/api/admin/staff/${id}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.employee;
}

async function apiFetchMaxSimultaneousTeams(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/admin/settings`, { headers: authHeaders() });
  if (!res.ok) return 2;
  const data = await res.json();
  return parseInt(data.settings?.max_simultaneous_teams ?? "2", 10);
}

interface ConflictReason {
  type: "schedule" | "timing";
  message: string;
}

interface ConflictResult {
  employeeId: string;
  name: string;
  reasons: ConflictReason[];
}

// CA2/CA3: client typeahead
interface ClientResult {
  id: string;
  name: string;
  email: string | null;
  default_address: string | null;
  service_type: string | null;
  mobile: string | null;
  phone: string | null;
}

async function apiCheckConflicts(eventId: string, startIso: string, endIso: string): Promise<ConflictResult[]> {

  const url = `${API_BASE}/api/calendar/events/${eventId}/conflicts?startIso=${encodeURIComponent(startIso)}&endIso=${encodeURIComponent(endIso)}`;

  const res = await fetch(url, { headers: authHeaders() });

  if (!res.ok) return []; // non-blocking — don't fail edit if conflict check fails

  const data = await res.json();

  return data.conflicts ?? [];

}

async function apiCheckConflictsBatch(
  events: { id: string; startIso: string; endIso: string }[],
): Promise<Record<string, ConflictResult[]>> {
  if (events.length === 0) return {};
  const res = await fetch(`${API_BASE}/api/calendar/events/conflicts/batch`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) return {}; // non-blocking — same criterio que apiCheckConflicts
  const data = await res.json();
  return data.conflictsByEventId ?? {};
}

async function apiCheckSeriesConflicts(
  slots: { startIso: string; endIso: string }[],
  colorId: string | null,
  exclude?: { eventId?: string; seriesId?: string | null },
): Promise<{ dateIso: string; type: string; detail: string }[]> {
  const res = await fetch(`${API_BASE}/api/calendar/events/conflicts/series`, {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({
      slots, colorId,
      excludeEventId: exclude?.eventId,
      excludeSeriesId: exclude?.seriesId,
    }),
  });
  if (!res.ok) {
    console.warn("[SeriesConflicts] Check failed:", res.status, await res.text().catch(() => ""));
    return [];
  }
  const data = await res.json();
  return data.conflicts ?? [];
}

async function apiSearchClients(q: string): Promise<ClientResult[]> {
  if (q.length < 2) return [];
  const res = await fetch(`${API_BASE}/api/admin/clients/search?q=${encodeURIComponent(q)}&limit=8`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.clients ?? [];
}

interface EventSearchResult {
  id: string;
  summary: string;
  startIso: string;
  startDate: string; // YYYY-MM-DD
  isAllDay: boolean;
  isPast: boolean; // ← NUEVO
  clientId: string | null;
  htmlLink: string | null;
}

async function apiSearchCalendarEvents(q: string): Promise<EventSearchResult[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`${API_BASE}/api/calendar/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.events ?? [];
}

// notes: permanent notes about the client & the cleaning location
// (door codes, property specs) — lives on the clients row, edited from the
// event modal, ClientFormModal, and ClientDrawer.
async function apiFetchClient(id: string): Promise<Client & { notes: string | null }> {
  const res = await fetch(`${API_BASE}/api/admin/clients/${id}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.client;
}

async function apiUpdateClient(id: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/clients/${id}`, {
    method: "PATCH", headers: authHeaders(), body: JSON.stringify(fields),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d: Date) { const c = new Date(d); c.setDate(c.getDate() - c.getDay()); return c; }
function endOfWeek(d: Date) { const c = new Date(d); c.setDate(c.getDate() + (6 - c.getDay())); return c; }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function addWeeks(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n * 7); return c; }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function isoDate(d: Date) { const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Convierte una clave de día "YYYY-MM-DD" al instante UTC real de inicio
// (00:00:00) o fin (23:59:59) de ESE DÍA en America/Vancouver — no en el
// huso horario del browser. El cálculo de la ventana de fetch usaba
// `date.setHours(0,0,0,0)` + `.toISOString()`, que fija "medianoche" en el
// huso del browser (ej. Argentina, UTC-3) y recién ahí convierte a UTC —
// para un admin fuera de Vancouver esto corre la ventana pedida tantas
// horas como separen los dos husos, cortando eventos cerca de cualquiera
// de los dos bordes del día (ver 2026-08-16_dst-recurring-events_bug.md,
// causa raíz #3 — confirmado en vivo: timeMax calculado terminaba a las
// 19:59:59 hora Vancouver en vez de las 23:59:59, ocultando un evento de
// 8pm entero). Reusa la misma matemática de offset con DST de
// vanStringToIso, así el borde siempre es medianoche/fin de día real de
// Vancouver, sin importar el huso del browser de quien esté mirando.
function vanDayBoundsIso(dayKey: string, edge: "start" | "end"): string {
  return vanStringToIso(`${dayKey}T${edge === "start" ? "00:00:00" : "23:59:59"}`);
}

function fmtMonthYear(d: Date) { return d.toLocaleDateString("en-CA", { month: "long", year: "numeric" }); }
function fmtWeekRange(start: Date, end: Date) {
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString("en-CA", { month: "long" })} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  const s = start.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  const e = end.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}
function fmtDayLabel(d: Date) {
  return d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
}
function fmtTime(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 ? "PM" : "AM";
  const disp = hh % 12 === 0 ? 12 : hh % 12;
  if (mm === 0) return `${disp} ${ampm}`;
  return `${disp}:${String(mm).padStart(2, "0")} ${ampm}`;
}
function todayVan(): string {
  const p = vanParts(new Date().toISOString());
  const pad = (n: string | number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#1a1a1a" : "#ffffff";
}


// Colores fijos que no son de ningún equipo — viven en eventClassification.js
// / settings (confirmar_color_id, non_service_color_id), no en la tabla
// `teams`. Los colores de equipo (Team 1/2/3...) se agregan dinámicamente a
// esta lista en loadAssignTeamCfg() — ver esa función más abajo por qué se
// sacó el hardcode de acá.
const NON_TEAM_COLOR_OPTIONS = [
  { label: "Flamingo", value: "4" },
  { label: "Banana", value: "5" },
  { label: "Peacock", value: "7" },
  { label: "Indigo", value: "9" },
  { label: "Default", value: "" },
];

// ── EventFormModal ────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  "Residential Cleaning", "Commercial Cleaning", "Deep Cleaning",
  "Move-in/Move-out", "Post-construction", "Recurring", "Event", "Other",
];

// Maps a client's default service_type (DB values) to the SERVICE_TYPES
// options shown in the form. Shared by handleSelectClient (manual pick) and
// the LAB309 duplicate-prefill effect (client inferred from the source event).
const SERVICE_TYPE_MAP: Record<string, string> = {
  "Residential": "Residential Cleaning",
  "Commercial": "Commercial Cleaning",
  "Deep": "Deep Cleaning",
  "Move-in/Move-out": "Move-in/Move-out",
  "Post-construction": "Post-construction",
  "Recurring": "Recurring",
  "Event": "Event",
};

const DURATION_OPTIONS = [
  { label: "15 minutes", value: 0.25 },
  { label: "30 minutes", value: 0.5 },
  { label: "45 minutes", value: 0.75 },
  { label: "1 hour", value: 1 },
  { label: "1.5 hours", value: 1.5 },
  { label: "2 hours", value: 2 },
  { label: "2.5 hours", value: 2.5 },
  { label: "3 hours", value: 3 },
  { label: "3.5 hours", value: 3.5 },
  { label: "4 hours", value: 4 },
  { label: "5 hours", value: 5 },
  { label: "6 hours", value: 6 },
];

// Google-Calendar-style time options, 15-minute increments ("9:00 AM").
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h24 = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const pad = (n: number) => String(n).padStart(2, "0");
  const value = `${pad(h24)}:${pad(m)}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return { value, label: `${h12}:${pad(m)} ${ampm}` };
});

function formatTimeLabel(value24: string) {
  if (!value24) return "";
  const [h, m] = value24.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Acepta "9", "930", "9:30", "9:30am", "9:30 PM", "21:30", etc.
// Sin AM/PM asume 24h. Devuelve "HH:MM" (24h) o null si no matchea nada.
function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap]\.?m?\.?)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (min > 59) return null;
  const ampm = m[3] ? m[3][0] : null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = ampm === "a" ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
  } else if (h > 23) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(min)}`;
}

const TimeSelect = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; className?: string; placeholder?: string }>(
  ({ value, onChange, className, placeholder }, ref) => {
    const [text, setText] = useState(() => formatTimeLabel(value));
    const [invalid, setInvalid] = useState(false);
    const [open, setOpen] = useState(false);
    const [typing, setTyping] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setText(formatTimeLabel(value)); }, [value]);

    // Cierra el dropdown al clickear afuera.
    useEffect(() => {
      if (!open) return;
      function handler(e: MouseEvent) {
        if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
      }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Filtra la lista mientras se escribe — prefijo primero (GCal-style:
    // "9:0" prioriza "9:00 AM"/"9:00 PM"), y si no matchea nada por
    // prefijo, busca como substring en cualquier parte del label.
    // GCal-style: al abrir sin haber tipeado nada, muestra la lista completa
    // (scrolleada hasta la hora actual). Recién filtra en vivo cuando el
    // usuario empieza a escribir.
    const filtered = useMemo(() => {
      if (!typing) return TIME_OPTIONS;
      const q = text.trim().toLowerCase();
      if (!q) return TIME_OPTIONS;
      const starts = TIME_OPTIONS.filter(t => t.label.toLowerCase().startsWith(q));
      return starts.length > 0 ? starts : TIME_OPTIONS.filter(t => t.label.toLowerCase().includes(q));
    }, [text, typing]);

    // Al abrir, hace scroll hasta la opción actualmente seleccionada
    // (mismo comportamiento que el dropdown de GCal).
    useEffect(() => {
      if (open && listRef.current) {
        listRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
      }
    }, [open]);

    function selectOption(opt: { value: string; label: string }) {
      onChange(opt.value);
      setText(opt.label);
      setInvalid(false);
      setOpen(false);
      setTyping(false);
    }

    function commit() {
      const parsed = parseTimeInput(text);
      if (parsed) {
        onChange(parsed);
        setText(formatTimeLabel(parsed));
        setInvalid(false);
      } else if (text.trim() !== "") {
        // No se pudo interpretar — vuelve al último valor válido en vez de
        // mandar basura al form o dejar el campo en un estado raro.
        setInvalid(true);
        setTimeout(() => setInvalid(false), 1200);
        setText(formatTimeLabel(value));
      } else {
        setText(formatTimeLabel(value));
      }
      setOpen(false);
      setTyping(false);
    }

    return (
      <div ref={wrapRef} className={`relative ${(className ?? "").replace(/\bfocus:/g, "focus-within:")}`}>
        <input
          ref={ref}
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={e => { setText(e.target.value); setOpen(true); setTyping(true); setHighlightIdx(-1); }}
          onFocus={() => { setOpen(true); setTyping(false); }}
          // Delay para que un click en una opción (que dispara blur primero)
          // alcance a registrarse antes de que commit() cierre el dropdown.
          onBlur={() => setTimeout(commit, 120)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && highlightIdx >= 0 && filtered[highlightIdx]) selectOption(filtered[highlightIdx]);
              else commit();
            } else if (e.key === "Escape") {
              setText(formatTimeLabel(value));
              setOpen(false);
              setTyping(false);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setTyping(false);
              setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIdx(i => Math.max(i - 1, 0));
            }
          }}
          className={`w-full h-full bg-transparent border-0 outline-none px-0 py-0 transition-shadow duration-300 ${invalid ? "ring-2 ring-red-400 rounded" : ""}`}
        />
        {open && filtered.length > 0 && (
          <div
            ref={listRef}
            className="absolute z-50 mt-1 max-h-52 w-full min-w-[110px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
          >
            {filtered.map((t, i) => (
              <button
                key={t.value}
                type="button"
                data-active={t.value === value}
                // onMouseDown + preventDefault en vez de onClick: evita que
                // el input pierda el foco (y dispare blur/commit) antes de
                // que el click en la opción llegue a procesarse.
                onMouseDown={e => { e.preventDefault(); selectOption(t); }}
                className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${t.value === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                  } ${i === highlightIdx ? "bg-gray-100" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);
TimeSelect.displayName = "TimeSelect";

// ── LunchFormModal ────────────────────────────────────────────────────────────
// Simplified modal for creating "Lunch" events (15 min duration, fixed title).
// User picks date, time (via TimeSelect), and optionally a team.

function LunchFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (e: CalEvent) => void;
}) {
  // Converters from EventFormModal (reused logic)
  function toLocalInput(iso: string): string {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  }

  function inputToIso(localVal: string): string {
    if (!localVal) return "";
    const asUtc = new Date(localVal + "Z");
    if (isNaN(asUtc.getTime())) return "";
    const vanParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(asUtc);
    const vg = (t: string) => vanParts.find(p => p.type === t)?.value ?? "00";
    const vanHour = vg("hour") === "24" ? "00" : vg("hour");
    const vanAsUtc = new Date(`${vg("year")}-${vg("month")}-${vg("day")}T${vanHour}:${vg("minute")}:${vg("second")}Z`);
    const offsetMs = vanAsUtc.getTime() - asUtc.getTime();
    return new Date(asUtc.getTime() - offsetMs).toISOString();
  }

  const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  const now = new Date().toISOString();
  const defaultStart = toLocalInput(now);
  const defaultEnd = toLocalInput(new Date(new Date(now).getTime() + 15 * 60_000).toISOString());

  const [startVal, setStartVal] = useState(defaultStart);
  const [endVal, setEndVal] = useState(defaultEnd);
  const [colorId, setColorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>(NON_TEAM_COLOR_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    loadAssignTeamCfg().then(({ colorOptions: opts }) => { if (!cancelled) setColorOptions(opts); }).catch(() => { });
    return () => { cancelled = true; };
  }, []);

  // Helper: Calculate end value given a start value (adds 15 minutes)
  // Returns the end time string in format YYYY-MM-DDTHH:MM
  function calculateEndVal(startValue: string): string {
    if (!LOCAL_DT_RE.test(startValue)) return "";
    // Treat the local time string as if it were UTC (for duration math)
    // This works because we're just adding 15 minutes
    const startDt = new Date(startValue + "Z");
    const endDt = new Date(startDt.getTime() + 15 * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${endDt.getUTCFullYear()}-${pad(endDt.getUTCMonth() + 1)}-${pad(endDt.getUTCDate())}T${pad(endDt.getUTCHours())}:${pad(endDt.getUTCMinutes())}`;
  }

  // Handle date change — calculate new start/end and update both
  function handleDateChange(newDate: string) {
    // Get current time from startVal (fallback to 00:00 if empty)
    const currentTime = startVal.slice(11) || "00:00";
    const newStart = `${newDate}T${currentTime}`;

    if (LOCAL_DT_RE.test(newStart)) {
      const newEnd = calculateEndVal(newStart);
      setStartVal(newStart);
      setEndVal(newEnd);
    }
  }

  // Handle time change (via TimeSelect) — calculate new start/end and update both
  function handleTimeChange(newTime: string) {
    // Get current date from startVal (fallback to today if empty)
    const currentDate = startVal.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const newStart = `${currentDate}T${newTime}`;

    if (LOCAL_DT_RE.test(newStart)) {
      const newEnd = calculateEndVal(newStart);
      setStartVal(newStart);
      setEndVal(newEnd);
    }
  }

  async function handleSubmit() {
    if (!LOCAL_DT_RE.test(startVal) || !LOCAL_DT_RE.test(endVal)) {
      setError("Pick both a date and a time");
      return;
    }
    // Validate that end is after start (string comparison works for YYYY-MM-DDTHH:MM format)
    if (endVal <= startVal) {
      setError("End time must be after start (this shouldn't happen, please refresh and try again)");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const input: EventInput = {
        summary: "Lunch",
        description: null,
        location: null,
        startIso: inputToIso(startVal),
        endIso: inputToIso(endVal),
        colorId: colorId || null,
      };
      const saved = await apiCreateEvent(input);
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Failed to create lunch event");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full text-sm border-0 border-b border-gray-200 px-0 py-2 focus:outline-none focus:border-blue-500 transition-colors bg-transparent placeholder-gray-400";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.18)] w-full max-w-md overflow-hidden">
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <h2 className="font-medium text-gray-800 text-base">Add Lunch</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* Title (fixed as "Lunch") */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Title</label>
            <div className="w-full text-sm px-0 py-2 border-b border-gray-200 text-gray-700 font-medium">
              Lunch
            </div>
          </div>

          {/* Date & Time — SAME as EventFormModal (separated inputs) */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Date & Time</label>
            <div className="flex gap-2">
              {/* Date picker */}
              <input
                type="date"
                value={startVal.slice(0, 10)}
                onChange={e => handleDateChange(e.target.value)}
                className={`${inputCls} flex-[3] min-w-0`}
              />
              {/* Time select with dropdown and type-to-search */}
              <TimeSelect
                value={startVal.slice(11)}
                onChange={t => handleTimeChange(t)}
                className={`${inputCls} bg-white flex-[2] min-w-[92px] pr-5`}
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Duration: 15 minutes (automatically set)</p>
          </div>

          {/* Team / Color */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Team (optional)</label>
            <select value={colorId} onChange={e => setColorId(e.target.value)} className={`${inputCls} bg-white`}>
              {colorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Create Lunch
          </button>
        </div>
      </div>
    </div>
  );
}

function EventFormModal({
  event, initialStart, duplicateFrom, onClose, onSaved, onOpenSchedule, conflictRefreshKey,
}: {
  event?: CalEvent;
  initialStart?: string;
  // LAB309: source event being duplicated. Prefills title/notes/location/team
  // color/client/service type/duration just like editing would, but this stays
  // a *create* flow (isEdit remains false — no `event` is passed) and the
  // date/time fields are left blank so the admin must pick a new slot.
  duplicateFrom?: CalEvent;
  onClose: () => void;
  onSaved: (e: CalEvent, scope?: "single" | "following" | "all") => void;
  onOpenSchedule?: (employee: { id: string; name: string }) => void;
  conflictRefreshKey?: number;
}) {
  // Converts any ISO string to "YYYY-MM-DDTHH:MM" expressed in Vancouver time.
  function toLocalInput(iso: string): string {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  }

  // Converts a datetime-local input value ("YYYY-MM-DDTHH:MM") to UTC ISO,
  // treating the value as America/Vancouver time (handles DST automatically).
  function inputToIso(localVal: string): string {
    if (!localVal) return "";
    // Parse as UTC to use as a reference for offset calculation
    const asUtc = new Date(localVal + "Z");
    if (isNaN(asUtc.getTime())) return "";
    // Get what Vancouver shows for this UTC instant
    const vanParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(asUtc);
    const vg = (t: string) => vanParts.find(p => p.type === t)?.value ?? "00";
    const vanHour = vg("hour") === "24" ? "00" : vg("hour");
    const vanAsUtc = new Date(`${vg("year")}-${vg("month")}-${vg("day")}T${vanHour}:${vg("minute")}:${vg("second")}Z`);
    // offsetMs = how far ahead Vancouver reads vs real UTC (negative = behind UTC)
    const offsetMs = vanAsUtc.getTime() - asUtc.getTime();
    return new Date(asUtc.getTime() - offsetMs).toISOString();
  }

  // LAB309: when duplicating, startVal/endVal start out as "" so the admin
  // is forced to pick a new date/time. But the date and time sub-inputs write
  // into the SAME combined "YYYY-MM-DDTHH:MM" string independently — if the
  // admin picks only the date and never touches the time picker, the result
  // is a truncated string like "2026-09-08T" (no minutes). That string is
  // truthy (so `if (startVal)` guards don't catch it) but `new Date(...)`
  // can't parse it, which silently turned into an empty startIso/endIso at
  // submit time — the create request then got rejected by the backend with
  // "summary, startIso and endIso are required" (or worse, if only one side
  // broke, could submit a bogus range). This regex is the single source of
  // truth for "is this a genuinely complete, parseable local datetime".
  const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

  const isEdit = !!event;
  const isPartOfSeries = !!event?.seriesId;
  const defaultStart = event?.startIso ? toLocalInput(event.startIso)
    : initialStart ? toLocalInput(initialStart)
      : duplicateFrom ? ""
        : toLocalInput(new Date().toISOString());
  const defaultEnd = event?.endIso ? toLocalInput(event.endIso)
    : initialStart ? toLocalInput(new Date(new Date(initialStart).getTime() + 2 * 3600_000).toISOString())
      : duplicateFrom ? ""
        : toLocalInput(new Date(Date.now() + 2 * 3600_000).toISOString());

  const [summary, setSummary] = useState(event?.summary ?? duplicateFrom?.summary ?? "");
  // "Event notes" — freeform, per-event text. Lives in the Google Calendar
  // event's description, alongside a hidden "client_id: <uuid>" marker line
  // which we strip out here so the admin only edits the actual notes.
  const [eventNotes, setEventNotes] = useState(() => stripClientIdLine(htmlToPlainText(event?.description ?? duplicateFrom?.description)));
  const [location, setLocation] = useState(event?.location ?? duplicateFrom?.location ?? "");
  const [startVal, setStartVal] = useState(defaultStart);
  const [endVal, setEndVal] = useState(defaultEnd);

  // LAB284: preserva la duración del evento cuando se mueve el Start en modo
  // edit (imita el comportamiento de Google Calendar). Se actualiza cada vez
  // que el usuario toca el End directamente.
  const durationMsRef = useRef(new Date(defaultEnd).getTime() - new Date(defaultStart).getTime());

  function handleStartChange(newStart: string) {
    setStartVal(newStart);
    if (!isEdit) return; // create mode ya recalcula End via su propio efecto (duration)
    const newEndDate = new Date(new Date(newStart).getTime() + durationMsRef.current);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEndVal(`${newEndDate.getFullYear()}-${pad(newEndDate.getMonth() + 1)}-${pad(newEndDate.getDate())}T${pad(newEndDate.getHours())}:${pad(newEndDate.getMinutes())}`);
  }

  function handleEndChange(newEnd: string) {
    setEndVal(newEnd);
    const newDuration = new Date(newEnd).getTime() - new Date(startVal).getTime();
    if (newDuration > 0) durationMsRef.current = newDuration;
  }

  // client_id associated with this event when editing (backend field, falling
  // back to the legacy embedded marker for older events).
  const editClientId = event ? (event.clientId ?? extractClientId(event)) : null;

  // Desde la migración a detección por color, event.colorId ya es la fuente
  // de verdad real — no hace falta ningún mapeo teamId→colorId para el caso
  // normal. El único caso que necesita el mapeo dinámico (cargado abajo vía
  // loadAssignTeamCfg) es un evento viejo sin colorId propio pero con
  // teamId ya resuelto por el backend (detección legacy por #N/emoji).
  function resolveInitialColorId(event?: CalEvent): string {
    return event?.colorId ?? "";
  }

  const [colorId, setColorId] = useState(() => resolveInitialColorId(event ?? duplicateFrom));
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>(NON_TEAM_COLOR_OPTIONS);

  // Carga la config de equipos (una sola vez por sesión, cacheada) para
  // poblar el dropdown de color y, si hace falta, completar el colorId de
  // un evento legacy sin colorId propio (ver resolveInitialColorId arriba).
  useEffect(() => {
    let cancelled = false;
    loadAssignTeamCfg().then(({ cfg, colorOptions: opts }) => {
      if (cancelled) return;
      setColorOptions(opts);
      setColorId(prev => {
        if (prev) return prev;
        const src = event ?? duplicateFrom;
        return (src?.teamId && cfg[src.teamId]?.colorIds?.[0]) || prev;
      });
    }).catch(() => { /* deja NON_TEAM_COLOR_OPTIONS como fallback */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictResult[]>([]);
  const [checking, setChecking] = useState(false);
  const startTimeFieldRef = useRef<HTMLInputElement>(null);
  const [blinkStartTime, setBlinkStartTime] = useState(false);

  function scrollToTimeFields() {
    startTimeFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    startTimeFieldRef.current?.focus();
    setBlinkStartTime(true);
    setTimeout(() => setBlinkStartTime(false), 1500);
  }

  // CA2/CA3: client typeahead
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const [serviceType, setServiceType] = useState("");
  const [duration, setDuration] = useState(() => {
    if (!duplicateFrom) return 2;
    const hours = (new Date(duplicateFrom.endIso).getTime() - new Date(duplicateFrom.startIso).getTime()) / 3_600_000;
    const match = DURATION_OPTIONS.find(o => Math.abs(o.value - hours) < 0.01);
    return match ? match.value : 2;
  });
  const [searchingClient, setSearchingClient] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  const [recurrenceFreq, setRecurrenceFreq] = useState<"" | "WEEKLY" | "BIWEEKLY" | "MONTHLY">("");
  const [recurrenceEndType, setRecurrenceEndType] = useState<"never" | "count" | "until">("never");
  const [recurrenceCount, setRecurrenceCount] = useState(10);
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [recurrenceTouched, setRecurrenceTouched] = useState(false);
  const [loadingSeriesRecurrence, setLoadingSeriesRecurrence] = useState(isEdit && isPartOfSeries);

  // Precarga el patrón real de la serie cuando se edita una instancia (las
  // instancias nunca traen `recurrence` propio, solo el maestro lo tiene).
  useEffect(() => {
    if (!isEdit || !isPartOfSeries || !event?.seriesId) return;
    let cancelled = false;
    apiFetchSeriesRecurrence(event.seriesId)
      .then(info => {
        if (cancelled || !info) return;
        setRecurrenceFreq(info.freq);
        setRecurrenceEndType(info.endType);
        if (info.count) setRecurrenceCount(info.count);
        if (info.until) setRecurrenceUntil(info.until);
      })
      .finally(() => { if (!cancelled) setLoadingSeriesRecurrence(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [seriesConflicts, setSeriesConflicts] = useState<{ dateIso: string; type: string; detail: string }[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  useEffect(() => {
    // Sin equipo asignado no hay nada contra qué comparar (mismo criterio que
    // el backend: teamIdFromColorId(null) siempre devuelve null).
    if (!colorId || !startVal || endVal <= startVal) { setSeriesConflicts([]); return; }

    setCheckingConflicts(true);
    const timer = setTimeout(async () => {
      const slots = (!isEdit && recurrenceFreq)
        ? generateCandidateSlots(inputToIso(startVal), inputToIso(endVal), {
          freq: recurrenceFreq,
          ...(recurrenceEndType === "count" && { count: recurrenceCount }),
          ...(recurrenceEndType === "until" && recurrenceUntil && { until: recurrenceUntil }),
        })
        : [{ startIso: inputToIso(startVal), endIso: inputToIso(endVal) }];

      const conflicts = await apiCheckSeriesConflicts(slots, colorId || null, {
        eventId: event?.id,
        seriesId: event?.seriesId ?? null,
      });
      setSeriesConflicts(conflicts);
      setCheckingConflicts(false);
    }, 400);
    return () => { clearTimeout(timer); setCheckingConflicts(false); };
  }, [isEdit, recurrenceFreq, recurrenceEndType, recurrenceCount, recurrenceUntil, startVal, endVal, colorId, event?.id, event?.seriesId]);
  // notes — permanent notes about the client & the cleaning location
  // (door codes, property specs). Prefilled from DB, editable here, saved
  // back to the clients row (independent of the calendar event save).
  const [clientNotes, setClientNotes] = useState("");
  const [loadingClientNotes, setLoadingClientNotes] = useState(false);
  const clientNotesDirty = useRef(false);
  // En edit mode ahora sigue la selección en vivo del picker (el admin puede
  // cambiar el cliente igual que en New Event) — cae al cliente original del
  // evento hasta que se elija uno nuevo.
  const clientIdForNotes = selectedClient?.id ?? (isEdit ? editClientId : null);

  function loadClientNotes(id: string) {
    setLoadingClientNotes(true);
    apiFetchClient(id)
      .then(c => { setClientNotes(c.notes ?? ""); clientNotesDirty.current = false; })
      .catch(() => { })
      .finally(() => setLoadingClientNotes(false));
  }

  // Edit mode: prefill notes once, from the client linked to this event.
  useEffect(() => {
    if (isEdit && editClientId) {
      loadClientNotes(editClientId);
      // Prefill the client picker too, so the Edit modal shows (and lets you
      // change) the client the same way New Event does.
      apiFetchClient(editClientId)
        .then(c => {
          const name = clientDisplayName(c);
          setSelectedClient({
            id: c.id,
            name,
            email: c.email ?? null,
            default_address: c.default_address ?? null,
            service_type: c.service_type ?? null,
            mobile: c.mobile ?? null,
            phone: c.phone ?? null,
          });
          setClientQuery(name);
        })
        .catch(() => { }); // non-blocking — el campo queda buscable igual
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New Event: preview de las preferencias del cliente elegido — mismo hook
  // que usa RescheduleModal, pero acá es puramente informativo (arranca con
  // lo que sea que ya esté en startVal, así que el ✅/⚠ también sirve como
  // aviso temprano si el horario por defecto no calza con sus días de siempre).
  const { preferenceCheck: clientPreferenceCheck, loadingPreference: loadingClientPreference } = useClientPreferences(
    !isEdit ? (selectedClient?.id ?? null) : null,
    !isEdit ? summary : "",
    !isEdit && LOCAL_DT_RE.test(startVal) ? inputToIso(startVal) : "",
  );

  // LAB309: Duplicate mode — prefill the client picker (and notes/service type)
  // from the source event's client. Unlike handleSelectClient, this doesn't
  // touch summary/location: those already carry the source event's own values
  // and shouldn't be overwritten by the client's defaults.
  useEffect(() => {
    if (!duplicateFrom) return;
    const sourceClientId = duplicateFrom.clientId ?? extractClientId(duplicateFrom);
    if (!sourceClientId) return;
    loadClientNotes(sourceClientId);
    apiFetchClient(sourceClientId)
      .then(c => {
        const name = clientDisplayName(c);
        setSelectedClient({
          id: c.id,
          name,
          email: c.email ?? null,
          default_address: c.default_address ?? null,
          service_type: c.service_type ?? null,
          mobile: c.mobile ?? null,
          phone: c.phone ?? null,
        });
        setClientQuery(name);
        if (c.service_type) {
          const mapped = SERVICE_TYPE_MAP[c.service_type] ?? c.service_type;
          setServiceType(SERVICE_TYPES.includes(mapped) ? mapped : "");
        }
      })
      .catch(() => { }); // non-blocking — el campo queda buscable igual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typeahead debounce
  useEffect(() => {
    if (selectedClient) return; // don't search if client already selected
    const t = setTimeout(async () => {
      if (clientQuery.length < 2) { setClientResults([]); return; }
      setSearchingClient(true);
      setClientResults(await apiSearchClients(clientQuery));
      setSearchingClient(false);
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery, selectedClient]);

  // Update endVal when start or duration changes
  useEffect(() => {
    if (!isEdit && LOCAL_DT_RE.test(startVal)) {
      const start = new Date(startVal);
      const end = new Date(start.getTime() + duration * 3_600_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setEndVal(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`);
    }
  }, [startVal, duration, isEdit]);

  function handleSelectClient(c: ClientResult) {
    setSelectedClient(c);
    setClientQuery(c.name);
    setClientResults([]);
    // CA3: autocomplete location and service type
    if (c.default_address) setLocation(c.default_address);
    if (!isEdit && c.service_type) {
      const mapped = SERVICE_TYPE_MAP[c.service_type] ?? c.service_type;
      setServiceType(SERVICE_TYPES.includes(mapped) ? mapped : "");
    }
    // Build summary if empty
    if (!summary.trim()) setSummary(`${c.name} – ${c.service_type || "Cleaning"}`);
    // Prefill notes from DB (CA5: notes de cliente/ubicación)
    loadClientNotes(c.id);
  }

  function handleClearClient() {
    setSelectedClient(null);
    setClientQuery("");
    setClientResults([]);
    setClientNotes("");
    clientNotesDirty.current = false;
  }

  function handleNewClientSaved(c: Client) {
    handleSelectClient({
      id: c.id,
      name: clientDisplayName(c),
      email: c.email,
      default_address: c.default_address,
      service_type: c.service_type,
      mobile: c.mobile,
      phone: c.phone,
    });
    setShowNewClientModal(false);
  }

  // CA4: check for team conflicts whenever start/end change in edit mode,
  // or when conflictRefreshKey changes (e.g. after editing a cleaner's schedule).
  useEffect(() => {
    if (!isEdit || !event) return;
    const newStartIso = inputToIso(startVal);
    const newEndIso = inputToIso(endVal);
    setChecking(true);
    apiCheckConflicts(event.id, newStartIso, newEndIso)
      .then(setConflicts)
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startVal, endVal, isEdit, event, conflictRefreshKey]);


  const [pendingScopeChoice, setPendingScopeChoice] = useState(false);

  async function handleSubmit(scope: "single" | "following" | "all" = "single") {
    if (!summary.trim()) { setError("Title is required"); return; }
    if (!LOCAL_DT_RE.test(startVal) || !LOCAL_DT_RE.test(endVal)) { setError("Pick both a start date and a start time"); return; }
    if (endVal <= startVal) { setError("End time must be after start"); return; }

    const includeRecurrence = !!recurrenceFreq && (!isEdit || !isPartOfSeries || recurrenceTouched);

    // LAB-233: editing an occurrence that belongs to a series — ask the admin
    // whether the change should apply to just this event or the whole series,
    // before doing any network work. Re-entered with the chosen scope once
    // RecurrenceScopeModal calls back.
    if (isEdit && event?.seriesId && !pendingScopeChoice) {
      if (includeRecurrence) {
        // Un cambio de patrón solo tiene sentido para toda la serie —
        // se salta el picker de single/following/all.
        scope = "all";
      } else {
        setPendingScopeChoice(true);
        return;
      }
    }

    setSaving(true); setError(null);
    try {
      // Re-attach the hidden client_id marker line (stripped from the visible
      // "Event notes" textarea) so the client ↔ event association is preserved.
      const finalDescription = withClientIdLine(eventNotes, clientIdForNotes);
      const input: EventInput = {
        summary: summary.trim(), description: finalDescription || null,
        location: location || null,
        startIso: inputToIso(startVal), endIso: inputToIso(endVal),
        colorId: colorId || null,
      };
      // CA2: pass clientId and serviceType to backend for Supabase sync
      const fullInput = {
        ...input,
        ...(selectedClient && { clientId: selectedClient.id }),
        ...(serviceType && { serviceType }),
        ...(includeRecurrence && {
          recurrence: {
            freq: recurrenceFreq,
            ...(recurrenceEndType === "count" && { count: recurrenceCount }),
            ...(recurrenceEndType === "until" && recurrenceUntil && { until: inputToIso(`${recurrenceUntil}T23:59`) }),
          },
        }),
      };
      const saved = isEdit
        ? await apiUpdateEvent(event!.id, fullInput, scope)
        : await apiCreateEvent(fullInput);

      // Save notes (clients table) best-effort — doesn't block the
      // event save if it fails, since it's a secondary write to a different resource.
      if (clientIdForNotes && clientNotesDirty.current) {
        try { await apiUpdateClient(clientIdForNotes, { notes: clientNotes }); }
        catch (e: any) { console.warn("Failed to save client notes:", e.message); }
      }

      onSaved(saved, isEdit ? scope : undefined);
    } catch (e: any) { setError(e.message ?? "Failed to save"); setPendingScopeChoice(false); }
    finally { setSaving(false); }
  }


  const inputCls = "w-full text-sm border-0 border-b border-gray-200 px-0 py-2 focus:outline-none focus:border-blue-500 transition-colors bg-transparent placeholder-gray-400";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.18)] w-full max-w-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <h2 className="font-medium text-gray-800 text-base">{isEdit ? "Edit event" : duplicateFrom ? "Duplicate event" : "New event"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {/* CA4: Team conflict warning (edit mode only) */}
          {isEdit && conflicts.length > 0 && (() => {
            const hasTimingConflict = conflicts.some(c => c.reasons.some(r => r.type === "timing"));
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-amber-700">⚠ Team conflict detected</p>
                  {hasTimingConflict && (
                    <button
                      type="button"
                      onClick={scrollToTimeFields}
                      className="flex-shrink-0 text-[11px] font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 transition-colors"
                    >
                      Edit time
                    </button>
                  )}
                </div>
                {conflicts.map(c => {
                  const timingReasons = c.reasons.filter(r => r.type === "timing");
                  const scheduleReasons = c.reasons.filter(r => r.type === "schedule");
                  return (
                    <div key={c.employeeId} className="space-y-1">
                      {timingReasons.length > 0 && (
                        <p className="text-xs text-amber-700">
                          <span className="font-medium">{c.name}:</span> {timingReasons.map(r => r.message).join(", ")}
                        </p>
                      )}
                      {scheduleReasons.length > 0 && (
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-amber-700">
                            <span className="font-medium">{c.name}:</span> {scheduleReasons.map(r => r.message).join(", ")}
                          </p>
                          {onOpenSchedule && (
                            <button
                              type="button"
                              onClick={() => onOpenSchedule({ id: c.employeeId, name: c.name })}
                              className="flex-shrink-0 text-[11px] font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900 transition-colors"
                            >
                              Edit schedule
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[11px] text-amber-600 mt-1">You can still save — this is a warning only.</p>
              </div>
            );
          })()}
          {isEdit && checking && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Checking team availability…
            </p>
          )}

          {/* Title */}
          <input
            type="text" value={summary} onChange={e => setSummary(e.target.value)}
            placeholder="Add title"
            className="w-full text-xl font-normal border-0 border-b-2 border-gray-200 px-0 py-1 focus:outline-none focus:border-blue-500 transition-colors bg-transparent placeholder-gray-300"
          />

          {/* Client typeahead — create and edit mode. En edit mode arranca prefilled con el cliente actual del evento 
          (ver useEffect de arriba) y se puede cambiar igual que en New Event. */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Client</label>
            <div className="relative">
              <div className="flex items-center border-b border-gray-200 focus-within:border-blue-500 transition-colors">
                <input
                  type="text"
                  value={clientQuery}
                  onChange={e => { setClientQuery(e.target.value); setSelectedClient(null); }}
                  placeholder="Search client…"
                  className="flex-1 text-sm py-2 px-0 border-0 focus:outline-none bg-transparent placeholder-gray-400"
                />
                {searchingClient && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Loader2 size={13} className="animate-spin text-blue-500" />
                    <span className="text-xs text-blue-500 font-medium">Searching…</span>
                  </div>
                )}
                {selectedClient && (
                  <button onClick={handleClearClient} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                    <X size={13} />
                  </button>
                )}
              </div>
              {/* Dropdown results */}
              {clientResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 overflow-hidden">
                  {clientResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectClient(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                    </button>
                  ))}
                </div>
              )}

              {/* No results → offer to create */}
              {clientQuery.length >= 2 && !searchingClient && clientResults.length === 0 && !selectedClient && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 overflow-hidden">
                  <button
                    onClick={() => setShowNewClientModal(true)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-2 text-sm text-blue-600 font-medium"
                  >
                    <Plus size={14} />
                    Add &ldquo;{clientQuery}&rdquo; as new client
                  </button>
                </div>
              )}
            </div>
            {selectedClient?.default_address && (
              <p className="text-xs text-gray-400 mt-1 truncate">📍 {selectedClient.default_address}</p>
            )}
            {!isEdit && selectedClient && (
              <div className="mt-2">
                {loadingClientPreference && (
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" /> Checking client preferences…
                  </p>
                )}
                {!loadingClientPreference && clientPreferenceCheck?.hasPreferences && (
                  <div className={`rounded-lg px-3 py-2.5 space-y-1 border ${clientPreferenceCheck.compatible ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
                    }`}>
                    {clientPreferenceCheck.message && (
                      <p className={`text-xs font-semibold ${clientPreferenceCheck.compatible ? "text-emerald-700" : "text-amber-700"}`}>
                        {clientPreferenceCheck.compatible ? "✅" : "⚠"} {clientPreferenceCheck.message}
                      </p>
                    )}
                    {clientPreferenceCheck.preferredDays.length > 0 && (
                      <p className={`text-[11px] ${clientPreferenceCheck.compatible ? "text-emerald-600" : "text-amber-700"}`}>
                        Preferred days: <span className="font-medium">{clientPreferenceCheck.preferredDays.join(", ")}</span>
                      </p>
                    )}
                    {clientPreferenceCheck.preferredTime && (
                      <p className={`text-[11px] ${clientPreferenceCheck.compatible ? "text-emerald-600" : "text-amber-700"}`}>
                        Preferred time: <span className="font-medium">{clientPreferenceCheck.preferredTime}</span>
                      </p>
                    )}
                    {clientPreferenceCheck.expectedFrequency && (
                      <p className={`text-[11px] ${clientPreferenceCheck.compatible ? "text-emerald-600" : "text-amber-700"}`}>
                        Expected frequency: <span className="font-medium">{clientPreferenceCheck.expectedFrequency}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Add location" className={inputCls} />
          </div>

          {/* CA2: Service type (create mode) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Service type</label>
              <select value={serviceType} onChange={e => setServiceType(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="">Select type…</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {/* LAB-233: Recurrence (create mode only) */}
          {/* Repeats — create mode arranca vacío; edit mode precarga el patrón real
    si el evento ya pertenece a una serie (ver useEffect arriba). */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-400 mb-1">Repeats</label>
            {loadingSeriesRecurrence ? (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Loading current pattern…
              </p>
            ) : (
              <>
                <select
                  value={recurrenceFreq}
                  onChange={e => { setRecurrenceFreq(e.target.value as any); setRecurrenceTouched(true); }}
                  className={`${inputCls} bg-white`}
                >
                  <option value="">Does not repeat</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Every 2 weeks</option>
                  <option value="MONTHLY">Monthly</option>
                </select>

                {recurrenceFreq && (
                  <div className="space-y-2">
                    <select
                      value={recurrenceEndType}
                      onChange={e => { setRecurrenceEndType(e.target.value as any); setRecurrenceTouched(true); }}
                      className={`${inputCls} bg-white`}
                    >
                      <option value="never">Ends after 1 year (default)</option>
                      <option value="count">Ends after N occurrences</option>
                      <option value="until">Ends on date</option>
                    </select>
                    {recurrenceEndType === "count" && (
                      <input type="number" min={1} value={recurrenceCount}
                        onChange={e => { setRecurrenceCount(Number(e.target.value)); setRecurrenceTouched(true); }}
                        className={`${inputCls} w-24`} placeholder="Number of occurrences" />
                    )}
                    {recurrenceEndType === "until" && (
                      <input type="date" value={recurrenceUntil}
                        onChange={e => { setRecurrenceUntil(e.target.value); setRecurrenceTouched(true); }}
                        className={inputCls} />
                    )}
                  </div>
                )}

                {isEdit && isPartOfSeries && recurrenceTouched && (
                  <p className="text-[11px] text-amber-600">This changes the pattern for the whole series ("All recurring events").</p>
                )}
                {isEdit && !isPartOfSeries && recurrenceFreq && (
                  <p className="text-[11px] text-gray-400">This turns this event into a recurring series starting now.</p>
                )}
              </>
            )}
          </div>

          {/* Start + Duration (create) or Start + End (edit) */}
          {isEdit ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Start</label>
                <div className="flex gap-2">
                  <input type="date" value={startVal.slice(0, 10)} onChange={e => handleStartChange(`${e.target.value}T${startVal.slice(11)}`)} className={`${inputCls} flex-[3] min-w-0`} />
                  <TimeSelect
                    ref={startTimeFieldRef}
                    value={startVal.slice(11)}
                    onChange={t => handleStartChange(`${startVal.slice(0, 10)}T${t}`)}
                    className={`${inputCls} bg-white flex-[2] min-w-[92px] pr-5 transition-shadow duration-300 ${blinkStartTime ? "ring-2 ring-amber-400" : ""}`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">End</label>
                <div className="flex gap-2">
                  <input type="date" value={endVal.slice(0, 10)} onChange={e => handleEndChange(`${e.target.value}T${endVal.slice(11)}`)} className={`${inputCls} flex-[3] min-w-0`} />
                  <TimeSelect value={endVal.slice(11)} onChange={t => handleEndChange(`${endVal.slice(0, 10)}T${t}`)} className={`${inputCls} bg-white flex-[2] min-w-[92px] pr-5`} />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Start</label>
                <div className="flex gap-2">
                  <input type="date" value={startVal.slice(0, 10)} onChange={e => setStartVal(`${e.target.value}T${startVal.slice(11)}`)} className={`${inputCls} flex-[3] min-w-0`} />
                  <TimeSelect value={startVal.slice(11)} onChange={t => setStartVal(`${startVal.slice(0, 10)}T${t}`)} placeholder="Time" className={`${inputCls} bg-white flex-[2] min-w-[92px] pr-5`} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Duration</label>
                <select value={duration} onChange={e => setDuration(Number(e.target.value))} className={`${inputCls} bg-white`}>
                  {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* notes — permanent notes about the client & location (door codes,
              property specs). Shown once we have a client in context: an existing
              client selected (create mode) or the client linked to this event (edit mode). */}
          {clientIdForNotes && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-400">Client notes</label>
                {loadingClientNotes && <Loader2 size={11} className="animate-spin text-gray-400" />}
              </div>
              <textarea
                rows={4} value={clientNotes}
                onChange={e => { setClientNotes(e.target.value); clientNotesDirty.current = true; }}
                placeholder="Door codes, property specs, permanent instructions…"
                className={`${inputCls} resize-none`}
              />
              <p className="text-[11px] text-gray-400 mt-1">Shared across all of this client's appointments.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Team / Color</label>
            <select value={colorId} onChange={e => setColorId(e.target.value)} className={`${inputCls} bg-white`}>
              {colorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          {checkingConflicts && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-1.5">
              <Loader2 size={12} className="animate-spin" /> Checking possible conflicts…
            </p>
          )}

          {!checkingConflicts && seriesConflicts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1 max-h-32 overflow-y-auto mt-1.5">
              <p className="text-xs font-semibold text-amber-700">
                ⚠ {seriesConflicts.length} {isEdit ? "conflict(s) at this time" : "occurrence(s) have a conflict"}
              </p>
              {seriesConflicts.map((c, i) => (
                <p key={i} className="text-xs text-amber-700">
                  {DateTime.fromISO(c.dateIso, { zone: "America/Vancouver" }).toFormat("ccc, LLL d 'at' h:mm a")}: {c.detail}
                </p>
              ))}
              <p className="text-[11px] text-amber-600 mt-1">
                You can still {isEdit ? "save" : "create the series and reassign"} these dates later.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Event notes</label>
            <textarea rows={4} value={eventNotes} onChange={e => setEventNotes(e.target.value)} placeholder="Notes for this specific visit (e.g. focus on kitchen this week)…" className={`${inputCls} resize-none`} />
          </div>
        </div>
        <div className="px-6 py-4 flex items-center justify-end gap-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
          <button
            onClick={() => handleSubmit()}
            disabled={saving || checking || checkingConflicts}
            title={!saving && (checking || checkingConflicts) ? "Waiting for the conflict check to finish…" : undefined}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {(saving || checking || checkingConflicts) && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
        {pendingScopeChoice && (
          <RecurrenceScopeModal
            action="save"
            onConfirm={(scope) => { setPendingScopeChoice(false); handleSubmit(scope); }}
            onCancel={() => setPendingScopeChoice(false)}
          />
        )}
        {showNewClientModal && (
          <ClientFormModal
            initialName={clientQuery}
            onClose={() => setShowNewClientModal(false)}
            onSaved={handleNewClientSaved}
            zIndex="z-[90]"
          />
        )}
      </div>
    </div>
  );
}

// ── RecurrenceScopeModal ────────────────────────────────────────────────────────────

function RecurrenceScopeModal({
  action, onConfirm, onCancel, hideAllOption = false,
}: {
  action: "save" | "delete";
  onConfirm: (scope: "single" | "following" | "all") => void;
  onCancel: () => void;
  // Oculta "all recurring events" — p. ej. al arrastrar/reprogramar una
  // instancia, donde aplicar el cambio a toda la serie no tiene sentido.
  hideAllOption?: boolean;
}) {
  const verb = action === "save" ? "Save changes" : "Delete";
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <h3 className="font-medium text-gray-800">This is a recurring event</h3>
        <p className="text-sm text-gray-500">
          {hideAllOption
            ? "Choose whether this applies to just this occurrence or this and future ones."
            : "Choose whether this applies to just this occurrence, this and future ones, or all recurring events."}
        </p>
        <div className="space-y-2">
          <button onClick={() => onConfirm("single")} className="w-full text-left px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm">
            {verb} — this event only
          </button>
          <button onClick={() => onConfirm("following")} className="w-full text-left px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm">
            {verb} — this and following events
          </button>
          {!hideAllOption && (
            <button onClick={() => onConfirm("all")} className="w-full text-left px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm">
              {verb} — all recurring events
            </button>
          )}
        </div>
        <button onClick={onCancel} className="w-full py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-full border border-gray-200">
          Keep
        </button>
      </div>
    </div>
  );
}
// ── AssignModal ───────────────────────────────────────────────────────────────

interface StaffMember { id: string; name: string; email: string; is_team_leader: boolean; teamId: string | null; }

// A "today pair" now represents a team from daily_team_assignments, not a GCal attendee pair
interface TodayPair {
  teamId: string;       // "team_1" | "team_2" | "team_3" | ... (N equipos, no hardcodeado)
  teamLabel: string;    // "Team 1" | "Team 2" | "Team 3" | ...
  teamColor: string;    // hex color for the badge
  teamEmoji: string;    // emoji del equipo (fallback "⚫" si no está configurado)
  members: StaffMember[];
}

// Loaded from GET /api/admin/teams — cacheado a nivel de módulo, compartido
// por EventFormModal, AddLunchModal, AssignModal y ConflictResolutionModal,
// así solo se pega una vez al endpoint por sesión en vez de una vez por
// componente. `colorIds` es el colorId de GCal (ej. "10"), NO el hex de UI
// — reemplaza los mapas hardcodeados TEAM_COLOR_MAP / TEAM_TO_COLOR_ID que
// quedaban desincronizados de la tabla `teams` real cada vez que se agrega
// o cambia un equipo (ver 2026-08-07_tercer-equipo_analisis.md, sección 3.2).
// Requiere que GET /api/admin/teams devuelva `color_ids` en el JSON — si hoy
// ese endpoint no lo expone, hay que agregarlo al select (mismo patrón que
// calendarController.js:initTeamsConfig()).
let _cachedTeamCfg: Record<string, { label: string; color: string; colorIds: string[]; emoji: string }> | null = null;
let _cachedTeamOrder: string[] | null = null;
let _cachedColorOptions: { label: string; value: string }[] | null = null;

async function loadAssignTeamCfg(): Promise<{
  cfg: Record<string, { label: string; color: string; colorIds: string[]; emoji: string }>;
  order: string[];
  colorOptions: { label: string; value: string }[];
}> {
  if (_cachedTeamCfg && _cachedTeamOrder && _cachedColorOptions) {
    return { cfg: _cachedTeamCfg, order: _cachedTeamOrder, colorOptions: _cachedColorOptions };
  }
  const token = localStorage.getItem("admin_blog_token") ?? "";
  const res = await fetch(`${API_BASE}/api/admin/teams`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const teams: { id: string; label: string; color: string; color_ids?: string[]; emojis?: string[] }[] = data.teams ?? [];
  _cachedTeamCfg = Object.fromEntries(
    teams.map(t => [t.id, { label: t.label, color: t.color, colorIds: t.color_ids ?? [], emoji: t.emojis?.[0] ?? "⚫" }]),
  );
  _cachedTeamOrder = teams.map(t => t.id);
  // Equipos activos sin color asignado todavía (ej. uno recién activado
  // antes de configurar su colorId) no se ofrecen como opción seleccionable.
  _cachedColorOptions = [
    ...teams
      .filter(t => (t.color_ids ?? []).length > 0)
      .map(t => ({ label: t.label, value: t.color_ids![0] })),
    ...NON_TEAM_COLOR_OPTIONS,
  ];
  return { cfg: _cachedTeamCfg, order: _cachedTeamOrder, colorOptions: _cachedColorOptions };
}

async function fetchTeamAssignments(date: string): Promise<{ team_id: string; employee_id: string; name: string; is_team_leader: boolean }[]> {
  const token = localStorage.getItem("admin_blog_token") ?? "";
  const res = await fetch(`${API_BASE}/api/admin/staff/team-assignments?date=${date}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.assignments ?? [];
}

function AssignModal({ event, onClose, onSaved, onOpenSchedule, availabilityRefreshKey }: {
  event: CalEvent; onClose: () => void; onSaved: (e: CalEvent) => void;
  onOpenSchedule?: (employee: { id: string; name: string }) => void;
  availabilityRefreshKey?: number;
}) {
  const [tab, setTab] = useState<"build" | "reuse">("build");
  const userChangedTab = useRef(false);
  const [available, setAvailable] = useState<StaffMember[]>([]);
  const [todayPairs, setTodayPairs] = useState<TodayPair[]>([]);
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Ids de los cleaners ya asignados al evento cuando se abrió el modal —
  // para el badge "current" en el picker. Antes se derivaba de
  // event.attendees (emails de GCal); ahora que el evento trae
  // assignedCleaners (nombres), se usa el id que devuelve currentAttendees.
  const [initialAttendeeIds, setInitialAttendeeIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fix 1 — capacity state from settings
  const [atCapacity, setAtCapacity] = useState(false);
  const [maxSimultaneousTeams, setMaxSimultaneousTeams] = useState<number | null>(null);
  // teamCfg (con colorIds) persistido en state — handleAssign lo necesita
  // para resolver el colorId a mandar al patch, y load() corre dentro de un
  // effect (scope local, no alcanzable desde otros handlers sin esto).
  const [teamCfgState, setTeamCfgState] = useState<Record<string, { label: string; color: string; colorIds: string[] }>>({});

  useEffect(() => {
    async function load() {
      setLoading(true); setError(null);
      try {
        const token = localStorage.getItem("admin_blog_token") ?? "";
        const eventDate = event.startIso.slice(0, 10); // "YYYY-MM-DD"

        // Fetch available staff + daily_team_assignments en paralelo.
        // daily_team_assignments ahora se puebla automáticamente desde GCal
        // en el backend (syncDailyTeamAssignments), por lo que tiene teamId exacto.
        const [staffRes, assignmentsRaw, { cfg: teamCfg, order: teamOrder }] = await Promise.all([
          fetch(`${API_BASE}/api/calendar/events/${event.id}/available-staff`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`); return d; }),
          fetchTeamAssignments(eventDate).catch(() => [] as any[]),
          loadAssignTeamCfg(),
        ]);

        const staffList: StaffMember[] = staffRes.available ?? [];
        setAvailable(staffList);
        setPreferredId(staffRes.preferredEmployeeId ?? null);
        setAtCapacity(staffRes.atCapacity ?? false);
        setMaxSimultaneousTeams(staffRes.maxSimultaneousTeams ?? null);
        setTeamCfgState(teamCfg);

        // Construir TodayPairs desde daily_team_assignments (teamId exacto,
        // poblado desde GCal por syncDailyTeamAssignments en el backend).
        // Enriquecer con email desde staffList cuando el miembro está disponible.
        const assignmentsByTeam: Record<string, typeof assignmentsRaw> = {};
        for (const a of assignmentsRaw) {
          if (!assignmentsByTeam[a.team_id]) assignmentsByTeam[a.team_id] = [];
          assignmentsByTeam[a.team_id].push(a);
        }

        const pairs: TodayPair[] = teamOrder
          .filter(tid => (assignmentsByTeam[tid] ?? []).length > 0)
          .map(tid => {
            const cfg = teamCfg[tid] ?? { label: tid, color: "#6b7280", emoji: "⚫" };
            const members: StaffMember[] = (assignmentsByTeam[tid] ?? []).map((a: any) => {
              const fromList = staffList.find(s => s.id === a.employee_id);
              return {
                id: a.employee_id,
                name: a.name,
                email: fromList?.email ?? "",
                is_team_leader: a.is_team_leader ?? false,
                teamId: tid, // exacto — viene de daily_team_assignments
              };
            });
            return { teamId: tid, teamLabel: cfg.label, teamColor: cfg.color, teamEmoji: cfg.emoji ?? "⚫", members };
          });

        setTodayPairs(pairs);

        // Pre-seleccionar attendees actuales del evento en los slots.
        // El backend resuelve esto en currentAttendees: incluye siempre a los
        // empleados del evento (con email completo) aunque estén fuera de horario
        // o atCapacity=true. outsideWorkHours y busy vienen como flags.
        const currentAttendees: StaffMember[] = (staffRes.currentAttendees ?? []).map((a: any) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          is_team_leader: a.is_team_leader ?? false,
          teamId: a.teamId ?? null,
          outsideWorkHours: a.outsideWorkHours ?? false,
          busy: a.busy ?? false,
        }));

        if (currentAttendees.length > 0) {
          // Inyectar al inicio de available los que falten (excluidos por horario o capacidad)
          const missingFromAvailable = currentAttendees.filter(
            a => !staffList.find(s => s.id === a.id)
          );
          if (missingFromAvailable.length > 0) {
            setAvailable(prev => [...missingFromAvailable, ...prev]);
          }
          setSelectedIds(currentAttendees.map(a => a.id));
          setInitialAttendeeIds(new Set(currentAttendees.map(a => a.id)));
        }

        if (staffRes.keepStablePair && pairs.length > 0 && !userChangedTab.current) {
          setTab("reuse");
        }
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, availabilityRefreshKey]);


  async function handleAssign() {
    setSaving(true); setError(null);
    try {
      // Derive team by matching selectedIds against todayPairs (the known team compositions
      // for this day). This is the only reliable source — emp.teamId reflects the employee's
      // permanent team assignment in daily_team_assignments, which may differ from the team
      // the admin intends to assign to this specific event.
      // Pick the pair with the most members in common with the selection.
      const matchedPair = todayPairs
        .map(pair => ({
          pair,
          overlap: pair.members.filter(m => selectedIds.includes(m.id)).length,
        }))
        .filter(({ overlap }) => overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)[0]?.pair ?? null;

      const leaderTeamId = matchedPair?.teamId ?? null;
      const colorId = leaderTeamId ? (teamCfgState[leaderTeamId]?.colorIds?.[0] ?? null) : null;

      // Add #N to title — the backend uses "#N" in summary as sole source of truth for teamId.
      const teamNum = leaderTeamId?.match(/(\d+)/)?.[1] ?? null;
      let summary = event.summary;
      if (selectedIds.length === 0) {
        // Un-assigning everyone: strip any leftover "#N" so the title doesn't
        // keep advertising a team that's no longer on this event.
        summary = summary.replace(/\s*#\s*\d+/, "").trim();
      } else if (teamNum && !summary.match(/#\s*\d+/)) {
        summary = `${summary} #${teamNum}`;
      } else if (teamNum) {
        // Update existing #N if it changed
        summary = summary.replace(/#\s*\d+/, `#${teamNum}`);
      }

      // Commented out: description-based team tracking (replaced by #N in title)
      // const names = selectedIds.map(id => available.find(e => e.id === id)?.name ?? id).join(", ");
      // const cur = event.description ?? "";
      // const line = `Team: ${names}`;
      // const desc = cur.includes("Team:") ? cur.replace(/Team:.*/, line) : [cur, line].filter(Boolean).join("\n");

      const patch: Record<string, unknown> = { summary, employeeIds: selectedIds };
      if (colorId) patch.colorId = colorId;
      else if (selectedIds.length === 0) patch.colorId = ""; // clear the team color too — nobody's assigned

      const saved = await apiUpdateEvent(event.id, patch as any);
      onSaved(saved);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  function handleReusePair(pair: TodayPair) {
    // Pre-select all members and switch to Build tab for confirmation
    const sorted = [...pair.members].sort((a, b) => (b.is_team_leader ? 1 : 0) - (a.is_team_leader ? 1 : 0));
    setSelectedIds(sorted.map(m => m.id));
    userChangedTab.current = true;
    setTab("build");
  }

  function EmployeePicker() {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Select cleaners</p>
        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
          {available.length === 0 ? (
            atCapacity ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 text-center space-y-1">
                <p className="text-xs font-semibold text-amber-700">Maximum teams reached</p>
                <p className="text-[11px] text-amber-600">
                  {maxSimultaneousTeams !== null
                    ? `${maxSimultaneousTeams} team${maxSimultaneousTeams !== 1 ? "s" : ""} already operating during this time slot.`
                    : "All teams are already assigned to this time slot."}
                  {" "}Adjust the limit in{" "}
                  <a href="/admin/settings" className="underline hover:text-amber-800">Settings</a>.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-3 text-center">No staff available</p>
            )
          ) : available.map(emp => {
            const isSel = selectedIds.includes(emp.id);
            const isPref = emp.id === preferredId;
            const isCurrentAttendee = initialAttendeeIds.has(emp.id);
            const hasScheduleConflict = (emp as any).outsideWorkHours === true;
            const hasBusyConflict = (emp as any).busy === true;
            return (
              <button
                key={emp.id}
                onClick={() => setSelectedIds(prev =>
                  prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                )}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all
                  ${isSel
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : isCurrentAttendee
                      ? "border-blue-200 bg-blue-50/40 text-gray-700 hover:bg-blue-50"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center
                  ${isSel ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
                  {isSel && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{emp.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {emp.is_team_leader && (
                      <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-px rounded-full font-medium">Leader</span>
                    )}
                    {isPref && (
                      <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-px rounded-full font-medium">Usual cleaner</span>
                    )}
                    {isCurrentAttendee && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-px rounded-full font-medium">Currently assigned</span>
                    )}
                    {isCurrentAttendee && hasScheduleConflict && !hasBusyConflict && (
                      <span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-600 px-1.5 py-px rounded-full font-medium border border-amber-200">
                        ⚠ Outside work hours
                        {onOpenSchedule && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onOpenSchedule({ id: emp.id, name: emp.name }); }}
                            className="underline underline-offset-1 hover:text-amber-800 transition-colors whitespace-nowrap"
                          >
                            Edit schedule
                          </button>
                        )}
                      </span>
                    )}
                    {isCurrentAttendee && hasBusyConflict && (
                      <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-px rounded-full font-medium border border-red-200">
                        ⚠ Has overlapping event
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.18)] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-medium text-gray-800">Assign team</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{event.summary}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(["build", "reuse"] as const).map(t => (
            <button
              key={t}
              onClick={() => { userChangedTab.current = true; setTab(t); }}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === t ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
            >
              {t === "build" ? "Build pair" : <>Reuse today's pair {todayPairs.length > 0 && <span className="ml-1 bg-blue-100 text-blue-600 px-1.5 py-px rounded-full">{todayPairs.length}</span>}</>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
          ) : error ? (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          ) : tab === "build" ? (
            <EmployeePicker />
          ) : (
            <div className="space-y-2">
              {todayPairs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No teams assigned today yet</p>
              ) : todayPairs.map((pair) => (
                <button
                  key={pair.teamId}
                  onClick={() => handleReusePair(pair)}
                  className="w-full text-left px-3 py-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all group"
                >
                  {/* Team label with color dot */}
                  <p
                    className="text-xs font-semibold mb-2"
                    style={{ color: pair.teamColor }}
                  >
                    {pair.teamEmoji}{" "}
                    {pair.teamLabel}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {pair.members.map(m => (
                      <span
                        key={m.id}
                        className="text-xs font-medium px-2 py-0.5 rounded-full transition-colors"
                        style={{
                          background: `${pair.teamColor}18`,
                          color: pair.teamColor,
                          border: `1px solid ${pair.teamColor}44`,
                        }}
                      >
                        {m.is_team_leader && <span className="text-amber-500 mr-0.5">★</span>}
                        {m.name}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
              <p className="text-xs text-gray-400 text-center pt-1">Click a team to pre-select it, then confirm with Assign</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          {selectedIds.length > 0 && (
            <p className="text-xs text-gray-500 mb-2 truncate">
              Selected: <span className="font-medium text-gray-700">
                {selectedIds.map(id => available.find(e => e.id === id)?.name ?? id).join(" + ")}
              </span>
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleAssign} disabled={saving || loading}
              className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {(saving || loading) && <Loader2 size={13} className="animate-spin" />}
              {loading ? "Assign" : selectedIds.length > 0 ? `Assign (${selectedIds.length})` : "Unassign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RescheduleModal ───────────────────────────────────────────────────────────

function RescheduleModal({ event, newStartIso, newEndIso, onConfirm, onCancel, onAssign }: {
  event: CalEvent; newStartIso: string; newEndIso: string; onConfirm: () => void; onCancel: () => void; onAssign: () => void;
}) {
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Vancouver",
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });

  // Existing CA3: team conflict check
  const [conflicts, setConflicts] = useState<ConflictResult[]>([]);
  const [checking, setChecking] = useState(true);
  const hasAttendees = event.assignedCleaners && event.assignedCleaners.length > 0;

  useEffect(() => {
    if (!event.id || !hasAttendees) { setChecking(false); return; }
    setChecking(true);
    apiCheckConflicts(event.id, newStartIso, newEndIso)
      .then(c => { setConflicts(c); setChecking(false); })
      .catch(() => setChecking(false));
  }, [event.id, newStartIso, newEndIso, hasAttendees]);

  // client preference check
  const clientId = event.clientId ?? extractClientId(event);
  const { preferenceCheck, loadingPreference } = useClientPreferences(
    clientId,
    event.summary,
    newStartIso,
  );

  const isPast = new Date(newStartIso) < new Date();

  // Button label escalates if there's any warning
  const hasWarning = isPast ||
    conflicts.length > 0 ||
    (preferenceCheck?.hasPreferences && !preferenceCheck?.compatible);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.18)] w-full max-w-sm overflow-hidden">
        <div className="p-6 space-y-4">
          <h3 className="font-medium text-gray-800">Move event?</h3>
          <p className="text-sm text-gray-500 truncate">{event.summary}</p>

          {/* Date change: struck-through original → new highlighted */}
          <div className="space-y-1.5 bg-gray-50 rounded-xl p-3">
            <p className="line-through text-gray-400 text-xs">{fmt(event.startIso)} – {fmt(event.endIso)}</p>
            <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <span>→</span>
              <span>{fmt(newStartIso)} – {fmt(newEndIso)}</span>
            </p>
          </div>

          {/* client preference validation */}
          {loadingPreference && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Checking client preferences…
            </p>
          )}
          {!loadingPreference && preferenceCheck?.hasPreferences && (
            preferenceCheck.compatible ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-emerald-700">✅ {preferenceCheck.message}</p>
                {preferenceCheck.preferredDays.length > 0 && (
                  <p className="text-[11px] text-emerald-600">
                    Preferred days: {preferenceCheck.preferredDays.join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-amber-700">⚠ {preferenceCheck.message}</p>
                {preferenceCheck.preferredDays.length > 0 && (
                  <p className="text-[11px] text-amber-700">
                    Preferred days: <span className="font-medium">{preferenceCheck.preferredDays.join(", ")}</span>
                  </p>
                )}
                {preferenceCheck.preferredTime && (
                  <p className="text-[11px] text-amber-700">
                    Preferred time: <span className="font-medium">{preferenceCheck.preferredTime}</span>
                  </p>
                )}
                <p className="text-[11px] text-amber-600 mt-1">You can still confirm — this is a warning only.</p>
              </div>
            )
          )}

          {/* Past date warning */}
          {isPast && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-red-700">⛔ Cannot reschedule to a past date or time.</p>
            </div>
          )}

          {/* Existing CA3: team conflict warning */}
          {!hasAttendees && (
            <p className="text-xs text-gray-400">
              ℹ No team assigned —{" "}
              <button
                onClick={() => { onCancel(); onAssign(); }}
                className="text-blue-500 hover:underline"
              >
                assign a team
              </button>
              {" "}to check availability.
            </p>
          )}
          {hasAttendees && checking && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" /> Checking team availability…
            </p>
          )}
          {hasAttendees && !checking && conflicts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-amber-700">⚠ Team conflict in new slot</p>
              {conflicts.map(c => (
                <p key={c.employeeId} className="text-xs text-amber-700">
                  <span className="font-medium">{c.name}:</span> {c.reasons.map(r => r.message).join(", ")}
                </p>
              ))}
              <p className="text-xs text-amber-600 mt-1">You can still move the event and reassign afterwards.</p>
            </div>
          )}
          {hasAttendees && !checking && conflicts.length === 0 && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">✓ Team is available at the new time</p>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isPast || checking || loadingPreference}
            title={!isPast && (checking || loadingPreference) ? "Waiting for the conflict check to finish…" : undefined}
            className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {(checking || loadingPreference) && !isPast && <Loader2 size={13} className="animate-spin" />}
            {hasWarning && !isPast ? "Move anyway" : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── ConflictResolutionModal ──────────────────────────────────────────────────
// Revisa conflictos severos (team_overlap / over_capacity) uno por uno,
// muestra la sugerencia calculada por conflictResolution.ts, y deja que el
// admin la apruebe (aplica el patch vía apiUpdateEvent, mismo endpoint que
// AssignModal / confirmReschedule) o la salte para más tarde.

type ResolutionStep =
  | { kind: 'team_overlap'; eventAId: string; eventBId: string; suggestion: TeamOverlapSuggestion | null }
  | { kind: 'over_capacity'; group: CalEvent[]; suggestion: OverCapacitySuggestion };

function dedupeOverlapPairs(events: CalEvent[]): [string, string][] {
  const flags = findTeamOverlaps(events);
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const f of flags) {
    const key = [f.eventId, f.conflictingEventId].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([f.eventId, f.conflictingEventId]);
  }
  return pairs;
}

// LAB252: momento más temprano involucrado en un step, para poder ordenar
// los conflictos cronológicamente (día y hora juntos, vía timestamp completo)
// en vez de depender del orden de iteración interno de cada detector.
function stepStartMs(step: ResolutionStep, events: CalEvent[]): number {
  if (step.kind === 'team_overlap') {
    const a = events.find(e => e.id === step.eventAId);
    const b = events.find(e => e.id === step.eventBId);
    const aMs = a ? new Date(a.startIso).getTime() : Infinity;
    const bMs = b ? new Date(b.startIso).getTime() : Infinity;
    return Math.min(aMs, bMs);
  }
  return Math.min(...step.group.map(e => new Date(e.startIso).getTime()));
}

function ConflictResolutionModal({ type, events, teamOrder, maxSimultaneousTeams, onClose, onApplied }: {
  type: ConflictType; events: CalEvent[]; teamOrder: string[]; maxSimultaneousTeams: number;
  onClose: () => void; onApplied: (e: CalEvent) => void;
}) {
  const [liveEvents, setLiveEvents] = useState(events);
  const [index, setIndex] = useState(0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forcedMoveId, setForcedMoveId] = useState<string | null>(null);
  useEffect(() => { setForcedMoveId(null); }, [index]); // se resetea al pasar de conflicto

  // teamCfg (con colorIds) para resolver el colorId al aplicar un cambio de
  // equipo — mismo cache compartido que AssignModal/EventFormModal, así que
  // en la práctica ya está resuelto (no hay round-trip extra al abrir esto).
  const [teamCfg, setTeamCfg] = useState<Record<string, { label: string; color: string; colorIds: string[] }>>({});
  useEffect(() => { loadAssignTeamCfg().then(({ cfg }) => setTeamCfg(cfg)); }, []);

  // Miembros del equipo destino ese día — solo se cargan para team_overlap
  const [toTeamMembers, setToTeamMembers] = useState<{ employee_id: string; name: string }[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const steps: ResolutionStep[] = useMemo(() => {
    const raw: ResolutionStep[] = type === 'team_overlap'
      ? dedupeOverlapPairs(liveEvents).map(([a, b]) => ({
        kind: 'team_overlap' as const, eventAId: a, eventBId: b,
        suggestion: suggestTeamOverlapFix(a, b, liveEvents, teamOrder),
      })).filter(s => s.suggestion !== null)
      : groupOverCapacityClusters(liveEvents, maxSimultaneousTeams).map(group => ({
        kind: 'over_capacity' as const, group,
        suggestion: suggestOverCapacityFix(group, liveEvents, maxSimultaneousTeams),
      }));
    // LAB252: cronológico por día y luego hora (un solo criterio: timestamp completo)
    return [...raw].sort((x, y) => stepStartMs(x, liveEvents) - stepStartMs(y, liveEvents));
  }, [type, liveEvents, teamOrder, maxSimultaneousTeams]);

  const baseStep = steps[index] ?? null;

  // Si el admin forzó una elección manual (swap), recalculamos SOLO el
  // step visible con esa restricción — el resto de la cola sigue automático.
  const step: ResolutionStep | null = useMemo(() => {
    if (!baseStep) return null;
    if (baseStep.kind === 'team_overlap' && forcedMoveId) {
      const otherId = forcedMoveId === baseStep.eventAId ? baseStep.eventBId : baseStep.eventAId;
      const forced = suggestTeamOverlapFixForced(forcedMoveId, otherId, liveEvents, teamOrder);
      if (forced) return { ...baseStep, suggestion: forced };
    }
    if (baseStep.kind === 'over_capacity' && forcedMoveId) {
      return { ...baseStep, suggestion: suggestOverCapacityFix(baseStep.group, liveEvents, maxSimultaneousTeams, forcedMoveId) };
    }
    return baseStep;
  }, [baseStep, forcedMoveId, liveEvents, teamOrder, maxSimultaneousTeams]);

  // Para team_overlap: traer los miembros actuales del equipo destino ese día,
  // para poder patchear employeeIds al aprobar (mismo patrón que AssignModal).
  useEffect(() => {
    if (!step || step.kind !== 'team_overlap' || !step.suggestion) { setToTeamMembers(null); return; }
    const moveEvent = liveEvents.find(e => e.id === step.suggestion!.eventToMoveId);
    if (!moveEvent) { setToTeamMembers(null); return; }
    setLoadingMembers(true);
    fetchTeamAssignments(moveEvent.startDate)
      .then(rows => setToTeamMembers(rows.filter(r => r.team_id === step.suggestion!.toTeamId).map(r => ({ employee_id: r.employee_id, name: r.name }))))
      .catch(() => setToTeamMembers([]))
      .finally(() => setLoadingMembers(false));
  }, [step, liveEvents]);

  if (!step) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
        <div className="bg-white rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.18)] w-full max-w-sm p-6 text-center space-y-3">
          <p className="text-sm font-medium text-gray-700">No conflicts left to review 🎉</p>
          <button onClick={onClose} className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">Close</button>
        </div>
      </div>
    );
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Vancouver", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });

  function skip() {
    setIndex(i => Math.min(i + 1, steps.length - 1 === i ? i : i + 1));
    // si ya estamos en el último, simplemente cerramos el loop en el próximo render (steps.length === index)
    if (index >= steps.length - 1) setIndex(steps.length); // fuerza step === null → pantalla de "no quedan"
  }

  async function approve() {
    if (!step) return;
    setApplying(true); setError(null);
    try {
      if (step.kind === 'team_overlap' && step.suggestion?.feasible) {
        const s = step.suggestion;
        const moveEvent = liveEvents.find(e => e.id === s.eventToMoveId)!;
        const colorId = teamCfg[s.toTeamId]?.colorIds?.[0] ?? null;
        const teamNum = s.toTeamId.match(/(\d+)/)?.[1] ?? null;
        const applyTeamTag = (summary: string) =>
          teamNum ? (summary.match(/#\s*\d+/) ? summary.replace(/#\s*\d+/, `#${teamNum}`) : `${summary} #${teamNum}`) : summary;
        const summary = applyTeamTag(moveEvent.summary);
        const employeeIds = (toTeamMembers ?? []).map(m => m.employee_id);
        const saved = await apiUpdateEvent(moveEvent.id, { summary, colorId, employeeIds } as any);
        setLiveEvents(prev => prev.map(e => e.id === saved.id ? saved : e));
        onApplied(saved);

        // El Lunch pegado a este servicio (si tiene) viaja con él al nuevo
        // equipo — misma regla que teamAutoAssignService.js.
        if (s.movedLunchEventId) {
          const lunchEvent = liveEvents.find(e => e.id === s.movedLunchEventId);
          if (lunchEvent) {
            const savedLunch = await apiUpdateEvent(lunchEvent.id, { summary: applyTeamTag(lunchEvent.summary), colorId, employeeIds } as any);
            setLiveEvents(prev => prev.map(e => e.id === savedLunch.id ? savedLunch : e));
            onApplied(savedLunch);
          }
        }
      } else if (step.kind === 'over_capacity' && step.suggestion.feasible && step.suggestion.toStartIso && step.suggestion.toEndIso) {
        const s = step.suggestion;
        const saved = await apiUpdateEvent(s.eventToMoveId, { startIso: s.toStartIso, endIso: s.toEndIso } as any);
        setLiveEvents(prev => prev.map(e => e.id === saved.id ? saved : e));
        onApplied(saved);

        // El Lunch pegado se reagenda junto, quedando inmediatamente antes del servicio.
        if (s.movedLunchEventId && s.toLunchStartIso && s.toLunchEndIso) {
          const lunchEvent = liveEvents.find(e => e.id === s.movedLunchEventId);
          if (lunchEvent) {
            const savedLunch = await apiUpdateEvent(lunchEvent.id, { startIso: s.toLunchStartIso, endIso: s.toLunchEndIso } as any);
            setLiveEvents(prev => prev.map(e => e.id === savedLunch.id ? savedLunch : e));
            onApplied(savedLunch);
          }
        }
      }
      setIndex(i => i); // los steps se recalculan solos (useMemo depende de liveEvents) — el conflicto resuelto desaparece de la lista
    } catch (e: any) {
      setError(e.message ?? 'Failed to apply fix');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.18)] w-full max-w-xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Users size={16} className="text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-800 leading-tight">
                  {type === 'team_overlap' ? 'Double-booked team' : 'Too many jobs at once'}
                </h3>
                <p className="text-[11px] text-gray-400">Conflict {index + 1} of {steps.length}</p>
              </div>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${((index + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>

          {step.kind === 'team_overlap' && step.suggestion && (() => {
            const s = step.suggestion;
            // Orden fijo — viene de baseStep, no de la sugerencia actual, así las
            // filas nunca cambian de posición al forzar cuál evento mover.
            const [eventAId, eventBId] = baseStep.kind === 'team_overlap'
              ? [baseStep.eventAId, baseStep.eventBId]
              : ['', ''];
            const eventA = liveEvents.find(e => e.id === eventAId)!;
            const eventB = liveEvents.find(e => e.id === eventBId)!;
            const moveEvent = liveEvents.find(e => e.id === s.eventToMoveId)!;

            return (
              <>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                  <Clock size={12} /> {fmt(moveEvent.startIso)}
                </div>

                <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                  {[eventA, eventB].map(ev => {
                    const isMoving = ev.id === s.eventToMoveId;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setForcedMoveId(ev.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 transition-colors text-left ${isMoving ? "bg-red-50/60 hover:bg-red-100/60" : "hover:bg-gray-50"
                          }`}
                        title="Move this one instead"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: teamDotColor(isMoving ? s.fromTeamId : ev.teamId, teamCfg) }}
                        />
                        <span className="text-sm text-gray-700 truncate flex-1">{ev.summary}</span>
                        {isMoving && s.movedLunchEventId && (
                          <span className="text-[9px] font-medium text-gray-400 shrink-0" title="Its Lunch break moves with it">+ Lunch</span>
                        )}
                        {s.bookedFirstEventId === ev.id && (
                          <span className="text-[9px] font-medium text-gray-400 shrink-0" title="This one was booked first">1st booked</span>
                        )}
                        <span className={`text-[10px] uppercase tracking-wide shrink-0 ${isMoving ? "font-semibold text-red-500" : "font-medium text-gray-300"
                          }`}>
                          {isMoving ? "Moving" : "Staying"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {forcedMoveId && (
                  <button onClick={() => setForcedMoveId(null)} className="text-[11px] text-blue-500 hover:underline">
                    ↺ Back to suggested pick
                  </button>
                )}

                <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Suggested fix</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs text-gray-400 line-through">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: teamDotColor(s.fromTeamId, teamCfg) }} />
                      {s.fromTeamId.replace('_', ' ')}
                    </span>
                    <ArrowRight size={14} className="text-gray-300 shrink-0" />
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: teamDotColor(s.toTeamId, teamCfg) }} />
                      {s.toTeamId.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-gray-200/70">
                    {loadingMembers ? (
                      <p className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Checking who's on that team…</p>
                    ) : (toTeamMembers && toTeamMembers.length > 0) ? (
                      <p className="text-[11px] text-gray-500">New crew: <span className="text-gray-700 font-medium">{toTeamMembers.map(m => m.name).join(', ')}</span></p>
                    ) : (
                      <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
                        <UserX size={11} className="shrink-0" /> No one's assigned to {s.toTeamId.replace('_', ' ')} yet that day — you'll need to assign a crew after applying.
                      </p>
                    )}
                  </div>
                </div>

                {!s.feasible && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ No team keeps a full {BUFFER_MIN_LABEL} buffer with this move — best available buffer is {s.resultingBufferMin === -Infinity ? 'none (still overlapping)' : `${Math.round(s.resultingBufferMin)}min`}. Review manually before applying.
                  </p>
                )}
              </>
            );
          })()}

          {step.kind === 'over_capacity' && (() => {
            const s = step.suggestion;
            const moveEvent = liveEvents.find(e => e.id === s.eventToMoveId)!;
            return (
              <>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-600 text-[11px] font-semibold shrink-0">
                    {step.group.length}
                  </span>
                  <span>services need a team at once — more than are available.</span>
                </div>

                {step.group.length > 2 && (
                  <div className="flex flex-wrap gap-1.5">
                    {step.group.map(e => (
                      <button
                        key={e.id}
                        onClick={() => setForcedMoveId(e.id)}
                        className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${e.id === s.eventToMoveId
                          ? 'bg-red-100 border-red-300 text-red-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                      >
                        {e.summary}
                      </button>
                    ))}
                  </div>
                )}

                <div className="rounded-xl border border-gray-100 px-3 py-2.5 flex items-center gap-2 bg-red-50/60">
                  <Clock size={13} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 truncate flex-1">{moveEvent.summary}</span>
                  {s.movedLunchEventId && (
                    <span className="text-[9px] font-medium text-gray-400 shrink-0" title="Its Lunch break moves with it">+ Lunch</span>
                  )}
                  <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide shrink-0">
                    {forcedMoveId ? 'Moving' : isLunchSummary(moveEvent.summary) ? 'Lunch break — easiest to shift' : 'Booked most recently'}
                  </span>
                </div>
                {forcedMoveId && (
                  <button onClick={() => setForcedMoveId(null)} className="text-[11px] text-blue-500 hover:underline">
                    ↺ Back to suggested pick
                  </button>
                )}

                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Suggested fix</p>
                  {s.feasible ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-xs text-gray-400 line-through">
                        {fmt(s.fromStartIso)} – {fmt(s.fromEndIso)}
                      </span>
                      <ArrowRight size={14} className="text-gray-300 shrink-0" />
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                        {fmt(s.toStartIso!)} – {fmt(s.toEndIso!)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 flex items-center gap-1.5">
                      <AlertTriangle size={12} className="shrink-0" /> No open slot the same day within business hours. Review manually.
                    </p>
                  )}
                </div>
              </>
            );
          })()}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-6 pb-5 flex gap-2">
          <button onClick={skip} className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
            Skip for now
          </button>
          <button
            onClick={approve}
            disabled={applying || (step.kind === 'team_overlap' ? !step.suggestion?.feasible : !step.suggestion.feasible)}
            className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
          >
            {applying && <Loader2 size={13} className="animate-spin" />}
            Apply fix
          </button>
        </div>
        <button onClick={onClose} className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100">
          Close review
        </button>
      </div>
    </div>
  );
}

const BUFFER_MIN_LABEL = "30min";
function teamDotColor(teamId: string | null, teamsConfig?: Record<string, { color: string }>): string {
  if (!teamId) return '#d1d5db';
  if (teamsConfig?.[teamId]?.color) return teamsConfig[teamId].color;
  return '#6b7280'; // fallback gris si no hay config
}

// ─────────────────────────────────────────────────────────────────────────

function GlobalSearchBar({ onSelectEvent, onSelectClient }: {
  onSelectEvent: (ev: EventSearchResult) => void;
  onSelectClient: (clientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eventResults, setEventResults] = useState<EventSearchResult[]>([]);
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounce + búsqueda combinada (eventos + clientes en paralelo)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setEventResults([]); setClientResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const [events, clients] = await Promise.all([
        apiSearchCalendarEvents(q),
        apiSearchClients(q),
      ]);
      setEventResults(events);
      setClientResults(clients);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const hasResults = eventResults.length > 0 || clientResults.length > 0;
  const showDropdown = open && query.trim().length >= 2;

  function fmtDate(iso: string) {
    return DateTime.fromISO(iso, { zone: "America/Vancouver" }).toFormat("ccc, LLL d yyyy");
  }

  function clear() {
    setQuery(""); setEventResults([]); setClientResults([]);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <div className="relative">
        <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search events or clients…"
          className="w-full pl-8 pr-7 py-1.5 text-sm rounded-full border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:outline-none transition-colors"
        />
        {query && (
          <button onClick={clear} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-[80] mt-1 w-full min-w-[320px] bg-white rounded-xl shadow-lg border border-gray-100 max-h-96 overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> Searching…
            </div>
          )}
          {!loading && !hasResults && (
            <div className="px-4 py-3 text-xs text-gray-400">No results for "{query}"</div>
          )}

          {!loading && clientResults.length > 0 && (
            <div className="py-1">
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Clients</div>
              {clientResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSelectClient(c.id); setOpen(false); clear(); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <Users size={14} className="text-gray-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{c.name}</p>
                    {c.default_address && <p className="text-xs text-gray-400 truncate">{c.default_address}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && eventResults.length > 0 && (
            <div className="py-1 border-t border-gray-50">
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Events</div>
              {eventResults.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => { onSelectEvent(ev); setOpen(false); clear(); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <Calendar size={14} className="text-gray-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${ev.isPast ? "text-gray-400" : "text-gray-800"}`}>
                      {ev.summary}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDate(ev.startIso)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ── EventDetailPopover ────────────────────────────────────────────────────────

function EventDetailPopover({ event, onClose, onEdit, onDelete, onAssign, onDuplicate, anchorRect }: {
  event: CalEvent; onClose: () => void;
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; onAssign: (e: CalEvent) => void;
  onDuplicate: (e: CalEvent) => void;
  anchorRect?: DOMRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scopeChoiceForDelete, setScopeChoiceForDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  async function handleDelete(scope: "single" | "following" | "all" = "single") {
    setDeleting(true);
    try { await apiDeleteEvent(event.id, scope); onDelete(event.id); onClose(); }
    catch (e: any) { alert(`Failed to delete: ${e.message}`); setDeleting(false); }
  }

  function requestDelete() {
    if (event.seriesId) setScopeChoiceForDelete(true);
    else setConfirmDelete(true);
  }

  const start = new Date(event.startIso);
  const end = new Date(event.endIso);
  const VAN = "America/Vancouver";
  const dateStr = start.toLocaleDateString("en-CA", { timeZone: VAN, weekday: "long", month: "long", day: "numeric" });
  const timeStr = event.isAllDay ? "All day"
    : `${start.toLocaleTimeString("en-CA", { timeZone: VAN, hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-CA", { timeZone: VAN, hour: "numeric", minute: "2-digit" })}`;

  return createPortal(
    <div
      ref={ref}
      // admin-scope: this node is createPortal'd to document.body, so it's
      // outside RequireAdmin's DOM tree — without this class here, the
      // admin-a11y.css descendant selectors (.admin-scope .text-xs, etc.)
      // never match and the popover silently falls back to default sizes.
      className="admin-scope fixed z-[70] bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.2)] border border-gray-100 w-80 max-w-[calc(100vw-2rem)] overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
      style={(() => {
        // Mobile: always center in the current viewport, regardless of scroll
        // position — anchoring to the tapped event (like desktop does) puts
        // the popover off-screen for events near the top or bottom edge.
        if (isMobile) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
        const W = 320; const H = 380; // popover size estimates
        if (!anchorRect) return { top: "50%", left: "50%" };
        // Prefer above the anchor; fall back to below if not enough space
        const spaceAbove = anchorRect.top;
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const top = spaceAbove >= H || spaceAbove >= spaceBelow
          ? Math.max(8, anchorRect.top - H - 8)
          : Math.min(anchorRect.bottom + 8, window.innerHeight - H - 8);
        // Clamp horizontally
        const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - W - 8);
        return { top, left };
      })()}
    >
      {/* Color header strip */}
      <div className="h-2" style={{ background: event.color }} />

      {/* Action bar */}
      <div className="flex items-center justify-end gap-0.5 px-3 pt-2 pb-1">
        <button onClick={() => { onEdit(event); onClose(); }} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors" title="Edit"><Pencil size={15} /></button>
        <button onClick={() => { onAssign(event); onClose(); }} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors" title="Assign team"><Users size={15} /></button>
        {/* LAB309: opens NewEvent prefilled with this event's data, date/time left blank */}
        <button onClick={() => { onDuplicate(event); onClose(); }} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors" title="Duplicate"><Copy size={15} /></button>
        {confirmDelete ? (
          <div className="flex items-center gap-1 ml-1">
            <button onClick={() => handleDelete()} disabled={deleting} className="text-xs font-medium py-1 px-2.5 rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
              {deleting ? "…" : "Delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs py-1 px-2 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Keep</button>
          </div>
        ) : (
          <button onClick={requestDelete} className="p-1.5 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={15} /></button>
        )}
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors ml-1"><X size={15} /></button>
      </div>

      {scopeChoiceForDelete && (
        <RecurrenceScopeModal
          action="delete"
          onConfirm={(scope) => { setScopeChoiceForDelete(false); handleDelete(scope); }}
          onCancel={() => setScopeChoiceForDelete(false)}
        />
      )}

      {/* Content */}
      <div className="px-5 pb-5 space-y-3">
        <div>
          <h3 className="text-lg font-medium text-gray-800 leading-snug">{event.summary}</h3>
          <span className="inline-flex items-center gap-1 text-xs font-medium mt-1 px-2 py-0.5 rounded-full" style={{ background: `${event.color}22`, color: event.color }}>
            {event.teamEmoji && <span className="text-[11px] leading-none">{event.teamEmoji}</span>}
            {event.teamLabel}
          </span>
        </div>

        <div className="space-y-2.5 text-sm text-gray-600">
          <div className="flex items-start gap-3">
            <Calendar size={15} className="mt-0.5 text-gray-400 flex-shrink-0" />
            <div>
              <p>{dateStr}</p>
              <p className="text-gray-400 text-xs">{timeStr}</p>
            </div>
          </div>
          {event.location && (
            <div className="flex items-start gap-3">
              <span className="text-gray-400 mt-0.5 text-base leading-none flex-shrink-0">📍</span>
              <span>{event.location}</span>
            </div>
          )}
          {event.assignedCleaners.length > 0 && (
            <div className="flex items-start gap-3">
              <Users size={15} className="mt-0.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs">{event.assignedCleaners.slice(0, 4).join(", ")}{event.assignedCleaners.length > 4 ? ` +${event.assignedCleaners.length - 4} more` : ""}</span>
            </div>
          )}
          {stripClientIdLine(htmlToPlainText(event.description)) && (
            <div className="flex items-start gap-3">
              <span className="text-gray-400 mt-0.5 text-base leading-none flex-shrink-0">📝</span>
              <p className="text-xs text-gray-500 line-clamp-4 whitespace-pre-line">{stripClientIdLine(htmlToPlainText(event.description))}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── EventPill (month view) ────────────────────────────────────────────────────

function EventPill({ event, highlightColor, conflictDetail, spotlighted, onEdit, onDelete, onAssign, onDuplicate }: {
  event: CalEvent;
  highlightColor?: 'amber' | 'red' | null;
  conflictDetail?: string;
  spotlighted?: boolean;
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; onAssign: (e: CalEvent) => void; onDuplicate: (e: CalEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect>();
  const btnRef = useRef<HTMLButtonElement>(null);
  const isUnassigned = !event.teamId && !event.color; // sin equipo Y sin color de estado
  const textColor = event.color ? contrastColor(event.color) : "#6b7280";

  function handleClick() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(v => !v);
  }

  const start = new Date(event.startIso);
  const timeLabel = event.isAllDay ? "" : start.toLocaleTimeString("en-CA", { timeZone: "America/Vancouver", hour: "numeric", minute: "2-digit" });

  return (
    <div className="relative" data-event-id={event.id}>
      <button
        ref={btnRef}
        onClick={handleClick}
        className={`w-full text-left flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded transition-all hover:brightness-95 active:scale-[0.98] ${isUnassigned
          ? `bg-gray-100 border ${highlightColor === 'amber' ? "border-amber-400" : "border-gray-300"}`
          : ""
          } ${highlightColor === 'red' ? "conflict-blink-red" : highlightColor === 'amber' ? "conflict-blink-amber" : ""
          } ${spotlighted ? "outline outline-[3px] outline-blue-500 outline-offset-2 animate-[pulse_0.8s_ease-in-out_2]" : ""}`}
        style={{
          ...(isUnassigned ? { color: textColor } : { background: event.color, color: textColor }),
          cursor: "grab",
          boxShadow: open ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
        }}
        title={conflictDetail ? `${event.summary} — ⚠ ${conflictDetail}` : event.summary}
      >
        {timeLabel && <span className="opacity-80 flex-shrink-0 text-[10px]">{timeLabel}</span>}
        <span className="truncate">{event.summary}</span>
      </button>
      {open && (
        <EventDetailPopover event={event} onClose={() => setOpen(false)} onEdit={onEdit} onDelete={onDelete} onAssign={onAssign} onDuplicate={onDuplicate} anchorRect={rect} />
      )}
    </div>
  );
}

// ── MonthView ─────────────────────────────────────────────────────────────────

function MonthView({ anchor, events, conflictByEventId, spotlightEventId, onCellClick, onEdit, onDelete, onAssign, onDuplicate }: {
  anchor: Date; events: CalEvent[];
  conflictByEventId: Map<string, { type: ConflictType; detail: string }>;
  spotlightEventId: string | null;
  onCellClick: (iso: string) => void; onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; onAssign: (e: CalEvent) => void; onDuplicate: (e: CalEvent) => void;
}) {
  const first = startOfMonth(anchor);
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - first.getDay());
  const cells: Date[] = [];
  const cur = new Date(gridStart);
  while (cells.length < 42) { cells.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  const todayStr = todayVan();
  const byDay: Record<string, CalEvent[]> = {};
  for (const e of events) { if (!byDay[e.startDate]) byDay[e.startDate] = []; byDay[e.startDate].push(e); }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-500 tracking-widest">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
        {cells.map((cell, i) => {
          const key = isoDate(cell); const inMonth = cell.getMonth() === anchor.getMonth();
          const isToday = key === todayStr; const cellEvents = byDay[key] || [];
          return (
            <div
              key={i}
              className={`border-r border-b border-gray-200 p-1 group cursor-pointer transition-colors hover:bg-gray-50 ${i % 7 === 6 ? "border-r-0" : ""}`}
              onClick={() => onCellClick(`${key}T09:00`)}
            >
              <div className="flex justify-between items-center mb-1 px-0.5">
                <span className={`text-sm w-7 h-7 flex items-center justify-center rounded-full font-medium transition-colors
                  ${isToday ? "bg-blue-600 text-white font-semibold" : inMonth ? "text-gray-800 hover:bg-gray-100" : "text-gray-300"}`}>
                  {cell.getDate()}
                </span>
                <Plus size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="space-y-px" onClick={e => e.stopPropagation()}>
                {cellEvents.slice(0, 4).map(e => (
                  <EventPill key={e.id} event={e}
                    conflictDetail={conflictByEventId.get(e.id)?.detail}
                    spotlighted={spotlightEventId === e.id}
                    onEdit={onEdit} onDelete={onDelete} onAssign={onAssign} onDuplicate={onDuplicate} />
                ))}
                {cellEvents.length > 4 && (
                  <button className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 font-medium w-full text-left">
                    {cellEvents.length - 4} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view layout ──────────────────────────────────────────────────────────

const HOUR_H = 60; // px per hour
const START_H = 0;
const END_H = 24;
const VISIBLE_HOURS = END_H - START_H;

interface LayoutEvent {
  event: CalEvent;
  leftPct: number;
  widthPct: number;
  top: number;
  height: number;
  sub: number; // column index within this event's own team — kept only for stable z-index; events never actually overlap anymore
}

// Classic "Google Calendar" column-layout algorithm: sort by start (longer
// first on ties), greedily assign each event to the leftmost column that
// isn't already occupied by something it truly overlaps in time, then let
// each event expand rightward through any of its OWN group's neighboring
// columns for as long as nothing placed there actually overlaps it. This is
// the piece that maximizes width without ever covering another event: every
// event gets its own dedicated, non-overlapping slice of the box, sized as
// large as it can be given what's really happening around it in time.
// `evs` should be a flat list to lay out inside one box (0–100 conceptually);
// events that don't overlap anything else simply get their own full-width run.
function assignExpandingColumns(evs: CalEvent[], effectiveEnd: (ev: CalEvent) => number) {
  const sorted = [...evs].sort((a, b) => a.startHour - b.startHour || b.durationH - a.durationH);

  // Sub-cluster into maximal transitively-overlapping runs first, so two
  // events that don't actually overlap (just happen to share this box) each
  // simply get the full width instead of splitting for no reason.
  const runs: CalEvent[][] = [];
  {
    let cur: CalEvent[] = [];
    let curEnd = -Infinity;
    for (const ev of sorted) {
      if (cur.length && ev.startHour >= curEnd) { runs.push(cur); cur = []; curEnd = -Infinity; }
      cur.push(ev);
      curEnd = Math.max(curEnd, effectiveEnd(ev));
    }
    if (cur.length) runs.push(cur);
  }

  const result = new Map<CalEvent, { col: number; span: number; total: number }>();

  for (const run of runs) {
    const cols: { endHour: number }[] = [];
    const colOf = new Map<CalEvent, number>();
    for (const ev of run) {
      const eEnd = effectiveEnd(ev);
      let c = -1;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i].endHour <= ev.startHour + 0.016) { c = i; break; }
      }
      if (c === -1) { c = cols.length; cols.push({ endHour: -Infinity }); }
      cols[c].endHour = eEnd;
      colOf.set(ev, c);
    }
    const total = cols.length || 1;

    for (const ev of run) {
      const c = colOf.get(ev)!;
      const eEnd = effectiveEnd(ev);
      let span = 1;
      outer:
      for (let k = c + 1; k < total; k++) {
        for (const other of run) {
          if (colOf.get(other) !== k) continue;
          const oEnd = effectiveEnd(other);
          if (other.startHour < eEnd && oEnd > ev.startHour) break outer; // real overlap → stop growing
        }
        span++;
      }
      result.set(ev, { col: c, span, total });
    }
  }

  return result;
}

// Two-level layout, GCal-style:
//  - Macro columns = one per team present that day (in `teamOrder`, then any
//    stray team, then unassigned last). Each team's box is sized via the same
//    expanding-column algorithm above: a lone Team-1 card can fill 100% of the
//    day width, and only narrows while Team-2 is genuinely busy too.
//  - The box is computed per REAL overlap window, not per team's whole combined
//    time span in the cluster: a team's own events are first sub-clustered into
//    maximal transitively-overlapping runs (same trick as assignExpandingColumns'
//    `runs`), and each run gets its own box sized against whatever is actually
//    happening in neighboring macro columns during that specific run. This is
//    what lets a card widen back out the moment the neighboring team's event
//    ends, instead of staying pinned narrow for the team's entire span just
//    because it collided with something once, earlier or later that day.
//  - Within one run's box, real overlaps between that team's own events are
//    resolved with the SAME expanding-column algorithm, nested one level
//    deeper — so no event is ever hidden behind another; each gets its own
//    dedicated slice, as wide as it can be.
function layoutDayEvents(events: CalEvent[], teamOrder: string[]): LayoutEvent[] {
  function effectiveEnd(ev: CalEvent) { return ev.endHour < ev.startHour ? 24 : ev.endHour; }
  function macroKey(ev: CalEvent): string | null { return ev.teamId ?? null; }

  const visible = events
    .filter(e => !e.isAllDay && e.startHour < END_H && effectiveEnd(e) > START_H)
    .sort((a, b) => a.startHour - b.startHour || b.durationH - a.durationH);

  if (!visible.length) return [];

  // Macro columns present today.
  const macroKeys: (string | null)[] = [];
  for (const tid of teamOrder) if (visible.some(e => e.teamId === tid)) macroKeys.push(tid);
  for (const ev of visible) if (ev.teamId && !macroKeys.includes(ev.teamId)) macroKeys.push(ev.teamId);
  if (visible.some(e => !e.teamId)) macroKeys.push(null);
  const totalMacro = macroKeys.length || 1;
  const macroIdxOf = (ev: CalEvent) => {
    const i = macroKeys.indexOf(macroKey(ev));
    return i === -1 ? totalMacro - 1 : i;
  };

  // Time clusters (maximal transitively-overlapping runs) — scopes the
  // "is my neighboring macro column actually busy right now" check to real
  // neighbors instead of the whole day.
  const clusters: CalEvent[][] = [];
  {
    let cur: CalEvent[] = [];
    let curEnd = -Infinity;
    for (const ev of visible) {
      if (cur.length && ev.startHour >= curEnd) { clusters.push(cur); cur = []; curEnd = -Infinity; }
      cur.push(ev);
      curEnd = Math.max(curEnd, effectiveEnd(ev));
    }
    if (cur.length) clusters.push(cur);
  }

  const results: LayoutEvent[] = [];

  for (const cluster of clusters) {
    const teamsInCluster = new Set(cluster.map(macroKey));

    for (const tid of teamsInCluster) {
      const teamEvents = cluster
        .filter(e => macroKey(e) === tid)
        .sort((a, b) => a.startHour - b.startHour || b.durationH - a.durationH);
      const idx = macroIdxOf(teamEvents[0]);

      // Sub-cluster this team's OWN events into maximal transitively-overlapping
      // runs (same trick as assignExpandingColumns' `runs`). This is the piece
      // that makes the box hug real overlaps: a team box is now only as narrow
      // as it needs to be for the moments it actually collides with a
      // neighboring team, instead of staying narrow for the team's whole
      // combined time span in the cluster (which could include long stretches
      // where the neighboring macro column is completely free).
      const teamRuns: CalEvent[][] = [];
      {
        let cur: CalEvent[] = [];
        let curEnd = -Infinity;
        for (const ev of teamEvents) {
          if (cur.length && ev.startHour >= curEnd) { teamRuns.push(cur); cur = []; curEnd = -Infinity; }
          cur.push(ev);
          curEnd = Math.max(curEnd, effectiveEnd(ev));
        }
        if (cur.length) teamRuns.push(cur);
      }

      for (const run of teamRuns) {
        const groupStart = Math.min(...run.map(e => e.startHour));
        const groupEnd = Math.max(...run.map(effectiveEnd));
        let span = 1;
        outer:
        for (let c = idx + 1; c < totalMacro; c++) {
          for (const other of cluster) {
            if (macroIdxOf(other) !== c) continue;
            const oEnd = effectiveEnd(other);
            if (other.startHour < groupEnd && oEnd > groupStart) break outer; // real overlap → stop growing
          }
          span++;
        }
        const box = { left: (idx / totalMacro) * 100, width: (span / totalMacro) * 100 };

        const colInfo = assignExpandingColumns(run, effectiveEnd);
        for (const ev of run) {
          const { col, span: colSpan, total } = colInfo.get(ev)!;
          const eEnd = effectiveEnd(ev);
          const top = (Math.max(ev.startHour, START_H) - START_H) * HOUR_H;
          const height = Math.max((Math.min(eEnd, END_H) - Math.max(ev.startHour, START_H)) * HOUR_H - 1, 22);
          const laneWidthPct = box.width / total;
          results.push({
            event: ev, top, height, sub: col,
            leftPct: box.left + col * laneWidthPct,
            widthPct: colSpan * laneWidthPct,
          });
        }
      }
    }
  }

  return results;
}

// ── WeekEvent ─────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 5;
// Mobile: holding an event for this long starts a drag-to-reschedule, mirroring
// the desktop mouse-drag but requiring a deliberate hold so it doesn't fight
// with normal scrolling/tapping on touch devices.
const LONG_PRESS_MS = 2000;
const TOUCH_MOVE_TOLERANCE_PX = 10;

// GCal-style drag preview: lives INSIDE the grid (absolutely positioned within
// the target day's column), snapped to the current 15-min slot — not a free
// box following the raw cursor position. `hour` is already snapped by the
// caller. Renders a translucent, dashed-border block with a live time label.
function DragPreviewBlock({ event, hour }: { event: CalEvent; hour: number }) {
  const top = (hour - START_H) * HOUR_H;
  const height = Math.max(event.durationH * HOUR_H - 1, 22);
  const showTime = height > 30;
  const textColor = contrastColor(event.color);
  return (
    <div
      className="absolute inset-x-0.5 pointer-events-none z-40 rounded-lg px-1.5 py-1 select-none shadow-md overflow-hidden"
      style={{
        top,
        height,
        background: event.color,
        color: textColor,
      }}
    >
      <p className="text-xs font-medium leading-tight truncate">{event.summary}</p>
      {showTime && (
        <p className="text-[10px] leading-tight mt-0.5" style={{ opacity: 0.9 }}>
          {fmtTime(hour)} – {fmtTime(hour + event.durationH)}
        </p>
      )}
    </div>
  );
}

function WeekEvent({ event, top, height, leftPct, widthPct, sub, highlightColor, conflictDetail, spotlighted, dimmed, openPopoverId, setOpenPopoverId, frontEventId, onBringToFront, onEdit, onDelete, onAssign, onDuplicate, onDragStart }: {
  event: CalEvent; top: number; height: number; leftPct: number; widthPct: number; sub: number;
  highlightColor?: 'amber' | 'red' | null;
  conflictDetail?: string;
  spotlighted?: boolean;
  // true while this exact event is the one currently being dragged — GCal-style:
  // keep it visible in its original slot, faded, instead of hiding it outright.
  dimmed?: boolean;
  openPopoverId: string | null;
  setOpenPopoverId: (id: string | null) => void;
  // GCal "bring to front" — id of the last-clicked event in this view. Only
  // affects stacking order (z-index); size and position never change on
  // click, matching GCal's actual behavior (cards don't grow/shrink on click,
  // the clicked one just draws above its overlapping neighbors).
  frontEventId: string | null;
  onBringToFront: (id: string) => void;
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; onAssign: (e: CalEvent) => void; onDuplicate: (e: CalEvent) => void;
  onDragStart: (e: CalEvent, grabOffsetPx: number) => void;
}) {
  const open = openPopoverId === event.id;
  const setOpen = (v: boolean) => setOpenPopoverId(v ? event.id : null);
  const [rect, setRect] = useState<DOMRect>();
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const isUnassigned = !event.teamId && !event.color; // sin equipo Y sin color de estado
  const textColor = event.color ? contrastColor(event.color) : "#6b7280";

  // Uniform 2px gutter on both sides of every slot. No cascade offset needed
  // anymore — layoutDayEvents now gives every event its own dedicated,
  // non-overlapping column slice (see assignExpandingColumns).
  const GAP = 2;
  const left = `calc(${leftPct}% + ${GAP}px)`;
  const width = `calc(${widthPct}% - ${GAP * 2}px)`;
  const showTime = height > 30;
  const showDetail = height > 50;

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    didDrag.current = false;
    dragOrigin.current = { x: e.clientX, y: e.clientY };

    // FIX 4: record where inside the event the user grabbed (px from top of event)
    const grabOffsetY = wrapRef.current
      ? e.clientY - wrapRef.current.getBoundingClientRect().top
      : 0;

    function onMouseMove(ev: MouseEvent) {
      if (!dragOrigin.current) return;
      const dist = Math.hypot(ev.clientX - dragOrigin.current.x, ev.clientY - dragOrigin.current.y);
      if (dist > DRAG_THRESHOLD_PX) {
        didDrag.current = true;
        dragOrigin.current = null;
        cleanup();
        onDragStart(event, grabOffsetY); // pass grab offset to parent
      }
    }

    function onMouseUp() {
      dragOrigin.current = null;
      cleanup();
    }

    function cleanup() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (didDrag.current) { didDrag.current = false; return; }
    onBringToFront(event.id);
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(!open);
  }

  // Mobile: hold the event for LONG_PRESS_MS to start a drag-to-reschedule.
  // Uses document-level listeners (not React's synthetic, passive touchmove)
  // just to detect an early move that cancels the hold — the actual drag
  // tracking (once started) lives in DayView, same as the mouse-drag pattern.
  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    const startX = touch.clientX, startY = touch.clientY;
    const grabOffsetY = wrapRef.current ? touch.clientY - wrapRef.current.getBoundingClientRect().top : 0;
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      cleanup();
      if (navigator.vibrate) navigator.vibrate(15);
      didDrag.current = true;
      onDragStart(event, grabOffsetY);
    }, LONG_PRESS_MS);

    function handleEarlyMove(ev: TouchEvent) {
      const t = ev.touches[0];
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > TOUCH_MOVE_TOLERANCE_PX) {
        cancelled = true; clearTimeout(timer); cleanup();
      }
    }
    function handleEarlyEnd() { cancelled = true; clearTimeout(timer); cleanup(); }
    function cleanup() {
      document.removeEventListener("touchmove", handleEarlyMove);
      document.removeEventListener("touchend", handleEarlyEnd);
      document.removeEventListener("touchcancel", handleEarlyEnd);
    }
    document.addEventListener("touchmove", handleEarlyMove, { passive: true });
    document.addEventListener("touchend", handleEarlyEnd);
    document.addEventListener("touchcancel", handleEarlyEnd);
  }

  return (
    <div
      ref={wrapRef}
      data-week-event="true"
      data-event-id={event.id}
      className="absolute select-none"
      style={{ top, height, left, width, zIndex: open ? 60 : frontEventId === event.id ? 55 : sub + 1, opacity: dimmed ? 0.35 : 1, pointerEvents: dimmed ? "none" : undefined }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={e => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        onClick={handleClick}
        title={conflictDetail ? `${event.summary} — ⚠ ${conflictDetail}` : event.summary}
        style={{
          ...(event.color ? { background: event.color, color: textColor } : { color: textColor }),
          cursor: "grab",
          boxShadow: open ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
        }}
        className={`w-full h-full text-left rounded-lg px-1.5 py-1 overflow-hidden hover:brightness-95 ${!event.color && isUnassigned
          ? `bg-gray-100 border ${highlightColor === 'amber' ? "border-amber-400" : "border-gray-300"}`
          : ""
          } ${highlightColor === 'red' ? "conflict-blink-red" : highlightColor === 'amber' ? "conflict-blink-amber" : ""
          } ${spotlighted ? "outline outline-[3px] outline-blue-500 outline-offset-2 animate-[pulse_0.8s_ease-in-out_2]" : ""}`}
      >
        <p className="text-xs font-medium leading-tight truncate">{event.summary}</p>
        {showTime && (
          <p className="text-[10px] leading-tight mt-0.5" style={{ opacity: 0.85 }}>
            {fmtTime(event.startHour)}{showDetail ? ` – ${fmtTime(event.endHour)}` : ""}
          </p>
        )}
        {showDetail && event.location && (
          <p className="text-[10px] leading-tight mt-0.5 truncate" style={{ opacity: 0.75 }}>📍 {event.location}</p>
        )}
      </button>
      {open && (
        <EventDetailPopover event={event} onClose={() => setOpen(false)} onEdit={onEdit} onDelete={onDelete} onAssign={onAssign} onDuplicate={onDuplicate} anchorRect={rect} />
      )}
    </div>
  );
}

// ── CurrentTimeLine ───────────────────────────────────────────────────────────

function CurrentTimeLine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  // ✅ Usar hora de Vancouver, no del browser
  const vanNow = vanParts(now.toISOString());
  const h = vanNow.hour + vanNow.minute / 60;

  if (h < START_H || h > END_H) return null;
  const top = (h - START_H) * HOUR_H;
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: top - 1 }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 -ml-1" />
        <div className="flex-1 h-px bg-red-500" />
      </div>
    </div>
  );
}

// ── DayColumn ─────────────────────────────────────────────────────────────────

function DayColumn({ laid, isToday, isSelected, date, scrollRef, activeHighlights, conflictByEventId, spotlightEventId, draggedEventId, ghost, openPopoverId, setOpenPopoverId, frontEventId, onBringToFront, onCellClick, onEdit, onDelete, onAssign, onDuplicate, onDragStart }: {
  laid: LayoutEvent[]; isToday: boolean; isSelected: boolean; date: Date;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  activeHighlights: Set<ConflictType>;
  openPopoverId: string | null;
  setOpenPopoverId: (id: string | null) => void;
  frontEventId: string | null;
  onBringToFront: (id: string) => void;
  onCellClick: (iso: string) => void;
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; onAssign: (e: CalEvent) => void; onDuplicate: (e: CalEvent) => void; onDragStart: (e: CalEvent, grabOffsetPx: number) => void;
  conflictByEventId: Map<string, { type: ConflictType; detail: string }>;
  spotlightEventId: string | null;
  // id of the event currently being dragged (its original slot renders faded here, GCal-style)
  draggedEventId?: string | null;
  // snapped drop-preview to render in THIS column, if it's the current drop target's day
  ghost?: { hour: number; event: CalEvent } | null;
}) {
  function clientYToHour(clientY: number): number {
    const scrollEl = scrollRef.current;
    const containerTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    return START_H + (clientY - containerTop + scrollTop) / HOUR_H;
  }

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (t.closest("[data-week-event]") || t.closest("button")) return;
    setOpenPopoverId(null); // close any open popover when clicking empty space
    const h = clientYToHour(e.clientY);
    const snapped = Math.floor(h * 4) / 4;
    const hh = Math.floor(snapped);
    const mm = Math.round((snapped % 1) * 60);
    const pad = (n: number) => String(n).padStart(2, "0");
    const vanIso = vanStringToIso(`${isoDate(date)}T${pad(hh)}:${pad(mm)}:00`);
    onCellClick(vanIso);
  }

  return (
    <div
      className="relative border-l border-gray-200"
      style={{ height: `${VISIBLE_HOURS * HOUR_H}px` }}
      onClick={handleColumnClick}
    >
      {/* Hour lines */}
      {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
        <div key={i} className="absolute w-full border-t border-gray-200" style={{ top: `${i * HOUR_H}px` }} />
      ))}
      {/* Half-hour lines */}
      {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
        <div key={`h-${i}`} className="absolute w-full border-t border-gray-100" style={{ top: `${i * HOUR_H + HOUR_H / 2}px` }} />
      ))}
      {/* Today highlight */}
      {isToday && <div className="absolute inset-0 bg-blue-50/30 pointer-events-none" />}
      {/* Selected day highlight — subtler than today's, and only when it isn't also today */}
      {isSelected && !isToday && <div className="absolute inset-0 bg-gray-50/60 pointer-events-none" />}
      {/* Current time line — only in today column */}
      {isToday && <CurrentTimeLine />}
      {/* Events */}
      {laid.map(({ event: e, leftPct, widthPct, top, height, sub }) => {
        const info = conflictByEventId.get(e.id);
        const highlightColor = info && activeHighlights.has(info.type)
          ? (SEVERE_TYPES.has(info.type) ? 'red' : 'amber')
          : null;
        return (
          <WeekEvent key={e.id} event={e} top={top} height={height} leftPct={leftPct} widthPct={widthPct} sub={sub}
            highlightColor={highlightColor} conflictDetail={info?.detail}
            spotlighted={spotlightEventId === e.id}
            dimmed={draggedEventId === e.id}
            openPopoverId={openPopoverId} setOpenPopoverId={setOpenPopoverId}
            frontEventId={frontEventId} onBringToFront={onBringToFront}
            onEdit={onEdit} onDelete={onDelete} onAssign={onAssign} onDuplicate={onDuplicate} onDragStart={onDragStart} />
        );
      })}
      {/* GCal-style drop preview — snapped to the grid, updates in 15min steps */}
      {ghost && <DragPreviewBlock event={ghost.event} hour={ghost.hour} />}
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────

// How close to the top/bottom edge of the scrollable grid (in px) before we start auto-scrolling.
const DRAG_EDGE_ZONE = 60;
// Max px scrolled per tick when the cursor is right at the edge.
const DRAG_SCROLL_SPEED = 18;
// Mobile drag-to-reschedule (DayView): auto-scrolling toward the top edge
// stops here rather than continuing up to midnight.
const DRAG_AUTOSCROLL_MIN_HOUR = 5;

function WeekView({ anchor, events, draggedEvent, dragGrabOffsetPx, activeHighlights, conflictByEventId, spotlightEventId, selectedDate, lunchMissingByDate, teamOrder, teamsConfig, onCellClick, onMouseUpDrop, onEdit, onDelete, onAssign, onDuplicate, onDragStart, onDayHeaderClick }: {
  anchor: Date; events: CalEvent[];
  // the event currently being dragged (null when not dragging) — carries color/duration/id
  // for both the faded original slot and the live grid-snapped preview.
  draggedEvent: CalEvent | null;
  // px offset from the top of the event where the user grabbed it (FIX 4) — used to
  // keep the preview aligned under the cursor the same way the final drop is computed.
  dragGrabOffsetPx: number;
  activeHighlights: Set<ConflictType>;
  // ISO date (yyyy-mm-dd, America/Vancouver) of the day currently focused in TeamHeader —
  // used to mark the selected day in the column header, distinct from "today".
  selectedDate?: string;
  // día (YYYY-MM-DD) → equipos a los que ese día les falta lunch. No hay
  // evento al que atribuir el conflicto, así que se marca en el header del
  // día en vez de en un EventPill.
  lunchMissingByDate: Map<string, LunchIssueFlag[]>;
  teamOrder: string[];
  teamsConfig?: Record<string, { color: string }>;
  onCellClick: (iso: string) => void;
  // date/hour are null when the event was dropped outside the grid — caller should cancel the reschedule.
  onMouseUpDrop: (date: Date | null, hour: number | null) => void;
  onDayHeaderClick?: (d: Date) => void;
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; onAssign: (e: CalEvent) => void; onDuplicate: (e: CalEvent) => void; onDragStart: (e: CalEvent, grabOffsetPx: number) => void;
  conflictByEventId: Map<string, { type: ConflictType; detail: string }>;
  spotlightEventId: string | null;
}) {
  const isDragging = draggedEvent !== null;
  const weekStart = startOfWeek(anchor);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart.getTime()]
  );
  const todayStr = todayVan();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  // GCal "bring to front" — last event clicked in this view; see WeekEvent.
  const [frontEventId, setFrontEventId] = useState<string | null>(null);
  // Live, grid-snapped drop preview (GCal-style) — which day column and which
  // 15-min slot the event would land on if released right now.
  const [dragPreview, setDragPreview] = useState<{ dayIndex: number; hour: number } | null>(null);

  // Scroll to 7am on mount
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H; }, []);

  const byDay: Record<string, CalEvent[]> = {};
  for (const e of events) { if (!byDay[e.startDate]) byDay[e.startDate] = []; byDay[e.startDate].push(e); }

  const GUTTER_W = 56;

  // Given a point on screen, figure out which day/hour it corresponds to.
  // Returns null if the point falls outside the grid (day headers, gutter, outside the calendar, etc).
  function resolveDropTarget(clientX: number, clientY: number): { date: Date; hour: number } | null {
    const el = scrollRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const insideX = clientX >= rect.left + GUTTER_W && clientX <= rect.right;
    const insideY = clientY >= rect.top && clientY <= rect.bottom;
    if (!insideX || !insideY) return null;
    const dayWidth = (rect.width - GUTTER_W) / 7;
    const dayIdx = Math.min(6, Math.max(0, Math.floor((clientX - rect.left - GUTTER_W) / dayWidth)));
    const hour = START_H + (clientY - rect.top + el.scrollTop) / HOUR_H;
    return { date: days[dayIdx], hour: Math.round(hour * 4) / 4 };
  }

  // FIX 2+3: listen on `document` (not just the grid) while dragging, so the ghost keeps
  // following the cursor and the drop is always resolved — even if the mouse is released
  // over the day header, the gutter, or anywhere outside the grid. Also auto-scrolls the
  // grid when the cursor nears the top/bottom edge, so you can drop on hours currently
  // scrolled out of view.
  useEffect(() => {
    if (!isDragging) return;
    const lastY = { current: 0 };

    // Same grab-offset + 15min snap math as the final drop (handleMouseUpDrop in the
    // parent) — so what's previewed live is exactly what will be applied on release.
    function computePreview(clientX: number, clientY: number): { dayIndex: number; hour: number } | null {
      const target = resolveDropTarget(clientX, clientY);
      if (!target) return null;
      const grabOffsetH = dragGrabOffsetPx / HOUR_H;
      const rawHour = target.hour - grabOffsetH;
      const snappedHour = Math.round(rawHour * 4) / 4;
      const dayIndex = days.findIndex(d => isoDate(d) === isoDate(target.date));
      if (dayIndex === -1) return null;
      // Same clamp as DayView's computePreviewHour: an unclamped hour lets the
      // ghost render past the 24h line, which grows the scroll container's real
      // scrollHeight and feeds back into the autoscroll ceiling below. See the
      // comment on DayView's computePreviewHour for the full mechanism.
      const maxHour = END_H - (draggedEvent?.durationH ?? 0);
      const clampedHour = Math.min(Math.max(snappedHour, START_H), Math.max(START_H, maxHour));
      return { dayIndex, hour: clampedHour };
    }

    function handleMove(e: MouseEvent) {
      lastY.current = e.clientY;
      setDragPreview(computePreview(e.clientX, e.clientY));
    }

    function handleUp(e: MouseEvent) {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      clearInterval(scrollTimer);
      setDragPreview(null);

      // Swallow the click the browser fires right after this mouseup, so we don't
      // accidentally trigger "create event" on whatever cell is under the cursor.
      const swallowClick = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
      document.addEventListener("click", swallowClick, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallowClick, true), 300);

      const target = resolveDropTarget(e.clientX, e.clientY);
      onMouseUpDrop(target?.date ?? null, target?.hour ?? null);
    }

    const scrollTimer = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = lastY.current;
      if (y < rect.top + DRAG_EDGE_ZONE) {
        const dist = Math.max(0, rect.top + DRAG_EDGE_ZONE - y);
        const speed = Math.min(DRAG_SCROLL_SPEED, (dist / DRAG_EDGE_ZONE) * DRAG_SCROLL_SPEED);
        el.scrollTop = Math.max(0, el.scrollTop - speed);
      } else if (y > rect.bottom - DRAG_EDGE_ZONE) {
        const dist = Math.max(0, y - (rect.bottom - DRAG_EDGE_ZONE));
        const speed = Math.min(DRAG_SCROLL_SPEED, (dist / DRAG_EDGE_ZONE) * DRAG_SCROLL_SPEED);
        el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + speed);
      }
    }, 16);

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      clearInterval(scrollTimer);
      setDragPreview(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, days, dragGrabOffsetPx]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Day headers */}
      <div className="grid border-b border-gray-200 bg-white flex-shrink-0 sticky top-0 z-10" style={{ gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)` }}>
        <div />
        {days.map(d => {
          const key = isoDate(d); const isToday = key === todayStr;
          const isSelected = key === selectedDate;
          // Solo se pinta cuando el banner "Lunch coverage" está activo — mismo
          // gesto que el resto de los conflictos, que solo resaltan al togglear.
          const missingLunch = activeHighlights.has('lunch') ? lunchMissingByDate.get(key) : undefined;
          return (
            // clicking a day column header focuses that date in TeamHeader
            <div key={key} onClick={() => onDayHeaderClick?.(d)} className={`py-2 text-center border-l border-gray-200 cursor-pointer select-none ${isToday ? "border-l-blue-500" : isSelected ? "border-l-gray-400" : ""}`}>
              <p className={`text-xs font-medium uppercase tracking-widest ${isToday ? "text-blue-600" : isSelected ? "text-gray-700" : "text-gray-500"}`}>
                {d.toLocaleDateString("en-CA", { weekday: "short" })}
              </p>
              <div className="flex flex-col items-center mt-1">
                <span
                  title={missingLunch ? `Missing lunch: ${missingLunch.length} team${missingLunch.length !== 1 ? 's' : ''}` : undefined}
                  className={`text-2xl font-light w-10 h-10 flex items-center justify-center rounded-full transition-colors
                  ${isToday
                      ? "bg-blue-600 text-white font-medium"
                      : isSelected
                        ? "bg-blue-200 text-gray-800 font-medium"
                        : "text-gray-800 hover:bg-gray-100"}
                  ${missingLunch ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}>
                  {d.getDate()}
                </span>
                {missingLunch && (
                  <div className="flex items-center gap-1 mt-1" title={`Missing lunch: ${missingLunch.length} team${missingLunch.length !== 1 ? 's' : ''}`}>
                    <AlertTriangle size={11} className="text-amber-500" />
                    <div className="flex gap-0.5">
                      {missingLunch.map(f => (
                        <span key={f.teamId} className="w-1.5 h-1.5 rounded-full" style={{ background: teamDotColor(f.teamId, teamsConfig) }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="grid" style={{ gridTemplateColumns: `${GUTTER_W}px repeat(7, 1fr)` }}>
          {/* Time gutter */}
          <div className="relative border-r border-gray-200" style={{ height: `${VISIBLE_HOURS * HOUR_H}px` }}>
            {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
              i > 0 && (
                <div key={i} className="absolute w-full pr-2 text-right" style={{ top: `${i * HOUR_H - 8}px` }}>
                  <span className="text-[11px] text-gray-400 leading-none whitespace-nowrap">{fmtTime(START_H + i)}</span>
                </div>
              )
            ))}
          </div>
          {/* Day columns */}
          {days.map((d, dayIndex) => {
            const key = isoDate(d); const isToday = key === todayStr;
            const isSelected = key === selectedDate;
            const ghost = draggedEvent && dragPreview?.dayIndex === dayIndex
              ? { hour: dragPreview.hour, event: draggedEvent }
              : null;
            return (
              <DayColumn key={key} laid={layoutDayEvents(byDay[key] || [], teamOrder)} isToday={isToday} isSelected={isSelected} date={d}
                scrollRef={scrollRef} activeHighlights={activeHighlights}
                conflictByEventId={conflictByEventId} spotlightEventId={spotlightEventId}
                draggedEventId={draggedEvent?.id ?? null} ghost={ghost}
                openPopoverId={openPopoverId} setOpenPopoverId={setOpenPopoverId}
                frontEventId={frontEventId} onBringToFront={setFrontEventId}
                onCellClick={onCellClick} onEdit={onEdit} onDelete={onDelete} onAssign={onAssign} onDuplicate={onDuplicate} onDragStart={onDragStart} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── DayView (mobile) ────────────────────────────────────────────────────────
// Single-day grid reusing DayColumn, with horizontal swipe to move ±1 day.
// Drag-to-reschedule is desktop-only (mouse-based in WeekView) — on mobile,
// rescheduling goes through the edit modal instead, since a touch-drag would
// conflict with the swipe-to-navigate gesture on the same axis.

const SWIPE_THRESHOLD_PX = 60;

function DayView({ date, events, activeHighlights, conflictByEventId, spotlightEventId, lunchMissingByDate, teamOrder, draggedEvent, dragGrabOffsetPx, onCellClick, onEdit, onDelete, onAssign, onDuplicate, onNavigateDay, onJumpToDate, onDragStart, onMouseUpDrop }: {
  date: Date; events: CalEvent[];
  activeHighlights: Set<ConflictType>;
  conflictByEventId: Map<string, { type: ConflictType; detail: string }>;
  spotlightEventId: string | null;
  // día (YYYY-MM-DD) → equipos a los que ese día les falta lunch — ver WeekView.
  lunchMissingByDate: Map<string, LunchIssueFlag[]>;
  teamOrder: string[];
  draggedEvent: CalEvent | null;
  dragGrabOffsetPx: number;
  onCellClick: (iso: string) => void;
  onEdit: (e: CalEvent) => void; onDelete: (id: string) => void; onAssign: (e: CalEvent) => void; onDuplicate: (e: CalEvent) => void;
  onNavigateDay: (dir: -1 | 1) => void;
  onJumpToDate: (iso: string) => void;
  onDragStart: (e: CalEvent, grabOffsetPx: number) => void;
  onMouseUpDrop: (date: Date | null, hour: number | null) => void;
}) {
  const isDragging = draggedEvent !== null;
  const dayKey = isoDate(date);
  const isToday = dayKey === todayVan();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [frontEventId, setFrontEventId] = useState<string | null>(null);
  // Live, grid-snapped drop preview — day is fixed in this view, only the hour moves.
  const [dragPreviewHour, setDragPreviewHour] = useState<number | null>(null);
  const GUTTER_W = 56;

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H; }, [dayKey]);

  const laid = useMemo(() => layoutDayEvents(events.filter(e => e.startDate === dayKey), teamOrder), [events, dayKey, teamOrder]);

  // ── Swipe gesture ──
  // Tracks the active touch and, once the gesture is clearly more horizontal
  // than vertical, drags the day grid along with the finger. On release: past
  // the threshold, finish the slide and hand off to onNavigateDay; otherwise
  // snap back. Vertical scrolling of the hour grid is left untouched.
  // Works the same whether the touch starts on empty space or on an event
  // chip — drag-to-reschedule is distinguished by a press-hold on the chip
  // (see WeekEvent's long-press timer), not by where the touch starts.
  const touch = useRef<{ startX: number; startY: number; dx: number; horizontal: boolean; ignore: boolean }>({ startX: 0, startY: 0, dx: 0, horizontal: false, ignore: false });
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (animating) return;
    const target = e.target as HTMLElement;
    // Starting on an event chip no longer opts out of swipe-to-navigate — a
    // quick horizontal drag over an event changes day just like empty space.
    // The chip's own long-press timer (WeekEvent) is what starts
    // drag-to-reschedule instead; it self-cancels as soon as the finger
    // moves more than a few px, which a swipe always does. Once that timer
    // does fire (isDragging becomes true), handleTouchMove/End below bail
    // out so the two gestures never fight over the same touch.
    if (target.closest("button") && !target.closest("[data-week-event]")) {
      touch.current.ignore = true;
      return;
    }
    const t = e.touches[0];
    touch.current = { startX: t.clientX, startY: t.clientY, dx: 0, horizontal: false, ignore: false };
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (animating || touch.current.ignore || isDragging) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.current.startX;
    const dy = t.clientY - touch.current.startY;
    if (!touch.current.horizontal && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      touch.current.horizontal = true;
    }
    if (touch.current.horizontal) {
      touch.current.dx = dx;
      setDragX(dx);
    }
  }
  function handleTouchEnd() {
    if (touch.current.ignore) { touch.current.ignore = false; return; }
    if (isDragging) { touch.current.horizontal = false; setDragX(0); return; }
    const { dx, horizontal } = touch.current;
    touch.current.horizontal = false;
    if (!horizontal) { setDragX(0); return; }
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      const dir: -1 | 1 = dx < 0 ? 1 : -1; // swipe left → next day, swipe right → previous day
      const w = containerRef.current?.clientWidth ?? 320;
      setAnimating(true);
      setDragX(dir === 1 ? -w : w);
      setTimeout(() => { onNavigateDay(dir); setDragX(0); setAnimating(false); }, 200);
    } else {
      setAnimating(true);
      setDragX(0);
      setTimeout(() => setAnimating(false), 200);
    }
  }

  // ── Long-press drag-to-reschedule (mobile) ──
  // Mirrors WeekView's mouse-drag effect but driven by touch: once WeekEvent's
  // long-press fires, this auto-scrolls near the top/bottom edge and resolves
  // the drop hour on release. Only the hour changes here — the day is fixed
  // to whatever's currently shown, since there's nothing to drop onto for a
  // different day in this view.
  function resolveDropHour(clientY: number): number {
    const el = scrollRef.current;
    const top = el ? el.getBoundingClientRect().top : 0;
    const scrollTop = el ? el.scrollTop : 0;
    const hour = START_H + (clientY - top + scrollTop) / HOUR_H;
    return Math.round(hour * 4) / 4;
  }
  // Same grab-offset + 15min snap math as the final drop, shared by both the
  // touch effect below and the mouse effect right after it, so the live
  // preview always matches what gets applied on release either way.
  //
  // Clamped to [START_H, END_H - duration]: without this, holding the cursor
  // past the bottom edge lets the computed hour climb past 24 with no ceiling.
  // The ghost (DragPreviewBlock) is an absolutely-positioned descendant of the
  // scroll container, so a ghost drawn past the 24h mark literally grows the
  // container's scrollHeight — which then feeds back into the autoscroll timer's
  // own `Math.min(el.scrollHeight - el.clientHeight, ...)` ceiling, letting it
  // scroll further, computing an even bigger hour next tick, and so on. Capping
  // the hour here keeps the ghost inside the real 24h grid and breaks that loop.
  function computePreviewHour(clientY: number): number {
    const rawHour = resolveDropHour(clientY) - dragGrabOffsetPx / HOUR_H;
    const snapped = Math.round(rawHour * 4) / 4;
    const maxHour = END_H - (draggedEvent?.durationH ?? 0);
    return Math.min(Math.max(snapped, START_H), Math.max(START_H, maxHour));
  }
  // ── Touch + mouse drag-to-reschedule (unified) ──
  // Touch and mouse used to be two separate effects, each with its own
  // scrollTimer/lastY. Both activated together as soon as isDragging became
  // true regardless of input type, so during a mouse drag the touch effect's
  // lastY stayed frozen at its initial 0 (no touchmove ever fired) and its
  // timer read that as "pointer pinned at the very top", constantly forcing
  // the scroll back up against whatever the mouse effect just did — net
  // result: a tiny scroll then a dead stop, in both directions. One shared
  // lastY/scrollTimer for both input types fixes it.
  useEffect(() => {
    if (!isDragging) return;
    const lastY = { current: 0 };
    // Which input is actually driving the drag right now. The 5am autoscroll
    // floor below is a touch/mobile-only decision (see DRAG_AUTOSCROLL_MIN_HOUR) —
    // desktop mouse drags should scroll all the way to midnight, same as WeekView.
    const inputType = { current: "mouse" as "mouse" | "touch" };

    function handleTouchMove(e: TouchEvent) {
      e.preventDefault(); // stop the grid from scrolling while repositioning the event
      inputType.current = "touch";
      const t = e.touches[0];
      lastY.current = t.clientY;
      setDragPreviewHour(computePreviewHour(t.clientY));
    }
    function handleTouchEnd(e: TouchEvent) {
      cleanup();
      const t = e.changedTouches[0];
      onMouseUpDrop(new Date(date), resolveDropHour(t.clientY));
    }
    function handleMouseMove(e: MouseEvent) {
      inputType.current = "mouse";
      lastY.current = e.clientY;
      setDragPreviewHour(computePreviewHour(e.clientY));
    }
    function handleMouseUp(e: MouseEvent) {
      cleanup();

      // Swallow the click the browser fires right after this mouseup, so we don't
      // accidentally trigger "create event" on whatever cell is under the cursor.
      const swallowClick = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
      document.addEventListener("click", swallowClick, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallowClick, true), 300);

      onMouseUpDrop(new Date(date), resolveDropHour(e.clientY));
    }
    const scrollTimer = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = lastY.current;
      if (y < rect.top + DRAG_EDGE_ZONE) {
        const dist = Math.max(0, rect.top + DRAG_EDGE_ZONE - y);
        const speed = Math.min(DRAG_SCROLL_SPEED, (dist / DRAG_EDGE_ZONE) * DRAG_SCROLL_SPEED);
        // Don't auto-scroll up past 5am on touch — going all the way to midnight
        // overshoots what's actually useful for rescheduling with a thumb. Mouse
        // drags scroll all the way to 0, matching WeekView's desktop behavior.
        const minScrollTop = inputType.current === "touch" ? DRAG_AUTOSCROLL_MIN_HOUR * HOUR_H : 0;
        el.scrollTop = Math.max(minScrollTop, el.scrollTop - speed);
      } else if (y > rect.bottom - DRAG_EDGE_ZONE) {
        const dist = Math.max(0, y - (rect.bottom - DRAG_EDGE_ZONE));
        const speed = Math.min(DRAG_SCROLL_SPEED, (dist / DRAG_EDGE_ZONE) * DRAG_SCROLL_SPEED);
        el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + speed);
      }
    }, 16);
    function cleanup() {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      clearInterval(scrollTimer);
      setDragPreviewHour(null);
    }
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, dayKey, dragGrabOffsetPx]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Date header — tap arrows or swipe the grid below to change day;
          tap the date itself to jump to any date via the native picker. */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-gray-200 bg-white flex-shrink-0 sticky top-0 z-10">
        <button onClick={() => onNavigateDay(-1)} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500" aria-label="Previous day">
          <ChevronLeft size={20} />
        </button>
        <div
          className="relative flex items-center gap-2 px-2 py-1 rounded-lg active:bg-gray-100 cursor-pointer"
          onClick={() => {
            const el = dateInputRef.current;
            if (!el) return;
            // showPicker() opens the OS picker programmatically from anywhere in
            // the tap target; falls back to .click() on browsers that lack it.
            if (typeof (el as any).showPicker === "function") (el as any).showPicker();
            else el.click();
          }}
        >
          {/* Solo se pinta con el banner "Lunch coverage" activo — mismo criterio que WeekView. */}
          {(() => {
            const missingLunch = activeHighlights.has('lunch') ? lunchMissingByDate.get(dayKey) : undefined;
            return (
              <span
                title={missingLunch ? `Missing lunch: ${missingLunch.length} team${missingLunch.length !== 1 ? 's' : ''}` : undefined}
                className={`text-base font-medium rounded px-1.5 -mx-1.5 ${isToday ? "text-blue-600" : "text-gray-800"} ${missingLunch ? "ring-2 ring-amber-400" : ""}`}
              >
                {fmtDayLabel(date)}
              </span>
            );
          })()}
          {isToday && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
          {activeHighlights.has('lunch') && lunchMissingByDate.get(dayKey) && (
            <AlertTriangle size={13} className="text-amber-500" />
          )}
          {/* Hidden native date input — no longer relied on for hit-testing (its
              own rendered control is much narrower than the label, which is why
              only the rightmost sliver used to respond to taps). The wrapping
              div now owns the click and opens it via showPicker(); this stays
              pointer-events-none so it never intercepts the tap itself. */}
          <input
            ref={dateInputRef}
            type="date"
            value={dayKey}
            onChange={(e) => { if (e.target.value) onJumpToDate(e.target.value); }}
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        <button onClick={() => onNavigateDay(1)} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 text-gray-500" aria-label="Next day">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Swipeable, scrollable single-day grid */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: animating ? "transform 200ms ease-out" : "none",
          }}
        >
          <div className="grid" style={{ gridTemplateColumns: `${GUTTER_W}px 1fr` }}>
            <div className="relative border-r border-gray-200" style={{ height: `${VISIBLE_HOURS * HOUR_H}px` }}>
              {Array.from({ length: VISIBLE_HOURS }, (_, i) => (
                i > 0 && (
                  <div key={i} className="absolute w-full pr-2 text-right" style={{ top: `${i * HOUR_H - 8}px` }}>
                    <span className="text-[11px] text-gray-400 leading-none whitespace-nowrap">{fmtTime(START_H + i)}</span>
                  </div>
                )
              ))}
            </div>
            <DayColumn laid={laid} isToday={isToday} isSelected={false} date={date}
              scrollRef={scrollRef} activeHighlights={activeHighlights}
              conflictByEventId={conflictByEventId} spotlightEventId={spotlightEventId}
              draggedEventId={draggedEvent?.id ?? null}
              ghost={draggedEvent && dragPreviewHour !== null ? { hour: dragPreviewHour, event: draggedEvent } : null}
              openPopoverId={openPopoverId} setOpenPopoverId={setOpenPopoverId}
              frontEventId={frontEventId} onBringToFront={setFrontEventId}
              onCellClick={onCellClick} onEdit={onEdit} onDelete={onDelete} onAssign={onAssign} onDuplicate={onDuplicate}
              onDragStart={onDragStart} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week" | "day";

export default function AdminCalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date()));

  // ── Mobile day view ──
  // Below 768px, the calendar always shows a single day regardless of the
  // desktop-preference `view` state (month/week) — `effectiveView` is what
  // actually gets rendered/fetched; `view` is preserved so the user's
  // month/week choice comes back untouched when they resize back up.
  const isMobile = useIsMobile();
  const [dayAnchor, setDayAnchor] = useState<Date>(() => new Date(todayVan()));
  const effectiveView: ViewMode = isMobile ? "day" : view;

  // ── Focus mode ──
  // Hides AdminNavbar + conflict banners + TeamHeader to give the grid more
  // vertical space — the "Google-style" toolbar (Today/nav/search/view
  // switcher/Create) always stays, since it's needed to navigate. Persisted
  // so the preference survives a refresh / next session.
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    try { return localStorage.getItem("admin_calendar_focus_mode") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("admin_calendar_focus_mode", focusMode ? "1" : "0"); } catch { /* ignore */ }
  }, [focusMode]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamHeaderRefreshKey, setTeamHeaderRefreshKey] = useState(0);

  // teamCfg (colores por equipo) para WeekView — mismo cache compartido que
  // AssignModal/AutoAssignModal vía loadAssignTeamCfg().
  const [teamCfg, setTeamCfg] = useState<Record<string, { label: string; color: string; colorIds: string[] }>>({});
  useEffect(() => { loadAssignTeamCfg().then(({ cfg }) => setTeamCfg(cfg)); }, []);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const [creatingStart, setCreatingStart] = useState<string | null>(null);
  const [creatingLunch, setCreatingLunch] = useState<boolean>(false);
  // LAB309: source event for "Duplicate" — opens EventFormModal in create mode,
  // prefilled with this event's data, date/time left blank.
  const [duplicatingEvent, setDuplicatingEvent] = useState<CalEvent | null>(null);
  const [assigningEvent, setAssigningEvent] = useState<CalEvent | null>(null);
  const [pendingReschedule, setPendingReschedule] = useState<{ event: CalEvent; newStartIso: string; newEndIso: string; } | null>(null);
  const [rescheduleScopeChoice, setRescheduleScopeChoice] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<CalEvent | null>(null);
  // px offset from the top of the event where the user grabbed it (FIX 4) — WeekView/DayView
  // use this to keep the live grid-snapped preview aligned under the cursor.
  const [dragGrabOffsetPx, setDragGrabOffsetPx] = useState(0);
  const [activeHighlights, setActiveHighlights] = useState<Set<ConflictType>>(new Set());
  function toggleHighlight(type: ConflictType) {
    if (SEVERE_TYPES.has(type)) return; // team_overlap / over_capacity: siempre visibles, no se pueden ocultar
    setActiveHighlights(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  // Conjunto efectivo de highlights a pintar: lo togglable + lo severo siempre encendido
  const effectiveHighlights = useMemo(() => {
    const set = new Set(activeHighlights);
    for (const t of SEVERE_TYPES) set.add(t);
    return set;
  }, [activeHighlights]);

  // Schedule conflicts — vista semana y día (mobile), se resetea al navegar.
  // Un solo POST batch en vez de N requests individuales (uno por evento).
  const [scheduleConflictDetails, setScheduleConflictDetails] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (effectiveView === 'month' || loading || events.length === 0) return;
    const assigned = events.filter(e => (e.teamId || e.isIndividualAssignment) && !e.isAllDay);
    if (assigned.length === 0) { setScheduleConflictDetails(new Map()); return; }
    let cancelled = false;
    (async () => {
      const conflictsByEventId = await apiCheckConflictsBatch(
        assigned.map(e => ({ id: e.id, startIso: e.startIso, endIso: e.endIso })),
      );
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const e of assigned) {
        const cs = conflictsByEventId[e.id] ?? [];
        if (cs.length > 0) map.set(e.id, cs.map(c => `${c.name}: ${c.reasons.map(r => r.message).join(', ')}`).join('; '));
      }
      setScheduleConflictDetails(map);
    })();
    return () => { cancelled = true; };
  }, [events, effectiveView, loading]);

  // Schedule editor — opened from conflict warnings in EventFormModal / AssignModal
  const [scheduleEditorEmployee, setScheduleEditorEmployee] = useState<{ id: string; name: string; availability?: unknown[]; time_off?: unknown[]; extra_availability?: unknown[] } | null>(null);
  const [loadingScheduleEmployee, setLoadingScheduleEmployee] = useState(false);
  // Incremented when ScheduleEditorModal saves — triggers re-checks in both modals
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  // Spotlight (deep-link highlight) + capacity limit for over-capacity conflict checks
  const [spotlightEventId, setSpotlightEventId] = useState<string | null>(null);

  const [openPopoverForSpotlight, setOpenPopoverForSpotlight] = useState(false);
  const [viewingClient, setViewingClient] = useState<(Client & { notes: string | null }) | null>(null);
  const [loadingViewingClient, setLoadingViewingClient] = useState(false);

  const [maxSimultaneousTeams, setMaxSimultaneousTeams] = useState<number | null>(null);
  useEffect(() => { apiFetchMaxSimultaneousTeams().then(setMaxSimultaneousTeams); }, []);
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  useEffect(() => { loadAssignTeamCfg().then(({ order }) => setTeamOrder(order)); }, []);
  const [resolvingType, setResolvingType] = useState<ConflictType | null>(null);

  async function openScheduleEditor(stub: { id: string; name: string }) {
    setLoadingScheduleEmployee(true);
    try {
      const full = await apiFetchEmployee(stub.id);
      setScheduleEditorEmployee(full);
    } catch {
      setScheduleEditorEmployee(stub);
    } finally {
      setLoadingScheduleEmployee(false);
    }
  }

  const [searchParams, setSearchParams] = useSearchParams();

  // ── Deep-link: ?action=schedule — fires on mount, no need to wait for events
  useEffect(() => {
    if (searchParams.get('action') !== 'schedule') return;
    const employeeId = searchParams.get('employeeId');
    const employeeName = searchParams.get('employeeName') ?? '';
    if (!employeeId) return;
    setSearchParams({}, { replace: true });
    openScheduleEditor({ id: employeeId, name: employeeName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Deep-link: ?action=assign — waits until events are loaded
  useEffect(() => {
    if (searchParams.get('action') !== 'assign') return;
    const eventId = searchParams.get('eventId');
    if (!eventId || loading || events.length === 0) return;
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    setSearchParams({}, { replace: true });
    setAssigningEvent(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, loading]);

  // ── Deep-link: ?action=highlight — viene de ConflictsAlertSection (team_overlap / over_capacity)
  useEffect(() => {
    if (searchParams.get('action') !== 'highlight') return;
    const eventId = searchParams.get('eventId');
    const eventDateStr = searchParams.get('eventDate'); // YYYY-MM-DD
    if (!eventId) return;
    setSearchParams({}, { replace: true });
    setView('week');
    if (eventDateStr) {
      const d = new Date(`${eventDateStr}T00:00:00`);
      if (!isNaN(d.getTime())) {
        setAnchor(startOfWeek(d));
        setTeamHeaderDate(eventDateStr);
      }
    }
    setSpotlightEventId(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una vez cargados los eventos de la semana correcta: scroll + apagar el spotlight a los 3s
  useEffect(() => {
    if (!spotlightEventId || loading) return;
    if (!events.some(e => e.id === spotlightEventId)) return;
    const el = document.querySelector(`[data-event-id="${spotlightEventId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    let openTimer: ReturnType<typeof setTimeout> | undefined;
    if (openPopoverForSpotlight) {
      openTimer = setTimeout(() => {
        const btn = el?.querySelector("button") as HTMLElement | null;
        btn?.click();
        setOpenPopoverForSpotlight(false); // ← movido: ahora corre DESPUÉS del click
      }, 350);
    }

    const t = setTimeout(() => setSpotlightEventId(null), 3000);
    return () => { clearTimeout(t); if (openTimer) clearTimeout(openTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, loading, spotlightEventId]);

  // Lunch coverage — mismo scope que 'schedule' (semana/día, no mes): es
  // barato de calcular pero mostrar el badge en mes agregaría ruido visual
  // a una vista que ya no muestra "Schedule conflict" tampoco.
  const lunchIssues = useMemo(() => {
    if (effectiveView === 'month') return [];
    return findLunchIssues(events);
  }, [events, effectiveView]);

  // "missing" no tiene evento al que atribuirse (no existe el Lunch que
  // falta), así que en vez de un eventId lo agrupamos por día — WeekView/
  // DayView lo usan para marcar el día en el header en lugar de un evento.
  const lunchMissingByDate = useMemo(() => {
    const map = new Map<string, LunchIssueFlag[]>();
    for (const f of lunchIssues) {
      if (f.issue !== 'missing') continue;
      const list = map.get(f.startDate) ?? [];
      list.push(f);
      map.set(f.startDate, list);
    }
    return map;
  }, [lunchIssues]);

  // Conflictos derivados del rango actualmente cargado (semana o mes)
  const conflictByEventId = useMemo(() => {
    const map = new Map<string, { type: ConflictType; detail: string }>();
    // Los tipos severos van primero — si un evento tiene un conflicto severo
    // (double-booking / sobre-capacidad) Y ADEMÁS un problema menor (fuera de
    // horario, sin equipo), el severo tiene que ganar el slot del Map, no
    // quedar tapado por el que se calculó/llegó después.
    // team_overlap
    for (const o of findTeamOverlaps(events)) {
      if (!map.has(o.eventId)) map.set(o.eventId, { type: 'team_overlap', detail: `Same team also booked: "${o.conflictingSummary}"` });
    }
    // over_capacity
    if (maxSimultaneousTeams !== null) {
      for (const f of findOverCapacity(events, maxSimultaneousTeams)) {
        if (!map.has(f.eventId)) map.set(f.eventId, { type: 'over_capacity', detail: `${f.simultaneousCount} simultaneous, ${f.maxTeams} team${f.maxTeams !== 1 ? 's' : ''} available` });
      }
    }
    // lunch — solo el caso "extra" tiene eventos a los que atribuirse; el
    // caso "missing" no aparece acá (no hay evento Lunch que resaltar), solo
    // se cuenta en bannerCounts más abajo.
    for (const f of lunchIssues) {
      if (f.issue !== 'extra') continue;
      for (const id of f.extraEventIds) {
        if (!map.has(id)) map.set(id, { type: 'lunch', detail: `${f.count} lunch events booked for this team today (expected 1)` });
      }
    }
    // schedule (solo semana — scheduleConflictDetails vacío en mes)
    for (const [id, detail] of scheduleConflictDetails) {
      if (!map.has(id)) map.set(id, { type: 'schedule', detail });
    }
    // unassigned
    for (const e of events) {
      if (!e.teamId && !e.isAllDay && !e.isNonService && !e.isIndividualAssignment) {
        map.set(e.id, { type: 'unassigned', detail: 'No team assigned' });
      }
    }
    return map;
  }, [events, scheduleConflictDetails, maxSimultaneousTeams, lunchIssues]);

  // Conteo por tipo para los banners
  const bannerCounts = useMemo(() => {
    const c: Record<ConflictType, number> = { unassigned: 0, schedule: 0, lunch: 0, team_overlap: 0, over_capacity: 0 };
    for (const { type } of conflictByEventId.values()) c[type]++;
    // Los "missing" no están en conflictByEventId (no hay evento al que
    // atribuirlos) — se suman acá para que el badge cuente el problema real.
    c.lunch += lunchIssues.filter(f => f.issue === 'missing').length;
    return c;
  }, [conflictByEventId, lunchIssues]);

  function handleScheduleEditorClose(saved: boolean) {
    setScheduleEditorEmployee(null);
    if (saved) setScheduleRefreshKey(k => k + 1);
  }

  // focused date shown in TeamHeader (defaults to today)
  const [teamHeaderDate, setTeamHeaderDate] = useState<string>(() => isoDate(new Date()));

  // Keep the mobile day anchor in sync with whatever day is focused elsewhere
  // in the UI (e.g. a deep link) the moment we drop into mobile, and keep
  // TeamHeader following the day currently shown in DayView.
  useEffect(() => {
    if (isMobile) setDayAnchor(new Date(`${teamHeaderDate}T00:00:00`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);
  useEffect(() => {
    if (effectiveView === "day") setTeamHeaderDate(isoDate(dayAnchor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAnchor, effectiveView]);

  // Auto-assign teams modal — solo aplica a la semana visible en vista "week"
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const autoAssignWeekStart = isoDate(startOfWeek(anchor));

  const { timeMin, timeMax, label } = (() => {
    if (effectiveView === "day") {
      const key = isoDate(dayAnchor);
      return {
        timeMin: vanDayBoundsIso(key, "start"),
        timeMax: vanDayBoundsIso(key, "end"),
        label: fmtDayLabel(dayAnchor),
      };
    }
    if (view === "month") {
      const s = startOfMonth(anchor), e = endOfMonth(anchor);
      const gs = new Date(s); gs.setDate(s.getDate() - s.getDay());
      const ge = new Date(e); ge.setDate(e.getDate() + (6 - e.getDay()));
      return {
        timeMin: vanDayBoundsIso(isoDate(gs), "start"),
        timeMax: vanDayBoundsIso(isoDate(ge), "end"),
        label: fmtMonthYear(anchor),
      };
    } else {
      const s = startOfWeek(anchor), e = endOfWeek(anchor);
      return {
        timeMin: vanDayBoundsIso(isoDate(s), "start"),
        timeMax: vanDayBoundsIso(isoDate(e), "end"),
        label: fmtWeekRange(s, e),
      };
    }
  })();

  // Month view: fetch week-by-week (same range the backend handles reliably).
  // Week view: single fetch as before.
  const load = useCallback(async () => {
    setLoading(true); setError(null); setActiveHighlights(new Set()); setScheduleConflictDetails(new Map());
    try {
      if (effectiveView === "month") {
        // Build the 6 week ranges that compose the month grid
        const s = startOfMonth(anchor);
        const gridStart = new Date(s); gridStart.setDate(s.getDate() - s.getDay());
        const weekFetches: Promise<CalEvent[]>[] = [];
        for (let w = 0; w < 6; w++) {
          const wStart = new Date(gridStart); wStart.setDate(gridStart.getDate() + w * 7);
          const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6);
          weekFetches.push(fetchEvents(vanDayBoundsIso(isoDate(wStart), "start"), vanDayBoundsIso(isoDate(wEnd), "end")));
        }
        const results = await Promise.all(weekFetches);
        // Deduplicate by event id (events can span weeks)
        const seen = new Set<string>();
        const all: CalEvent[] = [];
        for (const week of results) for (const ev of week) { if (!seen.has(ev.id)) { seen.add(ev.id); all.push(ev); } }
        setEvents(all);
      } else {
        setEvents(await fetchEvents(timeMin, timeMax));
      }
    }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [effectiveView, anchor, dayAnchor, timeMin, timeMax]);

  useEffect(() => { load(); }, [load]);

  function navigate(dir: -1 | 1) {
    if (effectiveView === "day") { setDayAnchor(d => addDays(d, dir)); return; }
    if (view === "month") setAnchor(a => addMonths(a, dir)); else setAnchor(a => addWeeks(a, dir));
  }
  function goToday() {
    const t = new Date(todayVan());
    if (effectiveView === "day") { setDayAnchor(t); setTeamHeaderDate(isoDate(t)); return; }
    setAnchor(view === "month" ? startOfMonth(t) : startOfWeek(t)); setTeamHeaderDate(isoDate(t));
  }
  function switchView(v: ViewMode) {
    setView(v);
    if (v === "day") { setDayAnchor(new Date(`${teamHeaderDate}T00:00:00`)); return; }
    setAnchor(v === "month" ? startOfMonth(anchor) : startOfWeek(anchor));
  }

  // Jump straight to an arbitrary date — used by DayView's date-picker header.
  function jumpToDate(iso: string) {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return;
    if (effectiveView === "day") { setDayAnchor(d); setTeamHeaderDate(iso); return; }
    setAnchor(view === "month" ? startOfMonth(d) : startOfWeek(d));
    setTeamHeaderDate(iso);
  }

  function handleSelectSearchEvent(ev: EventSearchResult) {
    setView('week');
    const d = new Date(`${ev.startDate}T00:00:00`);
    setAnchor(startOfWeek(d));
    setTeamHeaderDate(ev.startDate);
    setOpenPopoverForSpotlight(true);
    setSpotlightEventId(ev.id);
  }

  async function handleSelectSearchClient(clientId: string) {
    setLoadingViewingClient(true);
    try {
      const client = await apiFetchClient(clientId);
      setViewingClient(client);
    } catch (e) {
      console.error("Failed to load client:", e);
    } finally {
      setLoadingViewingClient(false);
    }
  }

  function handleEventSaved(saved: CalEvent, scope?: "single" | "following" | "all") {
    const editedId = editingEvent?.id;
    if (scope === "following" || scope === "all") {
      // LAB-330: a "following"/"all" edit can come back with a *different*
      // event id than the one we edited — GCal splits the series, truncating
      // the old master and inserting a brand-new series for the new id — and
      // it can also invalidate other occurrences of the old series that are
      // already sitting in `events` from the last fetch. A naive id-based
      // find-and-replace can't express either change (it just appends the
      // response as a phantom extra card), so instead: drop the stale
      // occurrence we just edited from local state immediately (so nobody
      // can see/delete it against the real GCal event) and reconcile the
      // rest of the visible range from the backend, same as force-sync does.
      setEvents(prev => (editedId ? prev.filter(e => e.id !== editedId) : prev));
      // El patch que trunca la serie vieja puede tardar unos segundos en
      // propagarse en Google Calendar. Un load() inmediato a veces todavía
      // ve la ocurrencia vieja Y la nueva superpuestas. Reintentamos una
      // vez más después de un margen corto — no es polling real, es un
      // parche pragmático hasta que el backend exponga confirmación async.
      load();
      setTimeout(() => load(), 2500);
    } else {
      setEvents(prev => { const i = prev.findIndex(e => e.id === saved.id); if (i >= 0) { const n = [...prev]; n[i] = saved; return n; } return [...prev, saved]; });
    }
    // After duplicating, jump the visible week/month/day to the new event's date 
    if (duplicatingEvent) {
      jumpToDate(DateTime.fromISO(saved.startIso).setZone("America/Vancouver").toISODate()!);
    }
    setEditingEvent(null); setCreatingStart(null); setDuplicatingEvent(null); setAssigningEvent(null); setCreatingLunch(false);
  }
  function handleEventDeleted(id: string) { setEvents(prev => prev.filter(e => e.id !== id)); }

  // Called by WeekView's global mouseup handler — hour is cursor position; we subtract grab offset.
  // date/hour are null when the event was dropped outside the grid (e.g. on the day label) —
  // in that case we just cancel the drag and the event snaps back to its original slot.
  function handleMouseUpDrop(date: Date | null, hour: number | null) {
    if (!draggedEvent) return;
    if (date === null || hour === null) { setDraggedEvent(null); return; }
    // FIX 4: subtract the px offset where user grabbed the event, converted to hours
    const grabOffsetH = dragGrabOffsetPx / HOUR_H;
    const rawHour = hour - grabOffsetH;
    const snapped = Math.round(rawHour * 4) / 4; // snap to 15min
    const hh = Math.floor(snapped);
    const mm = Math.round((snapped % 1) * 60);
    const pad = (n: number) => String(n).padStart(2, "0");
    const newStartIso = vanStringToIso(`${isoDate(date)}T${pad(hh)}:${pad(mm)}:00`);
    const newStart = new Date(newStartIso);
    const newEnd = new Date(newStart.getTime() + draggedEvent.durationH * 3_600_000);
    const origMin = Math.floor(new Date(draggedEvent.startIso).getTime() / 60000);
    const newMin = Math.floor(newStart.getTime() / 60000);
    if (origMin === newMin) { setDraggedEvent(null); return; }
    setPendingReschedule({ event: draggedEvent, newStartIso: newStartIso, newEndIso: newEnd.toISOString() });
    setDraggedEvent(null);
  }

  async function confirmReschedule(scope: "single" | "following" | "all" = "single") {
    if (!pendingReschedule) return;

    // LAB-233: dragging an occurrence of a recurring series — ask whether the
    // new time applies to just this event or the whole series before touching
    // the network. Re-entered with the chosen scope once the modal confirms.
    if (pendingReschedule.event.seriesId && !rescheduleScopeChoice) {
      setRescheduleScopeChoice(true);
      return;
    }

    const { event: ev, newStartIso, newEndIso } = pendingReschedule;
    const sP = vanParts(newStartIso);
    const eP = vanParts(newEndIso);
    const pad2 = (n: string | number) => String(n).padStart(2, "0");
    const optimistic: CalEvent = {
      ...ev, startIso: newStartIso, endIso: newEndIso,
      startDate: `${sP.year}-${pad2(sP.month)}-${pad2(sP.day)}`,
      startHour: sP.hour + sP.minute / 60,
      endHour: eP.hour + eP.minute / 60,
      durationH: (new Date(newEndIso).getTime() - new Date(newStartIso).getTime()) / 3600_000,
    };
    handleEventSaved(optimistic);
    setPendingReschedule(null);
    setRescheduleScopeChoice(false);
    try {
      const saved = await apiUpdateEvent(ev.id, { startIso: newStartIso, endIso: newEndIso }, scope);
      handleEventSaved(saved);
    } catch (e: any) {
      handleEventSaved(ev);
      alert(`Failed to reschedule: ${e.message}`);
    }
  }

  return (
    <RequireAdmin>
      <div className="h-screen flex flex-col bg-white overflow-hidden">

        {/* ── Shared admin navbar ── */}
        {!focusMode && (
          <AdminNavbar
            title="Calendar"
            onRefresh={load}
            refreshing={loading}
          />
        )}

        {/* ── Google-style top bar ── */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-4 px-4 h-16">

            {/* Logo / title */}
            <div className="flex items-center gap-2 min-w-[180px]">
              <div className="w-8 h-8 rounded-lg bg-[#031634] flex items-center justify-center">
                <Calendar size={15} className="text-white" />
              </div>
              <span className="text-lg font-normal text-gray-700 tracking-tight">Calendar</span>
            </div>

            {/* Today + Nav — chevrons hidden on mobile: DayView has its own prev/next + swipe */}
            <div className="flex items-center gap-1">
              <button
                onClick={goToday}
                className="px-3.5 py-1.5 text-sm font-medium border border-gray-300 rounded-full text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Today
              </button>
              <button onClick={() => navigate(-1)} className={`${effectiveView === "day" ? "hidden" : "hidden md:inline-flex"} p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors`}><ChevronLeft size={18} /></button>
              <button onClick={() => navigate(1)} className={`${effectiveView === "day" ? "hidden" : "hidden md:inline-flex"} p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors`}><ChevronRight size={18} /></button>
            </div>

            {/* Period label — hidden in Day view (any width): DayView's own header shows the focused date */}
            <h2 className={`${effectiveView === "day" ? "hidden" : "hidden md:block"} text-xl font-normal text-gray-700 min-w-[240px]`}>{label}</h2>

            <GlobalSearchBar onSelectEvent={handleSelectSearchEvent} onSelectClient={handleSelectSearchClient} />

            <div className="flex-1" />

            {viewingClient && (
              <ClientFormModal
                client={viewingClient}
                onClose={() => setViewingClient(null)}
                onSaved={() => setViewingClient(null)}
                zIndex="z-[90]"
              />
            )}
            {loadingViewingClient && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                <div className="bg-white rounded-xl shadow-lg px-5 py-4 flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                  <span className="text-sm text-gray-600">Loading client…</span>
                </div>
              </div>
            )}

            <div className="flex-1" />

            {/* Focus mode — hides navbar/banners/team header for more grid space */}
            <button
              onClick={() => setFocusMode(v => !v)}
              title={focusMode ? "Show top bars" : "Focus mode: hide top bars for more space"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-full transition-colors ${focusMode
                ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
            >
              {focusMode ? <PanelTopOpen size={15} /> : <PanelTopClose size={15} />}
              <span className="hidden lg:inline">{focusMode ? "Show bars" : "Focus mode"}</span>
            </button>

            {/* View switcher — Month/Week/Day only apply at desktop widths; mobile always shows Day view */}
            <div className="hidden md:flex items-center border border-gray-300 rounded-lg overflow-hidden text-sm">
              <button onClick={() => switchView("month")} className={`px-4 py-1.5 transition-colors font-medium ${view === "month" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>Month</button>
              <button onClick={() => switchView("week")} className={`px-4 py-1.5 border-l border-gray-300 transition-colors font-medium ${view === "week" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>Week</button>
              <button onClick={() => switchView("day")} className={`px-4 py-1.5 border-l border-gray-300 transition-colors font-medium ${view === "day" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}>Day</button>
            </div>

            {/* Create buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreatingStart(new Date().toISOString())}
                className="flex items-center gap-2 pl-3 pr-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 shadow-sm hover:shadow-md transition-all"
              >
                <Plus size={16} /> <span className="hidden sm:inline">New event</span>
              </button>

              {/* NEW: Add Lunch button */}
              <button
                onClick={() => setCreatingLunch(true)}
                className="flex items-center gap-2 pl-3 pr-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-full hover:bg-blue-700 shadow-sm hover:shadow-md transition-all"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Add Lunch</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Banners ── */}
        {/* ── Banners — vista semana y día (mobile) ── */}
        {(effectiveView === 'week' || effectiveView === 'day') && (error || (!focusMode && Object.values(bannerCounts).some(c => c > 0))) && (
          <div className="flex-shrink-0 px-4 py-2 space-y-1.5">
            {error && (
              <div className="px-4 py-2.5 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
                <span className="font-medium">Failed to load:</span> {error}
              </div>
            )}
            {!focusMode && Object.values(bannerCounts).some(c => c > 0) && (
              <div className="flex gap-1.5">
                {BANNER_DEFS.map(({ type, label, severe }) => {
                  const count = bannerCounts[type];
                  if (count === 0) return null;
                  const isActive = activeHighlights.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => severe ? setResolvingType(type) : toggleHighlight(type)}
                      title={severe ? 'Click to review suggested fixes' : undefined}
                      className={`flex-1 min-w-0 text-left px-3 py-2 rounded-xl border text-xs flex items-center gap-2 transition-colors ${severe
                        ? 'bg-red-100 border-red-400 text-red-800 hover:bg-red-200 cursor-pointer'
                        : isActive ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                        }`
                      }
                    >
                      <AlertTriangle size={13} className={`flex-shrink-0 ${severe ? 'text-red-500' : 'text-amber-500'}`} />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold">{count} event{count !== 1 ? 's' : ''}</span>
                        <span className="opacity-75 ml-1 truncate">{label}</span>
                      </div>
                      {severe ? <span className="text-[10px] font-semibold flex-shrink-0 underline">Resolve →</span>
                        : isActive && <span className="text-[10px] opacity-60 flex-shrink-0">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Error en vista mensual — sin banners de conflicto */}
        {effectiveView === 'month' && error && (
          <div className="flex-shrink-0 px-4 py-2">
            <div className="px-4 py-2.5 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
              <span className="font-medium">Failed to load:</span> {error}
            </div>
          </div>
        )}

        {/* ── Calendar body ── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Team header — shows Team 1 / Team 2 assignment for the focused date */}
          {!focusMode && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <TeamHeader date={teamHeaderDate} refreshKey={teamHeaderRefreshKey} />
              </div>
              {!isMobile && view === "week" && (
                <button
                  onClick={() => setShowAutoAssign(true)}
                  className="flex-shrink-0 mr-3 text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  Auto-assign teams
                </button>
              )}
            </div>
          )}
          {loading && events.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={24} className="animate-spin text-blue-400" />
                <span className="text-gray-400">Loading events…</span>
              </div>
            </div>
          ) : effectiveView === "day" ? (
            <DayView date={dayAnchor} events={events} activeHighlights={effectiveHighlights}
              conflictByEventId={conflictByEventId} spotlightEventId={spotlightEventId}
              lunchMissingByDate={lunchMissingByDate} teamOrder={teamOrder}
              draggedEvent={draggedEvent} dragGrabOffsetPx={dragGrabOffsetPx}
              onCellClick={(iso) => { setTeamHeaderDate(isoDate(new Date(iso))); setCreatingStart(iso); }}
              onEdit={setEditingEvent} onDelete={handleEventDeleted} onAssign={setAssigningEvent} onDuplicate={setDuplicatingEvent}
              onNavigateDay={navigate} onJumpToDate={jumpToDate}
              onDragStart={(ev, grabPx) => { setDraggedEvent(ev); setDragGrabOffsetPx(grabPx); }}
              onMouseUpDrop={handleMouseUpDrop} />
          ) : view === "month" ? (
            <MonthView anchor={anchor} events={events} conflictByEventId={conflictByEventId} spotlightEventId={spotlightEventId}
              onCellClick={(iso) => { setTeamHeaderDate(isoDate(new Date(iso))); setCreatingStart(iso); }}
              onEdit={setEditingEvent} onDelete={handleEventDeleted} onAssign={setAssigningEvent} onDuplicate={setDuplicatingEvent} />
          ) : (
            <WeekView
              anchor={anchor}
              events={events}
              draggedEvent={draggedEvent}
              dragGrabOffsetPx={dragGrabOffsetPx}
              activeHighlights={effectiveHighlights}
              conflictByEventId={conflictByEventId}
              spotlightEventId={spotlightEventId}
              selectedDate={teamHeaderDate}
              lunchMissingByDate={lunchMissingByDate}
              teamOrder={teamOrder}
              teamsConfig={teamCfg}
              onCellClick={(iso) => { setTeamHeaderDate(isoDate(new Date(iso))); setCreatingStart(iso); }}
              onMouseUpDrop={handleMouseUpDrop}
              onEdit={setEditingEvent} onDelete={handleEventDeleted} onAssign={setAssigningEvent} onDuplicate={setDuplicatingEvent} onDragStart={(ev, grabPx) => { setDraggedEvent(ev); setDragGrabOffsetPx(grabPx); }}
              onDayHeaderClick={(d) => setTeamHeaderDate(isoDate(d))} />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {
        (editingEvent || creatingStart !== null || duplicatingEvent) && (
          <EventFormModal
            event={editingEvent ?? undefined} initialStart={creatingStart ?? undefined}
            duplicateFrom={duplicatingEvent ?? undefined}
            onClose={() => { setEditingEvent(null); setCreatingStart(null); setDuplicatingEvent(null); }} onSaved={handleEventSaved}
            onOpenSchedule={openScheduleEditor}
            conflictRefreshKey={scheduleRefreshKey}
          />
        )
      }
      {/* NEW: Lunch modal */}
      {
        creatingLunch && (
          <LunchFormModal
            onClose={() => setCreatingLunch(false)}
            onSaved={handleEventSaved}
          />
        )
      }
      {
        showAutoAssign && (
          <TeamAutoAssignModal
            weekStart={autoAssignWeekStart}
            onClose={() => setShowAutoAssign(false)}
            onApplied={async () => {
              setTeamHeaderRefreshKey((k) => k + 1);
              // Standalone: el auto-assign ya persiste en Supabase, no hay
              // nada externo que re-sincronizar — solo recargar.
              try { await load(); }
              catch (e: any) { setError(`Reload failed: ${e.message}`); }
            }}
          />
        )
      }
      {
        assigningEvent && (
          <AssignModal
            event={assigningEvent} onClose={() => setAssigningEvent(null)} onSaved={handleEventSaved}
            onOpenSchedule={openScheduleEditor}
            availabilityRefreshKey={scheduleRefreshKey}
          />
        )
      }
      {
        pendingReschedule && !rescheduleScopeChoice && (
          <RescheduleModal
            event={pendingReschedule.event}
            newStartIso={pendingReschedule.newStartIso}
            newEndIso={pendingReschedule.newEndIso}
            onConfirm={() => confirmReschedule()}
            onCancel={() => setPendingReschedule(null)}
            onAssign={() => {
              setAssigningEvent(pendingReschedule.event);
              setPendingReschedule(null);
            }}
          />
        )
      }
      {
        rescheduleScopeChoice && (
          <RecurrenceScopeModal
            action="save"
            hideAllOption
            onConfirm={(scope) => confirmReschedule(scope)}
            onCancel={() => { setRescheduleScopeChoice(false); setPendingReschedule(null); }}
          />
        )
      }
      {resolvingType && (
        <ConflictResolutionModal
          type={resolvingType}
          events={events}
          teamOrder={teamOrder}
          maxSimultaneousTeams={maxSimultaneousTeams ?? 2}
          onClose={() => setResolvingType(null)}
          onApplied={handleEventSaved}
        />
      )}
      {/* Loading overlay while fetching employee data for schedule editor */}
      {
        loadingScheduleEmployee && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
            <div className="bg-white rounded-xl shadow-lg px-5 py-4 flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-blue-500" />
              <span className="text-sm text-gray-600">Loading schedule…</span>
            </div>
          </div>
        )
      }
      {/* Schedule editor — opened from conflict warnings in EventFormModal / AssignModal */}
      {
        scheduleEditorEmployee && (
          <ScheduleEditorModal
            employee={scheduleEditorEmployee as any}
            onClose={() => handleScheduleEditorClose(false)}
            onSaved={() => handleScheduleEditorClose(true)}
          />
        )
      }
    </RequireAdmin >
  );
}