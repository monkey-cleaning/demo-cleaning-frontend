// components/admin/QuincenalBanner.tsx
// v1.1 — Soporta uso controlado (period + onPeriodChange) y autónomo.
//
// Uso autónomo (sin props):
//   <QuincenalBanner />
//
// Uso controlado (sincronizado con la página):
//   <QuincenalBanner period={period} onPeriodChange={setPeriod} />

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Lock, TrendingUp, AlertTriangle } from 'lucide-react';
import { getPaymentsSummary, type PaymentsSummary } from '../../api/payments';
import { paymentsCache } from '../../lib/paymentsCache';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export type Period = 'current' | 'previous';

export interface QuincenalRange {
  from: string;   // YYYY-MM-DD
  to: string;     // YYYY-MM-DD
  label: string;  // e.g. "Q1 May 2026"
  qNum: 1 | 2;
}

/**
 * Calcula el rango quincenal para el período solicitado.
 * Q1 = días 1–15, Q2 = días 16–fin de mes.
 */
export function getQuincenalRange(period: Period): QuincenalRange {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const day = today.getDate();

  let fromDate: Date;
  let toDate: Date;

  if (day <= 15) {
    fromDate = new Date(year, month, 1);
    toDate = new Date(year, month, 15);
  } else {
    fromDate = new Date(year, month, 16);
    toDate = new Date(year, month + 1, 0);
  }

  if (period === 'previous') {
    if (fromDate.getDate() === 1) {
      fromDate = new Date(year, month - 1, 16);
      toDate = new Date(year, month, 0);
    } else {
      fromDate = new Date(year, month, 1);
      toDate = new Date(year, month, 15);
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmtISO = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const qNum = fromDate.getDate() === 1 ? (1 as const) : (2 as const);
  const label = `Q${qNum} ${fromDate.toLocaleString('en-CA', { month: 'short' })} ${fromDate.getFullYear()}`;

  return { from: fmtISO(fromDate), to: fmtISO(toDate), label, qNum };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface QuincenalBannerProps {
  /** Período controlado desde el padre. Si no se pasa, el banner gestiona su propio estado. */
  period?: Period;
  /** Callback cuando el usuario cambia el período en el banner. */
  onPeriodChange?: (p: Period) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuincenalBanner({ period: controlledPeriod, onPeriodChange }: QuincenalBannerProps = {}) {
  const isControlled = controlledPeriod !== undefined;

  // Internal state — only used in uncontrolled mode
  const [internalPeriod, setInternalPeriod] = useState<Period>('current');

  const period = isControlled ? controlledPeriod! : internalPeriod;

  function handlePeriodChange(p: Period) {
    if (isControlled) {
      onPeriodChange?.(p);
    } else {
      setInternalPeriod(p);
    }
  }

  const [summary, setSummary] = useState<PaymentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = getQuincenalRange(period);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = paymentsCache.get<PaymentsSummary>(
        `payments_summary_from=${range.from}&to=${range.to}`
      );
      if (cached) {
        setSummary(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getPaymentsSummary({ from: range.from, to: range.to }, force);
      setSummary(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const total = summary?.totalCollected ?? 0;
  const count = summary?.countPayments ?? 0;
  const avg = count > 0 ? Math.round(total / count) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between gap-3">

        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-gold flex-shrink-0" />
          <div>
            <span className="text-xs font-semibold text-navy">Quincenal Summary</span>
            <span className="hidden sm:inline text-xs text-gray-400 ml-2">
              {fmtDate(new Date(range.from + 'T12:00:00'))}
              {' – '}
              {fmtDate(new Date(range.to + 'T12:00:00'))}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">

          {/* Period toggle — always shown in the banner */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            {(['current', 'previous'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                disabled={loading}
                className={`px-2.5 sm:px-3 py-1.5 transition-colors disabled:opacity-50 ${period === p
                  ? 'bg-navy text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {p === 'current' ? 'Current Q' : 'Prev Q'}
              </button>
            ))}
          </div>

          {/* Read-only badge — desktop only */}
          <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400 border border-gray-200 rounded-lg px-2 py-1 select-none">
            <Lock size={11} /> Read only
          </span>

          <button
            onClick={() => load(true)}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-50 disabled:opacity-40 transition-colors"
            title="Refresh"
            aria-label="Refresh quincenal summary"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 sm:px-5 py-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
          <AlertTriangle size={13} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-gray-100">

        {/* Total collected */}
        <div className="px-4 sm:px-5 py-4 sm:py-5">
          <p className="text-xs text-gray-400 mb-1.5">Total collected</p>
          <p className={`text-xl sm:text-2xl font-bold text-navy transition-opacity ${loading ? 'opacity-30' : ''}`}>
            {fmtCAD(total)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{range.label}</p>
        </div>

        {/* Payments count */}
        <div className="px-4 sm:px-5 py-4 sm:py-5">
          <p className="text-xs text-gray-400 mb-1.5">Payments</p>
          <p className={`text-xl sm:text-2xl font-bold text-navy transition-opacity ${loading ? 'opacity-30' : ''}`}>
            {loading ? '—' : count}
          </p>
          <p className="text-xs text-gray-400 mt-1">transactions</p>
        </div>

        {/* Average per payment */}
        <div className="px-4 sm:px-5 py-4 sm:py-5">
          <p className="text-xs text-gray-400 mb-1.5">Avg / payment</p>
          <p className={`text-xl sm:text-2xl font-bold text-navy transition-opacity ${loading ? 'opacity-30' : ''}`}>
            {loading ? '—' : fmtCAD(avg)}
          </p>
          <p className="text-xs text-gray-400 mt-1">CAD</p>
        </div>
      </div>
    </div>
  );
}