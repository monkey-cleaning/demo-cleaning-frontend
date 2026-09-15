// components/payroll/PayrollSummaryView.tsx
// LAB428 — vista compartida de la pestaña "Payroll", usada tanto en
// /admin/payroll (showMoney) como en /staff/payroll (sin showMoney — el
// backend de staff ya no manda esos campos, este componente solo se limita
// a no intentar leerlos).
import { Fragment, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, MonitorSmartphone } from 'lucide-react';
import type { PayrollSummary, PayrollEmployeeRow } from '../../api/payroll';
import { type Quincena, quincenaLabel, shiftQuincena, isCurrentOrFuture } from '../../lib/quincena';

const TZ = 'America/Vancouver';

function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtHours(n: number) {
  return `${n.toFixed(1)}h`;
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

interface PayrollSummaryViewProps {
  data: PayrollSummary | null;
  showMoney: boolean;
  period: Quincena;
  onPeriodChange: (q: Quincena) => void;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

export default function PayrollSummaryView({
  data,
  showMoney,
  period,
  onPeriodChange,
  loading,
  error,
  onRefresh,
}: PayrollSummaryViewProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(employeeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  const totals = data?.totals;
  // El botón "next" tiene que quedar habilitado mientras se esté viendo una
  // quincena PASADA (para poder volver a la actual) y deshabilitado recién
  // al llegar a la actual — no al estar a un paso de ella. Ojo: comparar
  // contra `shiftQuincena(period, 1)` en vez de `period` deshabilitaba
  // "next" un paso antes de tiempo (viendo la quincena anterior a la
  // actual, ya no se podía volver).
  const nextDisabled = isCurrentOrFuture(period);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* ── Period navigator ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPeriodChange(shiftQuincena(period, -1))}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-40"
            aria-label="Previous fortnight"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-navy min-w-[140px] text-center">
            {quincenaLabel(period)}
          </span>
          <button
            onClick={() => onPeriodChange(shiftQuincena(period, 1))}
            disabled={loading || nextDisabled}
            className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-40"
            aria-label="Next fortnight"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-xs text-red-600 bg-red-50 border border-red-100">{error}</div>
      )}

      {/* ── General totals — se ve en mobile también, es lo que pidió el
          usuario (criterio 1 es sobre la pestaña/tabla, no sobre negarle
          los totales a un cleaner que abre esto desde el celular) ──────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div
          className={`grid grid-cols-2 divide-x divide-y divide-gray-100 ${showMoney ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} sm:divide-y-0`}
        >
          <StatTile label="Employees" value={loading ? '—' : String(totals?.employeeCount ?? 0)} loading={loading} />
          <StatTile label="Events" value={loading ? '—' : String(totals?.eventCount ?? 0)} loading={loading} />
          <StatTile label="Work hours" value={loading ? '—' : fmtHours(totals?.workHours ?? 0)} loading={loading} />
          <StatTile label="Travel hours" value={loading ? '—' : fmtHours(totals?.travelHours ?? 0)} loading={loading} />
          {showMoney && (
            <StatTile
              label="Total earned"
              value={loading ? '—' : fmtCAD(totals?.totalMoney ?? 0)}
              loading={loading}
            />
          )}
        </div>
      </div>

      {/* ── Per-employee table — el desglose por empleado (con el detalle de
          eventos) sí necesita el ancho de un escritorio; en mobile se avisa
          en vez de aplastarlo (criterio 1: la pestaña es de escritorio). ── */}
      {isMobile ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-8 text-center text-gray-500">
          <MonitorSmartphone size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-navy mb-1">Open this on a desktop screen</p>
          <p className="text-xs text-gray-400">
            The breakdown by employee needs more room than a phone screen gives it.
          </p>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="font-medium px-4 sm:px-5 py-3"></th>
              <th className="font-medium px-4 sm:px-5 py-3">Employee</th>
              <th className="font-medium px-4 sm:px-5 py-3">Events</th>
              <th className="font-medium px-4 sm:px-5 py-3">Work hours</th>
              <th className="font-medium px-4 sm:px-5 py-3">Travel hours</th>
              {showMoney && <th className="font-medium px-4 sm:px-5 py-3">Earned</th>}
            </tr>
          </thead>
          <tbody>
            {!loading && (data?.employees.length ?? 0) === 0 && (
              <tr>
                <td colSpan={showMoney ? 6 : 5} className="px-4 sm:px-5 py-6 text-center text-xs text-gray-400">
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
                      <td className="px-4 sm:px-5 py-3 font-medium text-navy">
                        {fmtCAD(row.totalMoney ?? 0)}
                      </td>
                    )}
                  </tr>
                  {canExpand && isOpen && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={showMoney ? 6 : 5} className="p-0">
                        <EmployeeEventsTable events={row.events!} />
                      </td>
                    </tr>
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
