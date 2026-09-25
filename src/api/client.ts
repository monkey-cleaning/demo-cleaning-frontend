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

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem('admin_blog_token');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    // Después de ...options: si no, un options.headers reemplazaría todo el
    // objeto y se perdería el Authorization.
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

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
