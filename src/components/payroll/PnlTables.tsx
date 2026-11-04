// components/payroll/PnlTables.tsx
// Payroll estilo Excel (2026-09-18) — las tablas de arriba de la página, todas
// alineadas a la izquierda (2026-09-24):
//   * 1ª: el resumen en UNA columna, con espacios entre bloques
//     (Gross revenue / Cleaner payroll / Gross profit — gastos — Net profit —
//     Ahorro), calcado de la planilla manual.
//   * 2ª: "gastos relevantes" — los conceptos que el admin fijó desde la
//     tabla Expenses (botón de fijar) y que acá se sacan con una x, +
//     Dividendos siempre visible. Los dividendos NO son un gasto: no entran
//     en Net profit.
//   * 3ª (`aside`, a la derecha): Net pay editable por persona.
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { setPinnedConcepts, type PayrollPnl } from '../../api/payroll';
import { useCollapsed, Chevron } from './Collapsible';

function fmt(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

function Row({
  label,
  value,
  loading,
  strong,
  tone,
  hint,
  onRemove,
  removing,
  actionSlot,
}: {
  label: string;
  value: string;
  loading?: boolean;
  strong?: boolean;
  tone?: 'positive' | 'negative';
  hint?: string;
  /** Si viene, la fila muestra una x para sacarla de la lista. */
  onRemove?: () => void;
  removing?: boolean;
  /** Reserva la columna de la x aunque la fila no la tenga, para que todos los
   *  montos de la tabla queden alineados. */
  actionSlot?: boolean;
}) {
  const toneCls = tone === 'negative' ? 'text-red-600' : tone === 'positive' ? 'text-emerald-700' : 'text-navy';
  return (
    <div className={`flex items-center justify-between px-4 sm:px-5 ${strong ? 'py-3 bg-gray-50/70' : 'py-2'}`}>
      <span className={`flex-1 min-w-0 text-xs ${strong ? 'font-semibold text-navy' : 'text-gray-500'}`} title={hint}>
        {label}
      </span>
      <span
        className={`tabular-nums transition-opacity ${loading ? 'opacity-30' : ''} ${toneCls} ${
          strong ? 'text-base font-bold' : 'text-sm font-semibold'
        }`}
      >
        {value}
      </span>
      {(onRemove || actionSlot) && (
        <span className="ml-2 -mr-1 w-6 flex-shrink-0 flex justify-center">
          {onRemove && (
            <button
              onClick={onRemove}
              disabled={removing}
              className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
              title="Remove from Key expenses"
              aria-label={`Remove ${label} from Key expenses`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// Espacio entre bloques, como las filas en blanco de la planilla.
const Spacer = () => <div className="h-3 border-y border-gray-100 bg-white" aria-hidden />;

export default function PnlTables({
  pnl,
  loading,
  onChanged,
  locked,
  aside,
  aside2,
}: {
  pnl: PayrollPnl;
  loading: boolean;
  onChanged: () => void;
  /** Quincena cerrada: el resumen sale del snapshot, no se puede cambiar la lista. */
  locked?: boolean;
  /** Tercera tabla (Net pay). */
  aside?: ReactNode;
  /** Cuarta tabla (Payroll check) — pedido explícito 2026-09-29. */
  aside2?: ReactNode;
}) {
  const c = useCollapsed('keyExpenses');
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const v = (n: number) => (loading ? '—' : fmt(n));

  // La lista de fijados es global (por concepto): sacar uno lo saca de todas
  // las quincenas. Se vuelve a fijar desde la tabla Expenses.
  async function unpin(label: string) {
    setRemoving(label);
    setRemoveError(null);
    try {
      await setPinnedConcepts(
        pnl.relevantExpenses.filter((r) => !r.auto && r.label !== label).map((r) => r.label),
      );
      onChanged();
    } catch (e: any) {
      setRemoveError(e?.message ?? 'Could not remove');
    } finally {
      setRemoving(null);
    }
  }

  // Alineadas a la izquierda (resumen + gastos relevantes) y Net pay/Payroll
  // check a la derecha; en pantallas angostas las tarjetas pasan a apilarse.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[repeat(4,minmax(280px,420px))] justify-start gap-4 items-start">
      {/* ── Izquierda: resumen en una columna ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <Row label="Gross revenue" value={v(pnl.grossRevenue)} loading={loading} />
        <Row label="Cleaner payroll" value={v(pnl.cleanerPayroll)} loading={loading} />
        <Row
          label="Dividends"
          value={v(pnl.dividends)}
          loading={loading}
          hint="Paid out to shareholders — subtracted from Gross profit, like the Nominee in the sheet"
        />
        <Row
          label="Gross profit"
          value={v(pnl.grossProfit)}
          loading={loading}
          strong
          tone={pnl.grossProfit < 0 ? 'negative' : undefined}
        />
        <Spacer />
        {/* Forecast (2026-09-30): ingresado vs. lo que ya debería haber
            ingresado vs. lo que ingresaría si se completa la quincena tal
            como está agendada — misma idea que Weekly Cashflow del
            Dashboard. Con GST: es plata real, no la base del P&L. */}
        {pnl.forecast && (
          <>
            <Row label="Received" value={v(pnl.forecast.received)} loading={loading} hint="Payments collected during this fortnight" />
            <Row
              label="Estimated today"
              value={v(pnl.forecast.estimatedToday)}
              loading={loading}
              hint="What should have come in by now, from work already done"
            />
            <Row
              label="Outstanding (today)"
              value={v(pnl.forecast.estimatedToday - pnl.forecast.received)}
              loading={loading}
              tone={pnl.forecast.estimatedToday - pnl.forecast.received > 0 ? 'negative' : 'positive'}
              hint="Estimated today minus Received"
            />
            <Row
              label="Estimated total"
              value={v(pnl.forecast.estimatedTotal)}
              loading={loading}
              strong
              hint="If the whole fortnight goes exactly as scheduled"
            />
            <Spacer />
          </>
        )}
        <Row label="Financial expenses" value={v(pnl.expensesFinancial)} loading={loading} />
        <Row label="Operational expenses" value={v(pnl.expensesOperational)} loading={loading} />
        {/* Administrative no está en la lista pedida, pero SÍ se descuenta de
            Net profit — se muestra solo cuando hay monto para que la cuenta
            cierre a la vista sin agregar una fila vacía de más. */}
        {pnl.expensesAdministrative > 0 && (
          <Row label="Administrative expenses" value={v(pnl.expensesAdministrative)} loading={loading} />
        )}
        <Row label="Total expenses" value={v(pnl.expensesTotal)} loading={loading} strong />
        <Row
          label="Net profit"
          value={v(pnl.netProfit)}
          loading={loading}
          strong
          tone={pnl.netProfit < 0 ? 'negative' : 'positive'}
        />
        <Spacer />
        <Row
          label="Savings"
          value={loading || pnl.savings == null ? '—' : fmt(pnl.savings)}
          loading={loading}
          hint="Source for this figure is still to be defined"
        />
      </div>

      {/* ── Derecha: gastos relevantes ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div
          className="px-4 sm:px-5 py-2.5 border-b border-gray-100 flex items-center justify-between cursor-pointer select-none"
          {...c.titleProps}
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-navy">
            <Chevron collapsed={c.collapsed} />
            Key expenses
          </span>
          {!c.collapsed && <span className="text-[11px] text-gray-400">Pin them from the Expenses table</span>}
        </div>
        <div hidden={c.collapsed}>
          {removeError && <p className="px-4 sm:px-5 py-2 text-[11px] text-red-600">{removeError}</p>}
          {pnl.relevantExpenses.map((r) => (
            <Row
              key={r.label}
              label={r.auto ? `${r.label} (cleaner travel pay)` : r.label}
              value={v(r.amount)}
              loading={loading}
              hint={r.hint}
              onRemove={r.auto || locked ? undefined : () => unpin(r.label)}
              removing={removing === r.label}
              actionSlot
            />
          ))}
          {pnl.relevantExpenses.length > 0 && <Spacer />}
          <Row
            label="Dividends"
            value={v(pnl.dividends)}
            loading={loading}
            actionSlot
            hint="Money paid out to shareholders — subtracted from Gross profit (and so from Net profit)"
          />
        </div>
      </div>

      {aside}
      {aside2}
    </div>
  );
}
