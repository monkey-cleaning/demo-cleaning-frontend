// LAB423 — fetch wrapper para GET /api/staff/calendar/events (solo lectura).
import { DateTime } from 'luxon';
import { staffApi, isNetworkError } from './staffClient';
import { cachedGet, storeEvents, storedEventsInRange, touchLastSync } from '../offline/cache';
import { compressImage, newClientRef } from '../offline/image';
import {
  enqueueOp,
  pendingOpsForEvent,
  removePendingPhoto,
  uploadToSignedUrl,
  type CentralOp,
  type ChecklistPhotoOp,
  type CompletionOp,
  type QueueOp,
} from '../offline/queue';

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
  /** Non-service events (lunch, blocks): no checklist, no Send to Central. */
  isNonService?: boolean;
  /** Groups notes across recurring instances (recurringEventId, or the event's own id if one-off). */
  seriesKey: string;
}

export interface EventNote {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
}

// LAB463 — trae del servidor y deja copia local; sin conexión arma la respuesta
// con lo guardado (semanas/meses ya vistos o precargados).
export async function fetchStaffEventsRaw(
  start: DateTime,
  end: DateTime,
  refresh = false
): Promise<StaffCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: start.toISO()!,
    timeMax: end.toISO()!,
    // LAB482 — solo cuando el cleaner toca Refresh: le dice al backend que
    // saltee su cache de meses (10 min) y vuelva a preguntarle a Google
    // Calendar. Un evento creado a mano en Google no invalida ese cache, asi
    // que sin esto el boton no traia nada nuevo.
    ...(refresh ? { refresh: '1' } : {}),
  });

  const data = await staffApi<{ ok: boolean; events: StaffCalendarEvent[] }>(
    `/api/staff/calendar/events?${params.toString()}`
  );

  return data.events;
}

async function getStaffEventsForRange(
  start: DateTime,
  end: DateTime,
  refresh = false
): Promise<StaffCalendarEvent[]> {
  try {
    const events = await fetchStaffEventsRaw(start, end, refresh);
    await storeEvents(events);
    void touchLastSync();
    return events;
  } catch (e) {
    if (isNetworkError(e)) {
      return storedEventsInRange<StaffCalendarEvent>(start.toMillis(), end.toMillis());
    }
    throw e;
  }
}

// Trae los eventos del cleaner logueado para la semana que arranca en
// `weekStart` (se lo normaliza a startOf('day') acá, así que alcanza con
// pasar cualquier DateTime dentro de esa semana).
export async function getStaffWeekEvents(
  weekStart: DateTime,
  refresh = false
): Promise<StaffCalendarEvent[]> {
  const start = weekStart.startOf('day');
  return getStaffEventsForRange(start, start.plus({ days: 7 }), refresh);
}

// LAB425 — solo el día pedido, para la sección "Today" del home.
export async function getStaffDayEvents(
  day: DateTime,
  refresh = false
): Promise<StaffCalendarEvent[]> {
  const start = day.startOf('day');
  return getStaffEventsForRange(start, start.plus({ days: 1 }), refresh);
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
export async function getStaffMonthEvents(
  monthAnchor: DateTime,
  refresh = false
): Promise<StaffCalendarEvent[]> {
  const first = monthAnchor.startOf('month');
  const gridStart = first.minus({ days: first.weekday % 7 }); // Sunday-aligned
  const weekFetches = Array.from({ length: 6 }, (_, w) => {
    const wStart = gridStart.plus({ days: w * 7 });
    return getStaffEventsForRange(wStart, wStart.plus({ days: 7 }), refresh);
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
  const data = await cachedGet<{ ok: boolean; notes: EventNote[] }>(notesPath(seriesKey), `notes:${seriesKey}`);
  return data.notes;
}

// Las notas nuevas requieren conexión (no están en la cola offline).
export async function addEventNote(seriesKey: string, eventId: string, body: string): Promise<EventNote> {
  const data = await staffApi<{ ok: boolean; note: EventNote }>('/api/staff/calendar/events/notes', {
    method: 'POST',
    body: JSON.stringify({ seriesKey, eventId, body }),
  });
  return data.note;
}

// LAB457 — checklist de indicaciones cargado por el admin (series_key =
// seriesKey), con check-off y foto por ocurrencia puntual (eventId).
export interface ChecklistPhoto {
  id: string;
  url: string;
  /** LAB463 — foto guardada en el dispositivo, todavía sin enviar. */
  pending?: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  sort_order: number;
  /** LAB462 — item del checklist general (false = específico de esta limpieza). */
  isGeneral: boolean;
  /** LAB462 — no se puede marcar como completed sin al menos una foto. */
  requirePhoto: boolean;
  completed: boolean;
  completedAt: string | null;
  completedBy?: string | null;
  /** LAB463 — el estado de completed todavía no se envió al servidor. */
  pendingSync?: boolean;
  photos: ChecklistPhoto[];
}

const checklistPath = (seriesKey: string, eventId: string) =>
  `/api/staff/calendar/events/checklist?${new URLSearchParams({ seriesKey, eventId }).toString()}`;
const notesPath = (seriesKey: string) =>
  `/api/staff/calendar/events/notes?${new URLSearchParams({ seriesKey }).toString()}`;
const centralPath = (eventId: string) =>
  `/api/staff/calendar/events/central?${new URLSearchParams({ eventId }).toString()}`;

// Las fotos pendientes se muestran desde el archivo local; una URL por foto.
const localUrls = new Map<string, string>();
function localPhotoUrl(clientRef: string, data: ArrayBuffer, type: string): string {
  let url = localUrls.get(clientRef);
  if (!url) {
    url = URL.createObjectURL(new Blob([data], { type: type || 'image/jpeg' }));
    localUrls.set(clientRef, url);
  }
  return url;
}

// Estado del servidor + lo hecho sin conexión que aún no se envió (en orden).
function applyPending(items: ChecklistItem[], ops: QueueOp[]): ChecklistItem[] {
  if (!ops.length) return items;
  const out = items.map((i) => ({ ...i, photos: [...i.photos] }));
  for (const op of ops) {
    if (op.kind === 'completion') {
      const item = out.find((i) => i.id === op.itemId);
      if (item) {
        item.completed = op.completed;
        item.completedAt = op.completed ? op.actedAt : null;
        item.completedBy = null;
        item.pendingSync = true;
      }
    } else if (op.kind === 'checklist-photo') {
      const item = out.find((i) => i.id === op.itemId);
      if (item) {
        item.photos.push({ id: `local-${op.clientRef}`, url: localPhotoUrl(op.clientRef, op.data, op.type), pending: true });
      }
    }
  }
  return out;
}

export async function getChecklist(seriesKey: string, eventId: string): Promise<ChecklistItem[]> {
  const data = await cachedGet<{ ok: boolean; items: ChecklistItem[] }>(
    checklistPath(seriesKey, eventId),
    `checklist:${eventId}`
  );
  return applyPending(data.items, await pendingOpsForEvent(eventId));
}

// Compartido por todo el equipo asignado a la visita — no hay estado
// por-persona, cualquiera puede marcar/desmarcar un item.
//
// LAB463 — con conexión se envía en el momento; sin conexión (o si ya hay
// acciones de esta visita esperando, para respetar el orden) va a la cola.
export async function setChecklistCompletion(
  itemId: string,
  eventId: string,
  completed: boolean
): Promise<Pick<ChecklistItem, 'completed' | 'completedAt' | 'completedBy' | 'pendingSync'>> {
  const actedAt = new Date().toISOString();

  if ((await pendingOpsForEvent(eventId)).length === 0) {
    try {
      const r = await staffApi<Pick<ChecklistItem, 'completed' | 'completedAt' | 'completedBy'>>(
        `/api/staff/calendar/events/checklist/${itemId}/completion`,
        { method: 'PATCH', body: JSON.stringify({ eventId, completed, actedAt }) }
      );
      return { ...r, pendingSync: false };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }

  await enqueueOp<CompletionOp>({ kind: 'completion', eventId, itemId, completed, actedAt });
  return { completed, completedAt: completed ? actedAt : null, completedBy: null, pendingSync: true };
}

// Sube la foto directo a Supabase Storage con una signed URL de un solo uso
// que emite el backend (el staff nunca tiene una key con permiso de
// escritura directa al bucket — ver eventChecklistController.js). Suma una
// foto más al item; NO lo marca como hecho (eso es siempre manual).
//
// LAB463 — la foto se comprime primero; sin conexión queda guardada en el
// dispositivo y se envía sola después. clientRef evita duplicados si un envío
// se repite.
export async function uploadChecklistPhoto(
  itemId: string,
  eventId: string,
  file: File
): Promise<ChecklistPhoto> {
  const blob = await compressImage(file);
  const clientRef = newClientRef();
  const actedAt = new Date().toISOString();

  if ((await pendingOpsForEvent(eventId)).length === 0) {
    try {
      const { path, token } = await staffApi<{ ok: boolean; path: string; token: string }>(
        `/api/staff/calendar/events/checklist/${itemId}/photo-upload-url`,
        { method: 'POST', body: JSON.stringify({ eventId, clientRef, actedAt }) }
      );
      await uploadToSignedUrl(path, token, blob, blob.type);
      const data = await staffApi<{ ok: boolean; photo: ChecklistPhoto }>(
        `/api/staff/calendar/events/checklist/${itemId}/photo`,
        { method: 'PATCH', body: JSON.stringify({ eventId, path, clientRef, actedAt }) }
      );
      return data.photo;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }

  const data = await blob.arrayBuffer();
  await enqueueOp<ChecklistPhotoOp>({ kind: 'checklist-photo', eventId, itemId, clientRef, actedAt, data, type: blob.type });
  return { id: `local-${clientRef}`, url: localPhotoUrl(clientRef, data, blob.type), pending: true };
}

export async function deleteChecklistPhoto(itemId: string, photoId: string): Promise<void> {
  // Foto que todavía no salió del teléfono: alcanza con sacarla de la cola.
  if (photoId.startsWith('local-')) {
    await removePendingPhoto(photoId.slice('local-'.length));
    return;
  }
  // Borrar una foto ya enviada requiere conexión.
  await staffApi(`/api/staff/calendar/events/checklist/${itemId}/photos/${photoId}`, {
    method: 'DELETE',
  });
}

// LAB462 — "Send to Central": fotos + comentario a la oficina, fuera del
// checklist. Mismo patrón de signed upload URL que las fotos del checklist.
export interface CentralSubmission {
  id: string;
  eventId: string;
  sentBy: string | null;
  comment: string | null;
  photos: string[];
  createdAt: string;
  /** LAB463 — guardado en el dispositivo, todavía sin enviar. */
  pending?: boolean;
}

export async function getCentralSubmissions(eventId: string): Promise<CentralSubmission[]> {
  const data = await cachedGet<{ ok: boolean; submissions: CentralSubmission[] }>(
    centralPath(eventId),
    `central:${eventId}`
  );
  const queued = (await pendingOpsForEvent(eventId)).filter((o): o is CentralOp => o.kind === 'central');
  const local: CentralSubmission[] = queued.map((o) => ({
    id: `local-${o.clientRef}`,
    eventId,
    sentBy: null,
    comment: o.comment || null,
    photos: o.photos.map((p, i) => localPhotoUrl(`${o.clientRef}-${i}`, p.data, p.type)),
    createdAt: o.actedAt,
    pending: true,
  }));
  return [...data.submissions, ...local];
}

export async function sendToCentral(
  eventId: string,
  files: File[],
  comment: string
): Promise<CentralSubmission> {
  const blobs = await Promise.all(files.map((f) => compressImage(f)));
  const clientRef = newClientRef();
  const actedAt = new Date().toISOString();

  if ((await pendingOpsForEvent(eventId)).length === 0) {
    try {
      const paths: string[] = [];
      for (let i = 0; i < blobs.length; i++) {
        const { path, token } = await staffApi<{ ok: boolean; path: string; token: string }>(
          '/api/staff/calendar/events/central/photo-upload-url',
          { method: 'POST', body: JSON.stringify({ eventId, clientRef, index: i, actedAt }) }
        );
        await uploadToSignedUrl(path, token, blobs[i], blobs[i].type);
        paths.push(path);
      }
      const data = await staffApi<{ ok: boolean; submission: CentralSubmission }>(
        '/api/staff/calendar/events/central',
        { method: 'POST', body: JSON.stringify({ eventId, comment, paths, clientRef, actedAt }) }
      );
      return data.submission;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }

  const photos = await Promise.all(blobs.map(async (b) => ({ data: await b.arrayBuffer(), type: b.type })));
  await enqueueOp<CentralOp>({ kind: 'central', eventId, clientRef, actedAt, comment, photos });
  return {
    id: `local-${clientRef}`,
    eventId,
    sentBy: null,
    comment: comment || null,
    photos: photos.map((p, i) => localPhotoUrl(`${clientRef}-${i}`, p.data, p.type)),
    createdAt: actedAt,
    pending: true,
  };
}

// LAB463 — precarga de una visita: deja en el caché local su checklist, las
// notas del próximo cleaner y lo ya enviado a central.
export async function refreshEventDetails(event: StaffCalendarEvent): Promise<void> {
  await Promise.all([
    cachedGet(checklistPath(event.seriesKey, event.id), `checklist:${event.id}`),
    cachedGet(notesPath(event.seriesKey), `notes:${event.seriesKey}`),
    cachedGet(centralPath(event.id), `central:${event.id}`),
  ]);
}
