// components/payroll/QuincenaNavigator.tsx
// LAB428 — selector de quincena (prev/label/next + refresh + picker),
// compartido por PayrollSummaryView (staff y admin) — cada uno lo renderiza
// una vez, arriba de todo, adentro de PayrollSummaryView.
//
// Pedido explícito 2026-09-17: ir a una quincena de hace varios meses con
// solo prev/next tomaba demasiados clicks — el label ahora es un botón que
// abre un picker (año + grilla de 12 meses × Q1/Q2) para saltar directo.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import {
  type Quincena,
  quincenaLabel,
  quincenaTitle,
  shiftQuincena,
  isCurrentOrFuture,
  currentQuincena,
  MONTH_LABELS,
} from '../../lib/quincena';

function QuincenaPicker({
  period,
  onSelect,
  onClose,
}: {
  period: Quincena;
  onSelect: (q: Quincena) => void;
  onClose: () => void;
}) {
  const [pickerYear, setPickerYear] = useState(period.year);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const nowQ = currentQuincena();
  const chipCls = (active: boolean, future: boolean) =>
    `flex-1 text-[11px] py-1 rounded-md font-medium transition-colors ${
      active
        ? 'bg-navy text-white'
        : future
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-500 hover:bg-gray-100'
    }`;

  return (
    <div
      ref={containerRef}
      className="absolute z-20 top-full left-8 mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-lg p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setPickerYear((y) => y - 1)}
          className="p-1 rounded-md text-gray-400 hover:text-navy hover:bg-gray-100"
          aria-label="Previous year"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-navy">{pickerYear}</span>
        <button
          onClick={() => setPickerYear((y) => y + 1)}
          disabled={pickerYear >= nowQ.year}
          className="p-1 rounded-md text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-30"
          aria-label="Next year"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1;
          return (
            <div key={label} className="border border-gray-100 rounded-lg p-1">
              <p className="text-[10px] text-gray-400 text-center mb-0.5">{label}</p>
              <div className="flex gap-1">
                {([1, 2] as const).map((half) => {
                  const q: Quincena = { year: pickerYear, month, half };
                  const active = q.year === period.year && q.month === period.month && q.half === period.half;
                  const future = isCurrentOrFuture(q) && !(q.year === nowQ.year && q.month === nowQ.month && q.half === nowQ.half);
                  return (
                    <button
                      key={half}
                      onClick={() => !future && onSelect(q)}
                      disabled={future}
                      className={chipCls(active, future)}
                    >
                      Q{half}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QuincenaNavigator({
  period,
  onPeriodChange,
  loading,
  onRefresh,
}: {
  period: Quincena;
  onPeriodChange: (q: Quincena) => void;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // El botón "next" tiene que quedar habilitado mientras se esté viendo una
  // quincena PASADA (para poder volver a la actual) y deshabilitado recién
  // al llegar a la actual — no al estar a un paso de ella. Ver
  // isCurrentOrFuture: comparar contra `shiftQuincena(period, 1)` en vez de
  // `period` deshabilitaba "next" un paso antes de tiempo.
  const nextDisabled = isCurrentOrFuture(period);

  return (
    <div className="relative flex items-center justify-center gap-3 min-w-0">
      <div className="relative flex items-center gap-1 min-w-0">
        <button
          onClick={() => onPeriodChange(shiftQuincena(period, -1))}
          disabled={loading}
          className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-40"
          aria-label="Previous fortnight"
        >
          <ChevronLeft size={18} />
        </button>
        {/* El período es el TÍTULO de la página (pedido 2026-09-18), al lado
            de las flechas; sigue siendo el botón que abre el picker. */}
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-navy px-2 py-1 rounded-lg hover:bg-gray-100 min-w-0"
          title="Pick a fortnight"
        >
          <span className="text-xl sm:text-2xl font-bold truncate">{quincenaTitle(period)}</span>
          {/* El "Q2" es redundante junto a la fecha completa: en pantallas
              angostas se oculta, que es donde la fila desbordaba. */}
          <span className="hidden sm:inline-block text-[11px] font-semibold text-gray-400 bg-gray-100 rounded-md px-1.5 py-0.5">
            {quincenaLabel(period).split(' ')[0]}
          </span>
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={() => onPeriodChange(shiftQuincena(period, 1))}
          disabled={loading || nextDisabled}
          className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-40"
          aria-label="Next fortnight"
        >
          <ChevronRight size={18} />
        </button>

        {pickerOpen && (
          <QuincenaPicker
            period={period}
            onSelect={(q) => {
              onPeriodChange(q);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          /* En pantallas angostas va en el flujo (si no, la fila centrada se
             le mete debajo y la flecha "siguiente" queda tapada por el
             refresh); de sm para arriba sigue pinneado a la derecha. */
          className="flex-shrink-0 static translate-y-0 sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2 p-2 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  );
}
