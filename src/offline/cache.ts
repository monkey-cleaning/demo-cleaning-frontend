// LAB463 — lecturas con caché local. Red primero; si no hay conexión, lo último
// que se guardó. Así la app abre y muestra eventos, instrucciones y checklist
// sin señal.
import { staffApi, isNetworkError } from '../api/staffClient';
import { kvGet, kvSet, eventsAll, eventsPutMany, eventsDeleteMany } from './db';
import { patchStatus } from './status';

const LAST_SYNC_KEY = 'meta:lastSync';

/** GET con respaldo local: guarda cada respuesta y la devuelve si no hay red. */
export async function cachedGet<T>(path: string, key: string = path): Promise<T> {
  try {
    const data = await staffApi<T>(path);
    kvSet(key, data).catch(() => {
      /* sin almacenamiento local (modo privado…): la app sigue online-only */
    });
    return data;
  } catch (e) {
    if (isNetworkError(e)) {
      const hit = await kvGet<T>(key).catch(() => undefined);
      if (hit) return hit.value;
    }
    throw e;
  }
}

/** Solo lectura del caché (sin tocar la red). */
export async function cachedOnly<T>(key: string): Promise<T | undefined> {
  return (await kvGet<T>(key).catch(() => undefined))?.value;
}

// ── Última sincronización ───────────────────────────────────────────────────
export async function touchLastSync(): Promise<void> {
  const now = Date.now();
  patchStatus({ lastSyncAt: now });
  await kvSet(LAST_SYNC_KEY, now).catch(() => {});
}

export async function loadLastSync(): Promise<void> {
  const hit = await kvGet<number>(LAST_SYNC_KEY).catch(() => undefined);
  if (hit) patchStatus({ lastSyncAt: hit.value });
}

// ── Eventos de calendario ───────────────────────────────────────────────────
// Se guardan por id para poder armar cualquier semana/mes ya visto sin red. Las
// pantallas piden rangos distintos (semana, mes de 6 semanas, hoy) y un caché
// por URL no serviría: el mismo día cae en URLs distintas según la vista.
interface StoredEvent {
  id: string;
  startIso: string;
  endIso: string;
}

export async function storeEvents<T extends StoredEvent>(
  events: T[],
  replaceRange?: { startMs: number; endMs: number }
): Promise<void> {
  try {
    if (replaceRange) {
      // Prefetch: los eventos de la ventana que ya no vinieron (cancelados,
      // reasignados a otra persona) salen del caché.
      const keep = new Set(events.map((e) => e.id));
      const stale = (await eventsAll<T>())
        .filter((e) => overlaps(e, replaceRange.startMs, replaceRange.endMs) && !keep.has(e.id))
        .map((e) => e.id);
      await eventsDeleteMany(stale);
    }
    await eventsPutMany(events);
  } catch {
    /* sin almacenamiento local */
  }
}

export async function storedEventsInRange<T extends StoredEvent>(startMs: number, endMs: number): Promise<T[]> {
  try {
    return (await eventsAll<T>()).filter((e) => overlaps(e, startMs, endMs));
  } catch {
    return [];
  }
}

function overlaps(e: StoredEvent, startMs: number, endMs: number): boolean {
  return new Date(e.startIso).getTime() < endMs && new Date(e.endIso).getTime() > startMs;
}
