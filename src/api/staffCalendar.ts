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
  /** Groups notes across recurring instances (series_id, or the event's own id if one-off). */
  seriesKey: string;
}

export interface EventNote {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
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

// Daily 2026-09-11 — grilla mensual estilo Google Calendar (6 semanas
// completas, Sunday-aligned, arranca antes/termina después del mes en sí).
// `monthAnchor` puede ser cualquier día del mes que se quiere mostrar.
//
// Se pide en 6 tramos semanales en paralelo, no en un solo request de 42
// días — igual que MonthView de AdminCalendarPage ("Build the 6 week ranges
// that compose the month grid"): un rango único que cruza 3 meses calendario
// (ej. fin de agosto a principios de octubre) vino vacío en pruebas, la capa
// de caché de getEventsForRange (calendarController.js, backend) parece
// asumir rangos acotados a un mes. Se deduplica por id porque un evento
// puede aparecer en dos semanas (no debería pasar acá al ser rangos
// disjuntos de 7 días, pero es gratis y evita sorpresas si cambia el backend).
export async function getStaffMonthEvents(monthAnchor: DateTime): Promise<StaffCalendarEvent[]> {
  const first = monthAnchor.startOf('month');
  const gridStart = first.minus({ days: first.weekday % 7 }); // Sunday-aligned
  const weekFetches = Array.from({ length: 6 }, (_, w) => {
    const wStart = gridStart.plus({ days: w * 7 });
    return getStaffEventsForRange(wStart, wStart.plus({ days: 7 }));
  });
  const weeks = await Promise.all(weekFetches);
  const seen = new Set<string>();
  const all: StaffCalendarEvent[] = [];
  for (const week of weeks) {
    for (const e of week) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        all.push(e);
      }
    }
  }
  return all;
}

// Daily 2026-09-11 — notas de cleaners sobre un evento/serie ("para el
// próximo cleaner"), agrupadas por seriesKey. Compartido con el admin del
// lado de lectura (ver AdminCalendarPage), pero solo el staff puede postear.
export async function getEventNotes(seriesKey: string): Promise<EventNote[]> {
  const params = new URLSearchParams({ seriesKey });
  const data = await staffApi<{ ok: boolean; notes: EventNote[] }>(
    `/api/staff/calendar/events/notes?${params.toString()}`
  );
  return data.notes;
}

export async function addEventNote(seriesKey: string, eventId: string, body: string): Promise<EventNote> {
  const data = await staffApi<{ ok: boolean; note: EventNote }>('/api/staff/calendar/events/notes', {
    method: 'POST',
    body: JSON.stringify({ seriesKey, eventId, body }),
  });
  return data.note;
}
