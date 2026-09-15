import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { LogOut, Calendar, Clock, CalendarPlus, AlertCircle, ChevronRight, DollarSign, KeyRound } from 'lucide-react';
import { getStaffDayEvents, type StaffCalendarEvent } from '../api/staffCalendar';
import { getStaffHoursSummary, type QuincenaPeriod, type StaffHoursSummary } from '../api/staffHours';
import { STAFF_TOKEN_KEY } from '../api/staffClient';
import TimeOffRequestModal from '../components/staff/TimeOffRequestModal';
import ComplaintModal from '../components/staff/ComplaintModal';
import AccountModal from '../components/staff/AccountModal';

const TZ = 'America/Vancouver';

// LAB425 — landing page tras el login de un cleaner. El calendario completo
// (LAB423) pasa a ser secundario, accesible por botón desde acá.
export default function StaffHomePage() {
  const navigate = useNavigate();

  const [period, setPeriod] = useState<QuincenaPeriod>('current');
  const [summary, setSummary] = useState<StaffHoursSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [today, setToday] = useState<StaffCalendarEvent[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState<string | null>(null);

  const [showTimeOff, setShowTimeOff] = useState(false);
  const [showComplaint, setShowComplaint] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Reset loading/error as soon as `period` changes, during render (not
  // inside the effect below) — same pattern as StaffCalendarPage, avoids the
  // cascading-render anti-pattern of calling setState synchronously at the
  // top of an effect.
  const [loadedPeriod, setLoadedPeriod] = useState(period);
  if (period !== loadedPeriod) {
    setLoadedPeriod(period);
    setSummaryLoading(true);
    setSummaryError(null);
  }

  useEffect(() => {
    let cancelled = false;
    getStaffHoursSummary(period)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setSummaryLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSummaryError("Could not load your hours.");
        setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    getStaffDayEvents(DateTime.now().setZone(TZ))
      .then((data) => {
        if (cancelled) return;
        setToday(data);
        setTodayLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTodayError("Could not load today's schedule.");
        setTodayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    navigate('/staff/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-[#031634] text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-montserrat font-bold">Staff Home</h1>
        <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white">
          <LogOut size={13} /> Log out
        </button>
      </header>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* ── Hours this quincena ─────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-[#031634]" />
              <span className="text-sm font-semibold text-[#031634]">Hours this period</span>
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {(['current', 'previous'] as QuincenaPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  disabled={summaryLoading}
                  className={`px-2.5 py-1 transition-colors disabled:opacity-50 ${
                    period === p ? 'bg-[#031634] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {p === 'current' ? 'Current' : 'Previous'}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-4">
            {summaryError ? (
              <p className="text-xs text-red-500">{summaryError}</p>
            ) : (
              <>
                <p className={`text-3xl font-bold text-[#031634] transition-opacity ${summaryLoading ? 'opacity-30' : ''}`}>
                  {summaryLoading ? '—' : summary?.hours.toFixed(1)}
                  <span className="text-base font-normal text-gray-400 ml-1">h</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {summary?.label} · {summary ? `${summary.from} – ${summary.to}` : ''}
                  {summary ? ` · ${summary.eventCount} completed job${summary.eventCount === 1 ? '' : 's'}` : ''}
                </p>
              </>
            )}
          </div>
        </section>

        {/* ── Today ────────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Calendar size={15} className="text-[#031634]" />
            <span className="text-sm font-semibold text-[#031634]">Today</span>
          </div>

          <div className="px-4 py-3 space-y-2">
            {todayLoading && <p className="text-xs text-gray-400 py-2">Loading...</p>}
            {todayError && <p className="text-xs text-red-500 py-2">{todayError}</p>}
            {!todayLoading && !todayError && today.length === 0 && (
              <p className="text-xs text-gray-400 py-2">No services scheduled for today.</p>
            )}
            {!todayLoading &&
              !todayError &&
              today.map((ev) => {
                const start = DateTime.fromISO(ev.startIso, { zone: TZ });
                const end = DateTime.fromISO(ev.endIso, { zone: TZ });
                return (
                  <div key={ev.id} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs font-semibold text-[#031634] w-20 flex-shrink-0 pt-0.5">
                      {ev.isAllDay ? 'All day' : start.toFormat('h:mm a')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{ev.summary}</p>
                      {!ev.isAllDay && (
                        <p className="text-[11px] text-gray-400">
                          {start.toFormat('h:mm a')} – {end.toFormat('h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          <button
            onClick={() => navigate('/staff/calendar')}
            className="w-full flex items-center justify-center gap-1 py-2.5 text-sm font-medium text-[#031634] border-t border-gray-100 hover:bg-gray-50"
          >
            View full calendar <ChevronRight size={14} />
          </button>
        </section>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => setShowTimeOff(true)}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm text-sm font-medium text-[#031634] hover:bg-gray-50"
          >
            <CalendarPlus size={16} /> Request time off
          </button>
          <button
            onClick={() => setShowComplaint(true)}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm text-sm font-medium text-[#031634] hover:bg-gray-50"
          >
            <AlertCircle size={16} /> Report an issue
          </button>
          <button
            onClick={() => navigate('/staff/payroll')}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm text-sm font-medium text-[#031634] hover:bg-gray-50"
          >
            <DollarSign size={16} /> Payroll
          </button>
          <button
            onClick={() => setShowChangePassword(true)}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm text-sm font-medium text-[#031634] hover:bg-gray-50"
          >
            <KeyRound size={16} /> My account
          </button>
        </section>
      </div>

      {showTimeOff && <TimeOffRequestModal onClose={() => setShowTimeOff(false)} />}
      {showComplaint && <ComplaintModal onClose={() => setShowComplaint(false)} />}
      {showChangePassword && <AccountModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
