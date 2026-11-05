import { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { apiFetchTeams, type TeamConfig } from './TeamHeader';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface WeekAssignment {
  team_id: string;
  name: string;
  is_team_leader: boolean;
}

// ── Fechas (siempre locales, toISOString correría el día por UTC) ────────────

function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const DAY_FMT = new Intl.DateTimeFormat('en-CA', { weekday: 'short' });
const RANGE_FMT = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' });

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchDay(date: string): Promise<WeekAssignment[]> {
  const token = localStorage.getItem('admin_blog_token') ?? '';
  const res = await fetch(`${API_BASE}/api/admin/staff/team-assignments?date=${date}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.assignments as WeekAssignment[];
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function TeamsWeekModal({ onClose }: { onClose: () => void }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [teams,     setTeams]     = useState<TeamConfig[]>([]);
  const [byDay,     setByDay]     = useState<Record<string, WeekAssignment[]>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayYmd = toYmd(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([apiFetchTeams(), ...days.map(d => fetchDay(toYmd(d)))])
      .then(([t, ...perDay]) => {
        if (cancelled) return;
        setTeams(t as TeamConfig[]);
        const map: Record<string, WeekAssignment[]> = {};
        days.forEach((d, i) => { map[toYmd(d)] = perDay[i] as WeekAssignment[]; });
        setByDay(map);
      })
      .catch((e: any) => { if (!cancelled) setError(e.message ?? 'Error desconocido'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isThisWeek = toYmd(weekStart) === toYmd(mondayOf(new Date()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-[96vw] xl:max-w-[1400px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3 border-b border-gray-100">
          <h2 className="font-bold text-navy text-sm sm:text-base flex items-center gap-2">
            <CalendarRange size={15} className="text-gold" />
            Weekly Teams
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart(w => addDays(w, -7))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Previous week"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold text-navy min-w-[130px] text-center">
              {RANGE_FMT.format(days[0])} – {RANGE_FMT.format(days[6])}
            </span>
            <button
              onClick={() => setWeekStart(w => addDays(w, 7))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Next week"
            >
              <ChevronRight size={16} />
            </button>
            {!isThisWeek && (
              <button
                onClick={() => setWeekStart(mondayOf(new Date()))}
                className="ml-1 text-xs text-gold hover:underline"
              >
                This week
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-4 overflow-auto">
          {error ? (
            <p className="text-xs text-red-500 text-center py-6">{error}</p>
          ) : loading ? (
            <p className="text-sm text-gray-400 text-center py-10 animate-pulse">Loading…</p>
          ) : (
            <table className="w-full table-fixed border-separate border-spacing-1 min-w-[640px]">
              <thead>
                <tr>
                  <th className="w-16 sm:w-20" />
                  {days.map(d => {
                    const ymd = toYmd(d);
                    const isToday = ymd === todayYmd;
                    return (
                      <th
                        key={ymd}
                        className={`text-xs font-semibold rounded-lg py-1.5 ${
                          isToday ? 'bg-gold/15 text-navy' : 'text-gray-500'
                        }`}
                      >
                        {DAY_FMT.format(d)} <span className="font-normal">{d.getDate()}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id}>
                    <th
                      className="text-left align-top text-xs font-bold text-navy pr-1 pt-2"
                      style={{ borderLeft: `4px solid ${team.color}`, paddingLeft: 8 }}
                    >
                      {team.emojis[0] && <span className="mr-1">{team.emojis[0]}</span>}
                      {team.label}
                    </th>
                    {days.map(d => {
                      const ymd = toYmd(d);
                      const members = (byDay[ymd] ?? [])
                        .filter(a => a.team_id === team.id)
                        .sort((a, b) => Number(b.is_team_leader) - Number(a.is_team_leader));
                      return (
                        <td
                          key={ymd}
                          className="align-top rounded-lg border border-gray-100 bg-gray-50/50 p-1.5"
                        >
                          {members.length === 0 ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {members.map(m => (
                                <li key={m.name} className="text-xs text-gray-700 flex items-start gap-1 leading-tight">
                                  {m.is_team_leader ? (
                                    <span className="text-[10px] mt-px">👑</span>
                                  ) : (
                                    <span className="w-1.5 h-1.5 mt-1 rounded-full bg-gray-300 flex-shrink-0" />
                                  )}
                                  <span className="break-words min-w-0">{m.name.trim()}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
