// components/payroll/AnnualSummarySection.tsx
// Payroll (2026-10-01) — contenido de la pestaña "Annual Summary", réplica de
// la hoja "Resumen_Anual" de Accounting.xlsx. A diferencia de "Activity"/
// "Payments", NO depende de la quincena seleccionada arriba — tiene su propio
// selector de año, porque junta 24 quincenas a la vez.
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getAnnualSummary, type PayrollAnnualSummary } from '../../api/payroll';
import { GroupedBarChart, StackedAreaChart, CHART_COLORS } from './AnnualSummaryCharts';

function fmt(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  const raw = e instanceof Error ? e.message : fallback;
  const idx = raw.indexOf(' - ');
  if (idx !== -1) {
    try {
      return JSON.parse(raw.slice(idx + 3)).error ?? raw;
    } catch {
      /* body not JSON */
    }
  }
  return raw;
}

const COLUMNS: { key: keyof PayrollAnnualSummary['total']; label: string }[] = [
  { key: 'grossRevenue', label: 'Gross revenue' },
  { key: 'cleanerPayroll', label: 'Cleaner payroll' },
  { key: 'dividends', label: 'Dividends' },
  { key: 'grossProfit', label: 'Gross profit' },
  { key: 'expensesFinancial', label: 'Financial exp.' },
  { key: 'expensesOperational', label: 'Operational exp.' },
  { key: 'expensesAdministrative', label: 'Admin exp.' },
  { key: 'netProfit', label: 'Net profit' },
];

export default function AnnualSummarySection() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<PayrollAnnualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getAnnualSummary(year)
      .then(setData)
      .catch((e: unknown) => {
        setData(null);
        setError(errorMessage(e, 'Could not load the annual summary'));
      })
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Same as the "Resumen Anual" sheet — each month is the sum of its two fortnights. A fortnight that hasn't
          started yet is left blank.
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-navy w-14 text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      {loading && !data && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {data && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <th className="text-left font-semibold text-navy px-4 py-2.5 whitespace-nowrap">Month</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="text-right font-semibold text-navy px-4 py-2.5 whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{m.label}</td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${
                        !m.hasData
                          ? 'text-gray-300'
                          : c.key === 'netProfit' && m[c.key] < 0
                            ? 'text-red-600 font-semibold'
                            : 'text-gray-700'
                      }`}
                    >
                      {m.hasData ? fmt(m[c.key]) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50/70 border-t border-gray-100">
                <td className="px-4 py-3 font-bold text-navy">TOTAL</td>
                {COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap ${
                      c.key === 'netProfit' && data.total[c.key] < 0 ? 'text-red-600' : 'text-navy'
                    }`}
                  >
                    {fmt(data.total[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Gráficos (2026-10-01) — réplica de los de la hoja Excel, separados en
          dos en vez de uno con los 7 números juntos: Revenue/Payroll/Profit
          son 10-50x más grandes que los 3 gastos y se aplastarían en un solo
          eje (ver AnnualSummaryCharts.tsx). Solo meses con datos. */}
      {data && data.months.some((m) => m.hasData) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-navy mb-1">Revenue &amp; profit</h3>
            <GroupedBarChart
              months={data.months
                .filter((m) => m.hasData)
                .map((m) => ({
                  label: m.label,
                  values: [m.grossRevenue, m.cleanerPayroll, m.grossProfit, m.netProfit],
                }))}
              series={[
                { name: 'Gross revenue', color: CHART_COLORS.BLUE },
                { name: 'Cleaner payroll', color: CHART_COLORS.ORANGE },
                { name: 'Gross profit', color: CHART_COLORS.AQUA },
                { name: 'Net profit', color: CHART_COLORS.VIOLET },
              ]}
            />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-navy mb-1">Expenses by category</h3>
            <StackedAreaChart
              months={data.months
                .filter((m) => m.hasData)
                .map((m) => ({
                  label: m.label,
                  values: [m.expensesFinancial, m.expensesOperational, m.expensesAdministrative],
                }))}
              series={[
                { name: 'Financial', color: CHART_COLORS.YELLOW },
                { name: 'Operational', color: CHART_COLORS.MAGENTA },
                { name: 'Administrative', color: CHART_COLORS.GREEN },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
