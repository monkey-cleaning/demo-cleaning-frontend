// pages/StaffPayrollPage.tsx
// LAB428 — "Payroll": histórico quincenal del cleaner logueado (eventos,
// horas, traslado — nunca dinero, el backend de staff no lo manda).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import PayrollSummaryView from '../components/payroll/PayrollSummaryView';
import { getStaffPayrollSummary, type PayrollSummary } from '../api/payroll';
import { currentQuincena, type Quincena } from '../lib/quincena';
import { STAFF_TOKEN_KEY } from '../api/staffClient';

export default function StaffPayrollPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Quincena>(() => currentQuincena());
  const [data, setData] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await getStaffPayrollSummary(period);
      setData(summary);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your payroll summary.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = () => {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    navigate('/staff/login');
  };

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="bg-[#031634] text-white px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/staff')}
          className="flex items-center gap-1.5 text-base font-montserrat font-bold"
        >
          <ArrowLeft size={16} /> Payroll
        </button>
        <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white">
          <LogOut size={13} /> Log out
        </button>
      </header>

      <PayrollSummaryView
        data={data}
        showMoney={false}
        period={period}
        onPeriodChange={setPeriod}
        loading={loading}
        error={error}
        onRefresh={load}
      />
    </div>
  );
}
