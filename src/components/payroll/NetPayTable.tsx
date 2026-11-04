// components/payroll/NetPayTable.tsx
// Payroll — tabla NET PAY de la planilla manual ("A Pagar | Monto" por
// persona), en el resumen de arriba. Solo lectura (pedido explícito
// 2026-09-29: dejó de ser editable) — es ganado + bonos + propinas −
// deducciones; si algún cleaner quedó con un override manual de una edición
// vieja, se sigue mostrando (marcado como "edited"), pero ya no se puede
// crear ni sacar uno nuevo desde acá. El desglose completo (eventos, horas,
// ganado, deducciones) sigue en la tabla de Employees de más abajo — esto es
// solo el resumen.
import { useState } from 'react';
import type { PayrollNetPayRow, PayrollNetPaySummary, PayrollStakeholderPayment } from '../../api/payroll';
import { useCollapsed, Chevron } from './Collapsible';

function fmt(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

// Horas con hasta 2 decimales, sin ceros de relleno (59.25, 7, 0.5).
function fmtHours(n: number) {
  return `${Number(n.toFixed(2))} h`;
}

function hoursLabel(workHours?: number, travelHours?: number) {
  if (workHours === undefined && travelHours === undefined) return null;
  return `Work ${fmtHours(workHours ?? 0)} · Travel ${fmtHours(travelHours ?? 0)}`;
}

function breakdown(row: PayrollNetPayRow) {
  const parts = [`Earned ${fmt(row.earned)}`];
  if (row.bonuses) parts.push(`+ Bonuses ${fmt(row.bonuses)}`);
  if (row.tips) parts.push(`+ Tips ${fmt(row.tips)}`);
  if (row.deductions) parts.push(`− Deductions ${fmt(row.deductions)}`);
  parts.push(`= ${fmt(row.calculated)}`);
  return parts.join(' ');
}

// Pago extra = horas extra + feriados, plata por encima del pago normal por hora.
const extraOf = (row: PayrollNetPayRow) => (row.overtimeMoney ?? 0) + (row.holidayMoney ?? 0);

function extraTooltip(row: PayrollNetPayRow) {
  const lines = [
    row.extraIncluded === false
      ? 'Extra pay on top of regular hourly pay. NOT included in the amount on the right: it is paid through the payment plan (see the Payment table).'
      : 'Extra pay on top of regular hourly pay. Already included in the amount on the right.',
  ];
  if ((row.overtimeMoney ?? 0) > 0) {
    const parts = [];
    if ((row.overtimeHours15 ?? 0) > 0) parts.push(`${fmtHours(row.overtimeHours15 ?? 0)} at 1.5×`);
    if ((row.overtimeHours2 ?? 0) > 0) parts.push(`${fmtHours(row.overtimeHours2 ?? 0)} at 2×`);
    lines.push(`• Overtime: ${parts.join(' + ')} → ${fmt(row.overtimeMoney ?? 0)}`);
  }
  for (const h of row.holidays ?? []) {
    lines.push(`• Holiday pay: ${h.name} (${h.worked ? 'worked' : 'not worked'}) → ${fmt(h.amount)}`);
  }
  return lines.join('\n');
}

/** Qué horas mirar al saltar a Activity → Employees → All records. */
export type RecordsKind = 'work' | 'travel';

// Las horas de cada cleaner llevan al detalle: mismo cleaner, solo ese tipo.
// Con 0 h no hay nada que ver, así que queda como texto plano.
function HoursLink({ label, hours, onClick }: { label: string; hours: number; onClick: () => void }) {
  const text = `${label} ${fmtHours(hours)}`;
  if (hours <= 0) return <>{text}</>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="tabular-nums underline-offset-2 hover:text-navy hover:underline cursor-pointer"
      title="See the detail in Activity → Employees → All records"
    >
      {text}
    </button>
  );
}

// Columnas de ancho fijo a la derecha del nombre: el pago extra y el monto
// quedan alineados en todas las filas, tenga o no extra.
const EXTRA_COL = 'w-20 flex-shrink-0 text-right';
// Ancho de sobra para el total (text-base bold) sin correr la columna del extra.
const AMOUNT_COL = 'w-[6.5rem] flex-shrink-0 text-right';

function NetPayRow({
  row,
  showExtra,
  onShowRecords,
}: {
  row: PayrollNetPayRow;
  showExtra: boolean;
  onShowRecords?: (employeeId: string, kind: RecordsKind) => void;
}) {
  const hours = hoursLabel(row.workHours, row.travelHours);
  const extra = extraOf(row);
  return (
    <div className={`px-4 sm:px-5 py-1.5 ${row.overridden ? 'bg-amber-50/50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1" title={breakdown(row)}>
          <span className="block text-xs text-gray-600 truncate">
            {row.name}
            {!row.active && <span className="ml-1.5 text-[10px] text-gray-400 uppercase tracking-wide">inactive</span>}
          </span>
          {hours && (
            <span className="block text-[10px] text-gray-400 tabular-nums">
              {onShowRecords ? (
                <>
                  <HoursLink label="Work" hours={row.workHours ?? 0} onClick={() => onShowRecords(row.employeeId, 'work')} />
                  {' · '}
                  <HoursLink label="Travel" hours={row.travelHours ?? 0} onClick={() => onShowRecords(row.employeeId, 'travel')} />
                </>
              ) : (
                hours
              )}
            </span>
          )}
        </div>
        {showExtra && (
          <span className={EXTRA_COL}>
            {extra > 0 && (
              <span
                className={`text-[11px] tabular-nums cursor-help ${
                  row.extraIncluded === false ? 'text-gray-400' : 'text-amber-700'
                }`}
                title={extraTooltip(row)}
              >
                (+{fmt(extra)})
              </span>
            )}
          </span>
        )}
        <span
          className={`text-sm font-semibold tabular-nums ${AMOUNT_COL} ${row.overridden ? 'text-amber-800' : 'text-navy'}`}
        >
          {fmt(row.applied)}
        </span>
      </div>
      {row.overridden && (
        <p className="text-[10px] text-amber-700 text-right -mt-0.5">edited · calculated {fmt(row.calculated)}</p>
      )}
    </div>
  );
}

function stakeholderBreakdown(s: PayrollStakeholderPayment) {
  const parts = [`Dividends ${fmt(s.dividends)}`];
  if (s.extras) parts.push(`+ Extras ${fmt(s.extras)}`);
  parts.push(`= ${fmt(s.total)}`);
  return parts.join(' ');
}

function StakeholderRow({ s }: { s: PayrollStakeholderPayment }) {
  return (
    <div className="px-4 sm:px-5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0" title={stakeholderBreakdown(s)}>
          <span className="block text-xs text-gray-600 truncate">{s.name}</span>
          <span className="block text-[10px] text-gray-400 tabular-nums">
            Dividends {fmt(s.dividends)}
            {s.extras ? ` · Extras ${fmt(s.extras)}` : ''}
          </span>
          {s.viaCash > 0 && (
            <span className="block text-[10px] text-gray-400 tabular-nums">
              Also passes on {fmt(s.viaCash)} in cash to cleaners (not included)
            </span>
          )}
        </div>
        <span className="text-sm font-semibold tabular-nums flex-shrink-0 text-navy">{fmt(s.total)}</span>
      </div>
    </div>
  );
}

export default function NetPayTable({
  summary,
  loading,
  onShowRecords,
}: {
  summary: PayrollNetPaySummary;
  loading: boolean;
  /** Si viene, las horas de cada cleaner pasan a ser links a su detalle. */
  onShowRecords?: (employeeId: string, kind: RecordsKind) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const c = useCollapsed('netPay');

  // Solo quien cobra algo (o tiene un ajuste): los cleaners activos sin
  // trabajo en la quincena no agregan más que filas en $0.
  const isRelevant = (r: PayrollNetPayRow) =>
    r.applied !== 0 || r.calculated !== 0 || r.overridden || r.earned !== 0 || r.deductions !== 0 || r.bonuses !== 0;
  const visible = showAll ? summary.rows : summary.rows.filter(isRelevant);
  const hidden = summary.rows.length - summary.rows.filter(isRelevant).length;
  const stakeholders = summary.stakeholders ?? [];
  const otherDividends = summary.otherDividends ?? 0;
  const stakeholdersTotal = summary.stakeholdersTotal ?? 0;
  const hasStakeholders = stakeholders.length > 0 || otherDividends > 0;
  const grandTotal = summary.total + stakeholdersTotal;
  // Cierres viejos no traen horas: en ese caso el total tampoco las muestra.
  const hasHours = summary.rows.some((r) => r.workHours !== undefined || r.travelHours !== undefined);
  const totalHours = hoursLabel(
    summary.rows.reduce((s, r) => s + (r.workHours ?? 0), 0),
    summary.rows.reduce((s, r) => s + (r.travelHours ?? 0), 0),
  );
  // La columna del pago extra solo existe si alguien lo tiene (los cierres
  // viejos ni lo traen): sin extra, la tabla queda como antes.
  const totalExtra = Math.round(summary.rows.reduce((s, r) => s + extraOf(r), 0) * 100) / 100;
  const showExtra = totalExtra > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div
        className="px-4 sm:px-5 py-2.5 border-b border-gray-100 flex items-center gap-2 cursor-pointer select-none"
        {...c.titleProps}
      >
        <Chevron collapsed={c.collapsed} />
        <span className="text-xs font-semibold text-navy">Net pay</span>
      </div>
      <div hidden={c.collapsed}>
        <div className={`divide-y divide-gray-50 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {visible.length === 0 && (
            <p className="px-4 sm:px-5 py-4 text-xs text-gray-400">Nobody to pay in this fortnight.</p>
          )}
          {visible.map((row) => (
            <NetPayRow key={row.employeeId} row={row} showExtra={showExtra} onShowRecords={onShowRecords} />
          ))}
        </div>
        {hasStakeholders && (
          <div className={`border-t border-gray-100 transition-opacity ${loading ? 'opacity-50' : ''}`}>
            <p className="px-4 sm:px-5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Stakeholders
            </p>
            <div className="divide-y divide-gray-50">
              {stakeholders.map((s) => (
                <StakeholderRow key={s.partnerId} s={s} />
              ))}
              {otherDividends > 0 && (
                <div className="px-4 sm:px-5 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600">Other dividends</span>
                  <span className="text-sm font-semibold tabular-nums text-navy">{fmt(otherDividends)}</span>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-gray-50/70 border-t border-gray-100">
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-navy">Total</span>
            {hasStakeholders && !loading && (
              <span className="block text-[10px] text-gray-400 tabular-nums">
                Employees {fmt(summary.total)} · Stakeholders {fmt(stakeholdersTotal)}
              </span>
            )}
            {hasHours && totalHours && (
              <span className={`block text-[10px] text-gray-400 tabular-nums ${loading ? 'opacity-30' : ''}`}>
                {totalHours}
              </span>
            )}
          </div>
          {showExtra && (
            <span className={EXTRA_COL}>
              {!loading && (
                <span
                  className="text-[11px] tabular-nums cursor-help text-amber-700"
                  title="Total extra pay of all cleaners this fortnight (overtime + holiday pay), on top of regular hourly pay."
                >
                  (+{fmt(totalExtra)})
                </span>
              )}
            </span>
          )}
          <span className={`text-base font-bold tabular-nums text-navy transition-opacity ${AMOUNT_COL} ${loading ? 'opacity-30' : ''}`}>
            {loading ? '—' : fmt(grandTotal)}
          </span>
        </div>
        {hidden > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full px-4 sm:px-5 py-2 text-[11px] text-gray-400 hover:text-navy border-t border-gray-100 text-left"
          >
            {showAll ? 'Hide people with no pay' : `Show ${hidden} more with no pay`}
          </button>
        )}
      </div>
    </div>
  );
}
