// Thin fetch wrapper for the calendar REST endpoints.
// All requests are authenticated via the JWT cookie/header
// that the existing API client pattern already injects.
import { DateTime } from "luxon";
import { occurrenceDates, type MonthlyOption, type RecurrencePattern, type Weekday } from "../lib/recurrence";

import { TZ } from '../lib/timezone';
const BASE = "/api/calendar";

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
// LAB-233: calcula las fechas candidatas de una serie recurrente sin pegarle a
// Google Calendar, para el pre-check de conflictos en EventFormModal antes de
// confirmar la creación. LAB617: ahora soporta cada N semanas, varios días de
// la semana y "n-ésimo día de la semana del mes" — la matemática de fechas
// vive en lib/recurrence.ts (espejo de buildRRule() del backend).

export interface RecurrenceInput {
  /** BIWEEKLY se mantiene por compatibilidad: equivale a WEEKLY con interval 2. */
  freq: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  interval?: number;
  /** Solo WEEKLY: días de la semana (por defecto, el del Start). */
  byDay?: Weekday[];
  /** Solo MONTHLY: mismo número de día, o "primer lunes", "último viernes"… */
  monthly?: MonthlyOption;
  count?: number;
  until?: string; // ISO date
  /** "Never": sin COUNT ni UNTIL, como Google Calendar. Sin fin ni esto el backend corta al año. */
  endless?: boolean;
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
  if (!start.isValid || !end.isValid) return [];
  const durationMs = end.toMillis() - start.toMillis();

  const pattern: RecurrencePattern = {
    freq: recurrence.freq === "MONTHLY" ? "MONTHLY" : "WEEKLY",
    interval: recurrence.freq === "BIWEEKLY" ? 2 : (recurrence.interval ?? 1),
    byDay: recurrence.byDay,
    monthly: recurrence.monthly,
  };
  let untilDate: string | null = null;
  if (recurrence.until) {
    const u = DateTime.fromISO(recurrence.until, { zone: TZ });
    if (!u.isValid) return [];
    untilDate = u.toISODate();
  }

  // occurrenceDates ya aplica el tope de seguridad (un Start absurdo, p. ej.
  // año 0002 a medio tipear, o un "until" lejano generaría cientos de miles de
  // slots y congelaría la página).
  const time = start.toFormat("HH:mm");
  return occurrenceDates(pattern, start.toISODate()!, { count: recurrence.count ?? null, untilDate }).map(date => {
    const s = DateTime.fromISO(`${date}T${time}`, { zone: TZ });
    return {
      startIso: s.toISO()!,
      endIso: s.plus({ milliseconds: durationMs }).toISO()!,
    };
  });
}
