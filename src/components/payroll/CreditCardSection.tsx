// components/payroll/CreditCardSection.tsx
// Payroll (2026-09-30) — saldo de la tarjeta de crédito de la empresa, de
// carga manual por ahora (punto 13 del pedido grande). Un solo registro por
// quincena: saldo al cierre + lo que se abonó esa quincena. Mismo patrón de
// tarjeta autónoma (fetch propio por `period`) que el resto de Payments.
import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Pencil, Check, X, RotateCcw } from 'lucide-react';
import { getCreditCard, setCreditCard, clearCreditCard, type PayrollCreditCard } from '../../api/payroll';
import type { Quincena } from '../../lib/quincena';
import { useCollapsed, Chevron } from './Collapsible';

function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

const inputCls =
  'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

export default function CreditCardSection({
  period,
  locked,
  onChanged,
}: {
  period: Quincena;
  locked?: boolean;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<PayrollCreditCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [balance, setBalance] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCreditCard(period));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load the credit card balance');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit() {
    setBalance(data ? String(data.balance) : '');
    setPaymentAmount(data ? String(data.paymentAmount) : '0');
    setNote(data?.note ?? '');
    setFormError(null);
    setEditing(true);
  }

  async function handleSave() {
    const bal = Number(balance);
    const pay = Number(paymentAmount || 0);
    if (balance.trim() === '' || !Number.isFinite(bal) || bal < 0) {
      return setFormError('Balance must be a non-negative number');
    }
    if (!Number.isFinite(pay) || pay < 0) {
      return setFormError('Payment must be a non-negative number');
    }
    setSaving(true);
    setFormError(null);
    try {
      await setCreditCard({ ...period, balance: bal, paymentAmount: pay, note: note.trim() });
      setEditing(false);
      await load();
      onChanged?.();
    } catch (e: any) {
      setFormError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setError(null);
    try {
      await clearCreditCard(period);
      setEditing(false);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? 'Could not clear');
    } finally {
      setSaving(false);
    }
  }

  const c = useCollapsed('creditCard');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="min-w-0 cursor-pointer select-none" {...c.titleProps}>
          <div className="flex items-center gap-2">
            <Chevron collapsed={c.collapsed} />
            <CreditCard size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-navy">Credit card</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Company card balance at the end of this fortnight, and the payment made.</p>
        </div>
        {!locked && !c.collapsed && !editing && (
          <button
            onClick={openEdit}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 flex-shrink-0"
          >
            <Pencil size={13} /> {data ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      <div hidden={c.collapsed}>
        {error && <div className="px-4 sm:px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>}

        {editing ? (
          <div className="px-4 sm:px-5 py-3 bg-gray-50/60 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Balance</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} w-28`}
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Payment made</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} w-28`}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-gray-400 mb-1">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} w-full`} />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              <Check size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100"
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
            {formError && <span className="text-[11px] text-red-600 w-full">{formError}</span>}
          </div>
        ) : !loading && !data ? (
          <p className="text-xs text-gray-400 px-4 py-5 text-center">Not loaded for this fortnight.</p>
        ) : (
          <div className="px-4 sm:px-5 py-3 flex items-center gap-6">
            <div>
              <p className="text-[11px] text-gray-400">Balance</p>
              <p className="text-base font-bold text-navy tabular-nums">{loading || !data ? '—' : fmtCAD(data.balance)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Payment made</p>
              <p className="text-sm font-semibold text-navy tabular-nums">{loading || !data ? '—' : fmtCAD(data.paymentAmount)}</p>
            </div>
            {data?.note && <p className="text-xs text-gray-500 flex-1 min-w-0 truncate" title={data.note}>{data.note}</p>}
            {!locked && data && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="ml-auto p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 flex-shrink-0"
                title="Clear this fortnight's entry"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
