/**
 * TeamHeader.tsx
 *
 * S-CAL-1 — Visualización por Equipo 1 / Equipo 2
 *
 * Barra compacta encima del calendario.
 * La composición de cada equipo se gestiona contra la tabla
 * `daily_team_assignments` (no se deriva de los eventos de GCal).
 *
 * Flujo:
 *  1. Al montar (o al cambiar `date`) fetchea GET /team-assignments?date=…
 *  2. Muestra los empleados asignados a cada equipo con un chip + botón ✕.
 *  3. Un selector "Agregar" permite asignar un empleado activo al equipo.
 *  4. Cambios (add / remove) llaman a POST / DELETE y actualizan estado local.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, Users, Plus, X, AlertTriangle } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  email: string | null;
  is_team_leader: boolean;
}

interface Assignment {
  id: string;           // UUID de la fila daily_team_assignments
  team_id: string;
  employee_id: string;
  name: string;
  is_team_leader: boolean;
  gender: "male" | "female" | "other" | null;
}

// ── TEAMS_CONFIG ──────────────────────────────────────────────────────────────

interface TeamCfg {
  label: string;
  color: string;
  dotEmoji: string;
}

export interface TeamConfig {
  id: string;
  label: string;
  color: string;
  emojis: string[];
}

export async function apiFetchTeams(): Promise<TeamConfig[]> {
  const res = await fetch(`${API_BASE}/api/admin/teams`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.teams;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

function authHeaders(): Record<string, string> {
  const token =
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("admin_blog_token")
      : null) ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiFetchAssignments(date: string): Promise<Assignment[]> {
  const res = await fetch(
    `${API_BASE}/api/admin/staff/team-assignments?date=${date}`,
    { headers: authHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.assignments as Assignment[];
}

async function apiCreateAssignment(
  date: string,
  team_id: string,
  employee_id: string
): Promise<Assignment> {
  const res = await fetch(`${API_BASE}/api/admin/staff/team-assignments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ date, team_id, employee_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.assignment as Assignment;
}

async function apiDeleteAssignment(id: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/admin/staff/team-assignments/${id}`,
    { method: "DELETE", headers: authHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
}

export async function apiFetchEmployees(): Promise<Employee[]> {
  const res = await fetch(`${API_BASE}/api/admin/staff?active=true&limit=100`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.employees as Employee[];
}

// ── CleanerChip ───────────────────────────────────────────────────────────────

function CleanerChip({
  assignment,
  teamColor,
  onRemove,
  removing,
}: {
  assignment: Assignment;
  teamColor: string;
  onRemove: (id: string) => void;
  removing: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
      style={{
        background: `${teamColor}18`,
        borderColor: `${teamColor}55`,
        color: teamColor,
      }}
    >
      {assignment.is_team_leader && (
        <span className="text-amber-500 text-[9px] leading-none" title="Team leader">
          ★
        </span>
      )}
      {assignment.name}
      <button
        onClick={() => onRemove(assignment.id)}
        disabled={removing}
        className="ml-0.5 rounded-full hover:opacity-70 disabled:opacity-40 transition-opacity"
        title="Remove from team"
        aria-label={`Remove ${assignment.name}`}
      >
        {removing ? (
          <Loader2 size={9} className="animate-spin" />
        ) : (
          <X size={9} />
        )}
      </button>
    </span>
  );
}

// ── AddCleanerSelect ──────────────────────────────────────────────────────────

function AddCleanerSelect({
  teamColor,
  allEmployees,
  assignedEmployeeIds,   // ALL assigned today (both teams) to prevent cross-team
  onAdd,
}: {
  teamId: string;
  teamColor: string;
  allEmployees: Employee[];
  assignedEmployeeIds: Set<string>;
  onAdd: (employee: Employee) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Employees not yet assigned anywhere today
  const available = allEmployees.filter(
    (e) => !assignedEmployeeIds.has(e.id)
  );

  const filtered = query.trim()
    ? available.filter((e) =>
      e.name.toLowerCase().includes(query.trim().toLowerCase())
    )
    : available;

  function handleOpen() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const panelWidth = 208; // w-52
      const left = Math.min(rect.left, window.innerWidth - panelWidth - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelect(emp: Employee) {
    onAdd(emp);
    setOpen(false);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-dashed transition-colors hover:opacity-80"
        style={{ borderColor: `${teamColor}66`, color: teamColor }}
        title="Add cleaner to this team"
      >
        <Plus size={9} />
        Add
      </button>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-dashed"
        style={{ borderColor: `${teamColor}66`, color: teamColor }}
      >
        <Plus size={9} />
        Add
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => { setOpen(false); setQuery(""); }} />
          <div
            className="fixed z-[200] bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-gray-100 w-52 overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="p-2 border-b border-gray-100">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee…"
                className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 outline-none focus:border-gray-400"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-400 italic">
                  {available.length === 0
                    ? "All employees are already assigned"
                    : "No results"}
                </li>
              ) : (
                filtered.map((emp) => (
                  <li key={emp.id}>
                    <button
                      onClick={() => handleSelect(emp)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      {emp.is_team_leader && (
                        <span className="text-amber-500 text-[10px]">★</span>
                      )}
                      {emp.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

// ── TeamSlot ──────────────────────────────────────────────────────────────────

function TeamSlot({
  teamId,
  assignments,
  allEmployees,
  allAssignedIds,
  onAdd,
  onRemove,
  removingId,
  teamsConfig,
}: {
  teamId: string;
  date: string;
  assignments: Assignment[];
  allEmployees: Employee[];
  allAssignedIds: Set<string>;
  onAdd: (teamId: string, emp: Employee) => void;
  onRemove: (assignmentId: string) => void;
  removingId: string | null;
  teamsConfig: Record<string, TeamCfg>;
}) {
  const cfg = teamsConfig[teamId] ?? { label: teamId, color: "#6b7280", dotEmoji: "⚫" };
  const maleCount = assignments.filter((a) => a.gender === "male").length;
  const showMaleWarning = maleCount >= 2;

  return (
    <div
      className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0"
      style={{ borderLeft: `3px solid ${cfg.color}`, background: `${cfg.color}0d` }}
    >
      {/* Team label */}
      <span
        className="text-[11px] font-semibold whitespace-nowrap flex-shrink-0"
        style={{ color: cfg.color }}
      >
        {cfg.dotEmoji} {cfg.label}
      </span>

      {showMaleWarning && (
        <span
          className="flex-shrink-0 text-amber-500"
          title={`${maleCount} men on this team today — review composition`}
        >
          <AlertTriangle size={12} />
        </span>
      )}

      <div className="w-px h-3 bg-gray-200 flex-shrink-0" />

      {/* Chips — scrollable */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
        {assignments.length === 0 ? (
          <span className="text-[11px] text-gray-400 italic whitespace-nowrap">
            No cleaners assigned
          </span>
        ) : (
          assignments.map((a) => (
            <CleanerChip
              key={a.id}
              assignment={a}
              teamColor={cfg.color}
              onRemove={onRemove}
              removing={removingId === a.id}
            />
          ))
        )}
      </div>

      {/* Add button */}
      <div className="flex-shrink-0">
        <AddCleanerSelect
          teamId={teamId}
          teamColor={cfg.color}
          allEmployees={allEmployees}
          assignedEmployeeIds={allAssignedIds}
          onAdd={(emp) => onAdd(teamId, emp)}
        />
      </div>
    </div>
  );
}

// ── TeamHeader (main export) ──────────────────────────────────────────────────

interface TeamHeaderProps {
  /** ISO date "2025-08-15" — typically the selected day in the calendar */
  date: string;
  /** Bump this to force a refetch without changing `date` (e.g. after bulk auto-assign) */
  refreshKey?: number;
}

export default function TeamHeader({ date, refreshKey }: TeamHeaderProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teamsConfig, setTeamsConfig] = useState<Record<string, TeamCfg>>({});
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingTeam, setAddingTeam] = useState<string | null>(null);

  // ── Load employees once on mount ─────────────────────────────────────────

  useEffect(() => {
    Promise.all([apiFetchEmployees(), apiFetchTeams()])
      .then(([emps, teams]) => {
        setEmployees(emps);
        const cfg: Record<string, TeamCfg> = {};
        const order: string[] = [];
        for (const t of teams) {
          cfg[t.id] = { label: t.label, color: t.color, dotEmoji: t.emojis?.[0] ?? "⚫" };
          order.push(t.id);
        }
        setTeamsConfig(cfg);
        setTeamOrder(order);
      })
      .catch((e: any) => setError(e.message));
  }, []);

  // ── Load assignments for this date ────────────────────────────────────────

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await apiFetchAssignments(date);
      setAssignments(fetched);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadAssignments(); }, [loadAssignments, refreshKey]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAdd(teamId: string, emp: Employee) {
    setAddingTeam(teamId);
    try {
      const created = await apiCreateAssignment(date, teamId, emp.id);
      setAssignments((prev) => [...prev, created]);
    } catch (e: any) {
      alert(`No se pudo agregar: ${e.message}`);
    } finally {
      setAddingTeam(null);
    }
  }

  async function handleRemove(assignmentId: string) {
    setRemovingId(assignmentId);
    try {
      await apiDeleteAssignment(assignmentId);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch (e: any) {
      alert(`No se pudo quitar: ${e.message}`);
    } finally {
      setRemovingId(null);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const byTeam = Object.fromEntries(
    teamOrder.map((tid) => [tid, assignments.filter((a) => a.team_id === tid)])
  );

  // All employee IDs assigned today (used to prevent adding to both teams)
  const allAssignedIds = new Set(assignments.map((a) => a.employee_id));

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-shrink-0 border-b border-gray-100 bg-white px-3 py-1.5 flex items-center gap-2">
      {/* Label */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Users size={12} className="text-gray-400" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest hidden sm:block">
          Teams
        </span>
        <span className="text-[10px] text-gray-400">{dateLabel}</span>
      </div>

      <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

      {/* Error */}
      {error && (
        <span className="text-[11px] text-red-500 italic truncate">
          Error: {error}
        </span>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <Loader2 size={13} className="animate-spin text-gray-400" />
      )}

      {/* Team slots */}
      {!loading && !error && (
        <div className="flex gap-2 flex-1 min-w-0">
          {teamOrder.map((tid) => (
            <TeamSlot
              key={tid}
              teamId={tid}
              date={date}
              teamsConfig={teamsConfig}
              assignments={byTeam[tid]}
              allEmployees={employees}
              allAssignedIds={allAssignedIds}
              onAdd={handleAdd}
              onRemove={handleRemove}
              removingId={removingId}
            />
          ))}
        </div>
      )}

      {/* Saving indicator (adding) */}
      {addingTeam && (
        <Loader2 size={13} className="animate-spin text-gray-400 flex-shrink-0" />
      )}
    </div>
  );
}

// ── useEmployees (kept for external use) ──────────────────────────────────────

export function useEmployees(): { employees: Employee[]; loading: boolean } {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetchEmployees()
      .then(setEmployees)
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  return { employees, loading };
}