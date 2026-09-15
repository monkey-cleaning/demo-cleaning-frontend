// pages/AdminPayrollPage.tsx
// LAB428 — "Payroll": histórico quincenal de eventos/horas/traslado/dinero
// de TODOS los empleados. Solo lectura.
import { useCallback, useEffect, useState } from 'react';
import RequireAdmin from '../components/admin/RequireAdmin';
import AdminNavbar from '../components/admin/AdminNavbar';
import PayrollSummaryView from '../components/payroll/PayrollSummaryView';
import { getAdminPayrollSummary, type PayrollSummary } from '../api/payroll';
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

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar title="Payroll" sectionLabel="Finance" />
        <PayrollSummaryView
          data={data}
          showMoney
          period={period}
          onPeriodChange={setPeriod}
          loading={loading}
          error={error}
          onRefresh={load}
        />
      </div>
    </RequireAdmin>
  );
}
