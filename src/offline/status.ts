// LAB463 — estado observable del modo offline (conexión, cola, última sync).
// Lo lee la barra de estado (OfflineBanner) y las pantallas que necesitan
// refrescarse cuando termina una sincronización (syncTick).
import { useSyncExternalStore } from 'react';

export interface OfflineStatus {
  /** Mejor estimación de si hay conexión con el backend. */
  online: boolean;
  /** Última vez que se guardaron datos frescos del servidor (ms epoch). */
  lastSyncAt: number | null;
  /** Acciones en cola esperando enviarse. */
  pending: number;
  /** Acciones que el servidor rechazó (necesitan atención del cleaner). */
  failed: number;
  syncing: boolean;
  /** El token venció: la cola espera a que el cleaner vuelva a iniciar sesión. */
  authExpired: boolean;
  /** Se incrementa cuando termina una sincronización que cambió datos. */
  syncTick: number;
}

let state: OfflineStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSyncAt: null,
  pending: 0,
  failed: 0,
  syncing: false,
  authExpired: false,
  syncTick: 0,
};

const listeners = new Set<() => void>();

export function getStatus(): OfflineStatus {
  return state;
}

export function patchStatus(patch: Partial<OfflineStatus>): void {
  const next = { ...state, ...patch };
  if ((Object.keys(patch) as (keyof OfflineStatus)[]).every((k) => next[k] === state[k])) return;
  state = next;
  listeners.forEach((l) => l());
}

export function bumpSyncTick(): void {
  patchStatus({ syncTick: state.syncTick + 1 });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

// Los eventos del navegador solo dicen "hay/ no hay interfaz de red"; los
// fetch fallidos (markNetworkFailure) cubren "hay wifi pero no internet".
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => patchStatus({ online: false }));
  window.addEventListener('online', () => patchStatus({ online: true }));
}

export function markNetworkFailure(): void {
  patchStatus({ online: false });
}

export function markNetworkOk(): void {
  patchStatus({ online: true });
}
