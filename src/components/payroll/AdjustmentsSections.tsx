// components/payroll/AdjustmentsSections.tsx
// Payroll estilo Excel (2026-09-18) — Dividendos y Deducciones de la quincena.
// Ninguno es un gasto del P&L (decisión acordada):
//   * Dividendos: dinero que sale hacia los accionistas, DESPUÉS de la
//     ganancia neta — no la baja. Cada uno se asigna a un ACCIONISTA (Javi /
//     Jhony) para que sume a lo suyo en "Pagos Experimental" (2026-09-24).
//   * Deducciones: adelantos de sueldo a un cleaner; se descuentan de lo que
//     se le paga (Earned − Deducciones = Net pay). El costo ya está en la
//     nómina.
// Los extras de accionista (p. ej. parking de Javi) viven en su propio
// archivo, PartnerExtrasSection.tsx — admiten un monto FIJO recurrente, algo
// que este molde genérico no cubre.
// Admin-only. Cada tarjeta es autónoma (fetch propio por `period`) y avisa al
// padre con `onChanged` para recargar el resumen.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Plus, Trash2, Pencil, Landmark, HandCoins, X } from 'lucide-react';
import {
  getPartners,
  type PayrollPartner,
  getDividends,
  addDividend,
  updateDividend,
  removeDividend,
  getDeductions,
  addDeduction,
  updateDeduction,
  removeDeduction,
} from '../../api/payroll';
import type { Quincena } from '../../lib/quincena';
import ConfirmDialog from '../admin/ConfirmDialog';
import { useCollapsed, Chevron } from './Collapsible';

function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

const inputCls =
  'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

interface Item {
  id: string;
  concept: string;
  amount: number;
  employeeId?: string;
  employeeName?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
}

function AdjustmentCard({
  title,
  icon,
  subtitle,
  addLabel,
  conceptPlaceholder,
  emptyText,
  period,
  load,
  add,
  update,
  remove,
  employees,
  partners,
  requireConcept,
  locked,
  onChanged,
}: {
  title: string;
  icon: ReactNode;
  subtitle: string;
  addLabel: string;
  conceptPlaceholder: string;
  emptyText: string;
  period: Quincena;
  load: () => Promise<{ items: Item[]; total: number }>;
  add: (v: { concept: string; amount: number; employeeId?: string; partnerId?: string }) => Promise<void>;
  /** Edita una fila ya cargada (mismos campos que el alta). */
  update?: (id: string, v: { concept: string; amount: number; employeeId?: string; partnerId?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Si se pasa, el formulario pide a qué empleado corresponde (deducciones). */
  employees?: { employeeId: string; name: string }[];
  /** Si se pasa (y no está vacío), el formulario pide a qué accionista
   *  corresponde (dividendos). El concepto queda opcional: por defecto es su
   *  nombre, como se venía cargando. */
  partners?: PayrollPartner[];
  /** El concepto es obligatorio aunque haya accionistas (extras). */
  requireConcept?: boolean;
  /** Quincena cerrada: solo lectura. */
  locked?: boolean;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Id de la fila que se está editando (null = alta nueva).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await load();
      setItems(r.items);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
    // `load` se recrea en cada render del padre; solo importa el período.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // La "x" del formulario de alta: lo cierra y descarta lo escrito.
  function openEdit(it: Item) {
    setEditingId(it.id);
    setConcept(it.concept);
    setAmount(String(it.amount));
    setEmployeeId(it.employeeId ?? '');
    setPartnerId(it.partnerId ?? '');
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setEditingId(null);
    setShowForm(false);
    setConcept('');
    setAmount('');
    setEmployeeId('');
    setPartnerId('');
    setFormError(null);
  }

  async function handleAdd() {
    const amt = Number(amount);
    const hasPartners = Boolean(partners?.length);
    if (employees && !employeeId) return setFormError('Pick a cleaner');
    if (hasPartners && !partnerId) return setFormError('Pick a shareholder');
    // Con accionistas, el concepto es opcional: por defecto va su nombre.
    const partnerName = partners?.find((p) => p.id === partnerId)?.name ?? '';
    const finalConcept = concept.trim() || (hasPartners && !requireConcept ? partnerName : '');
    if (!finalConcept) return setFormError('Concept is required');
    if (!Number.isFinite(amt) || amt < 0) return setFormError('Amount must be a non-negative number');
    setSaving(true);
    setFormError(null);
    try {
      const values = {
        concept: finalConcept,
        amount: amt,
        employeeId: employees ? employeeId : undefined,
        partnerId: hasPartners ? partnerId : undefined,
      };
      if (editingId && update) await update(editingId, values);
      else await add(values);
      setConcept('');
      setAmount('');
      setEmployeeId('');
      setPartnerId('');
      setEditingId(null);
      setShowForm(false);
      await refresh();
      onChanged?.();
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
      await remove(pendingDelete.id);
      setPendingDelete(null);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete');
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const c = useCollapsed(`adjustments.${title.toLowerCase()}`);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="min-w-0 cursor-pointer select-none" {...c.titleProps}>
          <div className="flex items-center gap-2">
            <Chevron collapsed={c.collapsed} />
            {icon}
            <span className="text-sm font-semibold text-navy">{title}</span>
            {!loading && items.length > 0 && (
              <span className="text-xs font-semibold text-gray-500">· {fmtCAD(total)}</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        {!locked && !c.collapsed && (
          <button
            onClick={() => (showForm ? cancelForm() : setShowForm(true))}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 flex-shrink-0"
          >
            <Plus size={13} /> {addLabel}
          </button>
        )}
      </div>

      <div hidden={c.collapsed}>
        {error && <div className="px-4 sm:px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>}

        {showForm && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-end gap-2">
            {employees && (
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Cleaner</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {partners && partners.length > 0 && (
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
            )}
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-gray-400 mb-1">
                Concept{partners && partners.length > 0 ? ' (optional)' : ''}
              </label>
              <input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder={conceptPlaceholder}
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

        {!loading && items.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-5 text-center">{emptyText}</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-gray-100 first:border-t-0">
                  <td className="px-4 sm:px-5 py-2 text-gray-700">
                    {employees && it.employeeName && (
                      <span className="font-medium text-navy mr-1.5">{it.employeeName}</span>
                    )}
                    {partners && partners.length > 0 && (
                      <span className={`font-medium mr-1.5 ${it.partnerName ? 'text-navy' : 'text-amber-600'}`}>
                        {it.partnerName ?? 'Unassigned'}
                      </span>
                    )}
                    {/* Con accionista el concepto suele repetir su nombre — no se duplica. */}
                    {it.partnerName && it.concept.trim().toLowerCase() === it.partnerName.toLowerCase()
                      ? null
                      : it.concept}
                  </td>
                  <td className="px-4 sm:px-5 py-2 text-gray-600 whitespace-nowrap text-right">{fmtCAD(it.amount)}</td>
                  <td className="px-2 py-2 text-right w-16 whitespace-nowrap">
                    {!locked && update && (
                      <button
                        onClick={() => openEdit(it)}
                        className="p-1 rounded-md text-gray-300 hover:text-navy hover:bg-gray-100"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {!locked && (
                      <button
                        onClick={() => setPendingDelete(it)}
                        className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pendingDelete && (
          <ConfirmDialog
            title={`Delete this ${title.toLowerCase().replace(/s$/, '')}?`}
            message={`"${pendingDelete.concept}" (${fmtCAD(pendingDelete.amount)}) will be removed from this fortnight.`}
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

export function DividendsSection({ period, locked, onChanged }: { period: Quincena; locked?: boolean; onChanged?: () => void }) {
  const [partners, setPartners] = useState<PayrollPartner[]>([]);
  // Los accionistas casi no cambian: una sola carga. Si falla (migración sin
  // correr) el formulario sigue funcionando sin selector.
  useEffect(() => {
    getPartners().then(setPartners).catch(() => setPartners([]));
  }, []);

  return (
    <AdjustmentCard
      title="Dividends"
      icon={<Landmark size={15} className="text-gray-400" />}
      subtitle="Paid out to shareholders. Not an expense — doesn't reduce Net profit."
      addLabel="Add dividend"
      conceptPlaceholder="Defaults to the shareholder's name"
      emptyText="No dividends this fortnight."
      period={period}
      load={async () => {
        const r = await getDividends(period);
        return { items: r.dividends, total: r.total };
      }}
      add={({ concept, amount, partnerId }) => addDividend({ ...period, concept, amount, partnerId })}
      update={(id, { concept, amount, partnerId }) => updateDividend(id, { concept, amount, partnerId })}
      remove={removeDividend}
      partners={partners}
      locked={locked}
      onChanged={onChanged}
    />
  );
}

// PartnerExtrasSection vive en su propio archivo (PartnerExtrasSection.tsx):
// desde que admite extras FIJOS (2026-09-29, parking de Javi confirmado
// recurrente) ya no encaja en el molde genérico de AdjustmentCard.

export function DeductionsSection({
  period,
  employees,
  locked,
  onChanged,
}: {
  locked?: boolean;
  period: Quincena;
  employees: { employeeId: string; name: string }[];
  onChanged?: () => void;
}) {
  return (
    <AdjustmentCard
      title="Deductions"
      icon={<HandCoins size={15} className="text-gray-400" />}
      subtitle="Salary advances to cleaners — subtracted from what each one is paid."
      addLabel="Add deduction"
      conceptPlaceholder="e.g. Salary advance"
      emptyText="No deductions this fortnight."
      period={period}
      load={async () => {
        const r = await getDeductions(period);
        return { items: r.deductions, total: r.total };
      }}
      add={({ concept, amount, employeeId }) =>
        addDeduction({ ...period, concept, amount, employeeId: employeeId! })
      }
      update={(id, { concept, amount, employeeId }) => updateDeduction(id, { concept, amount, employeeId: employeeId! })}
      remove={removeDeduction}
      employees={employees}
      locked={locked}
      onChanged={onChanged}
    />
  );
}
