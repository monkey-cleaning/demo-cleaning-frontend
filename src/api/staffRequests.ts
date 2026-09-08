// LAB425 — fetch wrappers para pedidos de licencia y reclamos del staff.
import { staffApi } from './staffClient';

export interface TimeOffRequest {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
}

export interface Complaint {
  id: string;
  message: string;
  status: 'open' | 'resolved';
  created_at: string;
}

export async function createTimeOffRequest(input: {
  start_date: string;
  end_date: string;
  reason?: string;
  notes?: string;
}): Promise<TimeOffRequest> {
  const data = await staffApi<{ ok: boolean; request: TimeOffRequest }>(
    '/api/staff/requests/time-off',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.request;
}

export async function getTimeOffRequests(): Promise<TimeOffRequest[]> {
  const data = await staffApi<{ ok: boolean; requests: TimeOffRequest[] }>(
    '/api/staff/requests/time-off'
  );
  return data.requests;
}

export async function createComplaint(message: string): Promise<Complaint> {
  const data = await staffApi<{ ok: boolean; complaint: Complaint }>(
    '/api/staff/requests/complaint',
    { method: 'POST', body: JSON.stringify({ message }) }
  );
  return data.complaint;
}

export async function getComplaints(): Promise<Complaint[]> {
  const data = await staffApi<{ ok: boolean; complaints: Complaint[] }>(
    '/api/staff/requests/complaint'
  );
  return data.complaints;
}
