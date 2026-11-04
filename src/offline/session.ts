// LAB463 — los datos guardados son del cleaner logueado en este dispositivo.
import { STAFF_TOKEN_KEY } from '../api/staffClient';
import { clearAll, kvGet, kvSet } from './db';
import { listOps, refreshCounts } from './queue';
import { patchStatus } from './status';

const OWNER_KEY = 'meta:owner';

// Dueño = email del empleado (no cambia si el cleaner cambia su username).
function usernameFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const id = payload.email ?? payload.user;
    return typeof id === 'string' ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Se llama justo después de iniciar sesión. Si entra otra persona en el mismo
 * dispositivo, se borra lo guardado de la anterior (eventos, checklist, cola).
 */
export async function onStaffLogin(token: string): Promise<void> {
  const owner = usernameFromToken(token);
  try {
    const prev = await kvGet<string>(OWNER_KEY);
    if (prev && owner && prev.value !== owner) {
      await clearAll();
      patchStatus({ lastSyncAt: null, pending: 0, failed: 0 });
    }
    if (owner) await kvSet(OWNER_KEY, owner);
  } catch {
    /* sin almacenamiento local */
  }
  patchStatus({ authExpired: false });
}

/**
 * Cierra la sesión. Si quedan acciones sin enviar avisa antes de perderlas.
 * Devuelve false si el cleaner canceló.
 */
export async function signOutStaff(): Promise<boolean> {
  const ops = await listOps();
  const unsynced = ops.length;
  if (unsynced > 0) {
    const ok = window.confirm(
      `You have ${unsynced} item${unsynced === 1 ? '' : 's'} that ${unsynced === 1 ? "hasn't" : "haven't"} been synced yet. ` +
        'If you sign out now, they will be lost. Sign out anyway?'
    );
    if (!ok) return false;
  }
  localStorage.removeItem(STAFF_TOKEN_KEY);
  try {
    await clearAll();
  } catch {
    /* nada que borrar */
  }
  patchStatus({ lastSyncAt: null, pending: 0, failed: 0, authExpired: false });
  await refreshCounts().catch(() => {});
  return true;
}
