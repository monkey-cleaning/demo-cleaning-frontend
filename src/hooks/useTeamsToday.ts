import { useCallback, useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface TeamMember {
  name: string;
  email: string;
  is_team_leader: boolean;
  is_active: boolean;
}

export interface TeamEvent {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
  durationH: number;
  location: string | null;
  color: string;
}

export interface TeamCard {
  teamId: string | null;       // null = "Available Staff"
  label: string;
  color: string | null;        // null = tarjeta punteada (sin equipo)
  emojis: string[];
  members: TeamMember[];
  serviceCount: number;
  dominantType: string | null;
  events: TeamEvent[];
}

export interface TeamsTodayData {
  date: string;
  teams: TeamCard[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchTeamsToday(): Promise<{ date: string; teams: TeamCard[] }> {
  const token = localStorage.getItem('admin_blog_token') ?? '';
  const res = await fetch(`${API_BASE}/api/dashboard/teams-today`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Teams Today fetch failed: ${res.status}`);
  return res.json();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTeamsToday(): TeamsTodayData {
  const [date,    setDate]    = useState('');
  const [teams,   setTeams]   = useState<TeamCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeamsToday();
      setDate(data.date);
      setTeams(data.teams);
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { date, teams, loading, error, refresh: load };
}