import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { DateTime } from 'luxon';
import { findTeamOverlaps, findOverCapacity } from '../lib/conflictDetection';

// ── Constantes ────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TZ = 'America/Vancouver';
const RISK_DAYS = 21;
const INACTIVE_DAYS = 30;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface TodayService {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
  durationH: number;
  teamLabel: string | null;
  teamId: string | null;
  color: string;
  location: string | null;
  serviceType: string;
  isNonService: boolean;
  isIndividualAssignment: boolean;
}

export interface ClientAlert {
  id: string;
  fullName: string;
  daysSince: number;
  alertLevel: 'inactive' | 'at-risk';
  serviceType: string | null;
  isRecurring: boolean | null;
  expectedFrequency: string | null;
}

export type ConflictType = 'unassigned' | 'schedule' | 'team_overlap' | 'over_capacity';

export interface ConflictAlert {
  id: string;
  type: ConflictType;
  summary: string;
  startIso: string;
  durationH: number;
  employeeName?: string;     // only 'schedule'
  employeeId?: string;       // only 'schedule'
  reasons?: string[];        // only 'schedule'
  // eventId real — necesario para el deep-link, porque `id` es una key
  // compuesta para mantener unicidad en la lista (ver más abajo)
  eventId?: string;          // 'team_overlap' | 'over_capacity'
  conflictingSummary?: string; // only 'team_overlap'
  teamLabel?: string | null;   // only 'team_overlap'
  simultaneousCount?: number;  // only 'over_capacity'
  maxTeams?: number;           // only 'over_capacity'
}

export interface ActiveTeams {
  active: number;
  total: number;
}

export interface OperationalKPIs {
  servicesToday: number;
  activeTeams: ActiveTeams;
  clientsInactive: number;
  estimatedWeeklyRev: number;
}

export interface OperationalData {
  kpis: OperationalKPIs;
  todayServices: TodayService[];
  inactiveClients: ClientAlert[];
  conflicts: ConflictAlert[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferServiceType(summary: string): string {
  const t = summary.toLowerCase();
  if (t.includes('comercial') || t.includes('office') || t.includes('corporate')) return 'Commercial';
  if (t.includes('post') || t.includes('construc')) return 'Post-construction';
  if (t.includes('especial') || t.includes('tapicería') || t.includes('carpet')) return 'Special';
  return 'Residential';
}

// ── Fetch 1: KPIs desde el nuevo endpoint ────────────────────────────────────

async function fetchOperationalKPIs(): Promise<OperationalKPIs> {
  const token = localStorage.getItem('admin_blog_token') ?? '';
  const res = await fetch(`${API_BASE}/api/dashboard/operational`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Dashboard KPI fetch failed: ${res.status}`);
  return res.json();
}

// ── Fetch 2: detalle de eventos de hoy (para la lista "Today's Services") ───

async function fetchTodayEvents(): Promise<TodayService[]> {
  const token = localStorage.getItem('admin_blog_token') ?? '';
  const startOfDay = DateTime.now().setZone(TZ).startOf('day');
  const timeMin = startOfDay.toISO()!;
  const timeMax = startOfDay.endOf('day').toISO()!;

  const url = `${API_BASE}/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
  const data = await res.json();

  return (data.events as any[]).map(e => {
    const rawLabel = e.teamLabel as string | null;
    const teamLabel = rawLabel
      ?? (e.teamId ? (e.teamId as string).replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null);
    return {
      id: e.id,
      summary: e.summary ?? '(No title)',
      startIso: e.startIso,
      endIso: e.endIso,
      durationH: e.durationH,
      teamLabel,
      teamId: e.teamId ?? null,
      color: e.color ?? '#6b7280',
      location: e.location ?? null,
      serviceType: inferServiceType(e.summary ?? ''),
      isNonService: e.isNonService ?? false,
      isIndividualAssignment: e.isIndividualAssignment ?? false,
    };
  });
}

// ── Fetch 3: clientes inactivos (para la lista de alertas) ──────────────────

async function fetchClientAlerts(): Promise<ClientAlert[]> {
  const cutoff = DateTime.now().setZone(TZ).minus({ days: RISK_DAYS }).toISO()!;

  const { data, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, last_activity_at, service_type, is_recurring, expected_frequency, postponed_until')
    .eq('is_recurring', true)
    .or(`last_activity_at.lt.${cutoff},last_activity_at.is.null`)
    .order('last_activity_at', { ascending: true })
    .limit(10);

  if (error) throw error;

  const now = DateTime.now().valueOf();
  return (data ?? [])
    .filter(c => !c.postponed_until || new Date(c.postponed_until).getTime() <= now)
    .map(c => {
      const daysSince = c.last_activity_at
        ? Math.floor((now - DateTime.fromISO(c.last_activity_at).valueOf()) / 86_400_000)
        : 999;
      return {
        id: c.id,
        fullName: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Cliente sin nombre',
        daysSince,
        alertLevel: daysSince >= INACTIVE_DAYS ? 'inactive' : 'at-risk',
        serviceType: c.service_type ?? null,
        isRecurring: c.is_recurring ?? null,
        expectedFrequency: c.expected_frequency ?? null,
      };
    });
}

// ── Fetch 4: conflictos de horario del personal asignado a eventos de hoy ───
// Reusa el mismo endpoint que AdminCalendarPage llama desde EventFormModal /
// AssignModal (apiCheckConflicts). Se invoca en paralelo, uno por evento con
// equipo asignado, para no duplicar la lógica de getAvailableStaff en el front.

interface RawConflict { employeeId: string; name: string; reasons: string[] }

async function fetchEventConflictsBatch(
  events: { id: string; startIso: string; endIso: string }[],
): Promise<Record<string, RawConflict[]>> {
  if (events.length === 0) return {};
  const token = localStorage.getItem('admin_blog_token') ?? '';
  const res = await fetch(`${API_BASE}/api/calendar/events/conflicts/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) return {}; // non-blocking, igual criterio que el endpoint individual
  const data = await res.json();
  return data.conflictsByEventId ?? {};
}

async function fetchScheduleConflicts(services: TodayService[]): Promise<ConflictAlert[]> {
  // Solo eventos con equipo asignado tienen attendees que chequear.
  const assigned = services.filter(s => s.teamId || s.isIndividualAssignment);
  if (assigned.length === 0) return [];

  const conflictsByEventId = await fetchEventConflictsBatch(
    assigned.map(s => ({ id: s.id, startIso: s.startIso, endIso: s.endIso })),
  );

  const alerts: ConflictAlert[] = [];
  for (const service of assigned) {
    const cs = conflictsByEventId[service.id] ?? [];
    for (const c of cs) {
      alerts.push({
        id: `${service.id}-${c.employeeId}`,
        type: 'schedule',
        summary: service.summary,
        startIso: service.startIso,
        durationH: service.durationH,
        employeeName: c.name,
        employeeId: c.employeeId,
        reasons: c.reasons,
      });
    }
  }
  return alerts;
}
// ── Fetch 5: capacidad de equipos (para over_capacity) ──────────────────────

async function fetchMaxSimultaneousTeams(): Promise<number> {
  const token = localStorage.getItem('admin_blog_token') ?? '';
  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return 2; // fallback conservador
  const data = await res.json();
  return parseInt(data.settings?.max_simultaneous_teams ?? '2', 10);
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useOperationalData(): OperationalData {
  const [kpis, setKpis] = useState<OperationalKPIs>({
    servicesToday: 0,
    activeTeams: { active: 0, total: 0 },
    clientsInactive: 0,
    estimatedWeeklyRev: 0,
  });
  const [todayServices, setTodayServices] = useState<TodayService[]>([]);
  const [inactiveClients, setInactiveClients] = useState<ClientAlert[]>([]);
  const [conflicts, setConflicts] = useState<ConflictAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Las 3 llamadas iniciales en paralelo
      // DESPUÉS
      const [serverKpis, services, alerts, maxTeams] = await Promise.all([
        fetchOperationalKPIs(),
        fetchTodayEvents(),
        fetchClientAlerts(),
        fetchMaxSimultaneousTeams(),
      ]);

      setKpis(serverKpis);
      setTodayServices(services);
      setInactiveClients(alerts);

      const unassigned: ConflictAlert[] = services
        .filter(s => !s.teamId && !s.isNonService && !s.isIndividualAssignment)
        .map(s => ({ id: s.id, type: 'unassigned' as const, summary: s.summary, startIso: s.startIso, durationH: s.durationH }));

      const teamOverlaps: ConflictAlert[] = findTeamOverlaps(services).map(o => {
        const ev = services.find(s => s.id === o.eventId)!;
        return {
          id: `${o.eventId}-overlap-${o.conflictingEventId}`,
          type: 'team_overlap' as const,
          summary: ev.summary,
          startIso: ev.startIso,
          durationH: ev.durationH,
          eventId: o.eventId,
          conflictingSummary: o.conflictingSummary,
          teamLabel: ev.teamLabel,
        };
      });

      const overCapacity: ConflictAlert[] = findOverCapacity(services, maxTeams).map(f => {
        const ev = services.find(s => s.id === f.eventId)!;
        return {
          id: `${f.eventId}-capacity`,
          type: 'over_capacity' as const,
          summary: ev.summary,
          startIso: ev.startIso,
          durationH: ev.durationH,
          eventId: f.eventId,
          simultaneousCount: f.simultaneousCount,
          maxTeams: f.maxTeams,
        };
      });

      const scheduleConflicts = await fetchScheduleConflicts(services);

      setConflicts([...unassigned, ...scheduleConflicts, ...teamOverlaps, ...overCapacity]);
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { kpis, todayServices, inactiveClients, conflicts, loading, error, refresh: load };
}