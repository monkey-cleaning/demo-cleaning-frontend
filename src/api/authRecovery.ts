// "Forgot your password?" — sin auth, compartido por admin y staff.
import { API_BASE_URL } from './client';

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
}

export function requestPasswordReset(email: string): Promise<void> {
  return post('/api/auth/forgot-password', { email });
}

export function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  return post('/api/auth/reset-password', { token, newPassword });
}
