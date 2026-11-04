// components/payroll/PartnerExtrasSection.tsx
// Payroll — extras de accionista: montos propios (p. ej. el parking de Javi)
// que suman a lo suyo ("Own") en Pagos Experimental sin ser un dividendo.
//
// (2026-09-29) Extras FIJOS: confirmado con Jhony que el parking de Javi se
// repite todas las quincenas — al agregar se puede marcar "Fixed", mismo
// patrón que los gastos fijos (ExpensesSection.tsx): editar el monto de uno
// fijo rige "desde esta quincena en adelante" (las anteriores conservan el
// precio viejo); borrarlo lo da de baja desde esta quincena. Por eso vive en
// su propio archivo — ya no encaja en el molde genérico de AdjustmentCard
// (AdjustmentsSections.tsx), que no tiene noción de "fijo".
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, Repeat, PiggyBank } from 'lucide-react';
import {
  getPartners,
  getPartnerExtras,
  addPartnerExtra,
  updatePartnerExtra,
  removePartnerExtra,
  type PayrollPartner,
  type PayrollPartnerExtra,
} from '../../api/payroll';
import type { Quincena } from '../../lib/quincena';
import ConfirmDialog from '../admin/ConfirmDialog';
import { useCollapsed, Chevron } from './Collapsible';

function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

const inputCls =
  'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

function ExtraRow({
  extra,
  period,
  partners,
  locked,
  onSaved,
  onDelete,
  deleting,
}: {
  extra: PayrollPartnerExtra;
  period: Quincena;
  partners: PayrollPartner[];
  locked?: boolean;
  onSaved: () => Promise<void>;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [partnerId, setPartnerId] = useState(extra.partnerId);
  const [concept, setConcept] = useState(extra.concept);
  const [amount, setAmount] = useState(String(extra.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amt = Number(amount);
    if (!concept.trim()) return setError('Concept is required');
    if (!Number.isFinite(amt) || amt < 0) return setError('Amount must be a non-negative number');
    setSaving(true);
    setError(null);
    try {
      await updatePartnerExtra({
        id: extra.id,
        ...period,
        partnerId,
        concept: concept.trim(),
        amount: amt,
        isFixed: extra.isFixed,
      });
      setEditing(false);
      await onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-t border-gray-100 bg-gray-50/60">
        <td className="px-4 sm:px-5 py-2">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={inputCls}>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-2">
          <input value={concept} onChange={(e) => setConcept(e.target.value)} className={`${inputCls} w-full`} />
        </td>
        <td className="px-4 sm:px-5 py-2">
          <input
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} w-24`}
          />
        </td>
        <td className="px-4 sm:px-5 py-2 text-right whitespace-nowrap">
          <button onClick={save} disabled={saving} className="p-1 rounded-md text-navy hover:bg-gray-100 disabled:opacity-40" title="Save">
            <Check size={14} />
          </button>
          <button onClick={() => setEditing(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100" title="Cancel">
            <X size={14} />
          </button>
          {extra.isFixed && <p className="text-[10px] text-gray-400 mt-1">Applies from this fortnight onward</p>}
          {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-gray-100 first:border-t-0 align-top">
      <td className="px-4 sm:px-5 py-2 text-gray-700 whitespace-nowrap">{extra.partnerName ?? 'Unassigned'}</td>
      <td className="px-2 py-2 text-gray-700">
        {extra.concept}
        {extra.isFixed && (
          <span
            className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-50 rounded-md px-1.5 py-0.5"
            title="Repeats every fortnight"
          >
            <Repeat size={9} /> Fixed
          </span>
        )}
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-600 whitespace-nowrap text-right">{fmtCAD(extra.amount)}</td>
      <td className="px-2 py-2 text-right whitespace-nowrap w-16">
        {!locked && (
          <>
            <button onClick={() => setEditing(true)} className="p-1 rounded-md text-gray-300 hover:text-navy hover:bg-gray-100" title="Edit">
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
              title={extra.isFixed ? 'Stop from this fortnight onward' : 'Delete'}
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

export default function PartnerExtrasSection({
  period,
  locked,
  onChanged,
}: {
  period: Quincena;
  locked?: boolean;
  onChanged?: () => void;
}) {
  const [partners, setPartners] = useState<PayrollPartner[]>([]);
  const [extras, setExtras] = useState<PayrollPartnerExtra[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PayrollPartnerExtra | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getPartners().then(setPartners).catch(() => setPartners([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getPartnerExtras(period);
      setExtras(r.extras);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load extras');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  function cancelForm() {
    setShowForm(false);
    setPartnerId('');
    setConcept('');
    setAmount('');
    setIsFixed(false);
    setFormError(null);
  }

  async function handleAdd() {
    const amt = Number(amount);
    if (!partnerId) return setFormError('Pick a shareholder');
    if (!concept.trim()) return setFormError('Concept is required');
    if (!Number.isFinite(amt) || amt < 0) return setFormError('Amount must be a non-negative number');
    setSaving(true);
    setFormError(null);
    try {
      await addPartnerExtra({ ...period, partnerId, concept: concept.trim(), amount: amt, isFixed });
      cancelForm();
      await reload();
    } catch (e: any) {
      setFormError(e?.message ?? 'Could not add extra');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removePartnerExtra(pendingDelete, period);
      setPendingDelete(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete extra');
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const c = useCollapsed('partnerExtras');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="min-w-0 cursor-pointer select-none" {...c.titleProps}>
          <div className="flex items-center gap-2">
            <Chevron collapsed={c.collapsed} />
            <PiggyBank size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-navy">Shareholder extras</span>
            {!loading && extras.length > 0 && <span className="text-xs font-semibold text-gray-500">· {fmtCAD(total)}</span>}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Amounts a shareholder also receives. Added to their own pay.</p>
        </div>
        {!locked && !c.collapsed && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 flex-shrink-0"
          >
            <Plus size={13} /> Add extra
          </button>
        )}
      </div>

      <div hidden={c.collapsed}>
        {error && <div className="px-4 sm:px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>}

        {showForm && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Shareholder</label>
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-gray-400 mb-1">Concept</label>
              <input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="e.g. Parking"
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Amount</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} w-24`}
              />
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 pb-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isFixed}
                onChange={(e) => setIsFixed(e.target.checked)}
                className="rounded border-gray-300"
              />
              Fixed (repeats every fortnight)
            </label>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={cancelForm}
              disabled={saving}
              className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100 disabled:opacity-40"
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
            {formError && <span className="text-[11px] text-red-600 w-full">{formError}</span>}
          </div>
        )}

        {!loading && extras.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-5 text-center">No extras this fortnight.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="font-medium px-4 sm:px-5 py-1.5">Shareholder</th>
                <th className="font-medium px-2 py-1.5">Concept</th>
                <th className="font-medium px-4 sm:px-5 py-1.5 text-right">Amount</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {extras.map((e) => (
                <ExtraRow
                  key={e.id}
                  extra={e}
                  period={period}
                  partners={partners}
                  locked={locked}
                  onSaved={reload}
                  onDelete={() => setPendingDelete(e)}
                  deleting={deleting && pendingDelete?.id === e.id}
                />
              ))}
            </tbody>
          </table>
        )}

        {pendingDelete && (
          <ConfirmDialog
            title={pendingDelete.isFixed ? 'Stop this fixed extra?' : 'Delete this extra?'}
            message={
              pendingDelete.isFixed
                ? `"${pendingDelete.concept}" will no longer repeat from this fortnight onward. Earlier fortnights keep it.`
                : `"${pendingDelete.concept}" (${fmtCAD(pendingDelete.amount)}) will be removed from this fortnight.`
            }
            confirmLabel={pendingDelete.isFixed ? 'Stop' : 'Delete'}
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
