// components/payroll/ClosePeriodSection.tsx
// Payroll — cierre manual de la quincena, al final de la página. Cerrar la
// congela como un archivo inmutable: sus números y tarjetas salen de un
// snapshot y ya no se puede editar nada. No hay "reabrir" en la app: si de
// verdad hace falta, se hace a mano en la base de datos.
import { useState } from 'react';
import { Lock, LockKeyhole } from 'lucide-react';
import { closePayrollPeriod, getChecklist } from '../../api/payroll';
import { isCurrentOrFuture, quincenaTitle, type Quincena } from '../../lib/quincena';
import ConfirmDialog from '../admin/ConfirmDialog';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ClosePeriodSection({
  period,
  closing,
  loading,
  onClosed,
}: {
  period: Quincena;
  closing?: { closedAt: string; closedBy: string | null };
  loading: boolean;
  onClosed: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // Items del Payroll check sin tildar (null = no se pudo consultar). No bloquea
  // el cierre: solo se le recuerda al admin antes de confirmar.
  const [pending, setPending] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Consulta el checklist justo antes de confirmar, así el aviso refleja lo
  // último que se tildó (la tarjeta del checklist tiene su propio estado).
  async function openConfirm() {
    setChecking(true);
    setError(null);
    try {
      const items = (await getChecklist(period)).items;
      setPending(items.filter((i) => !i.done).map((i) => i.label));
    } catch {
      setPending(null);
    } finally {
      setChecking(false);
      setConfirming(true);
    }
  }

  async function handleClose() {
    setBusy(true);
    setError(null);
    try {
      await closePayrollPeriod(period);
      setConfirming(false);
      onClosed();
    } catch (e: any) {
      setError(e?.message ?? 'Could not close the fortnight');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (closing) {
    return (
      <div className="bg-gray-50 rounded-2xl border border-gray-200 px-4 sm:px-5 py-4 flex items-start gap-3">
        <Lock size={18} className="text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-navy">Fortnight closed</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Frozen as an immutable archive on {fmtDateTime(closing.closedAt)}
            {closing.closedBy ? ` by ${closing.closedBy}` : ''}. Its numbers and tables can't be changed.
          </p>
        </div>
      </div>
    );
  }

  const notEnded = isCurrentOrFuture(period);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 sm:px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LockKeyhole size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-navy">Close this fortnight</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Freezes {quincenaTitle(period)} as an immutable archive. Nothing can be edited afterwards and it can't be
            reopened from the app.
            {notEnded ? ' This fortnight has not ended yet.' : ''}
          </p>
        </div>
        <button
          onClick={openConfirm}
          disabled={loading || busy || checking}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-navy rounded-lg px-4 py-2 disabled:opacity-50"
        >
          <Lock size={14} /> Close fortnight
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {confirming && (
        <ConfirmDialog
          title={`Close ${quincenaTitle(period)}?`}
          message={
            'The summary, tables and every card of this fortnight will be frozen as an immutable archive. ' +
            "You won't be able to edit or reopen it from the app." +
            (notEnded ? ' This fortnight has not ended yet, so later work in it will not be counted.' : '') +
            (pending && pending.length > 0
              ? ` Payroll check: ${pending.length} item${pending.length === 1 ? '' : 's'} not ticked yet (${pending
                  .slice(0, 5)
                  .join(', ')}${pending.length > 5 ? `, +${pending.length - 5} more` : ''}). They will be archived as pending.`
              : '')
          }
          confirmLabel="Close fortnight"
          danger
          loading={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={handleClose}
        />
      )}
    </div>
  );
}
