// Own fetch (not the shared `api()` helper) so a failure — e.g. "current
// password is incorrect", "username taken" — surfaces the backend's actual
// message instead of api()'s raw `API 401 - {...}` string.
import { API_BASE_URL } from './client';

export interface AdminProfile {
  username: string;
  email: string;
}

function authHeaders() {
  const token = localStorage.getItem('admin_blog_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getAdminProfile(): Promise<AdminProfile> {
  const res = await fetch(`${API_BASE_URL}/api/admin/auth/profile`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function updateAdminProfile(body: {
  currentPassword: string;
  username?: string;
  email?: string;
  newPassword?: string;
}): Promise<{ usernameChanged: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/admin/auth/profile`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const data = await res.json();
  return { usernameChanged: Boolean(data.usernameChanged) };
}
