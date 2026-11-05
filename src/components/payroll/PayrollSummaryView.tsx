// components/payroll/PayrollSummaryView.tsx
// LAB428 — vista compartida de la pestaña "Payroll", usada tanto en
// /admin/payroll (showMoney) como en /staff/payroll (sin showMoney — el
// backend de staff ya no manda esos campos, este componente solo se limita
// a no intentar leerlos).
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import { ChevronDown, MonitorSmartphone, Car, Check, AlertTriangle, Briefcase, List, Rows3, Users, DollarSign } from 'lucide-react';
import type {
  PayrollSummary,
  PayrollEmployeeRow,
  PayrollEventItem,
  PayrollTravelSlot,
  PayrollClientBillingRecord,
} from '../../api/payroll';
import type { Quincena } from '../../lib/quincena';
import QuincenaNavigator from './QuincenaNavigator';
import PnlTables from './PnlTables';
import NetPayTable, { type RecordsKind } from './NetPayTable';
import {
  RateCell,
  ProfitCells,
  InvoiceCells,
  JobMoneyHeaders,
  fmtMoney2,
  type JobMoneyInfo,
  type RateSaveHandler,
} from './JobMoneyCells';
import { TZ } from '../../lib/timezone';


function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);
}

// Los eventos vienen en cuartos de hora (15min = 0.25h) — con 1 solo
// decimal, 2.75h ("2:15pm-3:00pm") se muestra como "2.8h" (redondeo
// estándar de toFixed, no un error de cálculo: el valor real sigue siendo
// 2.75 puertas adentro). 2 decimales alcanza para representar cualquier
// cuarto de hora exacto sin ese redondeo — reportado por el usuario
// viendo "2.8h" en vez de "2.75h" para un evento de 12:15pm a 3:00pm.
function fmtHours(n: number) {
  return `${n.toFixed(2)}h`;
}

// Adaptadores a la forma que esperan las celdas de plata compartidas
// (JobMoneyCells) — el evento de un cleaner trae SU ganancia; el registro de
// "Client revenue" trae la de todos los cleaners del trabajo.
function eventToJob(e: PayrollEventItem): JobMoneyInfo {
  return {
    eventId: e.id,
    startIso: e.startIso,
    durationH: e.durationH,
    attendeeCount: e.attendeeNames?.length || 1,
    billedRate: e.billedRate,
    clientId: e.clientId,
    cleanerPay: e.cleanerPay,
    businessProfit: e.businessProfit,
    invoiceStatus: e.invoiceStatus,
    paidDate: e.paidDate,
  };
}

function recordToJob(r: PayrollClientBillingRecord): JobMoneyInfo {
  return {
    eventId: r.eventId,
    startIso: r.startIso,
    durationH: r.durationH,
    attendeeCount: r.attendeeNames.length || 1,
    billedRate: r.billedRate,
    clientId: r.clientId,
    cleanerPay: r.cleanerPayTotal,
    businessProfit: r.businessProfit,
    invoiceStatus: r.invoiceStatus,
    paidDate: r.paidDate,
  };
}

// Mismo criterio que StaffCalendarPage.tsx: la pestaña es explícitamente de
// escritorio (criterio 1 del ticket) — en mobile se avisa en vez de
// aplastar la tabla.
const MOBILE_QUERY = '(max-width: 767px)';
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

interface StatTileProps {
  label: string;
  value: string;
  loading: boolean;
}
// Aviso de horas extra — pedido 2026-09-30: quién pasó las 40h de TRABAJO
// (sin traslado, decisión del usuario) en la quincena. Solo informa, no
// bloquea nada; admin-only (se arma con data.employees, que staff nunca ve
// completo — su propio resumen trae un único empleado, ella misma).
// Aviso de horas extra y feriados de la quincena (ley de BC, calculados en el
// backend): quién tiene horas a 1,5×/2× y cuánto se sumó, y qué feriado hubo.
function LaborRulesNotice({ employees, loading }: { employees: PayrollEmployeeRow[]; loading?: boolean }) {
  if (loading) return null;
  const overtime = employees
    .filter((e) => (e.overtimeHours15 ?? 0) + (e.overtimeHours2 ?? 0) > 0)
    .sort((a, b) => (b.overtimeMoney ?? 0) - (a.overtimeMoney ?? 0));
  const holidays = new Map<string, { name: string; paid: number; total: number }>();
  for (const e of employees) {
    for (const h of e.holidayDays ?? []) {
      const entry = holidays.get(h.date) ?? { name: h.name, paid: 0, total: 0 };
      if (h.eligible) entry.paid += 1;
      entry.total += h.amount;
      holidays.set(h.date, entry);
    }
  }
  if (overtime.length === 0 && holidays.size === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 sm:px-5 py-3 flex items-start gap-2.5">
      <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-amber-800 space-y-1">
        {overtime.length > 0 && (
          <p>
            <span className="font-semibold">
              Overtime for {overtime.length} cleaner{overtime.length === 1 ? '' : 's'}
            </span>{' '}
            (BC rules, already added to their pay):{' '}
            {overtime
              .map((e) => {
                const parts = [`${fmtHours(e.overtimeHours15 ?? 0)} at 1.5×`];
                if (e.overtimeHours2) parts.push(`${fmtHours(e.overtimeHours2)} at 2×`);
                return `${e.name} (${parts.join(', ')}, +${fmtCAD(e.overtimeMoney ?? 0)})`;
              })
              .join(', ')}
          </p>
        )}
        {[...holidays.entries()].map(([date, h]) => (
          <p key={date}>
            <span className="font-semibold">
              {h.name} ({date})
            </span>
            : holiday pay of {fmtCAD(h.total)} for {h.paid} eligible cleaner{h.paid === 1 ? '' : 's'}, added to their
            pay.
          </p>
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value, loading }: StatTileProps) {
  return (
    <div className="px-4 sm:px-5 py-4 sm:py-5">
      <p className="text-xs text-gray-400 mb-1.5">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold text-navy transition-opacity ${loading ? 'opacity-30' : ''}`}>
        {value}
      </p>
    </div>
  );
}

// Daily follow-up 2026-09-15 — mobile "My Hours" (staff) showed only the
// totals tiles + "Open this on a desktop screen", with no way to see WHICH
// jobs made up those hours without switching devices. The full per-employee
// TABLE genuinely doesn't fit a phone (that's still true for admin, who's
// comparing several employees side by side) — but staff's own view is
// always exactly one employee (getStaffPayrollSummary resolves req.cleaner's
// own employee id server-side), so there's nothing to compare against and a
// simple stacked list of their own jobs is the "minimum indispensable"
// detail: date/time, job name, duration, location — one card per event, no
// table chrome.
function MobileEventCard({ event }: { event: PayrollEventItem }) {
  const start = DateTime.fromISO(event.startIso, { zone: TZ });
  const end = DateTime.fromISO(event.endIso, { zone: TZ });
  return (
    <div className="px-4 py-3 border-b border-gray-100 last:border-0 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy truncate">
          {event.summary}
          {event.isRecurring && (
            <span className="ml-1.5 text-[10px] text-gray-400 uppercase tracking-wide font-normal">Recurring</span>
          )}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {start.toFormat('ccc, LLL d')} · {start.toFormat('h:mm a')} – {end.toFormat('h:mm a')}
        </p>
        {event.location && <p className="text-xs text-gray-400 mt-0.5 truncate">{event.location}</p>}
      </div>
      <span className="text-xs font-semibold text-navy flex-shrink-0 pt-0.5">{fmtHours(event.durationH)}</span>
    </div>
  );
}

function EmployeeEventsTable({ events }: { events: NonNullable<PayrollEmployeeRow['events']> }) {
  if (events.length === 0) {
    return <p className="text-xs text-gray-400 px-4 py-3">No events this period.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-400">
          <th className="font-medium px-4 py-1.5">Date</th>
          <th className="font-medium px-4 py-1.5">Job</th>
          <th className="font-medium px-4 py-1.5">Time</th>
          <th className="font-medium px-4 py-1.5">Duration</th>
          <th className="font-medium px-4 py-1.5">Location</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => {
          const start = DateTime.fromISO(e.startIso, { zone: TZ });
          const end = DateTime.fromISO(e.endIso, { zone: TZ });
          return (
            <tr key={e.id} className="border-t border-gray-100">
              <td className="px-4 py-1.5 text-gray-500 whitespace-nowrap">{start.toFormat('LLL d')}</td>
              <td className="px-4 py-1.5 text-gray-700">
                {e.summary}
                {e.isRecurring && (
                  <span className="ml-1.5 text-[10px] text-gray-400 uppercase tracking-wide">Recurring</span>
                )}
              </td>
              <td className="px-4 py-1.5 text-gray-500 whitespace-nowrap">
                {start.toFormat('h:mm a')} – {end.toFormat('h:mm a')}
              </td>
              <td className="px-4 py-1.5 text-gray-500 whitespace-nowrap">{fmtHours(e.durationH)}</td>
              <td className="px-4 py-1.5 text-gray-500 truncate max-w-xs">{e.location ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Travel slots (admin-only) ────────────────────────────────────────────
// Un tramo de traslado entre dos eventos consecutivos del mismo día. Si
// `needsReview` (hueco calculado >= 1h) es editable: el admin ve el
// cálculo de referencia y carga a mano cuántas horas se aplican de verdad.
// Nunca aparece en la vista de staff — el backend directamente no manda
// `travelSlots` para ese endpoint, esto no depende de ningún prop acá.
type SlotSaveHandler = (slot: PayrollTravelSlot, appliedHours: number) => Promise<void>;

function TravelSlotRow({
  slot,
  onSave,
}: {
  slot: PayrollTravelSlot;
  onSave?: SlotSaveHandler;
}) {
  const [draft, setDraft] = useState(String(slot.appliedHours));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const prevEnd = DateTime.fromISO(slot.prevEndIso, { zone: TZ });
  const nextStart = DateTime.fromISO(slot.nextStartIso, { zone: TZ });

  // Si el slot cambia por debajo (llegó un override nuevo tras un refresh),
  // el draft tiene que seguirlo — si no, "Save" mandaría un valor viejo.
  useEffect(() => {
    setDraft(String(slot.appliedHours));
  }, [slot.appliedHours]);

  async function handleSave() {
    const hours = Number(draft);
    if (!Number.isFinite(hours) || hours < 0 || !onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(slot, hours);
    } catch (e: any) {
      // Sin esto, un PATCH fallido (ej. la migración todavía no corrió)
      // quedaba como unhandled promise rejection — el botón dejaba de
      // girar y no pasaba nada más, el admin no se enteraba de que no se
      // guardó nada.
      setSaveError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="bg-amber-50/40">
      <td className="px-4 py-1.5 text-gray-400 whitespace-nowrap">{prevEnd.toFormat('LLL d')}</td>
      <td className="px-4 py-1.5 text-gray-500 italic" colSpan={2}>
        <span className="inline-flex items-center gap-1.5">
          <Car size={13} className="text-gray-400" />
          Travel — {slot.prevSummary} → {slot.nextSummary}
        </span>
        <span className="block text-[11px] text-gray-400 not-italic mt-0.5">
          {prevEnd.toFormat('h:mm a')} – {nextStart.toFormat('h:mm a')}
        </span>
      </td>
      <td className="px-4 py-1.5" colSpan={7}>
        {!slot.needsReview ? (
          <span className="text-gray-500 italic">{fmtHours(slot.appliedHours)}</span>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.25}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              className="w-16 px-1.5 py-1 text-xs border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <span className="text-[11px] text-gray-400">h · calc. {fmtHours(slot.calculatedHours)}</span>
            <button
              onClick={handleSave}
              disabled={saving || Number(draft) === slot.appliedHours}
              className="p-1 rounded-md text-amber-700 hover:bg-amber-100 disabled:opacity-30"
              title="Save"
            >
              <Check size={13} />
            </button>
            {slot.reviewedBy ? (
              <span className="text-[10px] text-gray-400">reviewed by {slot.reviewedBy}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                <AlertTriangle size={11} /> Needs review
              </span>
            )}
            {saveError && <span className="text-[10px] text-red-600">{saveError}</span>}
          </div>
        )}
      </td>
    </tr>
  );
}

type ItineraryItem =
  | { kind: 'job'; sortKey: string; event: PayrollEventItem }
  | { kind: 'travel'; sortKey: string; slot: PayrollTravelSlot };

function EmployeeItinerary({
  events,
  travelSlots,
  onSlotSave,
  onRateSave,
}: {
  events: PayrollEventItem[];
  travelSlots: PayrollTravelSlot[];
  onSlotSave?: SlotSaveHandler;
  onRateSave?: RateSaveHandler;
}) {
  if (events.length === 0 && travelSlots.length === 0) {
    return <p className="text-xs text-gray-400 px-4 py-3">No events this period.</p>;
  }

  const items: ItineraryItem[] = [
    ...events.map((event): ItineraryItem => ({ kind: 'job', sortKey: event.startIso, event })),
    ...travelSlots.map((slot): ItineraryItem => ({ kind: 'travel', sortKey: slot.prevEndIso, slot })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-400">
          <th className="font-medium px-4 py-1.5">Date</th>
          <th className="font-medium px-4 py-1.5">Job</th>
          <th className="font-medium px-4 py-1.5">Time</th>
          <th className="font-medium px-4 py-1.5">Duration</th>
          <th className="font-medium px-4 py-1.5">Location</th>
          <JobMoneyHeaders className="font-medium px-4 py-1.5 whitespace-nowrap" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) =>
          item.kind === 'travel' ? (
            <TravelSlotRow
              key={`travel-${item.slot.prevEventId}-${item.slot.nextEventId}`}
              slot={item.slot}
              onSave={onSlotSave}
            />
          ) : (
            (() => {
              const e = item.event;
              const start = DateTime.fromISO(e.startIso, { zone: TZ });
              const end = DateTime.fromISO(e.endIso, { zone: TZ });
              return (
                <tr key={e.id} className={`border-t border-gray-100 ${!e.clientId ? 'bg-red-50/50' : ''}`}>
                  <td className="px-4 py-1.5 text-gray-500 whitespace-nowrap">{start.toFormat('LLL d')}</td>
                  <td className="px-4 py-1.5 text-gray-700">
                    {e.summary}
                    {e.isRecurring && (
                      <span className="ml-1.5 text-[10px] text-gray-400 uppercase tracking-wide">Recurring</span>
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-gray-500 whitespace-nowrap">
                    {start.toFormat('h:mm a')} – {end.toFormat('h:mm a')}
                  </td>
                  <td className="px-4 py-1.5 text-gray-500 whitespace-nowrap">{fmtHours(e.durationH)}</td>
                  <td className="px-4 py-1.5 text-gray-500 truncate max-w-xs">{e.location ?? '—'}</td>
                  <RateCell job={eventToJob(e)} onSave={onRateSave} compact />
                  <ProfitCells job={eventToJob(e)} compact />
                  <InvoiceCells job={eventToJob(e)} compact />
                </tr>
              );
            })()
          ),
        )}
      </tbody>
    </table>
  );
}

// ── All records (admin-only, flat cross-employee feed) ───────────────────
// Pedido del usuario 2026-09-16: ver work hours y travel hours de TODOS los
// cleaners juntos, en orden cronológico, sin agrupar por persona — con
// filtros por cleaner, tipo y fecha. Vive enteramente client-side: el
// resumen de admin ya trae `events` + `travelSlots` completos por
// empleado, no hace falta pedirle nada nuevo al backend.
interface FlatRecord {
  kind: 'work' | 'travel';
  sortKey: string; // ISO — startIso del job, o prevEndIso del hueco (cuándo arranca)
  day: string; // YYYY-MM-DD, para el filtro de fecha
  employeeId: string;
  employeeName: string;
  /** Equipo de ese cleaner ese día (`daily_team_assignments`); null = sin asignar. */
  teamId: string | null;
  event?: PayrollEventItem;
  slot?: PayrollTravelSlot;
}

// Orden de los equipos dentro de un día: team_1, team_2, … y al final los
// cleaners sin equipo asignado ese día.
function teamRank(teamId: string | null): number {
  if (!teamId) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(teamId.replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER - 1;
}

function teamLabel(teamId: string | null): string {
  if (!teamId) return 'No team';
  const n = parseInt(teamId.replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? `Team ${n}` : teamId;
}

// Orden (pedido del usuario 2026-09-24): cronológico por día, pero dentro de
// cada día agrupado por equipo — primero todos los eventos y traslados del
// equipo 1, después los del 2, etc. Dentro de un equipo, por hora y, a igual
// hora, por cleaner (así el mismo evento de dos compañeros queda junto).
function buildFlatRecords(
  employees: PayrollEmployeeRow[],
  teamsByDay: Record<string, Record<string, string>> = {},
): FlatRecord[] {
  const records: FlatRecord[] = [];
  const teamOf = (day: string, employeeId: string) => teamsByDay[day]?.[employeeId] ?? null;
  for (const emp of employees) {
    for (const event of emp.events ?? []) {
      const day = event.startIso.slice(0, 10);
      records.push({
        kind: 'work',
        sortKey: event.startIso,
        day,
        employeeId: emp.employeeId,
        employeeName: emp.name,
        teamId: teamOf(day, emp.employeeId),
        event,
      });
    }
    for (const slot of emp.travelSlots ?? []) {
      records.push({
        kind: 'travel',
        sortKey: slot.prevEndIso,
        day: slot.day,
        employeeId: emp.employeeId,
        employeeName: emp.name,
        teamId: teamOf(slot.day, emp.employeeId),
        slot,
      });
    }
  }
  return records.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      teamRank(a.teamId) - teamRank(b.teamId) ||
      a.sortKey.localeCompare(b.sortKey) ||
      a.employeeName.localeCompare(b.employeeName),
  );
}

/** Pedido de filtro desde afuera (ej. las horas de Net pay): un cleaner y un
 *  solo tipo de hora. `nonce` cambia en cada click para que repetir el mismo
 *  link vuelva a aplicar el filtro aunque el admin lo haya tocado en el medio. */
interface RecordsFocus {
  employeeId: string;
  kind: RecordsKind;
  nonce: number;
}

function AllRecordsView({
  employees,
  teamsByDay,
  loading,
  focus,
  onFocusApplied,
  onSlotSave,
  onRateSave,
}: {
  employees: PayrollEmployeeRow[];
  teamsByDay?: Record<string, Record<string, string>>;
  loading?: boolean;
  focus?: RecordsFocus | null;
  /** Avisa que el pedido ya se aplicó, para que no se reaplique al remontar. */
  onFocusApplied?: () => void;
  onSlotSave?: (employeeId: string, slot: PayrollTravelSlot, appliedHours: number) => Promise<void>;
  onRateSave?: RateSaveHandler;
}) {
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [showWork, setShowWork] = useState(true);
  const [showTravel, setShowTravel] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // También corre al montarse: si el salto viene de otra pestaña, esta vista
  // recién aparece con el pedido ya hecho.
  useEffect(() => {
    if (!focus) return;
    setEmployeeFilter(focus.employeeId);
    setDayFilter('all');
    setShowWork(focus.kind === 'work');
    setShowTravel(focus.kind === 'travel');
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onFocusApplied?.();
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const allRecords = useMemo(() => buildFlatRecords(employees, teamsByDay), [employees, teamsByDay]);

  const days = useMemo(
    () => [...new Set(allRecords.map((r) => r.day))].sort(),
    [allRecords],
  );

  const filtered = allRecords.filter((r) => {
    if (employeeFilter !== 'all' && r.employeeId !== employeeFilter) return false;
    if (dayFilter !== 'all' && r.day !== dayFilter) return false;
    if (r.kind === 'work' && !showWork) return false;
    if (r.kind === 'travel' && !showTravel) return false;
    return true;
  });

  const selectCls =
    'text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

  return (
    <div
      ref={rootRef}
      className={`scroll-mt-20 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
        <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className={selectCls}>
          <option value="all">All employees</option>
          {employees.map((emp) => (
            <option key={emp.employeeId} value={emp.employeeId}>
              {emp.name}
            </option>
          ))}
        </select>

        <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} className={selectCls}>
          <option value="all">All dates</option>
          {days.map((day) => (
            <option key={day} value={day}>
              {DateTime.fromISO(day, { zone: TZ }).toFormat('ccc, LLL d')}
            </option>
          ))}
        </select>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium ml-auto">
          <button
            onClick={() => setShowWork((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
              showWork ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Briefcase size={12} /> Work hours
          </button>
          <button
            onClick={() => setShowTravel((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 transition-colors border-l border-gray-200 ${
              showTravel ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Car size={12} /> Travel hours
          </button>
        </div>
      </div>

      {/* ── Registros ──────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-6 text-center">No records match these filters.</p>
      ) : (
        // overflow-x-auto en vez de dejar que el overflow-hidden del wrapper
        // de afuera recorte el contenido en pantallas angostas — reportado
        // por el usuario con la columna "Hours" cortada. min-w asegura que
        // cada columna respire antes de activar el scroll horizontal.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Date</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Time</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Cleaner</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Type</th>
                <th className="font-medium px-4 sm:px-5 py-2">Description</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Hours</th>
                <JobMoneyHeaders className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const prev = filtered[i - 1];
                const newGroup = !prev || prev.day !== r.day || prev.teamId !== r.teamId;
                // Cleaners del grupo (día + equipo) que quedaron a la vista.
                const members = newGroup
                  ? [...new Set(filtered.filter((x) => x.day === r.day && x.teamId === r.teamId).map((x) => x.employeeName))]
                  : [];
                return (
                  <Fragment key={r.kind === 'work' ? `w-${r.employeeId}-${r.event!.id}` : `t-${r.employeeId}-${r.slot!.prevEventId}-${r.slot!.nextEventId}`}>
                    {newGroup && (
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={11} className="px-4 sm:px-5 py-1.5 text-[11px] font-semibold text-navy">
                          {DateTime.fromISO(r.day, { zone: TZ }).toFormat('ccc, LLL d')}
                          <span className="mx-1.5 text-gray-300">·</span>
                          {teamLabel(r.teamId)}
                          <span className="ml-2 font-normal text-gray-400">{members.join(', ')}</span>
                        </td>
                      </tr>
                    )}
                    {r.kind === 'work' ? (
                      <WorkRecordRow record={r} onRateSave={onRateSave} />
                    ) : (
                      <TravelRecordRow
                        record={r}
                        onSave={onSlotSave ? (slot, hours) => onSlotSave(r.employeeId, slot, hours) : undefined}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WorkRecordRow({ record, onRateSave }: { record: FlatRecord; onRateSave?: RateSaveHandler }) {
  const e = record.event!;
  const start = DateTime.fromISO(e.startIso, { zone: TZ });
  const end = DateTime.fromISO(e.endIso, { zone: TZ });
  return (
    <tr className={`border-t border-gray-100 ${!e.clientId ? 'bg-red-50/50' : ''}`}>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">{start.toFormat('LLL d')}</td>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">
        {start.toFormat('h:mm a')} – {end.toFormat('h:mm a')}
      </td>
      <td className="px-4 sm:px-5 py-2 font-medium text-navy whitespace-nowrap">{record.employeeName}</td>
      <td className="px-4 sm:px-5 py-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          <Briefcase size={11} /> Work
        </span>
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-700">
        {e.summary}
        {e.isRecurring && <span className="ml-1.5 text-[10px] text-gray-400 uppercase tracking-wide">Recurring</span>}
        {e.location && <span className="block text-[11px] text-gray-400 mt-0.5 truncate max-w-xs">{e.location}</span>}
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-600 whitespace-nowrap">{fmtHours(e.durationH)}</td>
      <RateCell job={eventToJob(e)} onSave={onRateSave} />
      <ProfitCells job={eventToJob(e)} />
      <InvoiceCells job={eventToJob(e)} />
    </tr>
  );
}

function TravelRecordRow({
  record,
  onSave,
}: {
  record: FlatRecord;
  onSave?: SlotSaveHandler;
}) {
  const slot = record.slot!;
  const [draft, setDraft] = useState(String(slot.appliedHours));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const prevEnd = DateTime.fromISO(slot.prevEndIso, { zone: TZ });
  const nextStart = DateTime.fromISO(slot.nextStartIso, { zone: TZ });

  useEffect(() => {
    setDraft(String(slot.appliedHours));
  }, [slot.appliedHours]);

  async function handleSave() {
    const hours = Number(draft);
    if (!Number.isFinite(hours) || hours < 0 || !onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(slot, hours);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-gray-100 bg-amber-50/40">
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">{prevEnd.toFormat('LLL d')}</td>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">
        {prevEnd.toFormat('h:mm a')} – {nextStart.toFormat('h:mm a')}
      </td>
      <td className="px-4 sm:px-5 py-2 font-medium text-navy whitespace-nowrap">{record.employeeName}</td>
      <td className="px-4 sm:px-5 py-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          <Car size={11} /> Travel
        </span>
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-500 italic">
        {slot.prevSummary} → {slot.nextSummary}
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-600">
        {!slot.needsReview ? (
          <span className="italic whitespace-nowrap">{fmtHours(slot.appliedHours)}</span>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={0}
              step={0.25}
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              disabled={saving}
              className="w-16 px-1.5 py-1 text-xs border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <span className="text-[11px] text-gray-400 whitespace-nowrap">h · calc. {fmtHours(slot.calculatedHours)}</span>
            <button
              onClick={handleSave}
              disabled={saving || Number(draft) === slot.appliedHours}
              className="p-1 rounded-md text-amber-700 hover:bg-amber-100 disabled:opacity-30"
              title="Save"
            >
              <Check size={13} />
            </button>
            {slot.reviewedBy ? (
              <span className="text-[10px] text-gray-400 whitespace-nowrap">reviewed by {slot.reviewedBy}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 whitespace-nowrap">
                <AlertTriangle size={11} /> Needs review
              </span>
            )}
            {saveError && <span className="text-[10px] text-red-600">{saveError}</span>}
          </div>
        )}
      </td>
      <td colSpan={5} />
    </tr>
  );
}

// ── Client revenue (admin-only, LAB428 2026-09-17) ───────────────────────
// Un registro por SERVICIO facturado, ya deduplicado por el backend
// (data.clientBilling) — a diferencia de "All records", acá cada evento
// aparece UNA sola vez aunque lo hayan trabajado 2 cleaners. El monto
// calculado es solo una referencia (durationH × cleaners asignados × tarifa
// vigente a la fecha del evento) — no hay forma de reconstruir el monto
// COTIZADO real de un evento ya trabajado (cada casa tiene su propia
// cotización), así que el campo queda siempre editable para que el admin lo
// corrija contra su propia facturación real.
type ClientBillingSaveHandler = (
  eventId: string,
  appliedAmount: number,
  calculatedAmount: number,
) => Promise<void>;

function ClientBillingRow({
  record,
  onSave,
  onRateSave,
}: {
  record: PayrollClientBillingRecord;
  onSave?: ClientBillingSaveHandler;
  onRateSave?: RateSaveHandler;
}) {
  const [draft, setDraft] = useState(String(record.appliedAmount));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const start = DateTime.fromISO(record.startIso, { zone: TZ });
  const end = DateTime.fromISO(record.endIso, { zone: TZ });
  const wasEdited = record.appliedAmount !== record.calculatedAmount;

  // Si el registro cambia por debajo (otro admin lo editó, o llegó un
  // refresh), el draft tiene que seguirlo — mismo criterio que TravelSlotRow.
  useEffect(() => {
    setDraft(String(record.appliedAmount));
  }, [record.appliedAmount]);

  async function handleSave() {
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount < 0 || !onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(record.eventId, amount, record.calculatedAmount);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className={`border-t border-gray-100 ${!record.clientId ? 'bg-red-50/50' : ''}`}>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">{start.toFormat('LLL d')}</td>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">
        {start.toFormat('h:mm a')} – {end.toFormat('h:mm a')}
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-700">
        {record.summary}
        {record.location && (
          <span className="block text-[11px] text-gray-400 mt-0.5 truncate max-w-xs">{record.location}</span>
        )}
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">{record.serviceType ?? '—'}</td>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">
        {record.attendeeNames.length ? record.attendeeNames.join(', ') : '—'}
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-500 whitespace-nowrap">{fmtHours(record.durationH)}</td>
      <RateCell job={recordToJob(record)} onSave={onRateSave} />
      <td className="px-4 sm:px-5 py-2">
        <div
          className="flex items-center gap-2 flex-wrap"
          title={`Calculated: ${fmtMoney2(record.calculatedAmount)} (@ $${record.billedRate}/h × ${record.attendeeNames.length || 1} cleaner(s) + GST)`}
        >
          <input
            type="number"
            min={0}
            step={0.01}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            className="w-20 px-1.5 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-navy"
          />
          <button
            onClick={handleSave}
            disabled={saving || Number(draft) === record.appliedAmount}
            className="p-1 rounded-md text-navy hover:bg-gray-100 disabled:opacity-30"
            title="Save"
          >
            <Check size={13} />
          </button>
          {wasEdited && record.billingReviewedBy && (
            <span className="text-[10px] text-gray-400 whitespace-nowrap">edited by {record.billingReviewedBy}</span>
          )}
          {saveError && <span className="text-[10px] text-red-600">{saveError}</span>}
        </div>
      </td>
      <ProfitCells job={recordToJob(record)} />
      <InvoiceCells job={recordToJob(record)} />
    </tr>
  );
}

function ClientRevenueView({
  records,
  loading,
  onSave,
  onRateSave,
}: {
  records: PayrollClientBillingRecord[];
  loading?: boolean;
  onSave?: ClientBillingSaveHandler;
  onRateSave?: RateSaveHandler;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {records.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-6 text-center">No billed services this fortnight.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Date</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Time</th>
                <th className="font-medium px-4 sm:px-5 py-2 w-72">Client / Job</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Type</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Cleaners</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Hours</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Rate</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Billed</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Cleaner pay</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Business profit</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Invoice</th>
                <th className="font-medium px-4 sm:px-5 py-2 whitespace-nowrap">Paid</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <ClientBillingRow key={r.eventId} record={r} onSave={onSave} onRateSave={onRateSave} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface PayrollSummaryViewProps {
  data: PayrollSummary | null;
  showMoney: boolean;
  period: Quincena;
  onPeriodChange: (q: Quincena) => void;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
  /** Solo AdminPayrollPage lo pasa — persiste la revisión manual de un tramo. */
  onTravelSlotSave?: (employeeId: string, slot: PayrollTravelSlot, appliedHours: number) => Promise<void>;
  /** Solo AdminPayrollPage lo pasa — persiste la corrección manual del monto
   * facturado de un evento (pestaña "Client revenue"). */
  onClientBillingSave?: ClientBillingSaveHandler;
  /** Solo AdminPayrollPage lo pasa — edita la tarifa aplicada al cliente en
   * un trabajo (actualiza clients.rate en el CRM y fija el monto del trabajo). */
  onClientRateSave?: RateSaveHandler;
  /** Contenido de la pestaña "Activity", entre los totales generales y el
   * desglose de Employees/Client revenue — AdminPayrollPage pone acá
   * New services (pedido 2026-09-29). Staff no tiene nada que poner. */
  middleSlot?: ReactNode;
  /** 4ª columna de la fila de arriba, junto a Net pay — AdminPayrollPage pone
   * acá el Payroll check (pedido 2026-09-29). Admin-only. */
  checklistSlot?: ReactNode;
  /** Contenido completo de la pestaña "Payments" (Pagos Experimental, gastos,
   * dividendos, extras, deducciones, bonos, propinas) — lo arma
   * AdminPayrollPage. Admin-only; si no se pasa, no hay pestaña "Payments". */
  paymentsContent?: ReactNode;
  /** Contenido de la pestaña "Annual Summary" (2026-10-01) — réplica de la
   * hoja Excel del mismo nombre, SIN período (no depende de `period`/`data`,
   * tiene su propio selector de año). Admin-only; si no se pasa, no hay
   * pestaña "Annual Summary". */
  annualSummaryContent?: ReactNode;
}

// Pestañas de arriba de todo, DEBAJO de las 4 columnas (resumen/gastos/Net
// pay/Payroll check) — pedido explícito 2026-09-29: separar "lo que pasó"
// (horas, servicios, clientes) de "la plata que se mueve" (Pagos
// Experimental y los ajustes). Admin-only y desktop-only (mismo criterio que
// el viejo toggle Employees/Client revenue, que ahora vive DENTRO de
// "Activity"): staff nunca recibe `paymentsContent`, así que este tipo no le
// afecta.
type PageTab = 'activity' | 'payments' | 'annual';

export default function PayrollSummaryView({
  data,
  showMoney,
  period,
  onPeriodChange,
  loading,
  error,
  onRefresh,
  onTravelSlotSave,
  onClientBillingSave,
  onClientRateSave,
  middleSlot,
  checklistSlot,
  paymentsContent,
  annualSummaryContent,
}: PayrollSummaryViewProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Payments primero (pedido 2026-11-02): es donde se cargan los gastos para
  // cerrar la quincena. Sin `paymentsContent` (staff) solo existe Activity.
  const [pageTab, setPageTab] = useState<PageTab>(paymentsContent ? 'payments' : 'activity');
  // Pestaña DENTRO de "Activity": horas/pago de cleaners vs. cuánto se le
  // cobró al cliente — pedido explícito del usuario 2026-09-17 para no
  // mezclar los dos conceptos en una sola tabla. Ambas son admin-only
  // (necesitan travelSlots/clientBilling, que el backend nunca manda a staff).
  const [mainTab, setMainTab] = useState<'employees' | 'clientRevenue'>('clientRevenue');
  // Sub-vista DENTRO de "Employees" — se mantenía como único toggle antes de
  // que existiera la pestaña "Client revenue".
  const [employeeSubView, setEmployeeSubView] = useState<'byEmployee' | 'allRecords'>('allRecords');
  const [recordsFocus, setRecordsFocus] = useState<RecordsFocus | null>(null);

  // Horas de Net pay → Activity › Employees › All records, filtrado por ese
  // cleaner y por ese tipo de hora.
  function showRecords(employeeId: string, kind: RecordsKind) {
    setPageTab('activity');
    setMainTab('employees');
    setEmployeeSubView('allRecords');
    setRecordsFocus({ employeeId, kind, nonce: Date.now() });
  }

  function toggleExpanded(employeeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  const totals = data?.totals;

  // ── "General totals" — común a staff y a la pestaña "Activity" de admin.
  // En mobile se ve también (criterio 1 es sobre la pestaña/tabla ancha, no
  // sobre negarle los totales a un cleaner que abre esto desde el celular).
  const generalTotals = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div
        className={`grid grid-cols-2 divide-x divide-y divide-gray-100 ${showMoney ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} sm:divide-y-0`}
      >
        <StatTile label="Employees" value={loading ? '—' : String(totals?.employeeCount ?? 0)} loading={loading} />
        <StatTile label="Events" value={loading ? '—' : String(totals?.eventCount ?? 0)} loading={loading} />
        <StatTile label="Work hours" value={loading ? '—' : fmtHours(totals?.workHours ?? 0)} loading={loading} />
        <StatTile label="Travel hours" value={loading ? '—' : fmtHours(totals?.travelHours ?? 0)} loading={loading} />
        {showMoney && (
          <StatTile label="Total earned" value={loading ? '—' : fmtCAD(totals?.totalMoney ?? 0)} loading={loading} />
        )}
      </div>
    </div>
  );

  // ── Tabla por empleado (expandible) — compartida por STAFF (su única
  // vista de escritorio) y por admin en "By employee". Comparar varios
  // empleados lado a lado necesita el ancho de un escritorio; en mobile
  // ADMIN ve un aviso en vez de que se aplaste (criterio 1). La vista propia
  // de staff siempre es UN empleado (ver comentario de MobileEventCard) —
  // no hay nada que comparar, así que en mobile staff ve una lista simple de
  // sus propios trabajos en vez del aviso.
  const byEmployeeTable = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="font-medium px-4 sm:px-5 py-3"></th>
            <th className="font-medium px-4 sm:px-5 py-3">Employee</th>
            <th className="font-medium px-4 sm:px-5 py-3">Events</th>
            <th className="font-medium px-4 sm:px-5 py-3">Work hours</th>
            <th className="font-medium px-4 sm:px-5 py-3">Travel hours</th>
            {showMoney && <th className="font-medium px-4 sm:px-5 py-3">Overtime</th>}
            {showMoney && <th className="font-medium px-4 sm:px-5 py-3">Holiday pay</th>}
            {showMoney && <th className="font-medium px-4 sm:px-5 py-3">Earned</th>}
            {showMoney && <th className="font-medium px-4 sm:px-5 py-3">Deductions</th>}
            {showMoney && <th className="font-medium px-4 sm:px-5 py-3">Net pay</th>}
          </tr>
        </thead>
        <tbody>
          {!loading && (data?.employees.length ?? 0) === 0 && (
            <tr>
              <td colSpan={showMoney ? 10 : 5} className="px-4 sm:px-5 py-6 text-center text-xs text-gray-400">
                No employees to show for this fortnight.
              </td>
            </tr>
          )}
          {(data?.employees ?? []).map((row) => {
            const canExpand = Boolean(row.events);
            const isOpen = expanded.has(row.employeeId);
            return (
              <Fragment key={row.employeeId}>
                <tr
                  className={`border-t border-gray-100 ${canExpand ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  onClick={() => canExpand && toggleExpanded(row.employeeId)}
                >
                  <td className="px-4 sm:px-5 py-3 w-6">
                    {canExpand && (
                      <ChevronDown
                        size={14}
                        className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    )}
                  </td>
                  <td className="px-4 sm:px-5 py-3 font-medium text-navy">{row.name}</td>
                  <td className="px-4 sm:px-5 py-3 text-gray-600">{row.eventCount}</td>
                  <td className="px-4 sm:px-5 py-3 text-gray-600">{fmtHours(row.workHours)}</td>
                  <td className="px-4 sm:px-5 py-3 text-gray-600">{fmtHours(row.travelHours)}</td>
                  {showMoney && (
                    <td
                      className="px-4 sm:px-5 py-3 text-gray-600"
                      title="Hours past 8 per day (1.5×; 2× past 12) and past 40 per week (1.5×). The amount is the extra over the normal pay."
                    >
                      {(row.overtimeHours15 ?? 0) + (row.overtimeHours2 ?? 0) > 0 ? (
                        <>
                          {fmtHours((row.overtimeHours15 ?? 0) + (row.overtimeHours2 ?? 0))}
                          <span className="block text-[10px] text-gray-400">+{fmtCAD(row.overtimeMoney ?? 0)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  {showMoney && (
                    <td
                      className="px-4 sm:px-5 py-3 text-gray-600"
                      title={(row.holidayDays ?? [])
                        .map((h) =>
                          h.eligible
                            ? `${h.name}: average day ${fmtCAD(h.avgDayPay)}${h.worked ? ` + worked ${fmtHours(h.hoursWorked)} (+${fmtCAD(h.premium)})` : ''}`
                            : `${h.name}: not eligible (${h.daysWorkedInWindow} of the last 30 days worked, needs 15)`,
                        )
                        .join(String.fromCharCode(10))}
                    >
                      {(row.holidayMoney ?? 0) > 0 ? `+${fmtCAD(row.holidayMoney ?? 0)}` : '—'}
                    </td>
                  )}
                  {showMoney && (
                    <td className="px-4 sm:px-5 py-3 font-medium text-navy">
                      {fmtCAD(row.totalMoney ?? 0)}
                    </td>
                  )}
                  {showMoney && (
                    <td className="px-4 sm:px-5 py-3 text-gray-500">
                      {(row.deductions ?? 0) > 0 ? `− ${fmtCAD(row.deductions ?? 0)}` : '—'}
                    </td>
                  )}
                  {showMoney && (
                    <td className="px-4 sm:px-5 py-3 font-semibold text-navy">
                      {fmtCAD(row.netPay ?? row.totalMoney ?? 0)}
                    </td>
                  )}
                </tr>
                {canExpand && isOpen && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={showMoney ? 10 : 5} className="p-0">
                      {row.travelSlots ? (
                        <EmployeeItinerary
                          events={row.events!}
                          travelSlots={row.travelSlots}
                          onSlotSave={
                            onTravelSlotSave
                              ? (slot, hours) => onTravelSlotSave(row.employeeId, slot, hours)
                              : undefined
                          }
                          onRateSave={onClientRateSave}
                        />
                      ) : (
                        <EmployeeEventsTable events={row.events!} />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );

  // ── Pestaña "Activity" (admin) / contenido único (staff): totales +
  // New services (middleSlot) + el viejo desglose Employees/Client revenue.
  const activityContent = (
    <>
      {generalTotals}
      {showMoney && <LaborRulesNotice employees={data?.employees ?? []} loading={loading} />}
      {middleSlot}

      {/* ── Pestaña "Employees" / "Client revenue" — admin-only (necesita
          travelSlots/clientBilling). Botones agrandados (pedido 2026-09-17). */}
      {showMoney && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium w-fit">
          <button
            onClick={() => setMainTab('clientRevenue')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 transition-colors ${
              mainTab === 'clientRevenue' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <DollarSign size={16} /> Client revenue
          </button>
          <button
            onClick={() => setMainTab('employees')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 transition-colors border-l border-gray-200 ${
              mainTab === 'employees' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Users size={16} /> Employees
          </button>
        </div>
      )}

      {/* ── Toggle "By employee" / "All records" — solo dentro de la
          pestaña "Employees". ──────────────────────────────────────────── */}
      {showMoney && mainTab === 'employees' && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium w-fit">
          <button
            onClick={() => setEmployeeSubView('allRecords')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
              employeeSubView === 'allRecords' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <List size={13} /> All records
          </button>
          <button
            onClick={() => setEmployeeSubView('byEmployee')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-gray-200 ${
              employeeSubView === 'byEmployee' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Rows3 size={13} /> By employee
          </button>
        </div>
      )}

      {showMoney && mainTab === 'clientRevenue' ? (
        // Se renderiza siempre (no un `loading ? spinner : <ClientRevenueView>`)
        // a propósito, mismo criterio que AllRecordsView — desmontarlo
        // mientras se recarga (justo después de guardar una corrección de
        // monto) perdería cualquier estado local de fila que estuviera
        // editando el admin. `loading` solo atenúa la tabla existente.
        <ClientRevenueView
          records={data?.clientBilling ?? []}
          loading={loading}
          onSave={onClientBillingSave}
          onRateSave={onClientRateSave}
        />
      ) : showMoney && employeeSubView === 'allRecords' ? (
        // Se renderiza siempre (no un `loading ? spinner : <AllRecordsView>`)
        // a propósito — desmontarlo mientras se recarga (ej. justo después
        // de guardar una revisión de traslado) le resetea los filtros
        // propios (employeeFilter/dayFilter/showWork/showTravel) al admin
        // en la cara. `loading` solo atenúa la tabla existente.
        <AllRecordsView
          employees={data?.employees ?? []}
          teamsByDay={data?.teamsByDay}
          loading={loading}
          focus={recordsFocus}
          onFocusApplied={() => setRecordsFocus(null)}
          onSlotSave={onTravelSlotSave}
          onRateSave={onClientRateSave}
        />
      ) : (
        byEmployeeTable
      )}
    </>
  );

  return (
    <div className={`${showMoney ? 'max-w-[1800px]' : 'max-w-7xl'} mx-auto px-4 sm:px-6 py-6 space-y-4`}>
      {/* Sticky (pedido 2026-09-29): el selector de quincena se puede usar
          desde cualquier punto del scroll de la página, no solo arriba de
          todo. `bg-gray-50` tapa el contenido que pasa por detrás (mismo
          fondo que <body> de la página, ver AdminPayrollPage/StaffPayrollPage). */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-50">
        <QuincenaNavigator
          period={period}
          onPeriodChange={onPeriodChange}
          loading={loading}
          onRefresh={onRefresh}
        />
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-xs text-red-600 bg-red-50 border border-red-100">{error}</div>
      )}

      {/* ── Resumen de la quincena (admin-only) — estilo planilla: totales,
          gastos relevantes, Net pay y Payroll check, siempre visibles sin
          importar la pestaña de abajo (pedido 2026-09-29). Ausente para
          staff — el backend directamente no manda `pnl` para ese endpoint. */}
      {data?.pnl && (
        <PnlTables
          pnl={data.pnl}
          loading={loading}
          onChanged={() => onRefresh?.()}
          locked={Boolean(data.closing)}
          aside={
            data.netPaySummary && (
              <NetPayTable
                summary={data.netPaySummary}
                loading={loading}
                onShowRecords={showMoney && !isMobile ? showRecords : undefined}
              />
            )
          }
          aside2={checklistSlot}
        />
      )}

      {isMobile && showMoney ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-8 text-center text-gray-500">
          <MonitorSmartphone size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-navy mb-1">Open this on a desktop screen</p>
          <p className="text-xs text-gray-400">
            The breakdown by employee needs more room than a phone screen gives it.
          </p>
        </div>
      ) : isMobile ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <p className="text-xs text-gray-400 px-4 py-6 text-center">Loading...</p>
          ) : (data?.employees[0]?.events?.length ?? 0) === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-6 text-center">No events this period.</p>
          ) : (
            data!.employees[0].events!.map((e) => <MobileEventCard key={e.id} event={e} />)
          )}
        </div>
      ) : showMoney ? (
        <>
          {/* ── Pestañas "Activity" / "Payments" (pedido 2026-09-29): lo que
              pasó (horas, servicios, clientes) separado de la plata que se
              mueve (Pagos Experimental y los ajustes). Solo tiene sentido si
              AdminPayrollPage mandó `paymentsContent` — si no vino, no hay
              nada que mostrar en "Payments" y el toggle no aporta nada. ──── */}
          {paymentsContent || annualSummaryContent ? (
            <>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium w-fit">
                {paymentsContent && (
                  <button
                    onClick={() => setPageTab('payments')}
                    className={`px-4 py-2.5 transition-colors ${
                      pageTab === 'payments' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    Payments
                  </button>
                )}
                <button
                  onClick={() => setPageTab('activity')}
                  className={`px-4 py-2.5 transition-colors ${paymentsContent ? 'border-l border-gray-200' : ''} ${
                    pageTab === 'activity' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Activity
                </button>
                {annualSummaryContent && (
                  <button
                    onClick={() => setPageTab('annual')}
                    className={`px-4 py-2.5 transition-colors border-l border-gray-200 ${
                      pageTab === 'annual' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    Annual Summary
                  </button>
                )}
              </div>
              {pageTab === 'payments' ? paymentsContent : pageTab === 'annual' ? annualSummaryContent : activityContent}
            </>
          ) : (
            activityContent
          )}
        </>
      ) : (
        <>
          {generalTotals}
          {middleSlot}
          {byEmployeeTable}
        </>
      )}
    </div>
  );
}
