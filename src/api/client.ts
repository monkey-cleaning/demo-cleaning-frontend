const rawApiUrl = import.meta.env.VITE_API_URL;

if (typeof rawApiUrl !== 'string' || !rawApiUrl.trim()) {
  throw new Error(
    'VITE_API_URL is required. Set it in .env (dev) or in the production build environment.',
  );
}

export const API_BASE_URL = rawApiUrl.replace(/\/$/, '');

/** Structured API failure — prefer `code` over parsing message strings. */
export class ApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;

  constructor(status: number, body: unknown, fallbackMessage?: string) {
    const fromBody =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : null;
    super(fromBody || fallbackMessage || `API ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.code =
      body &&
      typeof body === 'object' &&
      'code' in body &&
      typeof (body as { code: unknown }).code === 'string'
        ? (body as { code: string }).code
        : null;
  }
}

/**
 * La sesión venció o el token no vale. El backend también usa 403 para
 * "fuera de la ventana de edición" (con `code`), así que solo cuenta el 403
 * "Forbidden" pelado.
 */
export function isAuthError(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  return e.status === 401 || (e.status === 403 && e.message === 'Forbidden' && !e.code);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  const token = localStorage.getItem('admin_blog_token');

  // Sin timeout, un backend que no contesta deja la pantalla colgada en
  // "Checking access...". Solo lo usan las llamadas que lo piden.
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...(controller ? { signal: controller.signal } : {}),
      ...options,
      // Después de ...options: si no, un options.headers reemplazaría todo el
      // objeto y se perdería el Authorization.
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text
    }
    throw new ApiError(res.status, body, `API ${res.status} - ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
