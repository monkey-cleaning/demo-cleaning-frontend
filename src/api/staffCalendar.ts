// LAB423 — fetch wrapper para GET /api/staff/calendar/events (solo lectura).
import { DateTime } from 'luxon';
import { staffApi } from './staffClient';

export interface StaffCalendarEvent {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  startDate: string;
  durationH: number;
  location: string | null;
  /** Raw HTML from the GCal description, internal tags already stripped server-side
   *  (see sanitizeNotes) — still needs htmlToPlainText() before rendering. */
  notes: string | null;
  /** Real names (employees.name), not emails — resolved server-side. */
  teammates: string[];
  isRecurring: boolean;
}

async function getStaffEventsForRange(
  start: DateTime,
  end: DateTime
): Promise<StaffCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: start.toISO()!,
    timeMax: end.toISO()!,
  });

  const data = await staffApi<{ ok: boolean; events: StaffCalendarEvent[] }>(
    `/api/staff/calendar/events?${params.toString()}`
  );

  return data.events;
}

// Trae los eventos del cleaner logueado para la semana que arranca en
// `weekStart` (se lo normaliza a startOf('day') acá, así que alcanza con
// pasar cualquier DateTime dentro de esa semana).
export async function getStaffWeekEvents(
  weekStart: DateTime
): Promise<StaffCalendarEvent[]> {
  const start = weekStart.startOf('day');
  return getStaffEventsForRange(start, start.plus({ days: 7 }));
}

// LAB425 — solo el día pedido, para la sección "Today" del home.
export async function getStaffDayEvents(day: DateTime): Promise<StaffCalendarEvent[]> {
  const start = day.startOf('day');
  return getStaffEventsForRange(start, start.plus({ days: 1 }));
}
