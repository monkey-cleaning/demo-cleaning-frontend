/**
 * TeamAutoAssignModal.tsx
 *
 * Preview editable de las formaciones sugeridas para una semana completa,
 * copiando la formación de referencia (última semana con datos, hasta 4
 * semanas atrás) filtrada por disponibilidad real de cada cleaner. Vacantes
 * y team-leader faltante se marcan para resolución manual — no se
 * auto-resuelven (ver services/teamAutoAssignService.js en el backend).
 *
 * Grilla: una fila por team, una columna por día de la semana.
 * Nada se persiste hasta tocar "Confirm all".
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, Plus, AlertTriangle } from "lucide-react";
import { apiFetchTeams, apiFetchEmployees, type Employee, type TeamConfig } from "./TeamHeader";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

function authHeaders(): Record<string, string> {
  const token =
    (typeof localStorage !== "undefined" ? localStorage.getItem("admin_blog_token") : null) ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Tipos del contrato de API ────────────────────────────────────────────────

interface SuggestionEvent { id: string; summary: string; startIso: string; endIso: string }
interface KeptEmployee { employee_id: string; name: string; is_team_leader: boolean }
interface Vacancy { previous_employee_id: string; previous_name: string; reason: string }

interface DayTeamSuggestion {
  date: string;
  team_id: string;
  source: "reference" | "fresh_build";
  referenceDate: string | null;
  events: SuggestionEvent[];
  kept: KeptEmployee[];
  vacancies: Vacancy[];
  needsManual: boolean;
  manualReasons: string[];
}

interface SuggestionsResponse {
  ok: boolean;
  weekStart: string;
  weekEnd: string;
  days: DayTeamSuggestion[];
}

const REASON_LABEL: Record<string, string> = {
  vacancy: "Some employees are no longer available — needs manual reassignment",
  missing_team_leader: "No team leader assigned",
  insufficient_coverage: "Not enough available staff",
};

// ── API helpers ───────────────────────────────────────────────────────────────

// In-flight de-dupe: evita disparar 2 requests idénticos si el efecto corre
// dos veces seguidas para el mismo weekStart (StrictMode dev, remounts, etc.)
const suggestionsInFlight = new Map<string, Promise<SuggestionsResponse>>();

async function apiFetchSuggestions(weekStart: string): Promise<SuggestionsResponse> {
  const existing = suggestionsInFlight.get(weekStart);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch(
      `${API_BASE}/api/admin/staff/team-assignments/auto-suggestions?weekStart=${weekStart}`,
      { headers: authHeaders() },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  })().finally(() => suggestionsInFlight.delete(weekStart));

  suggestionsInFlight.set(weekStart, promise);
  return promise;
}

/**
 * LAB-248: Fetchear empleados disponibles para un conjunto de eventos en una fecha.
 * Reusan la lógica de disponibilidad del backend (staff schedule + days_off + exceptions).
 */
async function apiFetchAvailableStaff(date: string, eventIds: string[]): Promise<Employee[]> {
  const eventIdParam = eventIds.join(',');
  const res = await fetch(
    `${API_BASE}/api/admin/staff/available?date=${date}&eventIds=${encodeURIComponent(eventIdParam)}`,
    { headers: authHeaders() },
  );
  const data = await res.json();
  if (!res.ok) {
    console.warn(`[apiFetchAvailableStaff] error:`, data.error ?? `HTTP ${res.status}`);
    return [];
  }
  return (data.availableEmployees ?? []) as Employee[];
}

async function apiApplyAssignments(
  assignments: { date: string; team_id: string; employee_ids: string[] }[],
): Promise<{ ok: boolean; results: { date: string; team_id: string; ok: boolean; error?: string }[] }> {
  const res = await fetch(`${API_BASE}/api/admin/staff/team-assignments/auto-apply`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ assignments }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// ── Helpers de fecha ──────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Estado editable de una celda (día × team) ─────────────────────────────────

type CellKey = string; // `${date}|${team_id}`
const cellKey = (date: string, teamId: string): CellKey => `${date}|${teamId}`;

// ── Chip ──────────────────────────────────────────────────────────────────────

function AssignedChip({
  employee, teamColor, onRemove,
}: { employee: KeptEmployee; teamColor: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
      style={{ background: `${teamColor}18`, borderColor: `${teamColor}55`, color: teamColor }}
    >
      {employee.is_team_leader && (
        <span className="text-amber-500 text-[9px] leading-none" title="Team leader">★</span>
      )}
      {employee.name}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full hover:opacity-70"
        title="Remove"
        aria-label={`Remove ${employee.name}`}
      >
        <X size={9} />
      </button>
    </span>
  );
}

function AddSelect({
  teamColor, options, onAdd, disabled,
}: { teamColor: string; options: Employee[]; onAdd: (emp: Employee) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const filtered = query.trim()
    ? options.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function handleOpen() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const panelWidth = 192; // w-48
      const left = Math.min(rect.left, window.innerWidth - panelWidth - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    setOpen(true);
    setQuery("");
  }

  if (!open) {
    return (
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-dashed hover:opacity-80"
        style={{ borderColor: `${teamColor}66`, color: teamColor }}
        title="Add cleaner"
        disabled={disabled}
      >
        <Plus size={9} /> Add
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
        <Plus size={9} /> Add
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[490]" onClick={() => { setOpen(false); setQuery(""); }} />
          <div
            className="fixed z-[500] bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-gray-100 w-48 overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee…"
                className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 outline-none focus:border-gray-400"
              />
            </div>
            <ul className="max-h-40 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-400 italic">No results</li>
              ) : (
                filtered.map((emp) => (
                  <li key={emp.id}>
                    <button
                      onClick={() => { onAdd(emp); setOpen(false); setQuery(""); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      {emp.is_team_leader && <span className="text-amber-500 text-[10px]">★</span>}
                      {emp.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div >
        </>,
        document.body,
      )
      }
    </>
  );
}

// ── Celda (día × team) ─────────────────────────────────────────────────────────

function DayTeamCell({
  suggestion, teamColor, kept, onAdd, onRemove, assignedElsewhereToday, allEmployees,
}: {
  suggestion: DayTeamSuggestion | null; // null = sin eventos ese día para ese team
  teamColor: string;
  kept: KeptEmployee[];
  onAdd: (emp: Employee) => void;
  onRemove: (employeeId: string) => void;
  assignedElsewhereToday: Set<string>;
  allEmployees: Employee[];
}) {
  const [availableEmployees, setAvailableEmployees] = useState<Employee[] | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  // LAB-248: Fetch de disponibilidad al renderizar (solo si hay eventos)
  useEffect(() => {
    if (!suggestion?.events?.length) {
      // Sin eventos ese día = sin restricción de horario, no "sin disponibles"
      setAvailableEmployees(null);
      setLoadingAvailability(false);
      return;
    }

    const eventIds = suggestion.events.map(e => e.id);
    setLoadingAvailability(true);
    setAvailabilityError(null);

    apiFetchAvailableStaff(suggestion.date, eventIds)
      .then(employees => {
        setAvailableEmployees(employees);
      })
      .catch(e => {
        console.error(`[DayTeamCell] availability fetch error:`, e);
        setAvailabilityError(`Availability check failed: ${e.message}`);
        setAvailableEmployees([]); // fallback conservador: error != null (no fingir "no hay restricción")
      })
      .finally(() => setLoadingAvailability(false));
  }, [suggestion?.date, suggestion?.events]);

  if (!suggestion) {
    return (
      <div className="h-full rounded-lg border border-dashed border-gray-200 p-2">
        <span className="text-[11px] text-gray-300 italic">No events</span>
      </div>
    );
  }

  const keptIds = new Set(kept.map((k) => k.employee_id));
  // LAB-248: Filtrar por "no asignados" + "disponibles"
  // null = todavía sin dato (sin eventos o cargando) → no restringir
  // []   = ya se consultó y no hay nadie disponible → vaciar opciones
  const notAssigned = allEmployees.filter((e) => !keptIds.has(e.id) && !assignedElsewhereToday.has(e.id));
  const options = availableEmployees === null
    ? notAssigned
    : availableEmployees.length > 0
      ? notAssigned.filter((e) => availableEmployees.some(a => a.id === e.id))
      : [];

  return (
    <div
      className="h-full rounded-lg p-2 space-y-1.5"
      style={{ borderLeft: `3px solid ${teamColor}`, background: `${teamColor}0d` }}
    >
      {suggestion.needsManual && (
        <div
          className="flex items-start gap-1 text-[10px] text-amber-700"
          title={suggestion.manualReasons.map((r) => REASON_LABEL[r] ?? r).join(" · ")}
        >
          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
          <span>{suggestion.manualReasons.map((r) => REASON_LABEL[r] ?? r).join(" · ")}</span>
        </div>
      )}

      {/* LAB-248: Indicadores de estado de disponibilidad */}
      {loadingAvailability && (
        <div className="text-[10px] text-gray-400 flex items-center gap-1">
          <Loader2 size={9} className="animate-spin" />
          <span>Checking availability…</span>
        </div>
      )}

      {availabilityError && (
        <div className="text-[10px] text-red-500 italic">{availabilityError}</div>
      )}

      {availableEmployees !== null && availableEmployees.length === 0 && !loadingAvailability && suggestion.events.length > 0 && (
        <div className="text-[10px] text-amber-600">
          ⚠️ No staff available for this time slot
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {kept.length === 0 && (
          <span className="text-[11px] text-gray-400 italic">No cleaners assigned</span>
        )}
        {kept.map((emp) => (
          <AssignedChip
            key={emp.employee_id}
            employee={emp}
            teamColor={teamColor}
            onRemove={() => onRemove(emp.employee_id)}
          />
        ))}
        <AddSelect
          teamColor={teamColor}
          options={options}
          onAdd={onAdd}
          disabled={loadingAvailability || (availableEmployees !== null && availableEmployees.length === 0)}
        />
      </div>
    </div>
  );
}

// ── Modal principal ────────────────────────────────────────────────────────────

interface TeamAutoAssignModalProps {
  /** Lunes de la semana visible en el calendario, "YYYY-MM-DD" */
  weekStart: string;
  onClose: () => void;
  /** Se llama tras confirmar con éxito, para refrescar TeamHeader / el calendario */
  onApplied: () => void;
}

export default function TeamAutoAssignModal({ weekStart, onClose, onApplied }: TeamAutoAssignModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamConfig[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [suggestionsByCell, setSuggestionsByCell] = useState<Map<CellKey, DayTeamSuggestion>>(new Map());
  const [editedByCell, setEditedByCell] = useState<Map<CellKey, KeptEmployee[]>>(new Map());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Días que se van a modificar en "Confirm all". Por defecto, toda la semana.
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([apiFetchTeams(), apiFetchEmployees(), apiFetchSuggestions(weekStart)])
      .then(([teamsRes, employeesRes, suggestionsRes]) => {
        if (cancelled) return;
        setTeams(teamsRes);
        setAllEmployees(employeesRes);

        const byCell = new Map<CellKey, DayTeamSuggestion>();
        const edited = new Map<CellKey, KeptEmployee[]>();
        for (const day of suggestionsRes.days) {
          const key = cellKey(day.date, day.team_id);
          byCell.set(key, day);
          edited.set(key, day.kept);
        }
        setSuggestionsByCell(byCell);
        setEditedByCell(edited);
        setSelectedDays(new Set(dates)); // reset: todos los días tildados por default
      })
      .catch((e: any) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [weekStart]);

  // Empleados ya asignados en OTRO team ese mismo día (para no duplicar cross-team).
  function assignedElsewhereToday(date: string, excludeTeamId: string): Set<string> {
    const set = new Set<string>();
    for (const team of teams) {
      if (team.id === excludeTeamId) continue;
      const list = editedByCell.get(cellKey(date, team.id)) ?? [];
      list.forEach((e) => set.add(e.employee_id));
    }
    return set;
  }

  function handleAdd(date: string, teamId: string, emp: Employee) {
    setEditedByCell((prev) => {
      const next = new Map(prev);
      const key = cellKey(date, teamId);
      const list = next.get(key) ?? [];
      next.set(key, [...list, { employee_id: emp.id, name: emp.name, is_team_leader: emp.is_team_leader }]);
      return next;
    });
  }

  function handleRemove(date: string, teamId: string, employeeId: string) {
    setEditedByCell((prev) => {
      const next = new Map(prev);
      const key = cellKey(date, teamId);
      const list = next.get(key) ?? [];
      next.set(key, list.filter((e) => e.employee_id !== employeeId));
      return next;
    });
  }

  function toggleDay(date: string) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function setAllDays(on: boolean) {
    setSelectedDays(on ? new Set(dates) : new Set());
  }

  async function handleConfirmAll() {
    setApplying(true);
    setApplyError(null);
    try {
      const assignments = Array.from(suggestionsByCell.entries())
        .filter(([, suggestion]) => selectedDays.has(suggestion.date))
        .map(([key, suggestion]) => ({
          date: suggestion.date,
          team_id: suggestion.team_id,
          employee_ids: (editedByCell.get(key) ?? []).map((e) => e.employee_id),
        }));
      const result = await apiApplyAssignments(assignments);
      const failed = result.results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setApplyError(`${failed.length} day/team combination(s) failed to save. Please retry.`);
        return;
      }
      onApplied();
      onClose();
    } catch (e: any) {
      setApplyError(e.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-[1600px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">
            Auto-assign teams — week of {dayLabel(weekStart)}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-gray-400 py-12">
              <Loader2 size={16} className="animate-spin" /> Loading suggestions…
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 italic py-8 text-center">Error: {error}</div>
          )}

          {!loading && !error && (
            <div className="space-y-3">
              <div className="flex justify-end gap-3 text-[11px] font-medium text-gray-400">
                <button onClick={() => setAllDays(true)} className="hover:text-gray-700">Select all days</button>
                <button onClick={() => setAllDays(false)} className="hover:text-gray-700">Clear</button>
              </div>

              {/* Grilla con scroll horizontal ÚNICO — header y todas las filas
                  comparten el mismo grid-template, así las columnas alinean. */}
              <div className="overflow-x-auto">
                <div className="min-w-full">
                  {/* Header de días (sticky para que quede visible al scrollear) */}
                  <div
                    className="grid gap-2 pb-2 mb-2 border-b border-gray-100 sticky top-0 bg-white z-10"
                    style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(160px, 1fr))` }}
                  >
                    {dates.map((date) => (
                      <label
                        key={date}
                        className="flex flex-col items-center gap-1 cursor-pointer select-none"
                      >
                        <span className="text-[10px] text-gray-500 font-medium">{dayLabel(date)}</span>
                        <input
                          type="checkbox"
                          checked={selectedDays.has(date)}
                          onChange={() => toggleDay(date)}
                          className="h-3.5 w-3.5 accent-gray-900"
                        />
                      </label>
                    ))}
                  </div>

                  {teams.map((team) => (
                    <div key={team.id} className="mb-3">
                      <div
                        className="text-xs font-semibold uppercase tracking-widest mb-1.5"
                        style={{ color: team.color }}
                      >
                        {team.emojis?.[0] ?? "⚫"} {team.label}
                      </div>
                      <div
                        className="grid gap-2 items-stretch"
                        style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(160px, 1fr))` }}
                      >
                        {dates.map((date) => {
                          const key = cellKey(date, team.id);
                          const suggestion = suggestionsByCell.get(key) ?? null;
                          const kept = editedByCell.get(key) ?? [];
                          const dayActive = selectedDays.has(date);
                          return (
                            <div
                              key={key}
                              className={`transition-opacity ${dayActive ? "" : "opacity-40 pointer-events-none"}`}
                            >
                              <DayTeamCell
                                suggestion={suggestion}
                                teamColor={team.color}
                                kept={kept}
                                onAdd={(emp) => handleAdd(date, team.id, emp)}
                                onRemove={(employeeId) => handleRemove(date, team.id, employeeId)}
                                assignedElsewhereToday={assignedElsewhereToday(date, team.id)}
                                allEmployees={allEmployees}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          {applyError && <span className="text-xs text-red-500">{applyError}</span>}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 mr-2"
            disabled={applying}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmAll}
            disabled={loading || !!error || applying || selectedDays.size === 0}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 px-4 py-1.5 rounded-lg"
          >
            {applying && <Loader2 size={12} className="animate-spin" />}
            Confirm all
          </button>
        </div>
      </div>
    </div>
  );
}