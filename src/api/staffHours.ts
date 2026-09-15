// LAB425 — fetch wrapper para GET /api/staff/hours/summary.
import { staffApi } from './staffClient';

export type QuincenaPeriod = 'current' | 'previous';

export interface StaffHoursSummary {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  label: string; // e.g. "Q1 Sep 2026"
  hours: number;
  eventCount: number;
}

export async function getStaffHoursSummary(
  period: QuincenaPeriod
): Promise<StaffHoursSummary> {
  const data = await staffApi<{ ok: boolean } & StaffHoursSummary>(
    `/api/staff/hours/summary?period=${period}`
  );
  return data;
}
