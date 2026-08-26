// Detección de conflictos de capacidad/equipo — funciones puras, sin fetch,
// para reusar la misma lógica en useOperationalData (hoy) y AdminCalendarPage
// (semana/mes completos).

export interface ConflictableEvent {
  id: string;
  summary: string;
  teamId: string | null;
  startIso: string;
  endIso: string;
  isAllDay?: boolean; // si está presente y es true, el evento se ignora
  createdIso?: string | null; // GCal `created` — opcional, solo lo usa conflictResolution.ts
  isNonService?: boolean; // eventos "*" o Google Task — nunca consumen capacidad ni disparan team_overlap
}

export interface TeamOverlapFlag {
  eventId: string;
  conflictingEventId: string;
  conflictingSummary: string;
  teamId: string;
}

export interface OverCapacityFlag {
  eventId: string;
  simultaneousCount: number;
  maxTeams: number;
}

export interface LunchIssueFlag {
  teamId: string;
  startDate: string;           // día (YYYY-MM-DD) al que aplica
  issue: "missing" | "extra";
  count: number;                // 0 para "missing", 2+ para "extra"
  extraEventIds: string[];      // eventos Lunch a resaltar (vacío si es "missing" — no hay evento al que atribuirlo)
}

// Misma convención que isLunchSummary() en conflictResolution.ts ("Lunch",
// "Lunch #1", "Lunch #2"...). Duplicado intencional para evitar un import
// circular (conflictResolution.ts ya importa tipos de este archivo) — ya
// existe una tercera copia de esta misma regla en teamAutoAssignService.js
// (ver comentario en conflictResolution.ts), así que mantenerlas en sync
// si se toca el formato del título.
const LUNCH_SUMMARY_RE = /^lunch(\s*#\s*\d+)?$/i;
function isLunch(summary: string): boolean {
  return LUNCH_SUMMARY_RE.test((summary ?? "").trim());
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime()
    && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

// ── Mismo equipo con dos eventos simultáneos ─────────────────────────────────
export function findTeamOverlaps<T extends ConflictableEvent>(events: T[]): TeamOverlapFlag[] {
  const out: TeamOverlapFlag[] = [];
  const byTeam = new Map<string, T[]>();

  for (const e of events) {
    if (!e.teamId || e.isAllDay || e.isNonService) continue;;
    const list = byTeam.get(e.teamId) ?? [];
    list.push(e);
    byTeam.set(e.teamId, list);
  }

  for (const [teamId, list] of byTeam) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (overlaps(a.startIso, a.endIso, b.startIso, b.endIso)) {
          out.push({ eventId: a.id, conflictingEventId: b.id, conflictingSummary: b.summary, teamId });
          out.push({ eventId: b.id, conflictingEventId: a.id, conflictingSummary: a.summary, teamId });
        }
      }
    }
  }
  return out;
}

// ── Más eventos simultáneos (con equipo asignado) que equipos disponibles ───
// Mismo criterio que el backend (getAvailableStaff): los eventos sin equipo
// asignado no consumen capacidad.
export function findOverCapacity<T extends ConflictableEvent>(
  events: T[],
  maxSimultaneousTeams: number,
): OverCapacityFlag[] {
  const assigned = events.filter(e => e.teamId && !e.isAllDay && !e.isNonService);
  if (assigned.length === 0) return [];

  // Sweep-line: +1 en cada inicio, -1 en cada fin, ordenado cronológicamente.
  // Esto refleja la concurrencia real en cada instante — a diferencia de
  // contar solapamientos por-evento, no cae en falsos positivos por cadenas
  // (A se solapa con B, B se solapa con C, pero A y C nunca coinciden).
  type Point = { time: number; delta: 1 | -1; eventId: string };
  const points: Point[] = [];
  for (const e of assigned) {
    points.push({ time: new Date(e.startIso).getTime(), delta: 1, eventId: e.id });
    points.push({ time: new Date(e.endIso).getTime(), delta: -1, eventId: e.id });
  }
  // En empates, procesar primero los finales que los inicios — un evento que
  // termina justo cuando otro arranca no cuenta como simultáneo (igual
  // criterio que overlaps(): límites que se tocan no se solapan).
  points.sort((a, b) => a.time - b.time || a.delta - b.delta);

  const active = new Set<string>();
  const flagged = new Map<string, number>();

  for (const p of points) {
    if (p.delta === 1) {
      active.add(p.eventId);
      if (active.size > maxSimultaneousTeams) {
        for (const id of active) {
          flagged.set(id, Math.max(flagged.get(id) ?? 0, active.size));
        }
      }
    } else {
      active.delete(p.eventId);
    }
  }

  return Array.from(flagged.entries()).map(([eventId, simultaneousCount]) => ({
    eventId,
    simultaneousCount,
    maxTeams: maxSimultaneousTeams,
  }));
}

// ── Un solo lunch por equipo por día ─────────────────────────────────────────
// No hardcodea la cantidad de equipos (LAB-233 principle) — solo mira los
// teamId que efectivamente aparecen en los eventos cargados. Un equipo
// "falta lunch" únicamente si tuvo 2+ servicios reales ese día — con un solo
// evento no hay hueco entre servicios para el que haga falta almuerzo, así
// que no se le asigna y no debe marcarse como conflicto (quickfix lunch).
// "Extra" no depende de la cantidad de servicios — 2+ eventos Lunch para el
// mismo equipo el mismo día es una anomalía en sí misma.
export function findLunchIssues<T extends ConflictableEvent & { startDate: string }>(
  events: T[],
): LunchIssueFlag[] {
  const lunchesByTeamDay = new Map<string, T[]>();
  const workingCountByTeamDay = new Map<string, number>();

  for (const e of events) {
    if (e.isAllDay || !e.teamId) continue;
    const day = e.startDate;
    if (isLunch(e.summary)) {
      const key = `${e.teamId}|${day}`;
      const list = lunchesByTeamDay.get(key) ?? [];
      list.push(e);
      lunchesByTeamDay.set(key, list);
    } else if (!e.isNonService) {
      const key = `${e.teamId}|${day}`;
      workingCountByTeamDay.set(key, (workingCountByTeamDay.get(key) ?? 0) + 1);
    }
  }

  const flags: LunchIssueFlag[] = [];

  for (const [key, lunches] of lunchesByTeamDay) {
    if (lunches.length > 1) {
      const [teamId, startDate] = key.split("|");
      flags.push({ teamId, startDate, issue: "extra", count: lunches.length, extraEventIds: lunches.map(l => l.id) });
    }
  }

  for (const [key, count] of workingCountByTeamDay) {
    if (count < 2) continue; // un solo evento no requiere lunch asignado
    if (!lunchesByTeamDay.has(key)) {
      const [teamId, startDate] = key.split("|");
      flags.push({ teamId, startDate, issue: "missing", count: 0, extraEventIds: [] });
    }
  }

  return flags;
}