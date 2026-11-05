// LAB425 — fetch wrapper para GET /api/staff/hours/summary.
import { cachedGet } from '../offline/cache';

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
  const data = await cachedGet<{ ok: boolean } & StaffHoursSummary>(
    `/api/staff/hours/summary?period=${period}`
  );
  return data;
}
