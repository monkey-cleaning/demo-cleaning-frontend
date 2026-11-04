// pages/AdminPayrollPage.tsx
// LAB428 — "Payroll": histórico quincenal de eventos/horas/traslado/dinero
// de TODOS los empleados, con el resumen (P&L), gastos fijos y puntuales,
// dividendos, deducciones y la lista de trabajos con su tarifa/ganancias.
import { useCallback, useEffect, useState } from 'react';
import RequireAdmin from '../components/admin/RequireAdmin';
import AdminNavbar from '../components/admin/AdminNavbar';
import PayrollSummaryView from '../components/payroll/PayrollSummaryView';
import ExpensesSection from '../components/payroll/ExpensesSection';
import { DividendsSection, DeductionsSection } from '../components/payroll/AdjustmentsSections';
import PartnerExtrasSection from '../components/payroll/PartnerExtrasSection';
import CreditCardSection from '../components/payroll/CreditCardSection';
import AnnualSummarySection from '../components/payroll/AnnualSummarySection';
import { BonusesSection, TipsSection, NewServicesSection, ChecklistSection } from '../components/payroll/ClosingSections';
import PaymentTableSection from '../components/payroll/PaymentTableSection';
import ClosePeriodSection from '../components/payroll/ClosePeriodSection';
import type { RateSaveHandler } from '../components/payroll/JobMoneyCells';
import {
  getAdminPayrollSummary,
  updateTravelSlot,
  updateClientBilling,
  updateClientRate,
  type PayrollSummary,
  type PayrollTravelSlot,
} from '../api/payroll';
import { currentQuincena, type Quincena } from '../lib/quincena';

export default function AdminPayrollPage() {
  const [period, setPeriod] = useState<Quincena>(() => currentQuincena());
  const [data, setData] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await getAdminPayrollSummary(period);
      setData(summary);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load payroll summary');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  // Revisión manual de un tramo de traslado >= 1h. Recarga el resumen entero
  // al terminar; no colapsa la fila que el admin tenía abierta (`expanded`
  // vive dentro de PayrollSummaryView, independiente de `data`/`loading`).
  async function handleTravelSlotSave(
    employeeId: string,
    slot: PayrollTravelSlot,
    appliedHours: number,
  ) {
    await updateTravelSlot({
      employeeId,
      prevEventId: slot.prevEventId,
      nextEventId: slot.nextEventId,
      appliedHours,
      calculatedHours: slot.calculatedHours,
    });
    await load();
  }

  // Corrección manual del monto facturado a un cliente por un evento
  // puntual (pestaña "Client revenue") — mismo patrón que el traslado.
  async function handleClientBillingSave(
    eventId: string,
    appliedAmount: number,
    calculatedAmount: number,
  ) {
    await updateClientBilling({ eventId, appliedAmount, calculatedAmount });
    await load();
  }

  // Tarifa aplicada al cliente en un trabajo: actualiza clients.rate en el
  // CRM (trabajos futuros) y fija el monto de ESTE trabajo con la tarifa
  // nueva, así las quincenas pasadas no se recalculan solas. `scope: 'job'`
  // (2026-09-30) fija SOLO este trabajo, sin tocar la tarifa del cliente.
  const handleClientRateSave: RateSaveHandler = async (job, hourlyRate, scope) => {
    await updateClientRate({
      eventId: job.eventId,
      hourlyRate,
      durationH: job.durationH,
      attendeeCount: job.attendeeCount,
      eventStartIso: job.startIso,
      scope,
    });
    await load();
  };

  // Quincena cerrada: el resumen sale del snapshot inmutable y todo queda en
  // solo lectura (los handlers de edición por evento se omiten a propósito).
  const locked = Boolean(data?.closing);

  const employeeOptions = (data?.employees ?? []).map((e) => ({ employeeId: e.employeeId, name: e.name }));

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar title="Payroll" sectionLabel="Finance" />
        {/* Layout (pedido 2026-09-29): navegador sticky → 4 columnas (resumen,
            gastos relevantes, Net pay, Payroll check — controlado dentro de
            PayrollSummaryView/PnlTables) → pestañas "Activity" (totales +
            New services + Employees/Client revenue, vía `middleSlot`) /
            "Payments" (Pagos Experimental + ajustes, vía `paymentsContent`) /
            "Annual Summary" (2026-10-01, vía `annualSummaryContent` — sin
            período, junta las 24 quincenas del año elegido) → Close
            fortnight, siempre visible sin importar la pestaña. */}
        <PayrollSummaryView
          data={data}
          showMoney
          period={period}
          onPeriodChange={setPeriod}
          loading={loading}
          error={error}
          onRefresh={load}
          onTravelSlotSave={locked ? undefined : handleTravelSlotSave}
          onClientBillingSave={locked ? undefined : handleClientBillingSave}
          onClientRateSave={locked ? undefined : handleClientRateSave}
          checklistSlot={<ChecklistSection period={period} locked={locked} onChanged={load} />}
          middleSlot={<NewServicesSection period={period} locked={locked} />}
          paymentsContent={
            <div className="space-y-4">
              <ExpensesSection
                period={period}
                locked={locked}
                pinnedLabels={(data?.pnl?.relevantExpenses ?? []).filter((r) => !r.auto).map((r) => r.label)}
                onChanged={load}
              />
              {data?.paymentTable && (
                <PaymentTableSection
                  period={period}
                  table={data.paymentTable}
                  employees={employeeOptions}
                  loading={loading}
                  locked={locked}
                  onChanged={load}
                />
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                <DividendsSection period={period} locked={locked} onChanged={load} />
                <PartnerExtrasSection period={period} locked={locked} onChanged={load} />
                <DeductionsSection period={period} locked={locked} employees={employeeOptions} onChanged={load} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                <BonusesSection period={period} locked={locked} employees={employeeOptions} onChanged={load} />
                <TipsSection period={period} locked={locked} employees={employeeOptions} onChanged={load} />
                <CreditCardSection period={period} locked={locked} onChanged={load} />
              </div>
            </div>
          }
          annualSummaryContent={<AnnualSummarySection />}
        />
        {/* Cierre manual de la quincena — siempre al final de la página, sin
            importar qué pestaña esté activa (PayrollSummaryView solo decide
            qué va en el medio; esto queda afuera). */}
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pb-10">
          <ClosePeriodSection period={period} closing={data?.closing} loading={loading} onClosed={load} />
        </div>
      </div>
    </RequireAdmin>
  );
}
