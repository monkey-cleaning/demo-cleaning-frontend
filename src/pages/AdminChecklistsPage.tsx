// pages/AdminChecklistsPage.tsx
//
// LAB458 / LAB462 — "Checklists". Tres pestañas:
//   * Activity: qué marcaron y qué fotos subieron los cleaners, por evento y por
//     día (GET /api/calendar/events/checklist-activity).
//   * General checklist: los items que aplican a TODAS las limpiezas (crear,
//     editar, ordenar, borrar, foto obligatoria). Los items de una limpieza en
//     particular se cargan en el modal de evento (AdminCalendarPage).
//   * Received from cleaners: fotos + comentario que mandan los cleaners a la
//     oficina (el dashboard es "central"), con aviso de las no revisadas.

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Loader2, MapPin, Plus, Search, Trash2, Users, X } from "lucide-react";
import RequireAdmin from "../components/admin/RequireAdmin";
import AdminNavbar from "../components/admin/AdminNavbar";
import ConfirmDialog from "../components/admin/ConfirmDialog";
import PhotoLightbox from "../components/PhotoLightbox";
import { api } from "../api/client";
import { TZ } from '../lib/timezone';


interface ActivityPhoto {
  id: string;
  url: string;
  createdAt: string;
  uploadedBy: string | null;
}
interface ActivityItem {
  id: string;
  label: string;
  isGeneral: boolean;
  requirePhoto: boolean;
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  photos: ActivityPhoto[];
}
interface CentralSubmission {
  id: string;
  eventId: string;
  clientName: string | null;
  eventSummary: string | null;
  eventStart: string | null;
  location: string | null;
  sentBy: string | null;
  comment: string | null;
  photos: string[];
  createdAt: string;
  reviewedAt: string | null;
}
interface ActivityEvent {
  eventId: string;
  summary: string;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  location: string | null;
  clientName: string | null;
  cleaners: string[];
  items: ActivityItem[];
  centralSubmissions: CentralSubmission[];
  totals: { done: number; total: number; photos: number };
}
interface ActivityResponse {
  ok: boolean;
  from: string;
  to: string;
  events: ActivityEvent[];
}
interface GeneralItem {
  id: string;
  label: string;
  requirePhoto: boolean;
}

const today = () => DateTime.now().setZone(TZ).toISODate()!;
const daysAgo = (n: number) => DateTime.now().setZone(TZ).minus({ days: n }).toISODate()!;

const PRESETS = [
  { label: "Today", from: () => today(), to: () => today() },
  { label: "Last 7 days", from: () => daysAgo(6), to: () => today() },
  { label: "Last 30 days", from: () => daysAgo(29), to: () => today() },
];

function fmtTime(iso: string) {
  return DateTime.fromISO(iso, { zone: TZ }).toFormat("h:mm a");
}
function fmtDateTime(iso: string) {
  return DateTime.fromISO(iso, { zone: TZ }).toFormat("LLL d, h:mm a");
}

// api() tira `API <status> - <body>`; si el body es JSON con `error`, se muestra.
function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  const raw = e instanceof Error ? e.message : fallback;
  const idx = raw.indexOf(" - ");
  if (idx !== -1) {
    try {
      return JSON.parse(raw.slice(idx + 3)).error ?? raw;
    } catch {
      /* body no JSON */
    }
  }
  return raw;
}

// Búsqueda sin mayúsculas ni acentos ("garcia" encuentra "García").
function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Tab = "activity" | "general" | "central";

export default function AdminChecklistsPage() {
  const [tab, setTab] = useState<Tab>("activity");
  const [unreviewed, setUnreviewed] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadUnreviewed = useCallback(() => {
    api<{ ok: boolean; count: number }>("/api/calendar/central-submissions/unreviewed-count")
      .then((d) => setUnreviewed(d.count))
      .catch(() => { /* el badge es best-effort */ });
  }, []);

  useEffect(() => {
    loadUnreviewed();
    const t = setInterval(() => { if (!document.hidden) loadUnreviewed(); }, 60_000);
    return () => clearInterval(t);
  }, [loadUnreviewed]);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "activity", label: "Activity" },
    { id: "general", label: "General checklist" },
    { id: "central", label: "Received from cleaners", badge: unreviewed },
  ];

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar
          title="Checklists"
          onRefresh={() => { setRefreshKey((k) => k + 1); loadUnreviewed(); }}
        />

        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4">
          <div className="flex gap-1 bg-white rounded-xl border border-gray-100 p-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 whitespace-nowrap flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 transition-colors ${
                  tab === t.id ? "bg-navy text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.label}
                {!!t.badge && (
                  <span className="text-[11px] font-semibold bg-red-500 text-white rounded-full px-1.5 min-w-[18px] text-center">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "activity" && <ActivityTab refreshKey={refreshKey} />}
          {tab === "general" && <GeneralChecklistTab />}
          {tab === "central" && <CentralTab refreshKey={refreshKey} onChanged={loadUnreviewed} />}
        </div>
      </div>
    </RequireAdmin>
  );
}

// Selector de día (como el del calendario) + accesos rápidos. Un día = from y to
// iguales; los presets "Last 7/30 days" son rangos y se marcan como activos.
function DayRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const single = from === to;
  const shift = (n: number) => {
    const d = DateTime.fromISO(to, { zone: TZ }).plus({ days: n }).toISODate()!;
    onChange(d, d);
  };
  const activePreset = PRESETS.find((p) => p.from() === from && p.to() === to)?.label;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          onClick={() => shift(-1)}
          aria-label="Previous day"
          className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <ChevronLeft size={16} />
        </button>
        {single ? (
          <input
            type="date"
            value={to}
            onChange={(e) => e.target.value && onChange(e.target.value, e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
          />
        ) : (
          <span className="text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50">
            {DateTime.fromISO(from, { zone: TZ }).toFormat("LLL d")} – {DateTime.fromISO(to, { zone: TZ }).toFormat("LLL d")}
          </span>
        )}
        <button
          onClick={() => shift(1)}
          aria-label="Next day"
          className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.from(), p.to())}
            className={`text-xs font-medium rounded-lg px-2.5 py-1.5 border ${
              activePreset === p.label
                ? "bg-navy text-white border-navy"
                : "text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Activity ────────────────────────────────────────────────────────────────

function ActivityTab({ refreshKey }: { refreshKey: number }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const [onlyWithActivity, setOnlyWithActivity] = useState(false);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<ActivityResponse>(`/api/calendar/events/checklist-activity?from=${from}&to=${to}`)
      .then((d) => setEvents(d.events))
      .catch((e: unknown) => {
        setEvents(null);
        setError(errorMessage(e, "Could not load"));
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const searchTerms = useMemo(
    () => normalizeSearch(search).split(/\s+/).filter(Boolean),
    [search]
  );

  const days = useMemo(() => {
    // Cada palabra tiene que aparecer en el título, el cliente o la dirección.
    const matchesSearch = (e: ActivityEvent) => {
      if (!searchTerms.length) return true;
      const haystack = normalizeSearch([e.summary, e.clientName, e.location].filter(Boolean).join(" "));
      return searchTerms.every((t) => haystack.includes(t));
    };
    const filtered = (events ?? []).filter(
      (e) =>
        matchesSearch(e) &&
        (!onlyWithActivity || e.totals.done > 0 || e.totals.photos > 0 || e.centralSubmissions.length > 0)
    );
    const sorted = [...filtered].sort((a, b) =>
      newestFirst ? b.startIso.localeCompare(a.startIso) : a.startIso.localeCompare(b.startIso)
    );
    const byDay = new Map<string, ActivityEvent[]>();
    for (const ev of sorted) {
      const key = DateTime.fromISO(ev.startIso, { zone: TZ }).toISODate()!;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(ev);
    }
    return [...byDay.entries()];
  }, [events, onlyWithActivity, newestFirst, searchTerms]);

  const totalEvents = days.reduce((n, [, evs]) => n + evs.length, 0);

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <DayRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by event title, client or address…"
            aria-label="Search visits"
            className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-9 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {loading
              ? "Loading…"
              : searchTerms.length
                ? `${totalEvents} of ${events?.length ?? 0} visit(s) match`
                : `${totalEvents} visit(s) with a checklist`}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithActivity}
                onChange={(e) => setOnlyWithActivity(e.target.checked)}
              />
              Only with activity
            </label>
            <button
              onClick={() => setNewestFirst((v) => !v)}
              className="font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
            >
              {newestFirst ? "Newest first" : "Oldest first"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
      )}

      {loading && !events && (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      )}

      {!loading && !error && totalEvents === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
          {searchTerms.length
            ? `No visits match "${search.trim()}" in this range.`
            : "No visits with a checklist in this range."}
        </div>
      )}

      {days.map(([dayKey, evs]) => (
        <section key={dayKey} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-1">
            {DateTime.fromISO(dayKey, { zone: TZ }).toFormat("cccc, LLLL d")}
          </h2>
          {evs.map((ev) => (
            <EventCard key={ev.eventId} ev={ev} onPhoto={setViewing} />
          ))}
        </section>
      ))}

      {viewing && <PhotoLightbox url={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function EventCard({ ev, onPhoto }: { ev: ActivityEvent; onPhoto: (url: string) => void }) {
  const { done, total, photos } = ev.totals;
  const complete = total > 0 && done === total;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex flex-wrap items-start justify-between gap-2 cursor-pointer"
      >
        <ChevronDown
          size={18}
          className={`mt-0.5 flex-shrink-0 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">
            {ev.isAllDay ? "All day" : `${fmtTime(ev.startIso)} – ${fmtTime(ev.endIso)}`}
          </p>
          <h3 className="text-base font-medium text-gray-800 leading-snug">{ev.summary}</h3>
          {ev.clientName && !normalizeSearch(ev.summary).includes(normalizeSearch(ev.clientName)) && (
            <p className="text-xs text-gray-500 mt-0.5">Client: {ev.clientName}</p>
          )}
          {ev.location && (
            <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <MapPin size={12} className="flex-shrink-0" /> {ev.location}
            </p>
          )}
          {ev.cleaners.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <Users size={12} className="flex-shrink-0" /> {ev.cleaners.join(", ")}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span
            className={`inline-block text-xs font-semibold rounded-full px-2.5 py-1 ${
              complete ? "bg-green-100 text-green-700" : done > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
            }`}
          >
            {done}/{total} completed
          </span>
          <p className="flex items-center justify-end gap-1 text-xs text-gray-400 mt-1">
            <Camera size={12} /> {photos} photo{photos === 1 ? "" : "s"}
          </p>
          {ev.centralSubmissions.length > 0 && (
            <p className="text-xs text-red-500 mt-1">
              {ev.centralSubmissions.length} from cleaners
            </p>
          )}
        </div>
      </div>

      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${complete ? "bg-green-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
      </div>

      {open && <div className="space-y-2.5">
        {ev.items.map((it) => (
          <div key={it.id} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center ${
                it.completed ? "bg-green-500 text-white" : "border border-gray-300"
              }`}
              aria-label={it.completed ? "Completed" : "Pending"}
            >
              {it.completed && <Check size={10} strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${it.completed ? "text-gray-500" : "text-gray-800"}`}>
                {it.label}
                {!it.isGeneral && (
                  <span className="ml-2 text-[10px] font-semibold uppercase text-amber-700 bg-amber-100 rounded px-1.5 py-px">
                    This home only
                  </span>
                )}
                {it.requirePhoto && (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase text-blue-700 bg-blue-100 rounded px-1.5 py-px">
                    Photo required
                  </span>
                )}
              </p>
              {it.completed && it.completedAt && (
                <p className="text-[11px] text-green-600">
                  Completed{it.completedBy ? ` by ${it.completedBy}` : ""} · {fmtTime(it.completedAt)}
                </p>
              )}
              {it.photos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {it.photos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onPhoto(p.url)}
                      aria-label="View photo"
                      title={[p.uploadedBy, fmtTime(p.createdAt)].filter(Boolean).join(" · ")}
                    >
                      <img src={p.url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>}

      {open && ev.centralSubmissions.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Received from cleaners ({ev.centralSubmissions.length})
          </p>
          {ev.centralSubmissions.map((s) => (
            <div key={s.id} className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[11px] text-gray-400">
                {s.sentBy ?? "Cleaner"} · {fmtDateTime(s.createdAt)}
              </p>
              {s.comment && <p className="text-sm text-gray-700 whitespace-pre-line">{s.comment}</p>}
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {s.photos.map((url) => (
                  <button key={url} onClick={() => onPhoto(url)} aria-label="View photo">
                    <img src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── General checklist ───────────────────────────────────────────────────────

function GeneralChecklistTab() {
  const [items, setItems] = useState<GeneralItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newRequirePhoto, setNewRequirePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<GeneralItem | null>(null);
  // Drag & drop nativo: la fila solo es arrastrable mientras se sostiene el
  // handle (si no, arrastrar texto dentro del input dispararía el reorden).
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ ok: boolean; items: GeneralItem[] }>("/api/calendar/checklist/general")
      .then((d) => { setItems(d.items); setError(null); })
      .catch((e: unknown) => setError(errorMessage(e, "Could not load the checklist")));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      const label = newLabel.trim();
      if (!label) return;
      await api("/api/calendar/checklist/general", {
        method: "POST",
        body: JSON.stringify({ label, requirePhoto: newRequirePhoto }),
      });
      setNewLabel("");
      setNewRequirePhoto(false);
    });

  const patch = (id: string, body: Partial<{ label: string; requirePhoto: boolean }>) =>
    run(async () => {
      await api(`/api/calendar/checklist/general/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setDrafts((d) => { const { [id]: _drop, ...rest } = d; return rest; });
    });

  const confirmRemove = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    await run(() => api(`/api/calendar/checklist/general/${id}`, { method: "DELETE" }));
    setPendingDelete(null);
  };

  const dropOn = (targetId: string) => {
    const from = dragId;
    setDragId(null);
    setOverId(null);
    setArmedId(null);
    if (!items || !from || from === targetId) return;
    const next = [...items];
    const fromIdx = next.findIndex((i) => i.id === from);
    const toIdx = next.findIndex((i) => i.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setItems(next); // optimista; load() reconcilia
    return run(() =>
      api("/api/calendar/checklist/general/order", {
        method: "PUT",
        body: JSON.stringify({ ids: next.map((i) => i.id) }),
      })
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
      <div>
        <h2 className="text-base font-medium text-gray-800">General checklist</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          These items appear on every visit. Add items for one specific home from the event editor in the Calendar.
          Changes only affect visits that haven&apos;t started yet — a visit keeps the checklist it had when the cleaner began.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      {items === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-gray-500">No general items yet.</p>}
          {items.map((item) => {
            const draft = drafts[item.id];
            return (
              <div
                key={item.id}
                draggable={armedId === item.id}
                onDragStart={(e) => { setDragId(item.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(item.id); } }}
                onDrop={(e) => { e.preventDefault(); dropOn(item.id); }}
                onDragEnd={() => { setDragId(null); setOverId(null); setArmedId(null); }}
                className={`flex flex-wrap items-center gap-2 border rounded-xl px-2.5 py-2 transition-colors ${
                  overId === item.id && dragId && dragId !== item.id ? "border-navy bg-navy/5" : "border-gray-100"
                } ${dragId === item.id ? "opacity-40" : ""}`}
              >
                <span
                  onMouseDown={() => setArmedId(item.id)}
                  onMouseUp={() => setArmedId(null)}
                  aria-label="Drag to reorder"
                  title="Drag to reorder"
                  className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <GripVertical size={16} />
                </span>
                <input
                  type="text"
                  value={draft ?? item.label}
                  maxLength={300}
                  onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                  onBlur={() => {
                    if (draft !== undefined && draft.trim() && draft.trim() !== item.label) patch(item.id, { label: draft });
                    else if (draft !== undefined) setDrafts((d) => { const { [item.id]: _drop, ...rest } = d; return rest; });
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="flex-1 min-w-[180px] text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.requirePhoto}
                    disabled={busy}
                    onChange={(e) => patch(item.id, { requirePhoto: e.target.checked })}
                  />
                  Photo required
                </label>
                <button
                  onClick={() => setPendingDelete(item)}
                  disabled={busy}
                  aria-label="Delete item"
                  className="p-1.5 text-gray-300 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input
          type="text"
          value={newLabel}
          maxLength={300}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="New general item, e.g. Wipe baseboards"
          className="flex-1 min-w-[200px] text-sm border border-gray-200 rounded-lg px-2.5 py-2"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={newRequirePhoto} onChange={(e) => setNewRequirePhoto(e.target.checked)} />
          Photo required
        </label>
        <button
          onClick={add}
          disabled={busy || !newLabel.trim()}
          className="flex items-center gap-1 text-sm font-medium text-white bg-navy rounded-lg px-3 py-2 disabled:opacity-40"
        >
          <Plus size={14} /> Add item
        </button>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this item?"
          message={`"${pendingDelete.label}" will be removed from the general checklist. Visits that already started keep it in their checklist.`}
          confirmLabel="Delete"
          danger
          loading={busy}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

// ── Received from cleaners ─────────────────────────────────────────────────────────

function CentralTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [rows, setRows] = useState<CentralSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const status = onlyUnreviewed ? "&status=unreviewed" : "";
    api<{ ok: boolean; submissions: CentralSubmission[] }>(
      `/api/calendar/central-submissions?from=${from}&to=${to}${status}`
    )
      .then((d) => setRows(d.submissions))
      .catch((e: unknown) => { setRows(null); setError(errorMessage(e, "Could not load")); })
      .finally(() => setLoading(false));
  }, [from, to, onlyUnreviewed]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function setReviewed(row: CentralSubmission, reviewed: boolean) {
    try {
      const d = await api<{ ok: boolean; submission: CentralSubmission }>(`/api/calendar/central-submissions/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ reviewed }),
      });
      setRows((prev) => prev?.map((r) => (r.id === row.id ? d.submission : r)) ?? prev);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <DayRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer ml-auto">
          <input type="checkbox" checked={onlyUnreviewed} onChange={(e) => setOnlyUnreviewed(e.target.checked)} />
          Only not reviewed
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
      {loading && !rows && <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
      {!loading && !error && rows?.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
          Nothing received from cleaners in this range.
        </div>
      )}

      {rows?.map((r) => (
        <div
          key={r.id}
          className={`bg-white rounded-2xl border shadow-sm p-4 space-y-2 ${r.reviewedAt ? "border-gray-100" : "border-red-200"}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-400">
                {r.sentBy ?? "Cleaner"} · {fmtDateTime(r.createdAt)}
              </p>
              <h3 className="text-base font-medium text-gray-800 leading-snug">
                {r.clientName ?? r.eventSummary ?? "Visit"}
              </h3>
              {r.clientName && r.eventSummary && <p className="text-xs text-gray-500">{r.eventSummary}</p>}
              {r.location && (
                <p className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                  <MapPin size={12} className="flex-shrink-0" /> {r.location}
                </p>
              )}
              {r.eventStart && <p className="text-xs text-gray-400 mt-0.5">Visit: {fmtDateTime(r.eventStart)}</p>}
            </div>
            <button
              onClick={() => setReviewed(r, !r.reviewedAt)}
              className={`text-xs font-medium rounded-lg px-2.5 py-1.5 border ${
                r.reviewedAt ? "text-gray-500 border-gray-200 hover:bg-gray-50" : "text-white bg-navy border-navy"
              }`}
            >
              {r.reviewedAt ? "Reviewed ✓ (undo)" : "Mark as reviewed"}
            </button>
          </div>
          {r.comment && <p className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg px-3 py-2">{r.comment}</p>}
          <div className="flex flex-wrap gap-1.5">
            {r.photos.map((url) => (
              <button key={url} onClick={() => setViewing(url)} aria-label="View photo">
                <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-gray-200" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {viewing && <PhotoLightbox url={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
