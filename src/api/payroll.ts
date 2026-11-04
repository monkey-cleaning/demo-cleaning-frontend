// api/payroll.ts
// LAB428 — fetch wrappers para GET /api/admin/payroll/summary (todos los
// empleados, con plata) y GET /api/staff/payroll/summary (solo el cleaner
// logueado, sin plata — el backend nunca la calcula para ese endpoint, no
// es un campo que el frontend "esconda").
import { api } from './client';
import { cachedGet } from '../offline/cache';
import type { Quincena } from '../lib/quincena';

export interface PayrollEventItem {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
  durationH: number;
  location: string | null;
  isRecurring: boolean;
  /** Referencia calculada (durationH × cleaners asignados × tarifa vigente a
   *  la fecha del evento) — NO es necesariamente el monto real facturado (no
   *  hay forma de reconstruir el monto cotizado original de un evento ya
   *  trabajado). Admin-only, ausente para staff (mismo gate que travelSlots). */
  calculatedAmount?: number;
  /** El monto que realmente cuenta para clientRevenue/profit — igual a
   *  calculatedAmount hasta que un admin lo corrige a mano (PATCH
   *  .../client-billing), ahí pasa a ser el valor cargado. */
  appliedAmount?: number;
  /** La tarifa aplicada en el cálculo (informativa). */
  billedRate?: number;
  /** Nombres de los cleaners asignados a este evento (para explicar por qué
   *  calculatedAmount multiplica por más de 1). */
  attendeeNames?: string[];
  serviceType?: string | null;
  billingReviewedBy?: string | null;
  billingReviewedAt?: string | null;
  /** Cliente resuelto del appointment (null = sin cliente real todavía). */
  clientId?: string | null;
  /** Ganancia de ESTE cleaner en este trabajo (durationH × su tarifa). */
  cleanerPay?: number;
  /** Lo que se le paga a TODOS los cleaners de este trabajo. */
  cleanerPayTotal?: number;
  /** Ganancia del negocio en este trabajo = appliedAmount − cleanerPayTotal. */
  businessProfit?: number;
  invoiceId?: string | null;
  /** null = todavía no hay invoice linkeada al appointment. */
  invoiceStatus?: InvoiceStatus | null;
  paidDate?: string | null;
}

export type InvoiceStatus = 'draft' | 'published' | 'sent' | 'paid' | 'overdue';

// Un hueco entre dos eventos consecutivos del mismo día. `needsReview` es
// true cuando el hueco calculado da >= 1h — en ese caso `appliedHours`
// arranca en 0 hasta que un admin carga un valor (PATCH .../travel-slot),
// y ahí `reviewedBy`/`reviewedAt` dejan de ser null.
export interface PayrollTravelSlot {
  day: string; // YYYY-MM-DD
  prevEventId: string;
  nextEventId: string;
  prevSummary: string;
  prevEndIso: string;
  nextSummary: string;
  nextStartIso: string;
  calculatedHours: number;
  needsReview: boolean;
  appliedHours: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

// Un día con horas extra (ley de BC: >8 h por día a 1,5×, >12 h a 2×, y >40 h
// por semana a 1,5×). `weeklyHours` son las de 1,5× que vienen de la semana.
export interface PayrollOvertimeDay {
  date: string;
  hours: number;
  hours15: number;
  hours2: number;
  weeklyHours: number;
}

// Un feriado de BC dentro de la quincena para un empleado. `amount` es lo que
// se SUMA al pago normal (día promedio + recargo si trabajó); 0 si no califica.
export interface PayrollHolidayDay {
  date: string;
  name: string;
  eligible: boolean;
  daysWorkedInWindow: number;
  worked: boolean;
  hoursWorked: number;
  avgDayPay: number;
  premium: number;
  amount: number;
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
  /** Horas pagadas a 1,5× y a 2× por la ley de BC. Ausentes en cierres viejos. */
  overtimeHours15?: number;
  overtimeHours2?: number;
  /** Plus de horas extra y pago de feriados — suman al total ganado. */
  overtimeMoney?: number;
  holidayMoney?: number;
  /** Solo admin (el feriado trae plata). */
  holidayDays?: PayrollHolidayDay[];
  overtimeDays?: PayrollOvertimeDay[];
  totalMoney?: number;
  events?: PayrollEventItem[];
  /** Solo en /api/admin/payroll — un cleaner nunca ve ni edita esto. */
  travelSlots?: PayrollTravelSlot[];
  /** Adelantos descontados en la quincena / lo que efectivamente se le paga. */
  deductions?: number;
  netPay?: number;
  /** Bonos de la quincena (suman al pago y son costo del P&L). */
  bonuses?: number;
  /** Propinas asignadas al cleaner — informativas, NO suman al net pay. */
  tips?: number;
  /** Net pay según la cuenta, antes de un override manual. */
  netPayCalculated?: number;
  netPayOverridden?: boolean;
}

export interface PayrollTotals {
  employeeCount: number;
  eventCount: number;
  workHours: number;
  travelHours: number;
  workMoney?: number;
  travelMoney?: number;
  overtimeHours?: number;
  overtimeMoney?: number;
  holidayMoney?: number;
  totalMoney?: number;
  deductions?: number;
  netPay?: number;
  bonuses?: number;
  tips?: number;
}

// P&L de la quincena (LAB428, admin-only) — mismo modelo que la planilla
// manual: "Ganancia" es el margen bruto ANTES de gastos (ingresos - nómina);
// "Ganancia Neta" recién descuenta los 3 gastos operativos/administrativos/
// financieros (pedido explícito 2026-09-17, calcado del Excel).
// `grossRevenue` = suma de appliedAmount de todos los eventos, DEDUPEADA por
// evento (un servicio con 2 cleaners de attendees no se cuenta 2 veces).
// `cleanerPayroll` es el mismo número que `totals.totalMoney`, repetido acá
// para que la cuenta de profit sea autocontenida.
export interface PayrollPnl {
  grossRevenue: number;
  cleanerPayroll: number;
  grossProfit: number;
  /** Forecast (2026-09-30): pagos recibidos vs. lo que ya debería haber
   *  ingresado vs. lo que ingresaría si se completa la quincena como está
   *  agendada. Con GST — plata real entrando/por entrar, no la base del P&L. */
  forecast: { received: number; estimatedToday: number; estimatedTotal: number };
  expensesFinancial: number;
  expensesOperational: number;
  expensesAdministrative: number;
  expensesTotal: number;
  netProfit: number;
  /** Transporte (autocompletado con lo pagado a cleaners por traslados, ya
   *  incluido en cleanerPayroll) + los conceptos fijados por el admin. */
  relevantExpenses: { label: string; amount: number; auto?: boolean; hint?: string }[];
  /** Dinero que sale hacia los accionistas — NO es gasto, no entra en netProfit. */
  dividends: number;
  /** null = todavía sin definir de dónde sale el dato. */
  savings: number | null;
  /** Bonos incluidos en cleanerPayroll. */
  bonuses?: number;
}

// Tabla NET PAY ("A Pagar" de cada persona) — editable: `applied` es lo que
// se paga (el override manual si lo hay, si no `calculated`). Incluye
// empleados inactivos que tengan algún ajuste en la quincena (ej. Clara).
export interface PayrollNetPayRow {
  employeeId: string;
  name: string;
  active: boolean;
  /** Horas de trabajo y de traslado de la quincena. Ausentes en cierres viejos
   *  (snapshot guardado antes de que existieran). */
  workHours?: number;
  travelHours?: number;
  /** Pago extra de la quincena (horas extra + feriados), por encima del pago
   *  normal. Ausente en cierres viejos. */
  overtimeMoney?: number;
  overtimeHours15?: number;
  overtimeHours2?: number;
  holidayMoney?: number;
  holidays?: { name: string; worked: boolean; amount: number }[];
  /** false = el monto es solo la parte directa de un plan de pago: el extra
   *  se paga por los accionistas y no está dentro de `applied`. */
  extraIncluded?: boolean;
  earned: number;
  bonuses: number;
  tips: number;
  deductions: number;
  calculated: number;
  applied: number;
  overridden: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

// Pago a un accionista (Javi, Jhony): dividendos + extras de la quincena.
// `viaCash` es el efectivo que pasa a cleaners con plan — informativo, no suma.
export interface PayrollStakeholderPayment {
  partnerId: string;
  name: string;
  employeeId: string | null;
  dividends: number;
  extras: number;
  total: number;
  viaCash: number;
}

export interface PayrollNetPaySummary {
  rows: PayrollNetPayRow[];
  /** Solo empleados (sin accionistas). */
  total: number;
  /** Propinas sin cleaner destinatario. */
  tipsUnassigned: number;
  /** Ausentes en cierres viejos (snapshot guardado antes de existir). */
  stakeholders?: PayrollStakeholderPayment[];
  /** Dividendos sin accionista asignado. */
  otherDividends?: number;
  /** Total pagado a accionistas (incluye `otherDividends`). */
  stakeholdersTotal?: number;
}

// Un registro por SERVICIO facturado al cliente, deduplicado — a diferencia
// de employees[].events (que repite el mismo evento por cada cleaner que lo
// trabajó), esto es la vista "cuánto se cobró" propiamente dicha.
export interface PayrollClientBillingRecord {
  eventId: string;
  summary: string;
  startIso: string;
  endIso: string;
  durationH: number;
  location: string | null;
  serviceType: string | null;
  attendeeNames: string[];
  calculatedAmount: number;
  appliedAmount: number;
  billedRate: number;
  billingReviewedBy: string | null;
  billingReviewedAt: string | null;
  clientId: string | null;
  cleanerPayTotal: number;
  businessProfit: number;
  invoiceId: string | null;
  invoiceStatus: InvoiceStatus | null;
  paidDate: string | null;
}

// ── Pagos Experimental ("Tabla Pagos Experimental" de la planilla) ────────
// Quién cobra qué y a través de quién. `via` = lo que un accionista cobra para
// pasarle en efectivo a un cleaner (clave = employeeId del cleaner).
export interface PayrollPaymentRow {
  key: string;
  employeeId: string | null;
  partnerId: string | null;
  name: string;
  isPartner: boolean;
  real: number;
  via: Record<string, number>;
  own: number;
  bonus: number;
  totalWithoutBonus: number;
  total: number;
  workHours: number;
  travelHours: number;
}

// Parámetros por cleaner y quincena (payroll_payment_plans).
export interface PayrollPaymentPlan {
  employeeId: string;
  officialNet: number | null;
  officialGross: number | null;
  bonusCol: number | null;
  cashRateFactor: number;
  viaPartnerIds: string[];
  note: string | null;
}

export interface PayrollPaymentTable {
  /** Cleaners cuyo efectivo se paga a través de accionistas (una columna "To X" cada uno). */
  beneficiaries: { employeeId: string; name: string }[];
  rows: PayrollPaymentRow[];
  totals: {
    real: number;
    own: number;
    bonus: number;
    totalWithoutBonus: number;
    total: number;
    via: Record<string, number>;
  };
  /** Detalle del excedente en efectivo de cada cleaner con plan. */
  routed: {
    employeeId: string;
    name: string;
    earnedTotal: number;
    excess: number;
    cash: number;
    viaPartnerIds: string[];
  }[];
  warnings: string[];
  plans: PayrollPaymentPlan[];
  partners: PayrollPartner[];
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
  /** Ausente en la respuesta de /api/staff/payroll — igual que travelSlots. */
  pnl?: PayrollPnl;
  clientBilling?: PayrollClientBillingRecord[];
  netPaySummary?: PayrollNetPaySummary;
  paymentTable?: PayrollPaymentTable;
  /** Admin-only: equipo de cada cleaner por día — { 'YYYY-MM-DD': { employeeId: 'team_1' } }. */
  teamsByDay?: Record<string, Record<string, string>>;
  /** Presente solo si la quincena está CERRADA: el resumen sale del snapshot inmutable. */
  closing?: { closedAt: string; closedBy: string | null };
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
  // LAB463 — con caché local: sin conexión se ve la última quincena consultada.
  return cachedGet<PayrollSummary>(`/api/staff/payroll/summary?${queryString(q)}`);
}

// ── Resumen Anual (2026-09-30) ────────────────────────────────────────────
// Un mes por fila, cada uno la suma de sus dos quincenas (cerrada → del
// snapshot; abierta → calculada en vivo). `hasData: false` = la quincena
// todavía no arrancó (mismo criterio que la hoja Excel, que la deja en blanco).
export interface PayrollAnnualMonthRow {
  month: number;
  label: string;
  hasData: boolean;
  grossRevenue: number;
  cleanerPayroll: number;
  dividends: number;
  grossProfit: number;
  expensesFinancial: number;
  expensesOperational: number;
  expensesAdministrative: number;
  expensesTotal: number;
  netProfit: number;
}

export interface PayrollAnnualSummary {
  ok: boolean;
  year: number;
  months: PayrollAnnualMonthRow[];
  total: Omit<PayrollAnnualMonthRow, 'month' | 'label' | 'hasData'>;
}

export async function getAnnualSummary(year: number): Promise<PayrollAnnualSummary> {
  return api<PayrollAnnualSummary>(`/api/admin/payroll/annual-summary?year=${year}`);
}

// client.ts's api() lanza "API ### - {raw body}" — le sacamos el .error de
// adentro para mostrar un mensaje legible (ej. "la migración todavía no
// corrió") en vez del JSON crudo. Compartido por todas las escrituras de
// esta pestaña (travel-slot, expenses).
async function callWithCleanError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    const match = /API \d+ - (\{.*\})/s.exec(e?.message ?? '');
    let cleanMessage: string | null = null;
    if (match) {
      try {
        cleanMessage = JSON.parse(match[1])?.error ?? null;
      } catch {
        // no era JSON parseable — seguir con el error original
      }
    }
    throw cleanMessage ? new Error(cleanMessage) : e;
  }
}

export interface UpdateTravelSlotPayload {
  employeeId: string;
  prevEventId: string;
  nextEventId: string;
  appliedHours: number;
  calculatedHours: number;
}

// Única escritura de toda la pestaña Payroll — revisión manual de un tramo
// de traslado >= 1h. Admin-only (requireAdmin en el backend); no existe
// equivalente de staff.
export async function updateTravelSlot(payload: UpdateTravelSlotPayload): Promise<void> {
  await callWithCleanError(() =>
    api<{ ok: boolean }>('/api/admin/payroll/travel-slot', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  );
}

export interface UpdateClientBillingPayload {
  eventId: string;
  appliedAmount: number;
  calculatedAmount?: number;
}

// Corrige a mano el monto facturado al cliente por un evento puntual — el
// calculado es solo una referencia (ver comentario en PayrollEventItem).
// Admin-only; no existe equivalente de staff.
export async function updateClientBilling(payload: UpdateClientBillingPayload): Promise<void> {
  await callWithCleanError(() =>
    api<{ ok: boolean }>('/api/admin/payroll/client-billing', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  );
}

// ── Expenses (admin-only, sin equivalente de staff) ─────────────────────
// Calcado de la sección "GASTOS" de la planilla manual — Concepto/Tipo/
// Monto, 3 categorías fijas. Traducidas a inglés para consistencia con el
// resto de la pestaña (igual que "Horas"→"Work hours").
export type ExpenseCategory = 'financial' | 'operational' | 'administrative';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  financial: 'Financial',
  operational: 'Operational',
  administrative: 'Administrative',
};

export interface PayrollExpense {
  id: string;
  concept: string;
  category: ExpenseCategory;
  amount: number;
  createdBy: string | null;
  createdAt: string;
  /** Gasto fijo: se repite en todas las quincenas con el mismo monto hasta
   *  que se actualice el precio (el nuevo rige de ahí en adelante). */
  isFixed: boolean;
  seriesId: string | null;
}

export interface PayrollExpenseTotals {
  financial: number;
  operational: number;
  administrative: number;
  total: number;
}

export interface PayrollExpensesResponse {
  expenses: PayrollExpense[];
  totals: PayrollExpenseTotals;
}

export async function getExpenses(q: Quincena): Promise<PayrollExpensesResponse> {
  return api<{ ok: boolean } & PayrollExpensesResponse>(
    `/api/admin/payroll/expenses?${queryString(q)}`,
  );
}

export interface AddExpensePayload {
  year: number;
  month: number;
  half: 1 | 2;
  concept: string;
  category: ExpenseCategory;
  amount: number;
  isFixed?: boolean;
}

export async function addExpense(payload: AddExpensePayload): Promise<PayrollExpense> {
  const { expense } = await callWithCleanError(() =>
    api<{ ok: boolean; expense: PayrollExpense }>('/api/admin/payroll/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
  return expense;
}

export interface UpdateExpensePayload extends AddExpensePayload {
  id: string;
  /** Tipo al que se pasa el gasto al guardar (fijo/puntual). `isFixed` sigue
   * siendo el tipo actual. Si falta o coincide, el tipo no cambia. */
  makeFixed?: boolean;
}

// Un gasto fijo se edita "desde esta quincena en adelante" (el backend cierra
// la versión vigente y abre otra) — las quincenas anteriores no cambian.
// Con `makeFixed` distinto de `isFixed` cambia de tipo: puntual → fijo lo repite
// desde esta quincena; fijo → puntual lo deja solo en esta y lo da de baja
// de ahí en adelante.
export async function updateExpense({ id, ...payload }: UpdateExpensePayload): Promise<PayrollExpense> {
  const { expense } = await callWithCleanError(() =>
    api<{ ok: boolean; expense: PayrollExpense }>(`/api/admin/payroll/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  );
  return expense;
}

// Un gasto fijo se da de baja desde esta quincena en adelante; uno puntual
// se borra.
export async function removeExpense(expense: PayrollExpense, q: Quincena): Promise<void> {
  const params = expense.isFixed ? `?fixed=true&${queryString(q)}` : '';
  await callWithCleanError(() =>
    api<{ ok: boolean }>(`/api/admin/payroll/expenses/${expense.id}${params}`, { method: 'DELETE' }),
  );
}

// ── Conceptos fijados (tabla de "gastos relevantes") ─────────────────────
export async function setPinnedConcepts(concepts: string[]): Promise<void> {
  await callWithCleanError(() =>
    api<{ ok: boolean }>('/api/admin/payroll/pinned-concepts', {
      method: 'PUT',
      body: JSON.stringify({ concepts }),
    }),
  );
}

// ── Dividendos y deducciones (admin-only) ────────────────────────────────
// Ninguno es un gasto del P&L: dividendos = dinero hacia los accionistas
// después de la ganancia neta; deducciones = adelantos a un cleaner, se
// descuentan de su pago.
export interface PayrollDividend {
  id: string;
  concept: string;
  amount: number;
  /** Accionista al que le corresponde (null = dividendo sin asignar). */
  partnerId: string | null;
  partnerName: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PayrollDeduction {
  id: string;
  employeeId: string;
  employeeName: string | null;
  concept: string;
  amount: number;
  createdBy: string | null;
  createdAt: string;
}

export async function getDividends(q: Quincena): Promise<{ dividends: PayrollDividend[]; total: number }> {
  return api(`/api/admin/payroll/dividends?${queryString(q)}`);
}

// Accionistas (Javi: también es cleaner; Jhony: no). Lista vacía si la
// migración 20260924 todavía no corrió.
export interface PayrollPartner {
  id: string;
  name: string;
  employeeId: string | null;
  employeeName: string | null;
  isActive: boolean;
}

export async function getPartners(): Promise<PayrollPartner[]> {
  const r = await api<{ partners: PayrollPartner[] }>('/api/admin/payroll/partners');
  return r.partners;
}

export async function addDividend(
  payload: Quincena & { concept: string; amount: number; partnerId?: string },
): Promise<void> {
  await callWithCleanError(() =>
    api('/api/admin/payroll/dividends', { method: 'POST', body: JSON.stringify(payload) }),
  );
}

export async function updateDividend(
  id: string,
  payload: { concept: string; amount: number; partnerId?: string },
): Promise<void> {
  await callWithCleanError(() =>
    api(`/api/admin/payroll/dividends/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  );
}

export async function removeDividend(id: string): Promise<void> {
  await callWithCleanError(() => api(`/api/admin/payroll/dividends/${id}`, { method: 'DELETE' }));
}

// Extras de accionista: montos propios que suman a "Own" en Pagos Experimental
// (p. ej. el parking fijo de Javi) sin ser un dividendo.
export interface PayrollPartnerExtra {
  id: string;
  partnerId: string;
  partnerName: string | null;
  concept: string;
  amount: number;
  createdBy: string | null;
  createdAt: string;
  /** Extra fijo: se repite en todas las quincenas con el mismo monto hasta
   *  que se actualice el precio (el nuevo rige de ahí en adelante). */
  isFixed: boolean;
  seriesId: string | null;
}

export async function getPartnerExtras(q: Quincena): Promise<{ extras: PayrollPartnerExtra[]; total: number }> {
  return api(`/api/admin/payroll/partner-extras?${queryString(q)}`);
}

export interface AddPartnerExtraPayload {
  year: number;
  month: number;
  half: 1 | 2;
  partnerId: string;
  concept: string;
  amount: number;
  isFixed?: boolean;
}

export async function addPartnerExtra(payload: AddPartnerExtraPayload): Promise<PayrollPartnerExtra> {
  const { extra } = await callWithCleanError(() =>
    api<{ ok: boolean; extra: PayrollPartnerExtra }>('/api/admin/payroll/partner-extras', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  );
  return extra;
}

export interface UpdatePartnerExtraPayload extends AddPartnerExtraPayload {
  id: string;
}

// Un extra fijo se edita "desde esta quincena en adelante" (el backend cierra
// la versión vieja y abre una nueva — las quincenas pasadas no cambian).
export async function updatePartnerExtra({ id, ...payload }: UpdatePartnerExtraPayload): Promise<PayrollPartnerExtra> {
  const { extra } = await callWithCleanError(() =>
    api<{ ok: boolean; extra: PayrollPartnerExtra }>(`/api/admin/payroll/partner-extras/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  );
  return extra;
}

// Un extra fijo se da de baja desde esta quincena en adelante; uno puntual se borra.
export async function removePartnerExtra(extra: PayrollPartnerExtra, q: Quincena): Promise<void> {
  const params = extra.isFixed ? `?fixed=true&${queryString(q)}` : '';
  await callWithCleanError(() =>
    api<{ ok: boolean }>(`/api/admin/payroll/partner-extras/${extra.id}${params}`, { method: 'DELETE' }),
  );
}

export async function getDeductions(q: Quincena): Promise<{ deductions: PayrollDeduction[]; total: number }> {
  return api(`/api/admin/payroll/deductions?${queryString(q)}`);
}

export async function addDeduction(
  payload: Quincena & { employeeId: string; concept: string; amount: number },
): Promise<void> {
  await callWithCleanError(() =>
    api('/api/admin/payroll/deductions', { method: 'POST', body: JSON.stringify(payload) }),
  );
}

export async function updateDeduction(
  id: string,
  payload: { employeeId: string; concept: string; amount: number },
): Promise<void> {
  await callWithCleanError(() =>
    api(`/api/admin/payroll/deductions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  );
}

export async function removeDeduction(id: string): Promise<void> {
  await callWithCleanError(() => api(`/api/admin/payroll/deductions/${id}`, { method: 'DELETE' }));
}

// ── NET PAY editable (admin-only) ────────────────────────────────────────
// Fija a mano el "A Pagar" de un cleaner en la quincena; borrar el override
// vuelve al valor calculado.
export async function setNetPay(
  payload: Quincena & { employeeId: string; amount: number; calculated: number; note?: string },
): Promise<void> {
  await callWithCleanError(() =>
    api('/api/admin/payroll/net-pay', { method: 'PUT', body: JSON.stringify(payload) }),
  );
}

export async function clearNetPay(q: Quincena, employeeId: string): Promise<void> {
  await callWithCleanError(() =>
    api(`/api/admin/payroll/net-pay?${queryString(q)}&employeeId=${employeeId}`, { method: 'DELETE' }),
  );
}

// ── Tarjeta de crédito de la empresa (2026-09-30, carga manual) ──────────
// Un solo registro por quincena: saldo al cierre + lo que se abonó esa
// quincena. null = todavía no se cargó nada.
export interface PayrollCreditCard {
  balance: number;
  paymentAmount: number;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export async function getCreditCard(q: Quincena): Promise<PayrollCreditCard | null> {
  const r = await api<{ ok: boolean; creditCard: PayrollCreditCard | null }>(
    `/api/admin/payroll/credit-card?${queryString(q)}`,
  );
  return r.creditCard;
}

export async function setCreditCard(
  payload: Quincena & { balance: number; paymentAmount: number; note?: string },
): Promise<PayrollCreditCard> {
  const r = await callWithCleanError(() =>
    api<{ ok: boolean; creditCard: PayrollCreditCard }>('/api/admin/payroll/credit-card', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  );
  return r.creditCard;
}

export async function clearCreditCard(q: Quincena): Promise<void> {
  await callWithCleanError(() =>
    api(`/api/admin/payroll/credit-card?${queryString(q)}`, { method: 'DELETE' }),
  );
}

// ── Tarifa aplicada al cliente (editable por trabajo) ────────────────────
// Actualiza clients.rate en el CRM (trabajos futuros del cliente) y fija el
// monto de ESTE trabajo con la tarifa nueva — las quincenas pasadas no se
// recalculan solas.
export interface UpdateClientRatePayload {
  eventId: string;
  hourlyRate: number;
  durationH: number;
  attendeeCount: number;
  eventStartIso: string;
  /** "client" (default): actualiza clients.rate, vale para próximos trabajos.
   *  "job" (2026-09-30): fija SOLO este trabajo (p. ej. alfombras a otra
   *  tarifa), sin tocar la tarifa habitual del cliente. */
  scope?: 'client' | 'job';
}

export async function updateClientRate(payload: UpdateClientRatePayload): Promise<void> {
  await callWithCleanError(() =>
    api('/api/admin/payroll/client-rate', { method: 'PATCH', body: JSON.stringify(payload) }),
  );
}

// ── Cierre de quincena (admin-only): propinas, servicios nuevos, checklist,
// planes de pago ─────────────────────────────────────────────────────────
const post = <T = unknown>(path: string, body: unknown) =>
  callWithCleanError(() => api<T>(path, { method: 'POST', body: JSON.stringify(body) }));
const patch = <T = unknown>(path: string, body: unknown) =>
  callWithCleanError(() => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) }));
const put = <T = unknown>(path: string, body: unknown) =>
  callWithCleanError(() => api<T>(path, { method: 'PUT', body: JSON.stringify(body) }));
const del = <T = unknown>(path: string) => callWithCleanError(() => api<T>(path, { method: 'DELETE' }));

// Cierra la quincena: queda congelada como archivo inmutable (no se reabre desde la app).
export async function closePayrollPeriod(q: Quincena): Promise<{ closedAt: string; closedBy: string | null }> {
  const r = await callWithCleanError(() =>
    api<{ closing: { closedAt: string; closedBy: string | null } }>('/api/admin/payroll/close', {
      method: 'POST',
      body: JSON.stringify(q),
    }),
  );
  return r.closing;
}

// Bonos: monto POR cleaner, para todos o solo para algunos. Suman al net pay
// (son un costo de nómina, a diferencia de las propinas).
export interface PayrollBonusRecipient {
  employeeId: string;
  name: string | null;
}
export interface PayrollBonus {
  id: string;
  concept: string;
  amount: number;
  appliesToAll: boolean;
  recipients: PayrollBonusRecipient[];
  createdBy: string | null;
  createdAt: string;
}
export interface BonusPayload {
  concept: string;
  amount: number;
  appliesToAll: boolean;
  employeeIds: string[];
}

export async function getBonuses(q: Quincena): Promise<{ bonuses: PayrollBonus[] }> {
  return api(`/api/admin/payroll/bonuses?${queryString(q)}`);
}
export async function addBonus(q: Quincena, payload: BonusPayload): Promise<void> {
  await post('/api/admin/payroll/bonuses', { ...q, ...payload });
}
export async function updateBonus(id: string, payload: BonusPayload): Promise<void> {
  await patch(`/api/admin/payroll/bonuses/${id}`, payload);
}
export async function removeBonus(id: string): Promise<void> {
  await del(`/api/admin/payroll/bonuses/${id}`);
}

// Propinas: registro de lo que dejó un cliente y a qué cleaners les
// corresponde. No suman al net pay (la planilla no las usa en esa cuenta).
export interface PayrollTipRecipient {
  employeeId: string;
  name: string | null;
}
export interface PayrollTip {
  id: string;
  clientName: string;
  clientId: string | null;
  amount: number;
  note: string | null;
  recipients: PayrollTipRecipient[];
  createdBy: string | null;
  createdAt: string;
}
export interface TipPayload {
  clientName: string;
  /** Cliente real del CRM (obligatorio: no se aceptan nombres libres). */
  clientId: string;
  amount: number;
  note?: string;
  employeeIds: string[];
}

export async function getTips(q: Quincena): Promise<{ tips: PayrollTip[]; total: number }> {
  return api(`/api/admin/payroll/tips?${queryString(q)}`);
}
export async function addTip(q: Quincena, payload: TipPayload): Promise<void> {
  await post('/api/admin/payroll/tips', { ...q, ...payload });
}
export async function updateTip(id: string, payload: TipPayload): Promise<void> {
  await patch(`/api/admin/payroll/tips/${id}`, payload);
}
export async function removeTip(id: string): Promise<void> {
  await del(`/api/admin/payroll/tips/${id}`);
}

// Servicios nuevos: clientes/servicios nuevos de la quincena y su frecuencia
// (mismas opciones que clients.expected_frequency).
export const NEW_SERVICE_FREQUENCIES = ['Weekly', 'Bi-weekly', 'Monthly', 'One-time', 'As needed'] as const;
export type NewServiceFrequency = (typeof NEW_SERVICE_FREQUENCIES)[number];
export interface PayrollNewService {
  id: string;
  serviceName: string;
  clientId: string | null;
  frequency: NewServiceFrequency;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}
export interface NewServicePayload {
  serviceName: string;
  frequency: NewServiceFrequency;
  note?: string;
  /** Cliente de origen (al confirmar uno detectado): evita volver a sugerirlo. */
  clientId?: string;
}

// Clientes cuyo primer servicio cae en la quincena y todavía no se cargaron.
export interface PayrollDetectedClient {
  clientId: string;
  name: string;
  firstServiceDate: string;
  frequency: NewServiceFrequency | null;
  serviceType: string | null;
}

export async function getDetectedNewClients(q: Quincena): Promise<{ detected: PayrollDetectedClient[] }> {
  return api(`/api/admin/payroll/new-services/detected?${queryString(q)}`);
}

export async function getNewServices(q: Quincena): Promise<{ newServices: PayrollNewService[] }> {
  return api(`/api/admin/payroll/new-services?${queryString(q)}`);
}
export async function addNewService(q: Quincena, payload: NewServicePayload): Promise<void> {
  await post('/api/admin/payroll/new-services', { ...q, ...payload });
}
export async function updateNewService(id: string, payload: NewServicePayload): Promise<void> {
  await patch(`/api/admin/payroll/new-services/${id}`, payload);
}
export async function removeNewService(id: string): Promise<void> {
  await del(`/api/admin/payroll/new-services/${id}`);
}

// Checklist "Chequeo Nomina": items con vigencia + estado por quincena.
export interface PayrollChecklistItem {
  id: string;
  label: string;
  position: number;
  done: boolean;
  comment: string | null;
  doneBy: string | null;
  doneAt: string | null;
}
export interface PayrollChecklist {
  items: PayrollChecklistItem[];
  total: number;
  doneCount: number;
}

export async function getChecklist(q: Quincena): Promise<PayrollChecklist> {
  return api(`/api/admin/payroll/checklist?${queryString(q)}`);
}
export async function addChecklistItem(q: Quincena, label: string): Promise<void> {
  await post('/api/admin/payroll/checklist/items', { ...q, label });
}
// Baja desde esta quincena en adelante (las anteriores lo siguen mostrando).
export async function removeChecklistItem(q: Quincena, id: string): Promise<void> {
  await del(`/api/admin/payroll/checklist/items/${id}?${queryString(q)}`);
}
export async function setChecklistStatus(
  q: Quincena,
  itemId: string,
  done: boolean,
  comment: string | null,
): Promise<void> {
  await put('/api/admin/payroll/checklist/status', { ...q, itemId, done, comment: comment ?? '' });
}

// Planes de pago: parámetros por cleaner y quincena de "Pagos Experimental".
export interface PaymentPlanPayload {
  employeeId: string;
  officialNet: number | null;
  officialGross: number | null;
  bonusCol: number | null;
  cashRateFactor: number;
  viaPartnerIds: string[];
  note?: string;
}

export async function savePaymentPlan(q: Quincena, payload: PaymentPlanPayload): Promise<void> {
  await put('/api/admin/payroll/payment-plans', { ...q, ...payload });
}
export async function removePaymentPlan(q: Quincena, employeeId: string): Promise<void> {
  await del(`/api/admin/payroll/payment-plans?${queryString(q)}&employeeId=${employeeId}`);
}
export async function copyPreviousPaymentPlans(q: Quincena): Promise<{ copied: number; skipped: boolean }> {
  return post('/api/admin/payroll/payment-plans/copy-previous', q);
}
