// Cache en memoria para la página de Payments.
// TTL configurable (default 5 minutos). Se invalida manualmente con clear().

const TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry<T> {
    data: T;
    ts: number;   // timestamp del momento en que se guardó
}

const store = new Map<string, CacheEntry<unknown>>();

function isAlive(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.ts < TTL_MS;
}

const inflight = new Map<string, Promise<unknown>>();

export const paymentsCache = {
    get<T>(key: string): T | null {
        const entry = store.get(key) as CacheEntry<T> | undefined;
        if (!entry || !isAlive(entry)) {
            store.delete(key);
            return null;
        }
        return entry.data;
    },

    set<T>(key: string, data: T): void {
        store.set(key, { data, ts: Date.now() });
    },

    /** Invalida sólo las claves que empiezan con el prefijo dado (o todas si no se pasa nada). */
    clear(prefix?: string): void {
        if (!prefix) {
            store.clear();
            return;
        }
        for (const key of store.keys()) {
            if (key.startsWith(prefix)) store.delete(key);
        }
    },

    /** Devuelve true si la clave existe Y sigue viva (útil para stale-while-revalidate). */
    has(key: string): boolean {
        const entry = store.get(key);
        return !!entry && isAlive(entry);
    },

    dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        if (inflight.has(key)) return inflight.get(key) as Promise<T>;

        const promise = fetcher().then(result => {
            inflight.delete(key);
            return result;
        }).catch(err => {
            inflight.delete(key);
            throw err;
        });

        inflight.set(key, promise);
        return promise;
    },
};