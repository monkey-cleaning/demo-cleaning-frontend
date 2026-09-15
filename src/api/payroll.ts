// api/payroll.ts
// LAB428 — fetch wrappers para GET /api/admin/payroll/summary (todos los
// empleados, con plata) y GET /api/staff/payroll/summary (solo el cleaner
// logueado, sin plata — el backend nunca la calcula para ese endpoint, no
// es un campo que el frontend "esconda").
import { api } from './client';
import { staffApi } from './staffClient';
import type { Quincena } from '../lib/quincena';

export interface PayrollEventItem {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
  durationH: number;
  location: string | null;
  isRecurring: boolean;
}

export interface PayrollEmployeeRow {
  employeeId: string;
  name: string;
  eventCount: number;
  workHours: number;
  travelHours: number;
  /** Ausente en la respuesta de /api/staff/payroll — nunca null-con-forma. */
  workMoney?: number;
  travelMoney?: number;
  totalMoney?: number;
  events?: PayrollEventItem[];
}

export interface PayrollTotals {
  employeeCount: number;
  eventCount: number;
  workHours: number;
  travelHours: number;
  workMoney?: number;
  travelMoney?: number;
  totalMoney?: number;
}

export interface PayrollSummary {
  period: {
    year: number;
    month: number;
    half: 1 | 2;
    label: string;
    from: string;
    to: string;
  };
  employees: PayrollEmployeeRow[];
  totals: PayrollTotals;
  tz: string;
}

function queryString(q: Quincena): string {
  return new URLSearchParams({
    year: String(q.year),
    month: String(q.month),
    half: String(q.half),
  }).toString();
}

export async function getAdminPayrollSummary(q: Quincena): Promise<PayrollSummary> {
  return api<PayrollSummary>(`/api/admin/payroll/summary?${queryString(q)}`);
}

export async function getStaffPayrollSummary(q: Quincena): Promise<PayrollSummary> {
  return staffApi<PayrollSummary>(`/api/staff/payroll/summary?${queryString(q)}`);
}
