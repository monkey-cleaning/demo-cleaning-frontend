// Thin fetch wrapper for the calendar REST endpoints.
// All requests are authenticated via the JWT cookie/header
// that the existing API client pattern already injects.
import { DateTime } from "luxon";

const BASE = "/api/calendar";
const TZ = "America/Vancouver";

// ── Shape returned by calendarController's mapEvent() ────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  colorId: string | null;
  color: string;
  teamId: string | null;
  teamLabel: string | null;
  isAllDay: boolean;
  startIso: string;
  endIso: string;
  startDate: string;
  startHour: number;
  endHour: number;
  durationH: number;
  organizer: string | null;
  attendees: string[];
  htmlLink: string | null;
  /** Derived on the frontend from the event summary / description */
  serviceType?: string;
}

// ── Service-type detection ────────────────────────────────────────────────────
//
// The GCal events don't carry an explicit serviceType field yet (E6-S3 will
// add it). In the meantime we infer it from the event summary, matching the
// same keywords used in the CalendarPage badge renderer.

const SERVICE_TYPE_PATTERNS: [RegExp, string][] = [
  [/\bcommercial\b/i,         "Commercial"],
  [/\bpost.?const/i,          "Post-construction"],
  [/\bspecial\b/i,            "Special"],
  [/\bresidential\b/i,        "Residential"],
];

export function inferServiceType(summary: string): string {
  for (const [re, label] of SERVICE_TYPE_PATTERNS) {
    if (re.test(summary)) return label;
  }
  return "Residential"; // sensible default for Monkey Cleaning
}

// ── getTodayEvents ────────────────────────────────────────────────────────────
//
// Reuses GET /api/calendar/events with a [startOfDay, endOfDay] window.
// The controller's cache layer means this is essentially free after the first
// calendar page load that warmed the month.

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  // Build ISO bounds for today in the local browser timezone.
  // The backend will re-interpret them in BOOKING_TIMEZONE, which is fine
  // because we only need same-calendar-day accuracy.
  const now      = new Date();
  const startDay = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  const endDay   = new Date(now);
  endDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: startDay.toISOString(),
    timeMax: endDay.toISOString(),
  });

  const res = await fetch(`${BASE}/events?${params}`, {
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Calendar API error ${res.status}`);
  }

  const data = await res.json() as { ok: boolean; events: CalendarEvent[] };

  // Attach inferred serviceType and sort by start time
  return data.events
    .map(e => ({ ...e, serviceType: inferServiceType(e.summary) }))
    .sort((a, b) => a.startIso.localeCompare(b.startIso));
}

// ── generateCandidateSlots ───────────────────────────────────────────────────
//
// LAB-233: calcula las fechas candidatas de una serie recurrente (semanal,
// quincenal, mensual) sin pegarle a Google Calendar — misma matemática que
// buildRRule() en el backend (mismo día de semana/mes que el Start, mismo
// tope por defecto de 1 año si no hay count/until explícito). Se usa para el
// pre-check de conflictos en EventFormModal antes de confirmar la creación.

export interface RecurrenceInput {
  freq: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  count?: number;
  until?: string; // ISO date
}

export interface CandidateSlot {
  startIso: string;
  endIso: string;
}

export function generateCandidateSlots(
  startIso: string,
  endIso: string,
  recurrence: RecurrenceInput,
): CandidateSlot[] {
  const start = DateTime.fromISO(startIso, { zone: TZ });
  const end = DateTime.fromISO(endIso, { zone: TZ });
  const durationMs = end.toMillis() - start.toMillis();
  const cap = recurrence.until
    ? DateTime.fromISO(recurrence.until, { zone: TZ }).endOf("day")
    : DateTime.now().setZone(TZ).plus({ years: 1 });
  const maxCount = recurrence.count ?? Infinity;

  const slots: CandidateSlot[] = [];
  let cursor = start;
  let n = 0;

  while (n < maxCount && cursor <= cap) {
    slots.push({
      startIso: cursor.toISO()!,
      endIso: cursor.plus({ milliseconds: durationMs }).toISO()!,
    });
    n++;

    if (recurrence.freq === "WEEKLY") {
      cursor = cursor.plus({ weeks: 1 });
    } else if (recurrence.freq === "BIWEEKLY") {
      cursor = cursor.plus({ weeks: 2 });
    } else {
      // MONTHLY, mismo día del mes que el Start — RFC 5545 SALTEA meses
      // donde ese día no existe (ej. día 31), no lo "clampea" a fin de mes.
      let probe = cursor.plus({ months: 1 }).set({ day: 1 });
      while (probe.daysInMonth! < start.day) probe = probe.plus({ months: 1 }).set({ day: 1 });
      cursor = probe.set({
        day: start.day, hour: start.hour, minute: start.minute, second: 0, millisecond: 0,
      });
    }
  }
  return slots;
}