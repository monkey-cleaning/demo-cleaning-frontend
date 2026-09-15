// LAB367 — Reporte de cashflow semanal (facturado vs. pagado).
// Sección autónoma del Dashboard: su propio fetch y su propia navegación de
// semana (lunes–domingo, ISO), independiente del period selector de la página.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Wallet, AlertTriangle } from 'lucide-react';
import { startOfWeek, endOfWeek, addWeeks, format } from 'date-fns';
import { getWeeklyCashflow, type WeeklyCashflow } from '../../api/payments';

function fmtCAD(amount: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function toISODate(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

/** Rango lunes–domingo de la semana desplazada `offset` semanas desde hoy. */
function getWeekRange(offset: number) {
  const ref = addWeeks(new Date(), offset);
  const from = startOfWeek(ref, { weekStartsOn: 1 });
  const to = endOfWeek(ref, { weekStartsOn: 1 });
  return { from, to, fromISO: toISODate(from), toISO: toISODate(to) };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-0.5 ${accent ?? 'text-navy'}`}>{value}</p>
    </div>
  );
}

export default function WeeklyCashflowCard() {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<WeeklyCashflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = getWeekRange(offset);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getWeeklyCashflow({ from: range.fromISO, to: range.toISO })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  const pct = data ? Math.round(data.paid.pct * 100) : 0;
  const label = `${format(range.from, 'MMM d')} – ${format(range.to, 'MMM d')}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3 border-b border-gray-50">
        <h2 className="text-sm font-bold text-navy flex items-center gap-2">
          <Wallet size={15} className="text-gold" /> Weekly Cashflow
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-50 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-semibold text-gray-600 min-w-[110px] text-center">
            {offset === 0 ? 'This week' : label}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        {error ? (
          <p className="text-sm text-gray-400 py-4">Couldn't load cashflow for this week.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <Stat
                label="Invoiced"
                value={loading || !data ? '—' : fmtCAD(data.invoiced.amount)}
                accent="text-navy"
              />
              <Stat
                label="Paid"
                value={loading || !data ? '—' : fmtCAD(data.paid.amount)}
                accent="text-emerald-600"
              />
              <Stat
                label="Outstanding"
                value={loading || !data ? '—' : fmtCAD(Math.max(0, data.outstanding.amount))}
                accent={data && data.outstanding.amount > 0 ? 'text-amber-600' : 'text-navy'}
              />
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {loading || !data
                  ? ' '
                  : data.invoiced.count === 0
                    ? 'No invoices issued this week'
                    : `${pct}% of ${fmtCAD(data.invoiced.amount)} collected · ${data.invoiced.count} invoice${data.invoiced.count === 1 ? '' : 's'}`}
              </p>
            </div>

            {/* Unreconciled warning */}
            {data && data.unreconciled.count > 0 && (
              <Link
                to="/admin/payments?method=pending-review"
                className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-700 hover:bg-amber-100/70 transition-colors"
              >
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  {fmtCAD(data.unreconciled.amount)} in {data.unreconciled.count} payment
                  {data.unreconciled.count === 1 ? '' : 's'} received this week not yet matched to an
                  invoice — <span className="font-semibold underline">review</span>
                </span>
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
