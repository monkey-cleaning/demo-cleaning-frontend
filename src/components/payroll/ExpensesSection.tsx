// components/payroll/ExpensesSection.tsx
// LAB428 (2026-09-17) — gastos de la quincena, calcado de la sección
// "GASTOS" de la planilla manual (Concepto/Tipo/Monto, 3 categorías fijas).
// Solo el listado — los totales por categoría viven en la tabla de resumen de
// arriba de todo. Admin-only — a diferencia de PayrollSummaryView, este
// componente ni siquiera se importa en StaffPayrollPage.
//
// (2026-09-18) Gastos FIJOS: al agregar se puede marcar "fixed" — se repite en
// todas las quincenas con el mismo monto. Editar el monto de uno fijo rige
// "desde esta quincena en adelante" (las anteriores conservan el precio
// viejo); borrarlo lo da de baja desde esta quincena.
//
// (2026-11-02) Fijar: cada fila tiene una chincheta que la agrega a "Key
// expenses" (la tabla de arriba de la página, que ya no se edita a mano). La
// lista es global y va por concepto: fijar "Gasolina" la muestra en todas las
// quincenas.
//
// Autónomo (fetch propio por `period`), mismo patrón que
// WeeklyCashflowCard.tsx. `onChanged` avisa al padre para recargar el resumen
// (los totales del P&L viven ahí).
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Receipt, Pencil, Check, X, Repeat, Pin } from 'lucide-react';
import {
  getExpenses,
  addExpense,
  updateExpense,
  removeExpense,
  setPinnedConcepts,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type PayrollExpense,
} from '../../api/payroll';
import type { Quincena } from '../../lib/quincena';
import ConfirmDialog from '../admin/ConfirmDialog';
import { useCollapsed, Chevron } from './Collapsible';

function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2,
  }).format(n);
}

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

// Mismo criterio que `conceptKey` del backend: sin mayúsculas ni espacios en
// los bordes. "Transporte" no se fija: es automático (pago de traslados).
const conceptKey = (c: string) => c.trim().toLowerCase();
const AUTO_KEY = 'transporte';

const inputCls =
  'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

function ExpenseRow({
  expense,
  period,
  locked,
  onSaved,
  onDelete,
  deleting,
  pinned,
  onTogglePin,
  pinning,
}: {
  locked?: boolean;
  expense: PayrollExpense;
  period: Quincena;
  onSaved: () => Promise<void>;
  onDelete: () => void;
  deleting: boolean;
  pinned: boolean;
  /** Ausente si el concepto no se puede fijar (Transporte). */
  onTogglePin?: () => void;
  pinning: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [concept, setConcept] = useState(expense.concept);
  const [category, setCategory] = useState<ExpenseCategory>(expense.category);
  const [amount, setAmount] = useState(String(expense.amount));
  const [fixed, setFixed] = useState(expense.isFixed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const amt = Number(amount);
    if (!concept.trim()) return setError('Concept is required');
    if (!Number.isFinite(amt) || amt < 0) return setError('Amount must be a non-negative number');
    setSaving(true);
    setError(null);
    try {
      await updateExpense({
        id: expense.id,
        ...period,
        concept: concept.trim(),
        category,
        amount: amt,
        isFixed: expense.isFixed,
        makeFixed: fixed,
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
          <input value={concept} onChange={(e) => setConcept(e.target.value)} className={`${inputCls} w-full`} />
          <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fixed}
              onChange={(e) => setFixed(e.target.checked)}
              className="rounded border-gray-300"
            />
            Fixed (repeats every fortnight)
          </label>
        </td>
        <td className="px-4 sm:px-5 py-2">
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
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
          {fixed && expense.isFixed && (
            <p className="text-[10px] text-gray-400 mt-1">Applies from this fortnight onward</p>
          )}
          {fixed && !expense.isFixed && (
            <p className="text-[10px] text-gray-400 mt-1">Will repeat from this fortnight onward</p>
          )}
          {!fixed && expense.isFixed && (
            <p className="text-[10px] text-gray-400 mt-1">
              Stops repeating from this fortnight onward; earlier ones keep it
            </p>
          )}
          {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 sm:px-5 py-2 text-gray-700">
        {expense.concept}
        {expense.isFixed && (
          <span
            className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-50 rounded-md px-1.5 py-0.5"
            title="Repeats every fortnight"
          >
            <Repeat size={9} /> Fixed
          </span>
        )}
      </td>
      <td className="px-4 sm:px-5 py-2 text-gray-500">{EXPENSE_CATEGORY_LABELS[expense.category]}</td>
      <td className="px-4 sm:px-5 py-2 text-gray-600 whitespace-nowrap">{fmtCAD(expense.amount)}</td>
      <td className="px-4 sm:px-5 py-2 text-right whitespace-nowrap">
        {!locked && (<>
        {onTogglePin && (
          <button
            onClick={onTogglePin}
            disabled={pinning}
            className={`p-1 rounded-md disabled:opacity-40 ${
              pinned ? 'text-navy bg-gray-100 hover:bg-gray-200' : 'text-gray-300 hover:text-navy hover:bg-gray-100'
            }`}
            title={pinned ? 'Shown in Key expenses — click to unpin' : 'Pin to Key expenses'}
            aria-pressed={pinned}
          >
            <Pin size={13} />
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded-md text-gray-300 hover:text-navy hover:bg-gray-100"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
          title={expense.isFixed ? 'Stop from this fortnight onward' : 'Delete'}
        >
          <Trash2 size={13} />
        </button>
        </>)}
      </td>
    </tr>
  );
}

export default function ExpensesSection({
  period,
  locked,
  pinnedLabels = [],
  onChanged,
}: {
  locked?: boolean;
  period: Quincena;
  /** Conceptos que hoy están en "Key expenses" (los trae el resumen). */
  pinnedLabels?: string[];
  onChanged?: () => void;
}) {
  const [expenses, setExpenses] = useState<PayrollExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('operational');
  const [amount, setAmount] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PayrollExpense | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExpenses(period);
      setExpenses(data.expenses);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  // Recarga la lista propia Y avisa al padre (los totales del P&L viven en
  // el resumen, no acá).
  const reload = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  // La "x" del formulario de alta: lo cierra y descarta lo escrito.
  function cancelForm() {
    setShowForm(false);
    setConcept('');
    setAmount('');
    setIsFixed(false);
    setCategory('operational');
    setFormError(null);
  }

  async function handleAdd() {
    const amt = Number(amount);
    if (!concept.trim()) {
      setFormError('Concept is required');
      return;
    }
    if (!Number.isFinite(amt) || amt < 0) {
      setFormError('Amount must be a non-negative number');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await addExpense({ ...period, concept: concept.trim(), category, amount: amt, isFixed });
      setConcept('');
      setAmount('');
      setIsFixed(false);
      setShowForm(false);
      await reload();
    } catch (e: any) {
      setFormError(e?.message ?? 'Could not add expense');
    } finally {
      setSaving(false);
    }
  }

  // setPinnedConcepts reemplaza la lista entera: se manda la actual con el
  // concepto agregado o sacado.
  async function togglePin(expense: PayrollExpense) {
    const key = conceptKey(expense.concept);
    const isPinned = pinnedLabels.some((l) => conceptKey(l) === key);
    setPinning(key);
    try {
      await setPinnedConcepts(
        isPinned
          ? pinnedLabels.filter((l) => conceptKey(l) !== key)
          : [...pinnedLabels, expense.concept.trim()],
      );
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? 'Could not update Key expenses');
    } finally {
      setPinning(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeExpense(pendingDelete, period);
      setPendingDelete(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete expense');
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const c = useCollapsed('expenses');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 cursor-pointer select-none" {...c.titleProps}>
          <Chevron collapsed={c.collapsed} />
          <Receipt size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-navy">Expenses</span>
        </div>
        {!locked && !c.collapsed && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
          >
            <Plus size={13} /> Add expense
          </button>
        )}
      </div>

      <div hidden={c.collapsed}>
        {error && (
          <div className="px-4 sm:px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</div>
        )}

        {showForm && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[11px] text-gray-400 mb-1">Concept</label>
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="e.g. Gasolina"
                className={`${inputCls} w-full`}
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
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

        {!loading && expenses.length === 0 ? (
          <p className="text-xs text-gray-400 px-4 py-6 text-center">No expenses logged for this fortnight yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="font-medium px-4 sm:px-5 py-2">Concept</th>
                <th className="font-medium px-4 sm:px-5 py-2">Category</th>
                <th className="font-medium px-4 sm:px-5 py-2">Amount</th>
                <th className="font-medium px-4 sm:px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <ExpenseRow
                  key={e.id}
                  locked={locked}
                  expense={e}
                  period={period}
                  onSaved={reload}
                  onDelete={() => setPendingDelete(e)}
                  deleting={deleting && pendingDelete?.id === e.id}
                  pinned={pinnedLabels.some((l) => conceptKey(l) === conceptKey(e.concept))}
                  onTogglePin={conceptKey(e.concept) === AUTO_KEY ? undefined : () => togglePin(e)}
                  pinning={pinning === conceptKey(e.concept)}
                />
              ))}
            </tbody>
          </table>
        )}

        {pendingDelete && (
          <ConfirmDialog
            title={pendingDelete.isFixed ? 'Stop this fixed expense?' : 'Delete this expense?'}
            message={
              pendingDelete.isFixed
                ? `"${pendingDelete.concept}" will no longer repeat from this fortnight onward. Earlier fortnights keep it.`
                : `"${pendingDelete.concept}" will be removed from this fortnight.`
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
