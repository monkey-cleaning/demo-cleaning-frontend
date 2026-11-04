// LAB463 — precarga: al abrir la app con conexión se guarda lo que el cleaner
// va a necesitar sin señal: sus visitas de hoy y de las próximas semanas, y de
// las próximas visitas el detalle (instrucciones, checklist, notas).
import { DateTime } from 'luxon';
import { fetchStaffEventsRaw, refreshEventDetails, type StaffCalendarEvent } from '../api/staffCalendar';
import { getStaffHoursSummary } from '../api/staffHours';
import { isNetworkError, isAuthError } from '../api/staffClient';
import { storeEvents, touchLastSync } from './cache';
import { bumpSyncTick, patchStatus } from './status';
import { TZ } from '../lib/timezone';

const DAYS_BACK = 1;
const DAYS_AHEAD = 21; // eventos: 3 semanas
const DETAIL_DAYS = 4; // detalle (checklist, notas): hoy + 3 días
const POOL = 4;
const MIN_INTERVAL_MS = 2 * 60_000;

let inFlight: Promise<void> | null = null;
let lastRun = 0;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      // Un detalle que falla no debe tirar abajo toda la precarga.
      await fn(item).catch(() => undefined);
    }
  });
  await Promise.all(workers);
}

export function prefetchStaffData(opts: { force?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight;
  if (!opts.force && Date.now() - lastRun < MIN_INTERVAL_MS) return Promise.resolve();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();

  inFlight = (async () => {
    try {
      const today = DateTime.now().setZone(TZ).startOf('day');
      const windowStart = today.minus({ days: DAYS_BACK });
      const windowEnd = today.plus({ days: DAYS_AHEAD });

      // Tramos semanales en paralelo (el backend cachea por mes; ver el mismo
      // criterio en getStaffMonthEvents).
      const weeks: [DateTime, DateTime][] = [];
      for (let s = windowStart; s < windowEnd; s = s.plus({ days: 7 })) {
        weeks.push([s, s.plus({ days: 7 }) < windowEnd ? s.plus({ days: 7 }) : windowEnd]);
      }
      const results = await Promise.all(weeks.map(([a, b]) => fetchStaffEventsRaw(a, b)));
      const seen = new Set<string>();
      const events: StaffCalendarEvent[] = [];
      for (const w of results) {
        for (const e of w) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            events.push(e);
          }
        }
      }
      await storeEvents(events, { startMs: windowStart.toMillis(), endMs: windowEnd.toMillis() });

      // Detalle de las visitas cercanas.
      const detailEnd = today.plus({ days: DETAIL_DAYS }).toMillis();
      const near = events.filter(
        (e) => !e.isNonService && new Date(e.startIso).getTime() < detailEnd && new Date(e.endIso) >= new Date()
      );
      await pool(near, POOL, refreshEventDetails);

      // Home: horas de la quincena actual y la anterior.
      await Promise.all([getStaffHoursSummary('current').catch(() => undefined), getStaffHoursSummary('previous').catch(() => undefined)]);

      lastRun = Date.now();
      await touchLastSync();
      bumpSyncTick();
    } catch (e) {
      // Sin conexión o sesión vencida: lo ya guardado sigue disponible.
      if (isAuthError(e)) patchStatus({ authExpired: true });
      else if (!isNetworkError(e)) console.warn('Offline prefetch failed:', e);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
