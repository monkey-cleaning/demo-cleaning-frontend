// LAB463 — almacenamiento local del modo offline (IndexedDB, sin dependencias).
//
//   kv      key → valor JSON de las últimas respuestas GET (checklist, notas…)
//   events  id  → evento de calendario del cleaner (para armar semanas/mes offline)
//   queue   seq → acciones hechas sin conexión, pendientes de enviar (FIFO)
//
// Todo lo que entra acá es del cleaner logueado en este dispositivo; se borra
// al cerrar sesión o al entrar otro usuario (ver session.ts).

const DB_NAME = 'staff-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Could not open the local database'));
    };
  });
  return dbPromise;
}

type StoreName = 'kv' | 'events' | 'queue';

async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest | void
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    let result: unknown;
    if (req) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error ?? new Error('Local database error'));
    tx.onabort = () => reject(tx.error ?? new Error('Local database error'));
  });
}

// ── kv ──────────────────────────────────────────────────────────────────────
interface KvRow<T> {
  key: string;
  value: T;
  savedAt: number;
}

export async function kvGet<T>(key: string): Promise<{ value: T; savedAt: number } | undefined> {
  const row = await run<KvRow<T> | undefined>('kv', 'readonly', (s) => s.get(key));
  return row ? { value: row.value, savedAt: row.savedAt } : undefined;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await run('kv', 'readwrite', (s) => {
    s.put({ key, value, savedAt: Date.now() } satisfies KvRow<T>);
  });
}

// ── events ──────────────────────────────────────────────────────────────────
export async function eventsAll<T>(): Promise<T[]> {
  return run<T[]>('events', 'readonly', (s) => s.getAll());
}

export async function eventsPutMany<T extends { id: string }>(events: T[]): Promise<void> {
  if (!events.length) return;
  await run('events', 'readwrite', (s) => {
    for (const e of events) s.put(e);
  });
}

export async function eventsDeleteMany(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await run('events', 'readwrite', (s) => {
    for (const id of ids) s.delete(id);
  });
}

// ── queue ───────────────────────────────────────────────────────────────────
export async function queueAdd<T extends object>(op: T): Promise<number> {
  return run<number>('queue', 'readwrite', (s) => s.add(op));
}

export async function queueAll<T>(): Promise<T[]> {
  return run<T[]>('queue', 'readonly', (s) => s.getAll());
}

export async function queuePut<T extends object>(op: T): Promise<void> {
  await run('queue', 'readwrite', (s) => {
    s.put(op);
  });
}

export async function queueDelete(seq: number): Promise<void> {
  await run('queue', 'readwrite', (s) => {
    s.delete(seq);
  });
}

// ── limpieza total (logout / cambio de usuario) ─────────────────────────────
export async function clearAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['kv', 'events', 'queue'], 'readwrite');
    tx.objectStore('kv').clear();
    tx.objectStore('events').clear();
    tx.objectStore('queue').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
