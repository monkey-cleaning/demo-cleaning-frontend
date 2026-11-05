// components/payroll/ClosingSections.tsx
// Payroll (2026-09-24) — las tablas de cierre de quincena de la planilla
// manual, con el mismo formato que Dividends/Deductions (tarjetas autónomas
// con fetch propio por `period`, que avisan al padre con `onChanged`):
//   * Bonuses: monto por cleaner (a todos o a algunos); SÍ suman al Net pay.
//   * Tips: lo que dejó un cliente y a qué cleaners les corresponde. Confirmado
//     con Jhony (2026-09-29): pasan por la cuenta de la empresa — SÍ suman al
//     Net pay y al excedente en efectivo de Pagos Experimental.
//   * New services: servicios/clientes nuevos de la quincena y su frecuencia.
//   * Payroll check: el chequeo previo a cerrar la quincena, con toggles y un
//     comentario por item; se pueden agregar items.
// Admin-only. UI provisoria — se repasa después de chequear con los usuarios.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Plus, Trash2, Pencil, X, Gift, Sparkles, ListChecks, Award } from 'lucide-react';
import {
  getBonuses,
  addBonus,
  updateBonus,
  removeBonus,
  getTips,
  addTip,
  updateTip,
  removeTip,
  getNewServices,
  getDetectedNewClients,
  addNewService,
  updateNewService,
  removeNewService,
  getChecklist,
  addChecklistItem,
  removeChecklistItem,
  setChecklistStatus,
  NEW_SERVICE_FREQUENCIES,
  type PayrollBonus,
  type PayrollTip,
  type PayrollNewService,
  type PayrollDetectedClient,
  type PayrollChecklistItem,
  type NewServiceFrequency,
} from '../../api/payroll';
import type { Quincena } from '../../lib/quincena';
import ConfirmDialog from '../admin/ConfirmDialog';
import ClientPicker, { type PickedClient } from './ClientPicker';
import { useCollapsed, Chevron } from './Collapsible';

function fmtCAD(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

const inputCls =
  'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-navy';

function CardShell({
  icon,
  title,
  meta,
  subtitle,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const c = useCollapsed(`closing.${title.toLowerCase()}`);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="min-w-0 cursor-pointer select-none" {...c.titleProps}>
          <div className="flex items-center gap-2">
            <Chevron collapsed={c.collapsed} />
            {icon}
            <span className="text-sm font-semibold text-navy">{title}</span>
            {meta}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        {!c.collapsed && action}
      </div>
      <div hidden={c.collapsed}>{children}</div>
    </div>
  );
}

const AddButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 flex-shrink-0"
  >
    <Plus size={13} /> {label}
  </button>
);

const ErrorBar = ({ message }: { message: string | null }) =>
  message ? (
    <div className="px-4 sm:px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{message}</div>
  ) : null;

const RowActions = ({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) => (
  <td className="px-2 py-2 text-right whitespace-nowrap w-16">
    {onEdit && (
      <button onClick={onEdit} className="p-1 rounded-md text-gray-300 hover:text-navy hover:bg-gray-100" title="Edit">
        <Pencil size={13} />
      </button>
    )}
    <button onClick={onDelete} className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50" title="Delete">
      <Trash2 size={13} />
    </button>
  </td>
);

// ── Bonuses ──────────────────────────────────────────────────────────────

export function BonusesSection({
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
  const [bonuses, setBonuses] = useState<PayrollBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PayrollBonus | 'new' | null>(null);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [appliesToAll, setAppliesToAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PayrollBonus | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getBonuses(period);
      setBonuses(r.bonuses);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load bonuses');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openForm(b: PayrollBonus | 'new') {
    setForm(b);
    setFormError(null);
    if (b === 'new') {
      setConcept('');
      setAmount('');
      setAppliesToAll(true);
      setSelected([]);
    } else {
      setConcept(b.concept);
      setAmount(String(b.amount));
      setAppliesToAll(b.appliesToAll);
      setSelected(b.recipients.map((r) => r.employeeId));
    }
  }

  // Un destinatario que ya no está entre los activos se sigue ofreciendo para
  // poder editar el bono.
  const options = [
    ...employees,
    ...(form && form !== 'new'
      ? form.recipients
          .filter((r) => !employees.some((e) => e.employeeId === r.employeeId))
          .map((r) => ({ employeeId: r.employeeId, name: r.name ?? 'Unknown' }))
      : []),
  ];

  async function handleSave() {
    const amt = Number(amount);
    if (!concept.trim()) return setFormError('Concept is required');
    if (amount.trim() === '' || !Number.isFinite(amt) || amt < 0) return setFormError('Amount must be a non-negative number');
    if (!appliesToAll && selected.length === 0) return setFormError('Pick at least one cleaner, or apply it to all');
    setSaving(true);
    setFormError(null);
    try {
      const payload = { concept: concept.trim(), amount: amt, appliesToAll, employeeIds: appliesToAll ? [] : selected };
      if (form && form !== 'new') await updateBonus(form.id, payload);
      else await addBonus(period, payload);
      setForm(null);
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
      await removeBonus(pendingDelete.id);
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

  return (
    <CardShell
      icon={<Award size={15} className="text-gray-400" />}
      title="Bonuses"
      subtitle="Amount is paid to EACH cleaner it applies to. Adds to their Net pay."
      action={locked ? undefined : <AddButton label="Add bonus" onClick={() => openForm('new')} />}
    >
      <ErrorBar message={error} />

      {form && (
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-gray-400 mb-1">Concept</label>
              <input value={concept} onChange={(e) => setConcept(e.target.value)} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Amount per cleaner</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputCls} w-28`}
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Applies to</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAppliesToAll(true)}
                className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                  appliesToAll ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                All cleaners
              </button>
              {options.map((e) => {
                const on = !appliesToAll && selected.includes(e.employeeId);
                return (
                  <button
                    key={e.employeeId}
                    type="button"
                    onClick={() => {
                      setAppliesToAll(false);
                      setSelected((cur) =>
                        cur.includes(e.employeeId) ? cur.filter((id) => id !== e.employeeId) : [...cur, e.employeeId],
                      );
                    }}
                    className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                      on ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {e.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
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
            {formError && <span className="text-[11px] text-red-600">{formError}</span>}
          </div>
        </div>
      )}

      {!loading && bonuses.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-5 text-center">No bonuses this fortnight.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="font-medium px-4 sm:px-5 py-1.5">Concept</th>
              <th className="font-medium px-2 py-1.5">Cleaners</th>
              <th className="font-medium px-4 sm:px-5 py-1.5 text-right">Each</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {bonuses.map((b) => (
              <tr key={b.id} className="border-t border-gray-100 first:border-t-0 align-top">
                <td className="px-4 sm:px-5 py-2 text-gray-700">{b.concept}</td>
                <td className="px-2 py-2 text-gray-500">
                  {b.appliesToAll ? 'All cleaners' : b.recipients.map((r) => r.name ?? 'Unknown').join(', ')}
                </td>
                <td className="px-4 sm:px-5 py-2 text-gray-600 whitespace-nowrap text-right">{fmtCAD(b.amount)}</td>
                {locked ? <td /> : <RowActions onEdit={() => openForm(b)} onDelete={() => setPendingDelete(b)} />}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this bonus?"
          message={`"${pendingDelete.concept}" (${fmtCAD(pendingDelete.amount)} each) will be removed from this fortnight.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </CardShell>
  );
}

// ── Tips ─────────────────────────────────────────────────────────────────

export function TipsSection({
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
  const [tips, setTips] = useState<PayrollTip[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = cerrado, 'new' = alta, un tip = edición
  const [form, setForm] = useState<PayrollTip | 'new' | null>(null);
  // Cliente REAL del CRM (elegido en el buscador o recién creado).
  const [client, setClient] = useState<PickedClient | null>(null);
  // Nombre viejo escrito a mano (propinas anteriores sin cliente): solo precarga la búsqueda.
  const [legacyName, setLegacyName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PayrollTip | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getTips(period);
      setTips(r.tips);
      setTotal(r.total);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load tips');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openForm(tip: PayrollTip | 'new') {
    setForm(tip);
    setFormError(null);
    if (tip === 'new') {
      setClient(null);
      setLegacyName('');
      setAmount('');
      setNote('');
      setSelected([]);
    } else {
      setClient(tip.clientId ? { id: tip.clientId, name: tip.clientName } : null);
      setLegacyName(tip.clientId ? '' : tip.clientName);
      setAmount(String(tip.amount));
      setNote(tip.note ?? '');
      setSelected(tip.recipients.map((r) => r.employeeId));
    }
  }

  // Los destinatarios de una propina vieja pueden ser un empleado que ya no
  // está entre los activos — se siguen ofreciendo para poder editarla.
  const options = [
    ...employees,
    ...(form && form !== 'new'
      ? form.recipients
          .filter((r) => !employees.some((e) => e.employeeId === r.employeeId))
          .map((r) => ({ employeeId: r.employeeId, name: r.name ?? 'Unknown' }))
      : []),
  ];

  async function handleSave() {
    const amt = Number(amount);
    if (!client) return setFormError('Pick an existing client or create a new one');
    if (amount.trim() === '' || !Number.isFinite(amt) || amt < 0) return setFormError('Amount must be a non-negative number');
    setSaving(true);
    setFormError(null);
    try {
      const payload = { clientName: client!.name, clientId: client!.id, amount: amt, note: note.trim(), employeeIds: selected };
      if (form && form !== 'new') await updateTip(form.id, payload);
      else await addTip(period, payload);
      setForm(null);
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
      await removeTip(pendingDelete.id);
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

  return (
    <CardShell
      icon={<Gift size={15} className="text-gray-400" />}
      title="Tips"
      meta={!loading && tips.length > 0 && <span className="text-xs font-semibold text-gray-500">· {fmtCAD(total)}</span>}
      subtitle="Left by clients for cleaners, through the company account. Adds to their Net pay."
      action={locked ? undefined : <AddButton label="Add tip" onClick={() => openForm('new')} />}
    >
      <ErrorBar message={error} />

      {form && (
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-gray-400 mb-1">Client</label>
              <ClientPicker key={form === 'new' ? 'new' : form.id} value={client} onChange={setClient} initialQuery={legacyName} />
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
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] text-gray-400 mb-1">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cash" className={`${inputCls} w-full`} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">
              Cleaners it belongs to — split equally{selected.length === 0 ? ' (none selected: unassigned)' : ''}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {options.map((e) => {
                const on = selected.includes(e.employeeId);
                return (
                  <button
                    key={e.employeeId}
                    type="button"
                    onClick={() =>
                      setSelected((cur) => (on ? cur.filter((id) => id !== e.employeeId) : [...cur, e.employeeId]))
                    }
                    className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                      on ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {e.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
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
            {formError && <span className="text-[11px] text-red-600">{formError}</span>}
          </div>
        </div>
      )}

      {!loading && tips.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-5 text-center">No tips this fortnight.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="font-medium px-4 sm:px-5 py-1.5">Client</th>
              <th className="font-medium px-2 py-1.5">Cleaners</th>
              <th className="font-medium px-4 sm:px-5 py-1.5 text-right">Amount</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {tips.map((t) => (
              <tr key={t.id} className="border-t border-gray-100 first:border-t-0 align-top">
                <td className="px-4 sm:px-5 py-2 text-gray-700">
                  {t.clientName}
                  {t.note && <span className="block text-[11px] text-gray-400">{t.note}</span>}
                </td>
                <td className="px-2 py-2 text-gray-500">
                  {t.recipients.length ? (
                    t.recipients.map((r) => r.name ?? 'Unknown').join(', ')
                  ) : (
                    <span className="text-amber-600">Unassigned</span>
                  )}
                </td>
                <td className="px-4 sm:px-5 py-2 text-gray-600 whitespace-nowrap text-right">{fmtCAD(t.amount)}</td>
                {locked ? <td /> : <RowActions onEdit={() => openForm(t)} onDelete={() => setPendingDelete(t)} />}
              </tr>
            ))}
            <tr className="border-t border-gray-200 bg-gray-50/70">
              <td className="px-4 sm:px-5 py-2 font-semibold text-navy" colSpan={2}>
                Total
              </td>
              <td className="px-4 sm:px-5 py-2 font-semibold text-navy text-right whitespace-nowrap">{fmtCAD(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this tip?"
          message={`"${pendingDelete.clientName}" (${fmtCAD(pendingDelete.amount)}) will be removed from this fortnight.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </CardShell>
  );
}

// ── New services ─────────────────────────────────────────────────────────

export function NewServicesSection({ period, locked, onChanged }: { period: Quincena; locked?: boolean; onChanged?: () => void }) {
  const [items, setItems] = useState<PayrollNewService[]>([]);
  // Clientes cuyo primer servicio cae en la quincena y aún no se cargaron;
  // `detectedFreq` es la frecuencia elegida por fila (por defecto la del cliente).
  const [detected, setDetected] = useState<PayrollDetectedClient[]>([]);
  const [detectedFreq, setDetectedFreq] = useState<Record<string, NewServiceFrequency>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PayrollNewService | 'new' | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [frequency, setFrequency] = useState<NewServiceFrequency>('Weekly');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PayrollNewService | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await getNewServices(period)).newServices);
      // La detección es una ayuda: si falla, la tarjeta sigue funcionando a mano.
      getDetectedNewClients(period)
        .then((r) => setDetected(r.detected))
        .catch(() => setDetected([]));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load new services');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openForm(item: PayrollNewService | 'new') {
    setForm(item);
    setFormError(null);
    setServiceName(item === 'new' ? '' : item.serviceName);
    setFrequency(item === 'new' ? 'Weekly' : item.frequency);
    setNote(item === 'new' ? '' : (item.note ?? ''));
  }

  async function handleSave() {
    if (!serviceName.trim()) return setFormError('Service is required');
    setSaving(true);
    setFormError(null);
    try {
      const payload = { serviceName: serviceName.trim(), frequency, note: note.trim() };
      if (form && form !== 'new') await updateNewService(form.id, payload);
      else await addNewService(period, payload);
      setForm(null);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      setFormError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDetected(list: PayrollDetectedClient[]) {
    setConfirming(list.length === 1 ? list[0].clientId : 'all');
    setError(null);
    try {
      for (const c of list) {
        await addNewService(period, {
          serviceName: c.serviceType ? `${c.name} – ${c.serviceType}` : c.name,
          frequency: detectedFreq[c.clientId] ?? c.frequency ?? 'As needed',
          clientId: c.clientId,
        });
      }
      await refresh();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? 'Could not add the client');
      await refresh();
    } finally {
      setConfirming(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeNewService(pendingDelete.id);
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

  return (
    <CardShell
      icon={<Sparkles size={15} className="text-gray-400" />}
      title="New services"
      meta={!loading && items.length > 0 && <span className="text-xs font-semibold text-gray-500">· {items.length}</span>}
      subtitle="New clients this fortnight (detected from the calendar) and how often they book."
      action={locked ? undefined : <AddButton label="Add service" onClick={() => openForm('new')} />}
    >
      <ErrorBar message={error} />

      {form && (
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] text-gray-400 mb-1">Service</label>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. Client name – House Cleaning"
              className={`${inputCls} w-full`}
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-400 mb-1">Type</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as NewServiceFrequency)} className={inputCls}>
              {NEW_SERVICE_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[11px] text-gray-400 mb-1">Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} w-full`} />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
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
      )}

      {!locked && detected.length > 0 && (
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-amber-50/40 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-amber-800">
              Detected: first service in this fortnight ({detected.length})
            </p>
            {detected.length > 1 && (
              <button
                onClick={() => confirmDetected(detected)}
                disabled={confirming !== null}
                className="text-[11px] font-semibold text-navy hover:underline disabled:opacity-40"
              >
                Add all
              </button>
            )}
          </div>
          {detected.map((c) => (
            <div key={c.clientId} className="flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate text-gray-700" title={c.name}>
                {c.name}
                <span className="ml-1.5 text-[11px] text-gray-400">
                  {c.firstServiceDate.slice(5)}
                  {c.serviceType ? ` · ${c.serviceType}` : ''}
                </span>
              </span>
              <select
                value={detectedFreq[c.clientId] ?? c.frequency ?? 'As needed'}
                onChange={(e) => setDetectedFreq((cur) => ({ ...cur, [c.clientId]: e.target.value as NewServiceFrequency }))}
                className={inputCls}
              >
                {NEW_SERVICE_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button
                onClick={() => confirmDetected([c])}
                disabled={confirming !== null}
                className="text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                {confirming === c.clientId || confirming === 'all' ? '…' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 py-5 text-center">No new services this fortnight.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="font-medium px-4 sm:px-5 py-1.5">Service</th>
              <th className="font-medium px-2 py-1.5">Type</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t border-gray-100 first:border-t-0 align-top">
                <td className="px-4 sm:px-5 py-2 text-gray-700">
                  {s.serviceName}
                  {s.note && <span className="block text-[11px] text-gray-400">{s.note}</span>}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className="text-[11px] font-medium text-navy bg-gray-100 rounded-full px-2 py-0.5">{s.frequency}</span>
                </td>
                {locked ? <td /> : <RowActions onEdit={() => openForm(s)} onDelete={() => setPendingDelete(s)} />}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this service?"
          message={`"${pendingDelete.serviceName}" will be removed from this fortnight.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </CardShell>
  );
}

// ── Payroll check (checklist) ────────────────────────────────────────────

function ChecklistRow({
  item,
  locked,
  onToggle,
  onComment,
  onDelete,
}: {
  locked?: boolean;
  item: PayrollChecklistItem;
  onToggle: () => void;
  onComment: (comment: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(item.comment ?? '');
  useEffect(() => {
    setDraft(item.comment ?? '');
  }, [item.comment]);

  const commit = () => {
    if (draft.trim() !== (item.comment ?? '')) onComment(draft.trim());
  };

  return (
    <div className="px-4 sm:px-5 py-2 group">
      <div className="flex items-center gap-3">
        <button
          role="switch"
          aria-checked={item.done}
          aria-label={item.label}
          disabled={locked}
          onClick={onToggle}
          className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${item.done ? 'bg-emerald-500' : 'bg-gray-200'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${item.done ? 'translate-x-4' : ''}`}
          />
        </button>
        <span className={`text-xs flex-1 min-w-0 ${item.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.label}</span>
        {item.done && item.doneBy && (
          <span className="text-[10px] text-gray-400 whitespace-nowrap hidden sm:inline">{item.doneBy}</span>
        )}
        {!locked && (
          <button
            onClick={onDelete}
            className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Remove from this fortnight onward"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {/* El comentario se pide al tildar; también se puede dejar/editar
          después. Si el item está pendiente pero tiene un comentario viejo,
          se muestra atenuado (no se pierde info al destildar). */}
      {(item.done || item.comment) && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          readOnly={locked}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          placeholder="Add a comment…"
          className={`mt-1 ml-12 w-[calc(100%-3rem)] text-[11px] border-0 border-b border-gray-100 bg-transparent px-0 py-0.5 focus:outline-none focus:border-navy ${
            item.done ? 'text-gray-600' : 'text-gray-400'
          }`}
        />
      )}
    </div>
  );
}

export function ChecklistSection({ period, locked, onChanged }: { period: Quincena; locked?: boolean; onChanged?: () => void }) {
  const [items, setItems] = useState<PayrollChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PayrollChecklistItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems((await getChecklist(period)).items);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load the checklist');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Cambio optimista: la fila responde al instante y, si el servidor falla,
  // se vuelve al estado real.
  async function update(item: PayrollChecklistItem, done: boolean, comment: string | null) {
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, done, comment } : i)));
    try {
      await setChecklistStatus(period, item.id, done, comment);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save');
      await refresh();
    }
  }

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    setError(null);
    try {
      await addChecklistItem(period, label);
      setNewLabel('');
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Could not add the item');
    } finally {
      setAdding(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeChecklistItem(period, pendingDelete.id);
      setPendingDelete(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Could not remove the item');
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <CardShell
      icon={<ListChecks size={15} className="text-gray-400" />}
      title="Payroll check"
      meta={
        !loading && items.length > 0 && (
          <span className={`text-xs font-semibold ${doneCount === items.length ? 'text-emerald-600' : 'text-gray-500'}`}>
            · {doneCount}/{items.length}
          </span>
        )
      }
      subtitle="Review before closing the fortnight. Tick an item and leave a comment if needed."
    >
      <ErrorBar message={error} />
      {items.length > 0 && (
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-emerald-500 transition-all"
            style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }}
          />
        </div>
      )}
      {/* ~10 filas visibles (37px c/u sin comentario); el resto se scrollea. */}
      <div className={`divide-y divide-gray-50 max-h-[370px] overflow-y-auto transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {!loading && items.length === 0 && <p className="text-xs text-gray-400 px-4 py-5 text-center">No items.</p>}
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            locked={locked}
            item={item}
            onToggle={() => update(item, !item.done, item.comment)}
            onComment={(c) => update(item, item.done, c || null)}
            onDelete={() => setPendingDelete(item)}
          />
        ))}
      </div>
      {!locked && (
      <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Add an item to the checklist…"
          className={`${inputCls} flex-1`}
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newLabel.trim()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40"
        >
          <Plus size={13} /> Add
        </button>
      </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Remove this check?"
          message={`"${pendingDelete.label}" will be removed from this fortnight onward. Earlier fortnights keep it.`}
          confirmLabel="Remove"
          danger
          loading={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </CardShell>
  );
}
