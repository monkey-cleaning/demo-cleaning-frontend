// LAB463 — cola de sincronización. Las acciones que el cleaner hace sin
// conexión (marcar un item, foto del checklist, "Other photos") se guardan
// acá en IndexedDB y se envían solas al volver la red.
//
// Garantías:
//   * Orden: se procesan en el orden en que se hicieron (FIFO). Una foto va
//     antes que el "completed" del mismo item, así la regla de foto
//     obligatoria del backend se cumple al sincronizar.
//   * Sin duplicados: cada foto / envío lleva un clientRef (UUID) y el backend
//     devuelve el registro existente si ya lo guardó (un reintento tras una
//     respuesta perdida no crea otro ni manda otro mail).
//   * Hora real: cada acción lleva actedAt; el backend valida la ventana de
//     edición y "última acción gana" con esa hora, no con la de la sincronización.
//   * Sin pérdida: solo se borra una acción de la cola cuando el servidor la
//     confirmó. Si el servidor la rechaza (visita cerrada, item borrado…)
//     queda como "failed" a la vista del cleaner, no desaparece en silencio.
import { supabase } from '../lib/supabaseClient';
import { staffApi, isNetworkError, isAuthError, parseApiError, NetworkError } from '../api/staffClient';
import { queueAdd, queueAll, queuePut, queueDelete } from './db';
import { patchStatus, bumpSyncTick, getStatus } from './status';

const BUCKET = 'checklist-photos';

interface BaseOp {
  seq?: number;
  eventId: string;
  /** Hora real de la acción (ISO). */
  actedAt: string;
  status: 'pending' | 'failed';
  attempts: number;
  error?: string;
}

export interface CompletionOp extends BaseOp {
  kind: 'completion';
  itemId: string;
  completed: boolean;
}

export interface ChecklistPhotoOp extends BaseOp {
  kind: 'checklist-photo';
  itemId: string;
  clientRef: string;
  data: ArrayBuffer;
  type: string;
}

export interface CentralOp extends BaseOp {
  kind: 'central';
  clientRef: string;
  comment: string;
  photos: { data: ArrayBuffer; type: string }[];
}

export type QueueOp = CompletionOp | ChecklistPhotoOp | CentralOp;

// ── Alta / consulta ─────────────────────────────────────────────────────────
export async function enqueueOp<T extends QueueOp>(op: Omit<T, 'seq' | 'status' | 'attempts'>): Promise<void> {
  try {
    await queueAdd({ ...op, status: 'pending', attempts: 0 });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('Not enough storage space on this device to save it for later.');
    }
    throw new Error('Could not save this for later. Please try again.');
  }
  await refreshCounts();
}

export async function listOps(): Promise<QueueOp[]> {
  try {
    return await queueAll<QueueOp>();
  } catch {
    return [];
  }
}

/** Acciones aún por enviar de una visita (las "failed" no cuentan). */
export async function pendingOpsForEvent(eventId: string): Promise<QueueOp[]> {
  return (await listOps()).filter((o) => o.eventId === eventId && o.status === 'pending');
}

export async function removeOp(seq: number): Promise<void> {
  await queueDelete(seq);
  await refreshCounts();
}

/** Borra una foto que todavía no se envió (el cleaner la quitó antes de tener señal). */
export async function removePendingPhoto(clientRef: string): Promise<void> {
  const op = (await listOps()).find((o) => o.kind === 'checklist-photo' && o.clientRef === clientRef);
  if (op?.seq !== undefined) await removeOp(op.seq);
}

export async function refreshCounts(): Promise<void> {
  const ops = await listOps();
  patchStatus({
    pending: ops.filter((o) => o.status === 'pending').length,
    failed: ops.filter((o) => o.status === 'failed').length,
  });
}

export async function failedOps(): Promise<QueueOp[]> {
  return (await listOps()).filter((o) => o.status === 'failed');
}

export async function retryFailedOps(): Promise<void> {
  for (const op of await failedOps()) {
    await queuePut({ ...op, status: 'pending', attempts: 0, error: undefined });
  }
  await refreshCounts();
  void flushQueue();
}

export async function discardFailedOps(): Promise<void> {
  for (const op of await failedOps()) {
    if (op.seq !== undefined) await queueDelete(op.seq);
  }
  await refreshCounts();
  bumpSyncTick();
}

export function describeOp(op: QueueOp): string {
  switch (op.kind) {
    case 'completion':
      return op.completed ? 'Checklist item marked as completed' : 'Checklist item unmarked';
    case 'checklist-photo':
      return 'Checklist photo';
    case 'central':
      return `Other photos (${op.photos.length})`;
  }
}

// ── Envío al servidor ───────────────────────────────────────────────────────
export async function uploadToSignedUrl(
  path: string,
  token: string,
  data: ArrayBuffer | Blob,
  type: string
): Promise<void> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'image/jpeg' });
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, blob, { upsert: true, contentType: blob.type });
  if (!error) return;
  const status = (error as { status?: number; statusCode?: string | number }).status;
  const statusCode = Number((error as { statusCode?: string | number }).statusCode);
  const code = Number.isFinite(status) && status ? status : Number.isFinite(statusCode) ? statusCode : undefined;
  // Sin código HTTP = el fetch ni salió (sin señal). 5xx = Storage caído, se reintenta.
  if (code === undefined || code >= 500) throw new NetworkError();
  throw new Error(`API ${code} - ${JSON.stringify({ error: `Photo upload failed: ${error.message}` })}`);
}

async function sendCompletion(op: CompletionOp): Promise<void> {
  await staffApi(`/api/staff/calendar/events/checklist/${op.itemId}/completion`, {
    method: 'PATCH',
    body: JSON.stringify({ eventId: op.eventId, completed: op.completed, actedAt: op.actedAt }),
  });
}

async function sendChecklistPhoto(op: ChecklistPhotoOp): Promise<void> {
  const { path, token } = await staffApi<{ path: string; token: string }>(
    `/api/staff/calendar/events/checklist/${op.itemId}/photo-upload-url`,
    { method: 'POST', body: JSON.stringify({ eventId: op.eventId, clientRef: op.clientRef, actedAt: op.actedAt }) }
  );
  await uploadToSignedUrl(path, token, op.data, op.type);
  await staffApi(`/api/staff/calendar/events/checklist/${op.itemId}/photo`, {
    method: 'PATCH',
    body: JSON.stringify({ eventId: op.eventId, path, clientRef: op.clientRef, actedAt: op.actedAt }),
  });
}

async function sendCentral(op: CentralOp): Promise<void> {
  const paths: string[] = [];
  for (let i = 0; i < op.photos.length; i++) {
    const { path, token } = await staffApi<{ path: string; token: string }>(
      '/api/staff/calendar/events/central/photo-upload-url',
      { method: 'POST', body: JSON.stringify({ eventId: op.eventId, clientRef: op.clientRef, index: i, actedAt: op.actedAt }) }
    );
    await uploadToSignedUrl(path, token, op.photos[i].data, op.photos[i].type);
    paths.push(path);
  }
  await staffApi('/api/staff/calendar/events/central', {
    method: 'POST',
    body: JSON.stringify({
      eventId: op.eventId,
      comment: op.comment,
      paths,
      clientRef: op.clientRef,
      actedAt: op.actedAt,
    }),
  });
}

async function sendOp(op: QueueOp): Promise<void> {
  switch (op.kind) {
    case 'completion':
      return sendCompletion(op);
    case 'checklist-photo':
      return sendChecklistPhoto(op);
    case 'central':
      return sendCentral(op);
  }
}

// ── Sincronización ──────────────────────────────────────────────────────────
let flushing = false;

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T | undefined> {
  // Web Locks evita que dos pestañas envíen la misma cola a la vez (el backend
  // ya es idempotente, esto solo ahorra tráfico). Safari <15.4: sin lock.
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return fn();
  return locks.request('staff-sync', { ifAvailable: true }, async (lock) => (lock ? fn() : undefined));
}

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    await withCrossTabLock(async () => {
      patchStatus({ syncing: true });
      let changed = false;
      const ops = (await listOps()).filter((o) => o.status === 'pending');

      for (const op of ops) {
        try {
          await sendOp(op);
          if (op.seq !== undefined) await queueDelete(op.seq);
          changed = true;
        } catch (e) {
          if (isNetworkError(e)) break; // sin conexión: quedan en cola, se reintenta al volver
          if (isAuthError(e)) {
            patchStatus({ authExpired: true });
            break; // hace falta volver a iniciar sesión; la cola se conserva
          }
          const parsed = parseApiError(e);
          if (parsed && parsed.status >= 400 && parsed.status < 500) {
            // El servidor la rechazó (visita cerrada, item borrado…): no reintentar
            // en loop ni descartar en silencio; queda visible para el cleaner.
            await queuePut({ ...op, status: 'failed', attempts: op.attempts + 1, error: parsed.message });
            changed = true;
            continue;
          }
          // 5xx u otro error transitorio: reintentar en el próximo ciclo.
          await queuePut({ ...op, attempts: op.attempts + 1 });
          break;
        }
      }

      if (changed) {
        patchStatus({ authExpired: false });
        bumpSyncTick();
      }
    });
  } finally {
    flushing = false;
    patchStatus({ syncing: false });
    await refreshCounts();
  }
}

// ── Motor: cuándo se intenta sincronizar ────────────────────────────────────
let engineStarted = false;
const RETRY_EVERY_MS = 30_000;

export function startSyncEngine(onOnline?: () => void): void {
  if (engineStarted) return;
  engineStarted = true;

  void refreshCounts();
  void flushQueue();

  window.addEventListener('online', () => {
    void flushQueue();
    onOnline?.();
  });
  // Safari iOS no tiene Background Sync: al volver a la app se reintenta.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void flushQueue();
      onOnline?.();
    }
  });
  // "hay wifi pero no internet" no dispara 'online': reintento periódico.
  setInterval(() => {
    if (document.hidden) return;
    const s = getStatus();
    if (s.pending > 0 && !s.authExpired) void flushQueue();
    else if (!s.online) onOnline?.(); // sondeo de reconexión
  }, RETRY_EVERY_MS);
}
