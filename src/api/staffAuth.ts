// Own fetch (not staffApi) so a failure — e.g. "current password is
// incorrect", "username taken" — surfaces the backend's actual message
// instead of staffApi's raw `API 401 - {...}` string.
import { API_BASE_URL } from './client';
import { STAFF_TOKEN_KEY } from './staffClient';

export interface StaffProfile {
  username: string;
  email: string;
}

function authHeaders() {
  const token = localStorage.getItem(STAFF_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getStaffProfile(): Promise<StaffProfile> {
  const res = await fetch(`${API_BASE_URL}/api/staff/auth/profile`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function updateStaffProfile(body: {
  currentPassword: string;
  username?: string;
  email?: string;
  newPassword?: string;
}): Promise<{ usernameChanged: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/staff/auth/profile`, {
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
