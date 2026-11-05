// components/payroll/PaymentTableSection.tsx
// Payroll (2026-09-24) — "Tabla Pagos Experimental" de la planilla manual: CÓMO
// se le paga a cada persona en la quincena.
//   * "Real" = neto que se paga por la nómina oficial (QuickBooks).
//   * Los cleaners con un PLAN cobran una parte por nómina (hasta un tope
//     bruto) y el excedente en efectivo A TRAVÉS de los accionistas (Javi /
//     Jhony), que se lo reparten en partes iguales — cada uno lo ve en la
//     columna "To <cleaner>". Un factor ajusta la tarifa de ese excedente
//     (ej. 19/22).
//   * "Own" = lo propio de un accionista (dividendos + extras y, si también es
//     cleaner, lo que ganó).
// Los topes y factores salen de la planilla (nadie sabe todavía el porqué) —
// por eso son parámetros editables por cleaner y quincena. Experimental: se
// repasa con los usuarios.
import { useState } from 'react';
import { Wallet, Plus, Pencil, Trash2, X, Copy } from 'lucide-react';
import {
  savePaymentPlan,
  removePaymentPlan,
  copyPreviousPaymentPlans,
  type PayrollPaymentTable,
  type PayrollPaymentPlan,
} from '../../api/payroll';
import type { Quincena } from '../../lib/quincena';
import ConfirmDialog from '../admin/ConfirmDialog';
import { useCollapsed, Chevron } from './Collapsible';

function fmt(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}
// La planilla deja en blanco lo que es cero.
const money = (n: number) => (n === 0 ? '—' : fmt(n));

const inputCls =
  'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

// "19/22" o "0.8636" → número; vacío → 1 (sin ajuste). null si no es válido.
export function parseFactor(raw: string): number | null {
  const s = raw.trim();
  if (!s) return 1;
  const parts = s.split('/');
  if (parts.length > 2) return null;
  const nums = parts.map((p) => Number(p.trim()));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return nums[1] === 0 ? null : nums[0] / nums[1];
  return nums[0];
}

const optionalMoney = (raw: string): number | null | undefined => {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined; // undefined = inválido
};

export default function PaymentTableSection({
  period,
  table,
  employees,
  loading,
  locked,
  onChanged,
}: {
  locked?: boolean;
  period: Quincena;
  table: PayrollPaymentTable;
  /** Cleaners de la quincena (para elegir a quién se le arma un plan). */
  employees: { employeeId: string; name: string }[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<'new' | PayrollPaymentPlan | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [officialNet, setOfficialNet] = useState('');
  const [officialGross, setOfficialGross] = useState('');
  const [bonusCol, setBonusCol] = useState('');
  const [factor, setFactor] = useState('');
  const [via, setVia] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PayrollPaymentPlan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);

  const nameOf = (id: string) => employees.find((e) => e.employeeId === id)?.name ?? table.rows.find((r) => r.employeeId === id)?.name ?? id;
  const partnerName = (id: string) => table.partners.find((p) => p.id === id)?.name ?? id;
  const routedOf = (id: string) => table.routed.find((r) => r.employeeId === id);

  function openForm(plan: 'new' | PayrollPaymentPlan) {
    setForm(plan);
    setFormError(null);
    setNotice(null);
    if (plan === 'new') {
      setEmployeeId('');
      setOfficialNet('');
      setOfficialGross('');
      setBonusCol('');
      setFactor('');
      setVia(table.partners.map((p) => p.id)); // lo habitual: entre todos los accionistas
      setNote('');
    } else {
      setEmployeeId(plan.employeeId);
      setOfficialNet(plan.officialNet == null ? '' : String(plan.officialNet));
      setOfficialGross(plan.officialGross == null ? '' : String(plan.officialGross));
      setBonusCol(plan.bonusCol == null ? '' : String(plan.bonusCol));
      setFactor(plan.cashRateFactor === 1 ? '' : String(Number(plan.cashRateFactor.toFixed(6))));
      setVia(plan.viaPartnerIds);
      setNote(plan.note ?? '');
    }
  }

  async function handleSave() {
    const net = optionalMoney(officialNet);
    const gross = optionalMoney(officialGross);
    const bonus = optionalMoney(bonusCol);
    const f = parseFactor(factor);
    if (!employeeId) return setFormError('Pick a cleaner');
    if (net === undefined || gross === undefined || bonus === undefined) {
      return setFormError('Amounts must be non-negative numbers (or empty)');
    }
    if (f === null) return setFormError('Rate factor must be a number or a fraction like 19/22');
    if (gross != null && via.length === 0) return setFormError('Pick at least one shareholder to pay the cash through');
    setSaving(true);
    setFormError(null);
    try {
      await savePaymentPlan(period, {
        employeeId,
        officialNet: net,
        officialGross: gross,
        bonusCol: bonus,
        cashRateFactor: f,
        viaPartnerIds: via,
        note: note.trim(),
      });
      setForm(null);
      onChanged();
    } catch (e: any) {
      setFormError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removePaymentPlan(period, pendingDelete.employeeId);
      setPendingDelete(null);
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete');
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopy() {
    setCopying(true);
    setError(null);
    setNotice(null);
    try {
      const r = await copyPreviousPaymentPlans(period);
      if (r.skipped) setNotice('This fortnight already has plans — nothing copied.');
      else if (r.copied === 0) setNotice('The previous fortnight has no plans to copy.');
      else setNotice(`Copied ${r.copied} plan${r.copied === 1 ? '' : 's'} from the previous fortnight.`);
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Could not copy');
    } finally {
      setCopying(false);
    }
  }

  const planless = employees.filter((e) => !table.plans.some((p) => p.employeeId === e.employeeId));
  const formEmployees = form && form !== 'new' ? employees : planless;
  const th = 'font-medium px-3 py-2 whitespace-nowrap text-right';

  const c = useCollapsed('paymentTable');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 cursor-pointer select-none" {...c.titleProps}>
          <div className="flex items-center gap-2">
            <Chevron collapsed={c.collapsed} />
            <Wallet size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-navy">Payment table</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              Experimental
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Who is paid what, and through whom. Cleaners with a plan are paid part through payroll and the rest in cash
            via the shareholders.
          </p>
        </div>
        {!locked && !c.collapsed && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleCopy}
            disabled={copying}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-50"
            title="Copy the plans of the previous fortnight (only if this one has none)"
          >
            <Copy size={12} /> Copy plans from previous
          </button>
          <button
            onClick={() => openForm('new')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
          >
            <Plus size={13} /> Add plan
          </button>
        </div>
        )}
      </div>

      <div hidden={c.collapsed}>
        {error && <div className="px-4 sm:px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>}
        {notice && <div className="px-4 sm:px-5 py-2 text-xs text-emerald-700 bg-emerald-50 border-b border-emerald-100">{notice}</div>}
        {table.warnings.length > 0 && (
          <div className="px-4 sm:px-5 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-100 space-y-0.5">
            {table.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}

        {/* ── La tabla ─────────────────────────────────────────────────────── */}
        <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="font-medium px-4 sm:px-5 py-2 text-left">Person</th>
                <th className={th} title="Net amount paid through the official payroll (QuickBooks)">Real</th>
                {table.beneficiaries.map((b) => (
                  <th key={b.employeeId} className={th} title={`Cash for ${b.name}, paid through the shareholders`}>
                    To {b.name.split(' ')[0]}
                  </th>
                ))}
                <th className={th} title="A shareholder's own: dividends + extras (+ what they earned, if also a cleaner)">Own</th>
                <th className={th} title="Paid outside the official payroll: travel + bonuses (or the value set in the plan)">Bonus</th>
                <th className={th}>Total w/o bonus</th>
                <th className={th}>Total</th>
                <th className={th}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 && (
                <tr>
                  <td colSpan={7 + table.beneficiaries.length} className="px-4 py-5 text-center text-gray-400">
                    Nobody to pay in this fortnight.
                  </td>
                </tr>
              )}
              {table.rows.map((r) => (
                <tr key={r.key} className="border-t border-gray-100">
                  <td className="px-4 sm:px-5 py-2 text-gray-700 whitespace-nowrap">
                    {r.name}
                    {r.isPartner && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-navy bg-gray-100 rounded px-1.5 py-0.5">
                        Shareholder
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{money(r.real)}</td>
                  {table.beneficiaries.map((b) => (
                    <td key={b.employeeId} className="px-3 py-2 text-right text-gray-600 tabular-nums">
                      {money(r.via[b.employeeId] ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{money(r.own)}</td>
                  <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{money(r.bonus)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-navy tabular-nums">{money(r.totalWithoutBonus)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-navy tabular-nums">{money(r.total)}</td>
                  <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{r.workHours ? r.workHours.toFixed(2) : '—'}</td>
                </tr>
              ))}
              {table.rows.length > 0 && (
                <tr className="border-t border-gray-200 bg-gray-50/70 font-semibold text-navy">
                  <td className="px-4 sm:px-5 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(table.totals.real)}</td>
                  {table.beneficiaries.map((b) => (
                    <td key={b.employeeId} className="px-3 py-2.5 text-right tabular-nums">
                      {money(table.totals.via[b.employeeId] ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(table.totals.own)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(table.totals.bonus)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(table.totals.totalWithoutBonus)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(table.totals.total)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Planes: los parámetros de arriba ─────────────────────────────── */}
        <div className="border-t border-gray-100">
          <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-navy">Plans for this fortnight</span>
            <span className="text-[11px] text-gray-400">
              {table.plans.length === 0 ? 'None — everyone is paid through payroll' : `${table.plans.length}`}
            </span>
          </div>

          {form && (
            <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/60 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Cleaner</label>
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    disabled={form !== 'new'}
                    className={inputCls}
                  >
                    <option value="">Select…</option>
                    {formEmployees.map((e) => (
                      <option key={e.employeeId} value={e.employeeId}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1" title="Net amount the official payroll pays (the sheet's “Real”). Empty = salary − deductions">
                    Payroll net
                  </label>
                  <input type="number" min={0} step={0.01} value={officialNet} onChange={(e) => setOfficialNet(e.target.value)} placeholder="auto" className={`${inputCls} w-24`} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1" title="Gross cap declared through payroll. Everything earned above it is paid in cash through the shareholders. Empty = no cash">
                    Payroll gross cap
                  </label>
                  <input type="number" min={0} step={0.01} value={officialGross} onChange={(e) => setOfficialGross(e.target.value)} placeholder="no cash" className={`${inputCls} w-28`} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1" title="The sheet's “Bono” column. Empty = travel + bonuses">
                    Bonus column
                  </label>
                  <input type="number" min={0} step={0.01} value={bonusCol} onChange={(e) => setBonusCol(e.target.value)} placeholder="auto" className={`${inputCls} w-24`} />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1" title="Rate adjustment applied to the cash part, e.g. 19/22. Empty = none">
                    Cash rate factor
                  </label>
                  <input value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="e.g. 19/22" className={`${inputCls} w-24`} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Cash paid through (split equally)</label>
                <div className="flex flex-wrap gap-1.5">
                  {table.partners.length === 0 && <span className="text-[11px] text-gray-400">No shareholders set up.</span>}
                  {table.partners.map((p) => {
                    const on = via.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setVia((cur) => (on ? cur.filter((id) => id !== p.id) : [...cur, p.id]))}
                        className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                          on ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${inputCls} flex-1 min-w-[160px]`} />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save plan'}
                </button>
                <button
                  onClick={() => setForm(null)}
                  disabled={saving}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100"
                  title="Cancel"
                  aria-label="Cancel"
                >
                  <X size={14} />
                </button>
                {formError && <span className="text-[11px] text-red-600 w-full">{formError}</span>}
              </div>
            </div>
          )}

          {table.plans.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-gray-400 border-y border-gray-100 text-left">
                    <th className="font-medium px-4 sm:px-5 py-1.5">Cleaner</th>
                    <th className="font-medium px-3 py-1.5 text-right">Payroll net</th>
                    <th className="font-medium px-3 py-1.5 text-right">Gross cap</th>
                    <th className="font-medium px-3 py-1.5 text-right">Bonus col.</th>
                    <th className="font-medium px-3 py-1.5 text-right">Factor</th>
                    <th className="font-medium px-3 py-1.5">Through</th>
                    <th className="font-medium px-3 py-1.5 text-right">Cash</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {table.plans.map((p) => {
                    const routed = routedOf(p.employeeId);
                    return (
                      <tr key={p.employeeId} className="border-t border-gray-50 first:border-t-0 align-top">
                        <td className="px-4 sm:px-5 py-2 text-gray-700 whitespace-nowrap">
                          {nameOf(p.employeeId)}
                          {p.note && <span className="block text-[11px] text-gray-400">{p.note}</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{p.officialNet == null ? 'auto' : fmt(p.officialNet)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{p.officialGross == null ? '—' : fmt(p.officialGross)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{p.bonusCol == null ? 'auto' : fmt(p.bonusCol)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{p.cashRateFactor === 1 ? '—' : p.cashRateFactor.toFixed(4)}</td>
                        <td className="px-3 py-2 text-gray-500">{p.viaPartnerIds.map(partnerName).join(', ') || '—'}</td>
                        <td
                          className="px-3 py-2 text-right text-gray-600 tabular-nums"
                          title={routed ? `Earned ${fmt(routed.earnedTotal)} − gross cap = ${fmt(routed.excess)} above the cap` : undefined}
                        >
                          {routed && routed.cash > 0 ? fmt(routed.cash) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          {!locked && (<>
                          <button onClick={() => openForm(p)} className="p-1 rounded-md text-gray-300 hover:text-navy hover:bg-gray-100" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setPendingDelete(p)} className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <Trash2 size={13} />
                          </button>
                          </>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pendingDelete && (
          <ConfirmDialog
            title="Delete this plan?"
            message={`${nameOf(pendingDelete.employeeId)} will be paid through payroll only (no cash through the shareholders) in this fortnight.`}
            confirmLabel="Delete"
            danger
            loading={deleting}
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDelete}
          />
        )}
      </div>
    </div>
  );
}
