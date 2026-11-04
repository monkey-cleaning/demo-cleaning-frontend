// components/payroll/JobMoneyCells.tsx
// Payroll estilo Excel (2026-09-18) — las columnas de plata de la lista de
// trabajos, compartidas por las tres vistas (By employee, All records y
// Client revenue) para que se vean y se editen igual en todas:
//   Rate ($/h al cliente, editable) · Cleaner pay · Business profit · Invoice · Paid
// Todo admin-only: un cleaner nunca recibe estos campos del backend.
import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { Check, AlertTriangle } from 'lucide-react';
import type { InvoiceStatus } from '../../api/payroll';
import { TZ } from '../../lib/timezone';


export function fmtMoney2(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

// Lo mínimo que necesita una fila de trabajo — lo cumplen tanto los eventos
// de cada empleado como los registros de "Client revenue".
export interface JobMoneyInfo {
  eventId: string;
  startIso: string;
  durationH: number;
  attendeeCount: number;
  billedRate?: number;
  clientId?: string | null;
  /** Ganancia del cleaner: la de ESTE cleaner (vistas por cleaner) o la de
   *  todos los cleaners del trabajo (Client revenue). */
  cleanerPay?: number;
  businessProfit?: number;
  invoiceStatus?: InvoiceStatus | null;
  paidDate?: string | null;
}

export type RateScope = 'client' | 'job';
export type RateSaveHandler = (job: JobMoneyInfo, hourlyRate: number, scope: RateScope) => Promise<void>;

// `compact` = mismo padding que las filas del itinerario por empleado
// (px-4 py-1.5); el resto de las tablas usa px-4 sm:px-5 py-2.
const cellCls = (compact?: boolean) =>
  compact ? 'px-4 py-1.5 whitespace-nowrap' : 'px-4 sm:px-5 py-2 whitespace-nowrap';

// Tarifa aplicada al cliente. Editarla actualiza clients.rate en el CRM
// (trabajos futuros) y fija el monto de ESTE trabajo — las quincenas pasadas
// no se recalculan solas.
export function RateCell({
  job,
  onSave,
  compact,
}: {
  job: JobMoneyInfo;
  onSave?: RateSaveHandler;
  compact?: boolean;
}) {
  const tdCls = cellCls(compact);
  const current = job.billedRate ?? 0;
  const [draft, setDraft] = useState(String(current));
  // "client" (default) = pisa clients.rate, vale para próximos trabajos;
  // "job" = solo este trabajo (p. ej. alfombras a otra tarifa), sin tocar la
  // tarifa habitual del cliente — pedido explícito 2026-09-30.
  const [scope, setScope] = useState<RateScope>('client');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(current));
  }, [current]);

  const editable = Boolean(onSave && job.clientId);

  async function handleSave() {
    const rate = Number(draft);
    if (!Number.isFinite(rate) || rate < 0 || !onSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(job, rate, scope);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  // Sin cliente reconocido, el rate es un fallback ($50/h para "cliente
  // nuevo" — ver resolveClientHourlyRate) que puede no ser el real: se
  // resalta en rojo para que el admin no lo dé por bueno sin mirarlo
  // (pedido explícito 2026-09-29).
  if (!job.clientId) {
    return (
      <td className={`${tdCls} text-red-600 font-medium`} title="No client linked to this job — this rate is a fallback, not necessarily accurate">
        <span className="inline-flex items-center gap-1">
          <AlertTriangle size={11} /> ${current}/h
        </span>
      </td>
    );
  }

  if (!editable) {
    return (
      <td className={`${tdCls} text-gray-500`}>
        ${current}/h
      </td>
    );
  }

  return (
    <td className={tdCls}>
      <div className="flex items-center gap-1">
        <span className="text-gray-400">$</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          title={
            scope === 'client'
              ? "Updates the client's rate in the CRM (future jobs too) and locks this job's amount"
              : "Only this job — the client's regular rate stays as-is"
          }
          className="w-14 px-1.5 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-navy"
        />
        <span className="text-gray-400">/h</span>
        <button
          onClick={handleSave}
          disabled={saving || Number(draft) === current}
          className="p-1 rounded-md text-navy hover:bg-gray-100 disabled:opacity-30"
          title="Save rate"
        >
          <Check size={13} />
        </button>
      </div>
      {/* Toggle: a qué le pega el cambio — a todo el cliente (default, como
          antes) o solo a este trabajo puntual (2026-09-30). */}
      <div className="flex rounded-md overflow-hidden border border-gray-200 mt-1 text-[9px] leading-none w-fit">
        <button
          type="button"
          onClick={() => setScope('client')}
          disabled={saving}
          title="Updates the client's regular rate"
          className={`px-1 py-0.5 ${scope === 'client' ? 'bg-navy text-white' : 'bg-white text-gray-400 hover:text-navy'}`}
        >
          Client
        </button>
        <button
          type="button"
          onClick={() => setScope('job')}
          disabled={saving}
          title="Just this job — the client's rate stays the same"
          className={`px-1 py-0.5 border-l border-gray-200 ${scope === 'job' ? 'bg-navy text-white' : 'bg-white text-gray-400 hover:text-navy'}`}
        >
          This job
        </button>
      </div>
      {error && <span className="block text-[10px] text-red-600 max-w-[180px] whitespace-normal">{error}</span>}
    </td>
  );
}

export function ProfitCells({ job, compact }: { job: JobMoneyInfo; compact?: boolean }) {
  const tdCls = cellCls(compact);
  return (
    <>
      <td className={`${tdCls} text-gray-600`}>{job.cleanerPay != null ? fmtMoney2(job.cleanerPay) : '—'}</td>
      <td
        className={`${tdCls} font-medium ${
          job.businessProfit != null && job.businessProfit < 0 ? 'text-red-600' : 'text-emerald-700'
        }`}
      >
        {job.businessProfit != null ? fmtMoney2(job.businessProfit) : '—'}
      </td>
    </>
  );
}

const INVOICE_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-50 text-blue-700',
  sent: 'bg-indigo-50 text-indigo-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-red-50 text-red-600',
};

// Estado de la invoice linkeada al appointment (LAB452) y fecha de pago. Sin
// invoice todavía → "—" en ambas.
export function InvoiceCells({ job, compact }: { job: JobMoneyInfo; compact?: boolean }) {
  const tdCls = cellCls(compact);
  return (
    <>
      <td className={tdCls}>
        {job.invoiceStatus ? (
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${INVOICE_STYLES[job.invoiceStatus]}`}
          >
            {job.invoiceStatus}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className={`${tdCls} text-gray-500`}>
        {job.paidDate ? DateTime.fromISO(job.paidDate, { zone: TZ }).toFormat('LLL d') : '—'}
      </td>
    </>
  );
}

// Encabezados de las 5 columnas, para las tablas que muestran el bloque
// completo (By employee / All records).
export function JobMoneyHeaders({ className }: { className: string }) {
  return (
    <>
      <th className={className}>Rate</th>
      <th className={className}>Cleaner pay</th>
      <th className={className}>Business profit</th>
      <th className={className}>Invoice</th>
      <th className={className}>Paid</th>
    </>
  );
}
