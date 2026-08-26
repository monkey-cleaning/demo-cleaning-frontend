import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, FileText, CreditCard, AlertCircle, ArrowRight, Calendar, Users, Clock, UserX, DollarSign } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, subYears } from 'date-fns';
import AdminNavbar from '../components/admin/AdminNavbar';
import ConflictsAlertSection from '../components/admin/ConflictsAlertSection';

// ── Period filter ─────────────────────────────────────────────────────────────

type PeriodPreset = '6m' | '1y' | 'custom';

interface Period {
  preset: PeriodPreset;
  from: string; // yyyy-MM-dd
  to: string;   // yyyy-MM-dd
}

function buildPeriod(preset: PeriodPreset, customFrom?: string, customTo?: string): Period {
  const today = new Date();
  if (preset === '6m') {
    return {
      preset,
      from: format(startOfMonth(subMonths(today, 5)), 'yyyy-MM-dd'),
      to: format(endOfMonth(today), 'yyyy-MM-dd'),
    };
  }
  if (preset === '1y') {
    return {
      preset,
      from: format(startOfMonth(subYears(today, 1)), 'yyyy-MM-dd'),
      to: format(endOfMonth(today), 'yyyy-MM-dd'),
    };
  }
  // custom
  return {
    preset: 'custom',
    from: customFrom ?? format(startOfMonth(subMonths(today, 5)), 'yyyy-MM-dd'),
    to: customTo ?? format(endOfMonth(today), 'yyyy-MM-dd'),
  };
}

// ── PeriodSelector component ──────────────────────────────────────────────────

function PeriodSelector({
  period, onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(period.from);
  const [customTo, setCustomTo] = useState(period.to);

  const PRESETS: { key: PeriodPreset; label: string }[] = [
    { key: '6m', label: 'Last 6 months' },
    { key: '1y', label: 'Last year' },
    { key: 'custom', label: 'Custom range' },
  ];

  function selectPreset(key: PeriodPreset) {
    if (key === 'custom') {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    onChange(buildPeriod(key));
  }

  function applyCustom() {
    if (!customFrom || !customTo || customTo < customFrom) return;
    onChange(buildPeriod('custom', customFrom, customTo));
    setShowCustom(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Pill buttons */}
      <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 shadow-sm gap-0.5">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => selectPreset(key)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              period.preset === key && key !== 'custom'
                ? 'bg-[#031634] text-white shadow-sm'
                : key === 'custom' && showCustom
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active period label */}
      {period.preset !== 'custom' && (
        <span className="text-xs text-gray-400 hidden sm:inline">
          {format(new Date(period.from + 'T00:00:00'), 'MMM d, yyyy')} –{' '}
          {format(new Date(period.to + 'T00:00:00'), 'MMM d, yyyy')}
        </span>
      )}

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2 shadow-sm">
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={e => setCustomFrom(e.target.value)}
            className="text-xs border-0 focus:outline-none text-gray-700 bg-transparent"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            onChange={e => setCustomTo(e.target.value)}
            className="text-xs border-0 focus:outline-none text-gray-700 bg-transparent"
          />
          <button
            onClick={applyCustom}
            disabled={!customFrom || !customTo || customTo < customFrom}
            className="px-2.5 py-1 bg-[#031634] text-white text-xs font-semibold rounded-lg disabled:opacity-40 hover:bg-navy/90 transition-colors"
          >
            Apply
          </button>
          <button
            onClick={() => setShowCustom(false)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
import { getPaymentsSummary, type PaymentsSummary } from '../api/payments';
import { listInvoices, type Invoice } from '../api/invoices';
import RequireAdmin from '../components/admin/RequireAdmin';
import { useOperationalData } from '../hooks/useOperationalData';
import TeamsTodaySection from '../components/admin/TeamsTodaySection';
import TodayServicesSection from '../components/admin/TodayServicesSection';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(amount);
}

function fmtCAD(amount: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(amount);
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-');
  return format(new Date(Number(y), Number(m) - 1, 1), 'MMM');
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-50 text-blue-700',
  sent: 'bg-indigo-50 text-indigo-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-red-50 text-red-600',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

// ── Revenue bar chart (SVG) ───────────────────────────────────────────────────

function RevenueChart({ data }: { data: PaymentsSummary['byMonth'] }) {
  if (!data.length) return <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>;

  const max = Math.max(...data.map(d => d.amount), 1);
  const BAR_H = 140;

  return (
    <div className="overflow-x-auto -mx-1">
      <svg
        viewBox={`0 0 ${Math.max(data.length * 52, 300)} ${BAR_H + 36}`}
        className="w-full min-w-[280px]"
        preserveAspectRatio="none"
      >
        {data.map((d, i) => {
          const barH = Math.max((d.amount / max) * BAR_H, 4);
          const x = i * 52 + 10;
          const y = BAR_H - barH;
          return (
            <g key={d.month}>
              <rect x={x} y={y} width={32} height={barH} rx={4} fill="#EBC991" opacity={0.9} />
              {barH > 20 && (
                <text x={x + 16} y={y + 14} textAnchor="middle" fontSize={9} fill="#031634" fontWeight="600">
                  {fmt(d.amount).replace('CA$', '$')}
                </text>
              )}
              <text x={x + 16} y={BAR_H + 20} textAnchor="middle" fontSize={11} fill="#6b7280">
                {fmtMonth(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent, clickable = false,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent: string;
  clickable?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 flex gap-3 sm:gap-4 items-start shadow-sm transition-colors ${clickable ? 'hover:bg-gray-50 cursor-pointer' : ''}`}>
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-navy mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<PaymentsSummary | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const operational = useOperationalData();
  const [snoozingId, setSnoozingId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(() => buildPeriod('6m'));

  async function load(p: Period = period) {
    setLoading(true);
    setError(null);
    try {
      const [s, recent, overdue] = await Promise.all([
        getPaymentsSummary({ from: p.from, to: p.to }),
        listInvoices({ limit: 6, page: 1, from: p.from, to: p.to }),
        listInvoices({ status: 'overdue', limit: 5, from: p.from, to: p.to }),
      ]);
      setSummary(s);
      setRecentInvoices(recent.data);
      setOverdueInvoices(overdue.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    load(p);
  }

  useEffect(() => { load(); }, []);

  async function handleSnooze(clientId: string) {
    setSnoozingId(clientId);
    const postponedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = localStorage.getItem('admin_blog_token') ?? '';
    try {
      await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ postponed_until: postponedUntil }),
      });
      operational.refresh();
    } finally {
      setSnoozingId(null);
    }
  }

  // ── Valores derivados de KPIs operacionales ─────────────────────────────────

  const { kpis, loading: opLoading } = operational;
  const hasInactive = !opLoading && kpis.clientsInactive > 0;

  const activeTeamsValue = opLoading
    ? '—'
    : kpis.activeTeams.total > 0
      ? `${kpis.activeTeams.active}/${kpis.activeTeams.total}`
      : String(kpis.activeTeams.active);

  const activeTeamsSub = opLoading
    ? undefined
    : kpis.activeTeams.active === 0
      ? 'No teams assigned today'
      : `${kpis.activeTeams.active} team${kpis.activeTeams.active !== 1 ? 's' : ''} with services`;

  const weeklyRevValue = opLoading
    ? '—'
    : kpis.estimatedWeeklyRev > 0
      ? fmtCAD(kpis.estimatedWeeklyRev)
      : '$0';

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50 font-montserrat">

        {/* ── NavBar ──────────────────────────────────────────────────────── */}
        <AdminNavbar
          onRefresh={() => { load(); operational.refresh(); }}
          refreshing={loading || opLoading}
        />

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-8 space-y-5 sm:space-y-8">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {operational.error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} /> Operational data unavailable: {operational.error}
            </div>
          )}

          {/* ── Calendar conflicts (collapsible, hidden if none) ──────────── */}
          <ConflictsAlertSection conflicts={operational.conflicts} loading={opLoading} />

          {/* ── ROW 1: KPIs operacionales ─────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

            <KpiCard
              label="Services Today"
              value={opLoading ? '—' : String(kpis.servicesToday)}
              sub="scheduled for today"
              icon={Clock}
              accent="bg-blue-50 text-blue-600"
            />

            <KpiCard
              label="Active Teams"
              value={activeTeamsValue}
              sub={activeTeamsSub}
              icon={Users}
              accent="bg-emerald-50 text-emerald-600"
            />

            <Link to="/admin/clients?status=inactive" className="block">
              <KpiCard
                label="Inactive Clients"
                value={opLoading ? '—' : String(kpis.clientsInactive)}
                sub={
                  opLoading
                    ? undefined
                    : hasInactive
                      ? '⚠ Tap to follow up'
                      : 'All clients active'
                }
                icon={UserX}
                accent={hasInactive ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400'}
                clickable
              />
            </Link>

            <KpiCard
              label="Est. Weekly Revenue"
              value={weeklyRevValue}
              sub="based on scheduled services"
              icon={DollarSign}
              accent="bg-gold/20 text-yellow-700"
            />

          </div>

          {/* ── ROW 2: Today's Services + Today's Teams (50/50) ──────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

            {/* Today's Services */}
            <TodayServicesSection
              events={operational.todayServices}
              loading={opLoading}
              error={operational.error}
            />

            {/* Today's Teams */}
            <TeamsTodaySection />

          </div>

          {/* ── ROW 3: Team Calendar ─────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#031634] flex items-center justify-center">
                <Calendar size={16} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-navy">Team Calendar</p>
                <p className="text-xs text-gray-400">View the full weekly schedule</p>
              </div>
            </div>
            <Link to="/admin/calendar" className="flex items-center gap-1 text-xs font-semibold text-gold hover:underline">
              Open <ArrowRight size={12} />
            </Link>
          </div>

          {/* ── ROW 4: Metrics period selector + Billing Summary ────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header with period selector */}
            <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-50">
              <h2 className="text-sm font-bold text-navy flex items-center gap-2">
                <TrendingUp size={15} className="text-gold" /> Billing Summary
              </h2>
              <PeriodSelector period={period} onChange={handlePeriodChange} />
            </div>
            <div className="px-4 sm:px-6 py-5 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard
                label="Collected (FAE)"
                value={loading ? '—' : summary ? fmt(summary.totalCollected) : '—'}
                sub={period.preset === '6m' ? 'Last 6 months' : period.preset === '1y' ? 'Last year' : `${period.from} – ${period.to}`}
                icon={TrendingUp}
                accent="bg-emerald-50 text-emerald-600"
              />
              <KpiCard
                label="Payments"
                value={loading ? '—' : summary ? String(summary.countPayments) : '—'}
                sub={loading ? undefined : summary ? `${summary.byStatus.completed.count} completed` : undefined}
                icon={CreditCard}
                accent="bg-blue-50 text-blue-600"
              />
              <KpiCard
                label="Average"
                value={loading ? '—' : summary && summary.countPayments > 0 ? fmt(summary.totalCollected / summary.countPayments) : '—'}
                sub="per payment"
                icon={AlertCircle}
                accent="bg-red-50 text-red-500"
              />
              <KpiCard
                label="Drafts"
                value={loading ? '—' : String(recentInvoices.filter(i => i.status === 'draft').length)}
                sub="Pending to publish"
                icon={FileText}
                accent="bg-gold/20 text-yellow-700"
              />
            </div>
          </div>

          {/* ── ROW 5: Revenue (2/3) + Overdue (1/3) ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

            {/* Revenue chart — 2/3 */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-navy text-sm sm:text-base">Revenue · {period.preset === '6m' ? 'Last 6 months' : period.preset === '1y' ? 'Last year' : `${format(new Date(period.from + 'T00:00:00'), 'MMM yyyy')} – ${format(new Date(period.to + 'T00:00:00'), 'MMM yyyy')}`}</h2>
                <span className="text-xs text-gray-400">CAD</span>
              </div>
              {loading ? (
                <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Loading...</div>
              ) : (
                <RevenueChart data={summary?.byMonth ?? []} />
              )}
            </div>

            {/* Overdue invoices — 1/3 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-navy text-sm sm:text-base">Overdue</h2>
                <Link to="/admin/invoices?status=overdue" className="text-xs text-gold hover:underline flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              {loading ? (
                <div className="text-sm text-gray-300">Loading...</div>
              ) : overdueInvoices.length === 0 ? (
                <p className="text-sm text-gray-400">No overdue invoices 🎉</p>
              ) : (
                <ul className="space-y-3">
                  {overdueInvoices.map(inv => (
                    <li key={inv.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-navy truncate">
                          {inv.leads?.full_name ?? inv.quickbooks_customer_name ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-400">
                          Due {inv.due_date ? format(new Date(inv.due_date), 'MMM d') : '—'}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-red-500 flex-shrink-0">
                        {fmt(inv.balance ?? inv.total_amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>

          {/* ── ROW 6: Clients needing attention ─────────────────────────── */}
          {!opLoading && operational.inactiveClients.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-gray-50">
                <h2 className="font-bold text-navy text-sm sm:text-base flex items-center gap-2">
                  <UserX size={15} className="text-red-500" />
                  Clients needing attention
                  <span className="ml-1 bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {operational.inactiveClients.length}
                  </span>
                </h2>
                <Link to="/admin/clients?status=inactive" className="text-xs text-gold hover:underline flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>

              <ul className="divide-y divide-gray-50">
                {operational.inactiveClients.slice(0, 5).map(client => {
                  const isInactive = client.alertLevel === 'inactive';
                  return (
                    <li
                      key={client.id}
                      className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isInactive ? 'bg-red-500' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy truncate">{client.fullName}</p>
                        <p className="text-xs text-gray-400">
                          {client.serviceType ?? 'No type'}
                          {client.expectedFrequency ? ` · ${client.expectedFrequency}` : ''} ·{' '}
                          <span className={isInactive ? 'text-red-500 font-semibold' : 'text-amber-600 font-semibold'}>
                            {client.daysSince === 999 ? 'No history' : `${client.daysSince}d without service`}
                          </span>
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${isInactive ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
                        {isInactive ? 'Inactive' : 'At risk'}
                      </span>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                          to={`/admin/clients?status=${isInactive ? 'inactive' : 'at_risk'}&open=${client.id}`}
                          className="text-xs font-medium text-gold hover:underline"
                        >
                          Contact
                        </Link>
                        <button
                          onClick={() => handleSnooze(client.id)}
                          disabled={snoozingId === client.id}
                          className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
                          title="Snooze alert for 7 days"
                        >
                          {snoozingId === client.id ? '...' : 'Snooze'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {operational.inactiveClients.length > 5 && (
                <div className="px-4 sm:px-6 py-3 border-t border-gray-50">
                  <Link to="/admin/clients?status=inactive" className="text-xs text-gold hover:underline">
                    View {operational.inactiveClients.length - 5} more →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ── ROW 7: Recent Invoices ────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-gray-50">
              <h2 className="font-bold text-navy text-sm sm:text-base">Recent Invoices</h2>
              <Link to="/admin/invoices" className="text-xs text-gold hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {loading ? (
              <div className="px-4 sm:px-6 py-8 text-sm text-gray-300 text-center">Loading...</div>
            ) : (
              <>
                {/* Desktop table */}
                <table className="hidden sm:table w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50/50">
                      <th className="px-6 py-3 text-left font-medium">Client</th>
                      <th className="px-6 py-3 text-left font-medium hidden md:table-cell">Doc #</th>
                      <th className="px-6 py-3 text-left font-medium hidden md:table-cell">Due</th>
                      <th className="px-6 py-3 text-right font-medium">Amount</th>
                      <th className="px-6 py-3 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-navy truncate max-w-[160px]">
                          {inv.leads?.full_name ?? inv.quickbooks_customer_name ?? 'Unknown'}
                        </td>
                        <td className="px-6 py-3.5 text-gray-500 hidden md:table-cell">{inv.doc_number ?? '—'}</td>
                        <td className="px-6 py-3.5 text-gray-500 hidden md:table-cell">
                          {inv.due_date ? format(new Date(inv.due_date), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold text-navy">{fmt(inv.total_amount)}</td>
                        <td className="px-6 py-3.5"><StatusBadge status={inv.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile card list */}
                <ul className="sm:hidden divide-y divide-gray-50">
                  {recentInvoices.map(inv => (
                    <li key={inv.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-navy truncate">
                          {inv.leads?.full_name ?? inv.quickbooks_customer_name ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {inv.due_date ? `Due ${format(new Date(inv.due_date), 'MMM d')}` : '—'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className="text-sm font-semibold text-navy">{fmt(inv.total_amount)}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

        </div>
      </div>
    </RequireAdmin>
  );
}