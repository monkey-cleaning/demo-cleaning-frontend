// LAB423 — mismo wrapper que api/client.ts, pero inyectando el token de
// cleaner (guardado bajo una key distinta a 'admin_blog_token' para que
// loguearse como cleaner no pise una sesión de admin en el mismo navegador).
import { API_BASE_URL } from './client';

export const STAFF_TOKEN_KEY = 'staff_token';

export async function staffApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem(STAFF_TOKEN_KEY);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} - ${text}`);
  }

  return res.json();
}
