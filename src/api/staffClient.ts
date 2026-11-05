// LAB423 — mismo wrapper que api/client.ts, pero inyectando el token de
// cleaner (guardado bajo una key distinta a 'admin_blog_token' para que
// loguearse como cleaner no pise una sesión de admin en el mismo navegador).
//
// LAB463 — modo offline: un fallo de red (sin señal, timeout) se distingue de
// un error HTTP con NetworkError, así las capas de arriba pueden caer al caché
// local o encolar la acción en vez de mostrar un error.
import { API_BASE_URL } from './client';
import { markNetworkFailure, markNetworkOk } from '../offline/status';

export const STAFF_TOKEN_KEY = 'staff_token';

export class NetworkError extends Error {
  constructor() {
    super("You're offline. Please try again when you're back online.");
    this.name = 'NetworkError';
  }
}

export function isNetworkError(e: unknown): e is NetworkError {
  return e instanceof NetworkError;
}

export interface ParsedApiError {
  status: number;
  code?: string;
  message: string;
}

/** staffApi tira `API <status> - <body>`; devuelve el status y el error legible. */
export function parseApiError(e: unknown): ParsedApiError | null {
  if (!(e instanceof Error)) return null;
  const m = /^API (\d{3}) - ([\s\S]*)$/.exec(e.message);
  if (!m) return null;
  let message = m[2];
  let code: string | undefined;
  try {
    const body = JSON.parse(m[2]);
    if (typeof body?.error === 'string') message = body.error;
    if (typeof body?.code === 'string') code = body.code;
  } catch {
    /* el body no era JSON */
  }
  return { status: Number(m[1]), code, message };
}

/**
 * La sesión venció o el token no vale. El backend también usa 403 para "fuera
 * de la ventana de edición" (con `code`), así que solo cuenta el 403
 * "Forbidden" pelado.
 */
export function isAuthError(e: unknown): boolean {
  const p = parseApiError(e);
  if (!p) return false;
  return p.status === 401 || (p.status === 403 && p.message === 'Forbidden' && !p.code);
}

const DEFAULT_TIMEOUT_MS = 20_000;

export async function staffApi<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  // navigator.onLine === false es confiable (modo avión): ni intentar.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    markNetworkFailure();
    throw new NetworkError();
  }

  const token = localStorage.getItem(STAFF_TOKEN_KEY);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
      ...options,
    });
  } catch {
    // Sin señal, DNS caído, timeout (AbortError)… en todos los casos el
    // servidor no contestó.
    markNetworkFailure();
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  markNetworkOk();

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} - ${text}`);
  }

  return res.json();
}
