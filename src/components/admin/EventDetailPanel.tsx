/**
 * A slide-in side panel (right edge) that shows the full detail of a
 * CalEvent, replacing the small EventDetailPopover for richer views.
 *
 * Features
 * ────────
 * • Team badge — color-coded chip with team label (team_1 / team_2)
 * • Assigned cleaners — parsed from the description "Team: …" line,
 *   with a ★ for the first name (leader)
 * • Date / time, location, notes
 * • Edit / Assign / Delete / Open-in-GCal action buttons
 * • Keyboard: Escape closes
 *
 * Usage
 * ─────
 * import EventDetailPanel from "@/components/admin/EventDetailPanel";
 *
 * {selectedEvent && (
 *   <EventDetailPanel
 *     event={selectedEvent}
 *     onClose={() => setSelectedEvent(null)}
 *     onEdit={setEditingEvent}
 *     onAssign={setAssigningEvent}
 *     onDelete={handleEventDeleted}
 *   />
 * )}
 */

import { useEffect, useRef, useState } from "react";
import {
  X,
  Pencil,
  Trash2,
  Users,
  ExternalLink,
  MapPin,
  Calendar,
  Clock,
  FileText,
} from "lucide-react";
import { Loader2 } from "lucide-react";

// ── Shared CalEvent type (must stay in sync with AdminCalendarPage) ───────────

export interface CalEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  color: string;
  colorId: string | null;
  teamId: string | null;
  teamLabel: string | null;
  teamEmoji: string | null;
  isAllDay: boolean;
  startIso: string;
  endIso: string;
  startDate: string;
  startHour: number;
  endHour: number;
  durationH: number;
  organizer: string | null;
  attendees: string[];
  clientId: string | null;
  htmlLink: string | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

function authHeaders() {
  const token =
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("admin_blog_token")
      : null) ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiDeleteEvent(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/calendar/events/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? `HTTP ${res.status}`);
  }
}

async function apiFetchClient(id: string): Promise<{ id: string; notes: string | null }> {
  const res = await fetch(`${API_BASE}/api/admin/clients/${id}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.client;
}

// ── client_id / event notes helpers (must stay in sync with AdminCalendarPage) ─

const CLIENT_ID_RE = /client_id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const CLIENT_ID_LINE_RE = /^.*client_id:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}.*$/im;

function extractClientId(event: CalEvent): string | null {
  return event.clientId ?? event.description?.match(CLIENT_ID_RE)?.[1] ?? null;
}

function stripClientIdLine(description: string | null | undefined): string {
  if (!description) return "";
  return description.replace(CLIENT_ID_LINE_RE, "").replace(/\n{2,}/g, "\n").trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDuration(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

/** Parse "Team: Name1, Name2" from description */
function parseAssignedNames(description: string | null): string[] {
  if (!description) return [];
  const m = description.match(/Team:\s*(.+)/);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

// ── TeamBadge ─────────────────────────────────────────────────────────────────

function TeamBadge({ teamId, teamLabel, teamColor, teamEmoji }: {
  teamId: string;
  teamLabel: string | null;
  teamColor: string;
  teamEmoji: string | null;
}) {
  const label = teamLabel ?? teamId;
  const color = teamColor;
  const emoji = teamEmoji ?? "⚫";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: `${color}18`, color }}
    >
      <span className="text-[11px] leading-none">{emoji}</span>
      {label}
    </span>
  );
}

// ── CleanerList ───────────────────────────────────────────────────────────────

function CleanerList({ names }: { names: string[] }) {
  if (names.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">No cleaner assigned yet</p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name, i) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full"
        >
          {i === 0 && (
            <span className="text-amber-400 text-[9px] leading-none">★</span>
          )}
          {name}
        </span>
      ))}
    </div>
  );
}

// ── EventDetailPanel ──────────────────────────────────────────────────────────

interface EventDetailPanelProps {
  event: CalEvent;
  onClose: () => void;
  onEdit: (e: CalEvent) => void;
  onAssign: (e: CalEvent) => void;
  onDelete: (id: string) => void;
}

export default function EventDetailPanel({
  event,
  onClose,
  onEdit,
  onAssign,
  onDelete,
}: EventDetailPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // notes — permanent client/location notes, fetched read-only for
  // quick reference. Edited from the event form, ClientFormModal, or ClientDrawer.
  const clientId = extractClientId(event);
  const [clientNotes, setClientNotes] = useState<string | null>(null);
  const [loadingClientNotes, setLoadingClientNotes] = useState(false);

  useEffect(() => {
    if (!clientId) { setClientNotes(null); return; }
    setLoadingClientNotes(true);
    apiFetchClient(clientId)
      .then(c => setClientNotes(c.notes ?? ""))
      .catch(() => setClientNotes(null))
      .finally(() => setLoadingClientNotes(false));
  }, [clientId]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Slight delay so the opening click doesn't immediately close
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 60);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDeleteEvent(event.id);
      onDelete(event.id);
      onClose();
    } catch (e: any) {
      setDeleteError(e.message ?? "Delete failed");
      setDeleting(false);
    }
  }

  const assignedNames = parseAssignedNames(event.description);
  const hasTeam = !!event.teamId;
  const timeStr = event.isAllDay
    ? "All day"
    : `${fmtTime(event.startIso)} – ${fmtTime(event.endIso)}`;

  // Event notes: description without the "Team: …" management line and
  // without the hidden "client_id: …" marker line.
  const displayDesc = stripClientIdLine(
    event.description ? event.description.replace(/Team:.*(\n|$)/g, "").trim() : null
  ) || null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/10" aria-hidden />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 bottom-0 z-[70] w-full max-w-sm bg-white shadow-[−8px_0_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden"
        style={{ borderLeft: `4px solid ${event.color}` }}
      >
        {/* ── Color header strip ── */}
        <div
          className="h-1.5 flex-shrink-0"
          style={{ background: event.color }}
        />

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onEdit(event); onClose(); }}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              title="Edit event"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => { onAssign(event); onClose(); }}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              title="Assign team"
            >
              <Users size={15} />
            </button>
            {event.htmlLink && (
              <a
                href={event.htmlLink}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                title="Open in Google Calendar"
              >
                <ExternalLink size={15} />
              </a>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Delete flow */}
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-medium py-1.5 px-3 rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {deleting && <Loader2 size={11} className="animate-spin" />}
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs py-1.5 px-3 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors ml-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-5">

          {/* Title + team badge */}
          <div className="space-y-2 pt-1">
            <h2 className="text-xl font-medium text-gray-900 leading-snug">
              {event.summary}
            </h2>
            {hasTeam ? (
              <TeamBadge
                teamId={event.teamId!}
                teamLabel={event.teamLabel}
                teamColor={event.color}
                teamEmoji={event.teamEmoji}
              />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                ⚠ No team assigned
              </span>
            )}
          </div>

          {/* Date / time */}
          <div className="flex items-start gap-3 text-sm text-gray-600">
            <Calendar size={15} className="mt-0.5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="font-medium text-gray-800">{fmtDate(event.startIso)}</p>
              <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5">
                <Clock size={11} className="flex-shrink-0" />
                {timeStr}
                {!event.isAllDay && (
                  <span className="ml-1 text-gray-400">
                    ({fmtDuration(event.durationH)})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <MapPin size={15} className="mt-0.5 text-gray-400 flex-shrink-0" />
              <p>{event.location}</p>
            </div>
          )}

          {/* ── Cleaners section ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Assigned cleaners
              </p>
              <button
                onClick={() => { onAssign(event); onClose(); }}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                {assignedNames.length > 0 ? "Reassign" : "Assign"}
              </button>
            </div>
            <CleanerList names={assignedNames} />
          </div>

          {/* ── Team section ── */}
          {hasTeam && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Team
              </p>
              <div
                className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                style={{
                  background: `${event.color}12`,
                  borderLeft: `3px solid ${event.color}`,
                }}
              >
                <span className="text-sm leading-none">
                  {event.teamEmoji ?? "⚫"}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: event.color }}
                >
                  {event.teamLabel ?? event.teamId}
                </span>
              </div>
            </div>
          )}

          {/* Client notes — permanent, read-only reference (edit in the event
              form, ClientFormModal, or ClientDrawer) */}
          {clientId && (loadingClientNotes || clientNotes) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Client notes
              </p>
              <div className="flex items-start gap-2.5">
                <FileText size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
                {loadingClientNotes ? (
                  <p className="text-sm text-gray-400 italic">Loading…</p>
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                    {clientNotes}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Event notes — specific to this visit */}
          {displayDesc && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Event notes
              </p>
              <div className="flex items-start gap-2.5">
                <FileText size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                  {displayDesc}
                </p>
              </div>
            </div>
          )}

          {/* Attendees (e-mails) */}
          {event.attendees.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Attendees
              </p>
              <div className="flex items-start gap-2.5">
                <Users size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  {event.attendees.slice(0, 6).join(", ")}
                  {event.attendees.length > 6 &&
                    ` +${event.attendees.length - 6} more`}
                </p>
              </div>
            </div>
          )}

          {/* Delete error */}
          {deleteError && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {deleteError}
            </p>
          )}
        </div>

        {/* ── Footer quick-action ── */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100">
          <button
            onClick={() => { onAssign(event); onClose(); }}
            className="w-full py-2.5 text-sm font-medium rounded-xl text-white flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            style={{ background: event.color }}
          >
            <Users size={14} />
            {assignedNames.length > 0 ? "Reassign cleaners" : "Assign cleaners"}
          </button>
        </div>
      </div>
    </>
  );
}