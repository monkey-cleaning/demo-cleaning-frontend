import type { ConflictableEvent } from "./conflictDetection";

export interface ResolvableEvent extends ConflictableEvent {
  createdIso?: string;
}

export interface TeamOverlapSuggestion {
  eventToMoveId: string;      // cuál de los dos eventos cambia de equipo
  keepEventId: string;
  fromTeamId: string;
  toTeamId: string;
  resultingBufferMin: number; // buffer mínimo logrado en ambos equipos tras el cambio
  feasible: boolean;          // false si ningún equipo alcanza los 30min
  bookedFirstEventId: string; // informativo — NO decide cuál se mueve
  movedLunchEventId?: string; // si eventToMoveId tiene un Lunch pegado, también se reasigna
}

export interface OverCapacitySuggestion {
  eventToMoveId: string;
  fromStartIso: string;
  fromEndIso: string;
  toStartIso?: string;        // ausente si no hay slot factible
  toEndIso?: string;
  feasible: boolean;
  movedLunchEventId?: string; // si eventToMoveId tiene un Lunch pegado, se reagenda junto
  toLunchStartIso?: string;
  toLunchEndIso?: string;
}

// ── Config ────────────────────────────────────────────────────────────────
const BUFFER_MIN = 30;            // debe coincidir con BUFFER_MIN_LABEL en AdminCalendarPage.tsx
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 17;
const SLOT_STEP_MINUTES = 30;
const TIMEZONE = "America/Vancouver";

// Tipo mínimo que necesitan estas funciones (CalEvent lo satisface tal cual).
interface EventLike {
  id: string;
  summary: string;
  teamId: string | null;
  startIso: string;
  endIso: string;
  startDate: string;
  isAllDay: boolean;
  createdIso?: string | null;
  isNonService?: boolean;
}

// Devuelve el gap en minutos entre dos intervalos: positivo = separación libre,
// negativo = magnitud del solapamiento.
function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (aEnd <= bStart) return (bStart - aEnd) / 60000;
  if (bEnd <= aStart) return (aStart - bEnd) / 60000;
  const overlapStart = Math.max(aStart, bStart);
  const overlapEnd = Math.min(aEnd, bEnd);
  return -(overlapEnd - overlapStart) / 60000;
}

function overlapsRange(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// Convierte una hora "local" (America/Vancouver) de un día dado a su ISO UTC real,
// respetando DST. Doble pasada: adivina en UTC, mide el offset real, corrige.
function zonedTimeToIso(dateStr: string, hour: number, minute: number, timeZone = TIMEZONE): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(guessUtcMs));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hourValue = map.hour === "24" ? 0 : Number(map.hour);
  const asUtcOfGuess = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    hourValue, Number(map.minute), Number(map.second)
  );
  const offsetMs = asUtcOfGuess - guessUtcMs;
  return new Date(guessUtcMs - offsetMs).toISOString();
}

// ── Lunch pairing ─────────────────────────────────────────────────────────
// Misma regla que teamAutoAssignService.js (isLunch + adyacencia horaria).
// Acá los eventos ya tienen teamId resuelto, así que alcanza con: mismo día,
// mismo equipo, y pegado (termina cuando el otro arranca, en cualquier orden
// — igual que el fallback "anterior si es el último del día" del backend).
export function isLunchSummary(summary: string): boolean {
  // Los almuerzos se llaman "Lunch #1", "Lunch #2"... (el número de equipo),
  // no solo "Lunch" a secas — el match exacto anterior nunca los reconocía.
  return /^lunch(\s*#\s*\d+)?$/i.test((summary ?? "").trim());
}

export function findPairedLunch<T extends EventLike>(event: T, events: T[]): T | null {
  if (isLunchSummary(event.summary) || !event.teamId) return null;
  return events.find(e =>
    e.id !== event.id &&
    isLunchSummary(e.summary) &&
    e.teamId === event.teamId &&
    e.startDate === event.startDate &&
    (e.endIso === event.startIso || e.startIso === event.endIso)
  ) ?? null;
}

// Bloque real que ocupa un evento en la agenda de su equipo, incluyendo su
// Lunch pegado (si tiene). Se usa para todo cálculo de buffer/colisión al
// mover o reagendar, así el servicio y su almuerzo nunca se separan.
function occupiedBlock<T extends EventLike>(event: T, events: T[]): { startMs: number; endMs: number; lunch: T | null } {
  const lunch = findPairedLunch(event, events);
  const startMs = lunch
    ? Math.min(new Date(lunch.startIso).getTime(), new Date(event.startIso).getTime())
    : new Date(event.startIso).getTime();
  return { startMs, endMs: new Date(event.endIso).getTime(), lunch };
}

// Buffer resultante de insertar `moveEvent` (+ su Lunch, si tiene) en la
// agenda de `team` ese día, excluyendo al propio evento y a su lunch de los
// "ocupantes" contra los que se mide.
function scoreTeamForMove<T extends EventLike>(moveEvent: T, team: string, events: T[]): { buffer: number; lunch: T | null } {
  const { startMs, endMs, lunch } = occupiedBlock(moveEvent, events);
  const excludeIds = new Set([moveEvent.id, lunch?.id].filter((x): x is string => Boolean(x)));
  // el Lunch propio de moveEvent ya está afuera vía excludeIds
  // (occupiedBlock lo fusiona). Cualquier OTRO Lunch en el equipo destino
  // sigue contando como ocupante real: el equipo necesita tiempo de viaje
  // antes/después de comer igual que entre dos trabajos.
  const occupants = events.filter(e =>
    !excludeIds.has(e.id) &&
    e.teamId === team &&
    e.startDate === moveEvent.startDate
  );
  let buffer = Infinity;
  for (const occ of occupants) {
    const gap = overlapMinutes(startMs, endMs, new Date(occ.startIso).getTime(), new Date(occ.endIso).getTime());
    // Tocar o separarse de un Lunch (gap >= 0) no exige el buffer de 30min —
    // el equipo ya está ahí, no necesita tiempo de viaje extra. Pero un
    // solapamiento REAL contra el Lunch (gap < 0) sigue siendo un choque
    // imposible de ignorar: no pueden estar comiendo y trabajando a la vez.
    if (isLunchSummary(occ.summary) && gap >= 0) continue;
    buffer = Math.min(buffer, gap);
  }
  return { buffer, lunch };
}

// ── team_overlap: automático (explora ambas direcciones) ────────────────────
// No presetea cuál de los dos eventos mueve — prueba mover A o mover B a
// cada equipo alternativo y se queda con la combinación de mayor buffer.
export function suggestTeamOverlapFix<T extends EventLike>(
  eventAId: string,
  eventBId: string,
  events: T[],
  teamOrder: string[]
): TeamOverlapSuggestion | null {
  const a = events.find(e => e.id === eventAId);
  const b = events.find(e => e.id === eventBId);
  if (!a || !b || !a.teamId || !b.teamId || a.teamId !== b.teamId) return null;

  const currentTeam = a.teamId;
  const candidateTeams = teamOrder.filter(t => t !== currentTeam);
  if (candidateTeams.length === 0) return null;

  const aCreated = a.createdIso ? new Date(a.createdIso).getTime() : 0;
  const bCreated = b.createdIso ? new Date(b.createdIso).getTime() : 0;
  const bookedFirstEventId = aCreated <= bCreated ? a.id : b.id;

  type Option = { moveEvent: T; keepEvent: T; team: string; buffer: number; lunch: T | null };
  const options: Option[] = [];
  for (const [moveEvent, keepEvent] of [[a, b], [b, a]] as [T, T][]) {
    // Lunches nunca se eligen como el evento "principal" a mover — siguen a
    // su servicio automáticamente (ver movedLunchEventId más abajo).
    if (isLunchSummary(moveEvent.summary)) continue;
    for (const team of candidateTeams) {
      const { buffer, lunch } = scoreTeamForMove(moveEvent, team, events);
      options.push({ moveEvent, keepEvent, team, buffer, lunch });
    }
  }
  if (options.length === 0) return null;

  // Mayor buffer resultante gana. En empate, preferir mover el evento
  // agendado más recientemente — es solo un desempate, no una preselección.
  options.sort((x, y) => {
    if (y.buffer !== x.buffer) return y.buffer - x.buffer;
    const xCreated = x.moveEvent.createdIso ? new Date(x.moveEvent.createdIso).getTime() : 0;
    const yCreated = y.moveEvent.createdIso ? new Date(y.moveEvent.createdIso).getTime() : 0;
    return yCreated - xCreated;
  });

  const best = options[0];
  return {
    eventToMoveId: best.moveEvent.id,
    keepEventId: best.keepEvent.id,
    fromTeamId: currentTeam,
    toTeamId: best.team,
    resultingBufferMin: best.buffer,
    feasible: best.buffer >= BUFFER_MIN,
    bookedFirstEventId,
    movedLunchEventId: best.lunch?.id,
  };
}

// ── team_overlap: forzado (el admin elige cuál de los dos mover) ────────────
export function suggestTeamOverlapFixForced<T extends EventLike>(
  moveEventId: string,
  keepEventId: string,
  events: T[],
  teamOrder: string[]
): TeamOverlapSuggestion | null {
  const moveEvent = events.find(e => e.id === moveEventId);
  const keepEvent = events.find(e => e.id === keepEventId);
  if (!moveEvent || !keepEvent || !moveEvent.teamId || moveEvent.teamId !== keepEvent.teamId) return null;
  if (isLunchSummary(moveEvent.summary)) return null; // no se fuerza el movimiento de un Lunch suelto

  const currentTeam = moveEvent.teamId;
  const candidateTeams = teamOrder.filter(t => t !== currentTeam);
  if (candidateTeams.length === 0) return null;

  let best: { team: string; buffer: number; lunch: T | null } | null = null;
  for (const team of candidateTeams) {
    const { buffer, lunch } = scoreTeamForMove(moveEvent, team, events);
    if (!best || buffer > best.buffer) best = { team, buffer, lunch };
  }
  if (!best) return null;

  const moveCreated = moveEvent.createdIso ? new Date(moveEvent.createdIso).getTime() : 0;
  const keepCreated = keepEvent.createdIso ? new Date(keepEvent.createdIso).getTime() : 0;

  return {
    eventToMoveId: moveEvent.id,
    keepEventId: keepEvent.id,
    fromTeamId: currentTeam,
    toTeamId: best.team,
    resultingBufferMin: best.buffer,
    feasible: best.buffer >= BUFFER_MIN,
    bookedFirstEventId: moveCreated <= keepCreated ? moveEvent.id : keepEvent.id,
    movedLunchEventId: best.lunch?.id,
  };
}

// ── over_capacity ─────────────────────────────────────────────────────────
// Sweep-line: agrupa, para cada instante en que el set de eventos activos
// supera maxSimultaneousTeams, el set completo de eventos solapados en ese pico.
export function groupOverCapacityClusters<T extends EventLike>(
  events: T[],
  maxSimultaneousTeams: number
): T[][] {
  // Mismo criterio que findOverCapacity: solo consumen capacidad los eventos
  // con equipo asignado; los no-servicio (o sin equipo) nunca cuentan.
  const relevant = events.filter(e => e.teamId && !e.isAllDay && !e.isNonService);

  type Point = { time: number; order: number; kind: "start" | "end"; event: T };
  const points: Point[] = [];
  for (const e of relevant) {
    points.push({ time: new Date(e.startIso).getTime(), order: 0, kind: "start", event: e });
    points.push({ time: new Date(e.endIso).getTime(), order: -1, kind: "end", event: e });
  }
  // Procesar los "end" antes que los "start" en el mismo instante: un servicio
  // que termina justo cuando otro arranca no cuenta como solapado.
  points.sort((p1, p2) => p1.time - p2.time || p1.order - p2.order);

  const active = new Map<string, T>();
  const clusters: T[][] = [];
  const seen = new Set<string>();

  for (const p of points) {
    if (p.kind === "start") {
      active.set(p.event.id, p.event);
      if (active.size > maxSimultaneousTeams) {
        const group = Array.from(active.values());
        const key = group.map(e => e.id).sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          clusters.push(group);
        }
      }
    } else {
      active.delete(p.event.id);
    }
  }
  return clusters;
}

// El evento a mover del clúster: si hay un Lunch en el grupo, se prioriza
// SIEMPRE por sobre cualquier servicio real — reagendar 15min de almuerzo
// es mucho menos disruptivo para el cliente que reagendar su cita. Si no
// hay Lunch en el grupo, se elige el servicio creado más recientemente.
export function findNewestInGroup<T extends EventLike>(group: T[]): T {
  const lunches = group.filter(e => isLunchSummary(e.summary));
  const candidates = lunches.length > 0 ? lunches : group;
  return [...candidates].sort((x, y) => {
    const xC = x.createdIso ? new Date(x.createdIso).getTime() : 0;
    const yC = y.createdIso ? new Date(y.createdIso).getTime() : 0;
    return yC - xC;
  })[0];
}

// Para un cluster sobre-capacidad, sugiere mover un evento (por defecto, un
// Lunch si el grupo tiene alguno — ver findNewestInGroup) al primer hueco
// del mismo día (dentro del horario laboral) donde no vuelva a superar
// maxSimultaneousTeams. El admin puede forzar cuál evento del grupo mover
// con `forcedEventId` (incluido un Lunch específico) — útil cuando mover
// "el no sugerido" resuelve dos conflictos a la vez.
export function suggestOverCapacityFix<T extends EventLike>(
  group: T[],
  events: T[],
  maxSimultaneousTeams: number,
  forcedEventId?: string
): OverCapacitySuggestion {
  const forced = forcedEventId ? group.find(e => e.id === forcedEventId) : undefined;
  const moveEvent = forced ?? findNewestInGroup(group);
  const lunch = findPairedLunch(moveEvent, events);

  const fromStartIso = moveEvent.startIso;
  const fromEndIso = moveEvent.endIso;
  const serviceDurationMs = new Date(fromEndIso).getTime() - new Date(fromStartIso).getTime();
  const lunchDurationMs = lunch ? new Date(lunch.endIso).getTime() - new Date(lunch.startIso).getTime() : 0;
  const blockDurationMs = serviceDurationMs + lunchDurationMs; // lunch pegado justo antes del servicio

  const excludeIds = new Set([moveEvent.id, lunch?.id].filter((x): x is string => Boolean(x)));
  const sameDayOthers = events.filter(e => !excludeIds.has(e.id) && e.startDate === moveEvent.startDate && !e.isAllDay);

  const dayStart = new Date(zonedTimeToIso(moveEvent.startDate, BUSINESS_START_HOUR, 0)).getTime();
  const dayEnd = new Date(zonedTimeToIso(moveEvent.startDate, BUSINESS_END_HOUR, 0)).getTime();

  for (let blockStart = dayStart; blockStart + blockDurationMs <= dayEnd; blockStart += SLOT_STEP_MINUTES * 60000) {
    const serviceStart = blockStart + lunchDurationMs; // el servicio arranca después del lunch pegado
    const serviceEnd = serviceStart + serviceDurationMs;

    // Capacidad: solo la consumen los servicios (mismo criterio que findOverCapacity) —
    // los Lunch no cuentan doble, ya están representados por su propio servicio.
    const concurrent = sameDayOthers.filter(e => {
      if (isLunchSummary(e.summary)) return false;
      if (!e.teamId || e.isNonService) return false; // solo servicios con equipo asignado consumen capacidad
      const s = new Date(e.startIso).getTime();
      const en = new Date(e.endIso).getTime();
      return s < serviceEnd && en > serviceStart;
    }).length;
    if (concurrent + 1 > maxSimultaneousTeams) continue;

    // El bloque completo (lunch + servicio) no puede pisar nada del mismo equipo.
    const blockEnd = serviceEnd;
    const sameTeamClash = sameDayOthers.some(e =>
      e.teamId === moveEvent.teamId && overlapsRange(blockStart, blockEnd, new Date(e.startIso).getTime(), new Date(e.endIso).getTime())
    );
    if (sameTeamClash) continue;

    return {
      eventToMoveId: moveEvent.id,
      fromStartIso, fromEndIso,
      toStartIso: new Date(serviceStart).toISOString(),
      toEndIso: new Date(serviceEnd).toISOString(),
      feasible: true,
      movedLunchEventId: lunch?.id,
      toLunchStartIso: lunch ? new Date(blockStart).toISOString() : undefined,
      toLunchEndIso: lunch ? new Date(serviceStart).toISOString() : undefined,
    };
  }

  return { eventToMoveId: moveEvent.id, fromStartIso, fromEndIso, feasible: false, movedLunchEventId: lunch?.id };
}