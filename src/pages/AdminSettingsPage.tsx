import { useEffect, useState } from "react";
import { startOfWeek, addWeeks, subDays, format } from "date-fns";
import { RefreshCw, AlertCircle, History } from "lucide-react";
import RequireAdmin from "../components/admin/RequireAdmin";
import AdminNavbar from '../components/admin/AdminNavbar';
import HistoryDrawer from "../components/admin/HistoryDrawer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Settings {
  inactivity_risk_days: string;
  inactivity_inactive_days: string;
  exclude_adhoc_clients: string;
  team_default_size: string;
  service_buffer_minutes: string;
  max_simultaneous_teams: string;
  keep_stable_pair: string;
  work_start_hour: string;
  work_end_hour: string;
  confirmation_reminder_days_before: string;
  confirmation_pairing_grace_minutes: string;
  confirmation_release_hours_before: string;
  ops_alert_email: string;
  travel_time_buffer_minutes: string;
  distance_validation_enabled: string;
  confirmar_color_id: string;
  non_service_color_id: string;
  individual_color_id: string;
  booking_blackout_weeks: string;
}

// GCAL colorId → hex mapping para visualización de colores.
// Estos valores vienen del GET /colors de la API de Google Calendar (event colors).
// https://developers.google.com/calendar/api/v3/reference/colors/get
const GCAL_COLOR_HEX: Record<string, string> = {
  "1": "#a4bdfc",  // Lavender
  "2": "#7ae7bf",  // Sage
  "3": "#dbadff",  // Grape
  "4": "#ff887c",  // Flamingo
  "5": "#fbd75b",  // Banana
  "6": "#ffb878",  // Tangerine
  "7": "#46d6db",  // Peacock
  "8": "#e1e1e1",  // Graphite
  "9": "#5484ed",  // Indigo (azul)
  "10": "#51b749",  // Basil (verde)
  "11": "#dc2127",  // Tomato (rojo)
};

// Paleta fija de colorId de evento de Google Calendar — espejo de
// GCAL_COLOR_OPTIONS en services/colorAssignmentService.js (backend).
const GCAL_COLOR_OPTIONS = [
  { id: "1", name: "Lavender" },
  { id: "2", name: "Sage" },
  { id: "3", name: "Grape" },
  { id: "4", name: "Flamingo" },
  { id: "5", name: "Banana" },
  { id: "6", name: "Tangerine" },
  { id: "7", name: "Peacock" },
  { id: "8", name: "Graphite" },
  { id: "9", name: "Indigo" },
  { id: "10", name: "Basil" },
  { id: "11", name: "Tomato" },
];

const DEFAULTS: Settings = {
  inactivity_risk_days: "21",
  inactivity_inactive_days: "30",
  exclude_adhoc_clients: "false",
  team_default_size: "2",
  service_buffer_minutes: "30",
  max_simultaneous_teams: "2",
  keep_stable_pair: "false",
  work_start_hour: "7",
  work_end_hour: "19",
  confirmation_reminder_days_before: "2",
  confirmation_pairing_grace_minutes: "60",
  confirmation_release_hours_before: "24",
  ops_alert_email: "",
  travel_time_buffer_minutes: "10",
  distance_validation_enabled: "true",
  confirmar_color_id: "5",
  non_service_color_id: "4",
  individual_color_id: "9",
  booking_blackout_weeks: "0",
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => String(h));
const HOUR_LABELS = HOUR_OPTIONS.map((h) => `${h.padStart(2, "0")}:00`);

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("admin_blog_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Team colors ──────────────────────────────────────────────────────────────

interface Team {
  id: string;
  label: string;
  color: string;
  color_ids: string[];
  emojis: string[];
  is_active: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saved, setSaved] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Team colors state ────────────────────────────────────────────────────
  // `teams` = última verdad conocida del servidor (se recarga al montar y
  // después de cada guardado). `draftTeams` = lo que el admin está editando
  // en pantalla — cambio de color por fila, altas y reactivaciones viven acá
  // y NO pegan al backend hasta que se aprieta "Save settings" (ver
  // handleSave). Antes cada acción de equipo hacía su propio fetch al
  // tocarla, lo cual generaba confusión (quedaba persistido aunque después
  // se descartaran los demás cambios con "Discard changes").
  const [teams, setTeams] = useState<Team[]>([]);
  const [draftTeams, setDraftTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);

  const [newTeamLabel, setNewTeamLabel] = useState("");
  const [newTeamColorId, setNewTeamColorId] = useState("");
  const [teamDraftError, setTeamDraftError] = useState<string | null>(null);

  async function loadTeams(): Promise<Team[]> {
    setTeamsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/teams?includeInactive=true`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        const fresh: Team[] = data.teams ?? [];
        setTeams(fresh);
        setDraftTeams(fresh.map((t) => ({ ...t })));
        return fresh;
      }
      return teams;
    } catch {
      // best-effort — la sección de colores de equipo simplemente queda vacía
      return teams;
    } finally {
      setTeamsLoading(false);
    }
  }

  useEffect(() => { loadTeams(); }, []);

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          const merged = { ...DEFAULTS, ...data.settings };
          setSettings(merged);
          setSaved(merged);
        } else {
          setError(data.error ?? "Error loading settings");
        }
      })
      .catch(() => setError("Network error loading settings"))
      .finally(() => setLoading(false));
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const isDirty =
    JSON.stringify(settings) !== JSON.stringify(saved) ||
    JSON.stringify(draftTeams) !== JSON.stringify(teams);

  // Todo lo que sigue trabaja sobre `draftTeams` (lo que se ve en pantalla),
  // no sobre `teams` (lo persistido) — así el gap de capacidad, los colores
  // tomados, etc. reflejan lo que el admin está por guardar.
  const draftActiveTeams = draftTeams.filter((t) => t.is_active);
  const requestedCapacity = parseInt(settings.max_simultaneous_teams, 10) || 0;
  // Cuánto le falta a la cantidad de equipos activos (en el borrador) para
  // cubrir la capacidad pedida. > 0 bloquea el guardado — ver handleSave.
  const capacityGap = Math.max(0, requestedCapacity - draftActiveTeams.length);

  // Equipos inactivos (team_N) que ya existen en DB y todavía siguen
  // inactivos en el borrador — se ofrecen para reactivar en vez de crear
  // uno nuevo. Al reactivar uno (handleMarkReactivate) pasa a
  // draftActiveTeams y sale de esta lista.
  const reactivatableTeams = draftTeams
    .filter((t) => !t.is_active)
    .map((t) => ({ ...t, n: Number(/^team_(\d+)$/.exec(t.id)?.[1] ?? -1) }))
    .filter((t) => t.n > 0)
    .sort((a, b) => a.n - b.n)
    .slice(0, capacityGap);

  // Mismo criterio que createTeam en el backend (team_N = mayor sufijo
  // numérico existente + 1, contando también inactivos) — solo para
  // precargar el nombre sugerido; el id real lo sigue generando el backend
  // recién cuando se guarda.
  const nextTeamNumber = (() => {
    const used = draftTeams
      .map((t) => /^team_(\d+)$/.exec(t.id)?.[1])
      .filter(Boolean)
      .map(Number);
    return used.length ? Math.max(...used) + 1 : 1;
  })();

  useEffect(() => {
    if (!teamsLoading && !newTeamLabel) {
      setNewTeamLabel(`Team ${nextTeamNumber}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsLoading, nextTeamNumber]);

  // colorId → dueño ("Team 2", "CONFIRMAR", ...), para deshabilitar
  // opciones ya tomadas en cada select y no depender solo del error del
  // backend. `excludeOwnerKey` deja pasar el color actual del propio
  // select (si no, un select mostraría su propia selección como "tomada").
  function usedColorIds(excludeOwnerKey?: string): Map<string, string> {
    const used = new Map<string, string>();
    for (const t of draftActiveTeams) {
      const key = `team:${t.id}`;
      if (key === excludeOwnerKey) continue;
      for (const cid of t.color_ids) used.set(cid, t.label);
    }
    const specials: [string, string, string][] = [
      ["setting:confirmar_color_id", settings.confirmar_color_id, "CONFIRMAR"],
      ["setting:non_service_color_id", settings.non_service_color_id, "Non-service"],
      ["setting:individual_color_id", settings.individual_color_id, "Individual assignment"],
    ];
    for (const [key, val, label] of specials) {
      if (key === excludeOwnerKey) continue;
      if (val) used.set(val, label);
    }
    return used;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  // ── Team draft handlers ──────────────────────────────────────────────────
  // Ninguno de estos pega al backend — solo tocan `draftTeams`. La
  // persistencia real (color, altas, reactivaciones) ocurre toda junta
  // dentro de handleSave, en el mismo click de "Save settings".

  function updateDraftTeamColor(teamId: string, colorId: string) {
    const derivedColor = GCAL_COLOR_HEX[colorId] ?? "#6b7280";
    setDraftTeams((prev) =>
      prev.map((t) =>
        t.id === teamId ? { ...t, color_ids: [colorId], color: derivedColor } : t,
      ),
    );
    setError(null);
    setSuccessMsg(null);
  }

  function handleAddTeam() {
    setTeamDraftError(null);
    if (!newTeamLabel.trim()) {
      setTeamDraftError("Team name is required.");
      return;
    }
    if (!newTeamColorId) {
      setTeamDraftError("Pick a color for the new team.");
      return;
    }
    // Id temporal solo para identificarlo en el borrador — el id real
    // (team_N) lo asigna el backend recién al guardar.
    const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTeam: Team = {
      id: tempId,
      label: newTeamLabel.trim(),
      color: GCAL_COLOR_HEX[newTeamColorId] ?? "#6b7280",
      color_ids: [newTeamColorId],
      emojis: [],
      is_active: true,
    };
    setDraftTeams((prev) => [...prev, newTeam]);
    setNewTeamLabel("");
    setNewTeamColorId("");
    setError(null);
    setSuccessMsg(null);
  }

  function handleRemoveDraftTeam(teamId: string) {
    // Solo tiene sentido para equipos nuevos (todavía no existen en DB) —
    // un equipo reactivado se "des-reactiva" con handleUndoReactivate.
    setDraftTeams((prev) => prev.filter((t) => t.id !== teamId));
  }

  function handleMarkReactivate(team: Team) {
    setDraftTeams((prev) =>
      prev.map((t) => (t.id === team.id ? { ...t, is_active: true } : t)),
    );
  }

  function handleUndoReactivate(team: Team) {
    setDraftTeams((prev) =>
      prev.map((t) => (t.id === team.id ? { ...t, is_active: false } : t)),
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleChange(key: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccessMsg(null);
  }

  async function handleSave() {
    const risk = parseInt(settings.inactivity_risk_days, 10);
    const inactive = parseInt(settings.inactivity_inactive_days, 10);
    if (risk >= inactive) {
      setError(`"At risk" (${risk} days) must be less than "Inactive" (${inactive} days).`);
      return;
    }

    const startHour = parseInt(settings.work_start_hour, 10);
    const endHour = parseInt(settings.work_end_hour, 10);
    if (startHour >= endHour) {
      setError(`"Start hour" (${startHour}:00) must be earlier than "End hour" (${endHour}:00).`);
      return;
    }

    const releaseHours = parseFloat(settings.confirmation_release_hours_before);
    if (isNaN(releaseHours) || releaseHours <= 0) {
      setError(`"Auto-release" must be a positive number of hours, got: ${settings.confirmation_release_hours_before}`);
      return;
    }

    const reminderDays = parseInt(settings.confirmation_reminder_days_before, 10);
    if (isNaN(reminderDays) || reminderDays < 1) {
      setError(`"Confirmation reminder" must be a positive integer of days, got: ${settings.confirmation_reminder_days_before}`);
      return;
    }

    const graceMinutes = parseInt(settings.confirmation_pairing_grace_minutes, 10);
    if (isNaN(graceMinutes) || graceMinutes < 1) {
      setError(`"Pairing window" must be a positive integer of minutes, got: ${settings.confirmation_pairing_grace_minutes}`);
      return;
    }

    // LAB290: obligatorio en el backend — validamos también acá para no
    // hacer un round-trip inútil al servidor con un campo vacío
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.ops_alert_email)) {
      setError(`"Ops alert email" must be a valid email address.`);
      return;
    }

    if (capacityGap > 0) {
      setError(
        `"Max simultaneous teams" (${requestedCapacity}) exceeds the number of active teams (${draftActiveTeams.length}). Add or reactivate the missing team below before saving.`,
      );
      return;
    }

    const specialColorEntries: [string, string][] = [
      ["CONFIRMAR", settings.confirmar_color_id],
      ["Non-service", settings.non_service_color_id],
      ["Individual assignment", settings.individual_color_id],
    ];
    const seenColor = new Map<string, string>();
    for (const [label, colorId] of specialColorEntries) {
      if (seenColor.has(colorId)) {
        setError(`"${label}" and "${seenColor.get(colorId)}" can't use the same color.`);
        return;
      }
      seenColor.set(colorId, label);
    }
    for (const t of draftActiveTeams) {
      for (const cid of t.color_ids) {
        if (seenColor.has(cid)) {
          setError(`"${seenColor.get(cid)}" can't use the same color as team "${t.label}".`);
          return;
        }
      }
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // Persistimos primero todo lo relacionado a equipos — el PATCH de
      // settings más abajo valida "max_simultaneous_teams" contra los
      // equipos activos EN DB, así que tienen que existir/estar activos
      // antes de mandarlo.
      for (const draft of draftTeams) {
        const serverTeam = teams.find((t) => t.id === draft.id);

        if (!serverTeam) continue; // es un alta nueva, se crea en el paso siguiente

        const colorChanged = draft.color_ids[0] !== serverTeam.color_ids[0];
        const justReactivated = !serverTeam.is_active && draft.is_active;

        if (justReactivated) {
          const res = await fetch(`${API_BASE}/api/admin/teams/${draft.id}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
              is_active: true,
              ...(colorChanged ? { color_id: draft.color_ids[0], color: draft.color } : {}),
            }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error ?? `Error reactivating ${draft.id}`);
        } else if (serverTeam.is_active && colorChanged) {
          const res = await fetch(`${API_BASE}/api/admin/teams/${draft.id}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ color_id: draft.color_ids[0], color: draft.color }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error ?? `Error updating ${draft.id}`);
        }
      }

      for (const draft of draftTeams) {
        if (!draft.id.startsWith("new-")) continue; // solo las altas nuevas quedan sin match en `teams`
        const res = await fetch(`${API_BASE}/api/admin/teams`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            label: draft.label,
            color: draft.color,
            color_id: draft.color_ids[0],
            emoji: draft.emojis[0],
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? `Error creating team "${draft.label}"`);
      }

      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Error saving");
      setSaved({ ...settings });
      setSuccessMsg("Settings saved successfully.");
    } catch (e: any) {
      setError(e.message ?? "Error saving settings");
    } finally {
      setSaving(false);
      // Resincroniza `teams`/`draftTeams` con lo que realmente quedó
      // persistido — importante también si algo falló a mitad de camino,
      // para no arrastrar un borrador que no coincide más con la DB.
      await loadTeams();
    }
  }

  function handleReset() {
    setSettings({ ...saved });
    setDraftTeams(teams.map((t) => ({ ...t })));
    setTeamDraftError(null);
    setError(null);
    setSuccessMsg(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">

        {/*Navbar */}
        <AdminNavbar
          title="Settings"
          rightSlot={
            <>
              <button
                type="button"
                onClick={() => setShowHistory(true)}
                title="Settings change history"
                className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                <History size={15} />
              </button>
              {isDirty && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving}
                  className="px-3.5 py-2 text-xs font-semibold border border-white/30 rounded-lg text-white/80 hover:bg-white/10 disabled:opacity-50 transition-colors"
                >
                  Discard changes
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gold text-navy text-xs font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <><RefreshCw size={13} className="animate-spin" /> Saving…</>
                ) : (
                  'Save settings'
                )}
              </button>
            </>
          }
        />

        {/* Body */}
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-2xl space-y-5">

            {/* Alerts */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                <AlertCircle size={14} className="flex-shrink-0" /> {error}
              </div>
            )}
            {successMsg && (
              <div className="px-4 py-3 bg-emerald-50 text-emerald-700 text-sm rounded-xl border border-emerald-100">
                {successMsg}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-48 text-gray-300 text-sm">
                <RefreshCw size={18} className="animate-spin mr-2 text-gray-200" />
                Loading settings…
              </div>
            ) : (
              <>
                {/* ── Section: Client inactivity ──────────────────────────── */}
                <Section
                  title="Client Inactivity"
                  description="Define how many days without a service determine each client's status."
                >
                  <Field
                    label="Days until at risk"
                    hint="A client moves to 'At risk' if they have not had a service within this many days."
                  >
                    <NumberInput
                      value={settings.inactivity_risk_days}
                      min={1}
                      max={365}
                      onChange={(v) => handleChange("inactivity_risk_days", v)}
                    />
                  </Field>

                  <Field
                    label="Days until inactive"
                    hint="A client moves to 'Inactive' if they exceed this many days without a service."
                  >
                    <NumberInput
                      value={settings.inactivity_inactive_days}
                      min={1}
                      max={365}
                      onChange={(v) => handleChange("inactivity_inactive_days", v)}
                    />
                  </Field>

                  <ThresholdPreview
                    riskDays={parseInt(settings.inactivity_risk_days, 10) || 21}
                    inactiveDays={parseInt(settings.inactivity_inactive_days, 10) || 30}
                  />

                  <Field
                    label="Exclude ad-hoc clients"
                    hint="One-time services (post-construction, events, move-in/move-out) are not counted in the inactivity calculation."
                  >
                    <Toggle
                      checked={settings.exclude_adhoc_clients === "true"}
                      onChange={(v) =>
                        handleChange("exclude_adhoc_clients", v ? "true" : "false")
                      }
                    />
                  </Field>
                </Section>

                {/* ── Section: Team parameters ────────────────────────────── */}
                <Section
                  title="Team Parameters"
                  description="These values are used by the assignment modal to filter availability and suggest teams."
                >
                  <Field
                    label="Default team size"
                    hint="Number of cleaners per team when no specific configuration is set."
                  >
                    <SelectInput
                      value={settings.team_default_size}
                      options={["1", "2", "3"]}
                      labels={["1 person", "2 people", "3 people"]}
                      onChange={(v) => handleChange("team_default_size", v)}
                    />
                  </Field>

                  <Field
                    label="Buffer between services"
                    hint="Minimum free time between the end of one service and the start of the next."
                  >
                    <SelectInput
                      value={settings.service_buffer_minutes}
                      options={["15", "30", "45", "60"]}
                      labels={["15 min", "30 min", "45 min", "60 min"]}
                      onChange={(v) => handleChange("service_buffer_minutes", v)}
                    />
                  </Field>

                  <Field
                    label="Max simultaneous teams"
                    hint="How many teams can be operating at the same time."
                  >
                    <NumberInput
                      value={settings.max_simultaneous_teams}
                      min={1}
                      max={10}
                      onChange={(v) => handleChange("max_simultaneous_teams", v)}
                    />
                  </Field>

                  {capacityGap > 0 && (
                    <div className="mx-6 mb-4 px-4 py-3 bg-amber-50 text-amber-700 text-xs rounded-xl border border-amber-100">
                      Requesting capacity for {requestedCapacity} teams, but only {draftActiveTeams.length} active team
                      {draftActiveTeams.length === 1 ? "" : "s"} {draftActiveTeams.length === 1 ? "has" : "have"} a color assigned.
                      {reactivatableTeams.length > 0
                        ? " Reactivate or add the missing team"
                        : " Add the missing team"}{" "}
                      in the <strong>Event Colors</strong> section below — it's queued along with everything else
                      until you click <strong>Save settings</strong>.
                    </div>
                  )}

                  <Field
                    label="Keep stable pair during the day"
                    hint="When enabled, the assignment modal prioritises reusing the same team pairing across services on the same day."
                  >
                    <Toggle
                      checked={settings.keep_stable_pair === "true"}
                      onChange={(v) =>
                        handleChange("keep_stable_pair", v ? "true" : "false")
                      }
                    />
                  </Field>
                </Section>

                {/* ── Section: Event colors ───────────────────────────────── */}
                <Section
                  title="Event Colors"
                  description="Google Calendar colorId used to detect each team, plus the CONFIRMAR, non-service and individual-assignment special roles. No two roles can share the same color. Nothing here is saved until you click Save settings."
                >
                  {teamsLoading ? (
                    <div className="px-6 py-4 text-xs text-gray-400">Loading teams…</div>
                  ) : (
                    draftActiveTeams.map((team) => {
                      const serverTeam = teams.find((t) => t.id === team.id);
                      const isNew = team.id.startsWith("new-");
                      const isPendingReactivation = !isNew && serverTeam && !serverTeam.is_active;
                      return (
                        <Field
                          key={team.id}
                          label={team.label}
                          hint={
                            isNew
                              ? `New team — will be created when you save.`
                              : isPendingReactivation
                              ? `Previously used team (${team.id}) — will be reactivated when you save.`
                              : `GCal colorId currently used to detect ${team.label} events (${team.id}).`
                          }
                        >
                          <div className="flex items-center gap-2">
                            {(isNew || isPendingReactivation) && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                Pending
                              </span>
                            )}
                            <ColorIdSelect
                              value={team.color_ids[0] ?? ""}
                              onChange={(v) => updateDraftTeamColor(team.id, v)}
                              taken={usedColorIds(`team:${team.id}`)}
                            />
                            {isNew && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDraftTeam(team.id)}
                                className="text-xs text-red-500 hover:underline flex-shrink-0"
                              >
                                Remove
                              </button>
                            )}
                            {isPendingReactivation && (
                              <button
                                type="button"
                                onClick={() => handleUndoReactivate(team)}
                                className="text-xs text-gray-400 hover:underline flex-shrink-0"
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        </Field>
                      );
                    })
                  )}

                  <Field
                    label="CONFIRMAR"
                    hint="Events pending client confirmation before they're assigned to a team."
                  >
                    <ColorIdSelect
                      value={settings.confirmar_color_id}
                      onChange={(v) => handleChange("confirmar_color_id", v)}
                      taken={usedColorIds("setting:confirmar_color_id")}
                    />
                  </Field>

                  <Field
                    label="Non-service"
                    hint="Events that aren't a cleaning service (office, meeting, training, break…) — never block availability."
                  >
                    <ColorIdSelect
                      value={settings.non_service_color_id}
                      onChange={(v) => handleChange("non_service_color_id", v)}
                      taken={usedColorIds("setting:non_service_color_id")}
                    />
                  </Field>

                  <Field
                    label="Individual assignment"
                    hint="A single cleaner assigned directly, not resolved to a team."
                  >
                    <ColorIdSelect
                      value={settings.individual_color_id}
                      onChange={(v) => handleChange("individual_color_id", v)}
                      taken={usedColorIds("setting:individual_color_id")}
                    />
                  </Field>

                  {capacityGap > 0 && (
                    <div className="px-6 py-5 bg-amber-50/40">
                      <p className="text-sm font-medium text-[#031634] mb-1">
                        New team required ({capacityGap} missing)
                      </p>
                      <p className="text-xs text-gray-400 mb-3">
                        {reactivatableTeams.length > 0
                          ? "Max simultaneous teams was raised above the number of active teams. Reactivate an existing inactive team below, or add a new one — nothing is sent until you click Save settings."
                          : "Max simultaneous teams was raised above the number of active teams — add the missing team with its own color; it's queued until you click Save settings."}
                      </p>

                      {reactivatableTeams.length > 0 && (
                        <div className="flex flex-col gap-2 mb-4">
                          {reactivatableTeams.map((team) => (
                            <div
                              key={team.id}
                              className="flex items-center justify-between gap-3 px-3 py-2 bg-white rounded-xl border border-gray-100"
                            >
                              <div className="flex items-center gap-2">
                                {team.color_ids[0] && (
                                  <div
                                    className="w-5 h-5 rounded-full border-2 border-gray-200 flex-shrink-0"
                                    style={{ backgroundColor: GCAL_COLOR_HEX[team.color_ids[0]] }}
                                  />
                                )}
                                <span className="text-sm text-[#031634]">
                                  {team.label}{" "}
                                  <span className="text-gray-400">({team.id}, previously used)</span>
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleMarkReactivate(team)}
                                className="px-3 py-1.5 bg-[#031634] text-white text-xs font-semibold rounded-lg hover:bg-[#031634]/90 transition-colors"
                              >
                                Reactivate
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {teamDraftError && (
                        <div className="mb-3 px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
                          {teamDraftError}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={newTeamLabel}
                          onChange={(e) => setNewTeamLabel(e.target.value)}
                          placeholder="Team name (e.g. Team 4)"
                          className="w-44 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white"
                        />
                        <ColorIdSelect
                          value={newTeamColorId}
                          onChange={setNewTeamColorId}
                          taken={usedColorIds()}
                          placeholder="GCal color…"
                        />
                        <button
                          type="button"
                          onClick={handleAddTeam}
                          className="px-3.5 py-2 bg-[#031634] text-white text-xs font-semibold rounded-lg hover:bg-[#031634]/90 transition-colors"
                        >
                          {reactivatableTeams.length > 0 ? "Add new team" : "Add team"}
                        </button>
                      </div>
                    </div>
                  )}
                </Section>

                {/* ── Section: Confirmation window ────────────────────────── */}
                <Section
                  title="Confirmation Window"
                  description="Controls the automatic confirmation flow for pending ('CONFIRMAR') events."
                >
                  <Field
                    label="Days before to request confirmation"
                    hint="How many days before the appointment the client gets asked to confirm."
                  >
                    <NumberInput
                      value={settings.confirmation_reminder_days_before}
                      min={1}
                      max={30}
                      onChange={(v) => handleChange("confirmation_reminder_days_before", v)}
                    />
                  </Field>

                  <Field
                    label="Pairing window (minutes)"
                    hint="Two 'CONFIRMAR' events created within this window for the same client are offered together as one choice."
                  >
                    <NumberInput
                      value={settings.confirmation_pairing_grace_minutes}
                      min={1}
                      max={480}
                      onChange={(v) => handleChange("confirmation_pairing_grace_minutes", v)}
                    />
                  </Field>

                  <Field
                    label="Auto-release (hours before)"
                    hint="If the client hasn't confirmed by this many hours before the service, the slot is released automatically."
                  >
                    <NumberInput
                      value={settings.confirmation_release_hours_before}
                      min={1}
                      max={168}
                      onChange={(v) => handleChange("confirmation_release_hours_before", v)}
                    />
                  </Field>

                  <Field
                    label="Ops alert email"
                    hint="Where to send the internal alert when a slot is auto-released without client confirmation."
                  >
                    <EmailInput
                      value={settings.ops_alert_email}
                      onChange={(v) => handleChange("ops_alert_email", v)}
                    />
                  </Field>
                </Section>

                {/* ── Section: Distance & travel time ─────────────────────── */}
                <Section
                  title="Distance & Travel Time"
                  description="Controls how travel time between services is factored into staff availability."
                >
                  <Field
                    label="Enable distance-based validation"
                    hint="When on, availability uses real travel time between service addresses instead of the fixed buffer."
                  >
                    <Toggle
                      checked={settings.distance_validation_enabled === "true"}
                      onChange={(v) =>
                        handleChange("distance_validation_enabled", v ? "true" : "false")
                      }
                    />
                  </Field>

                  <Field
                    label="Travel time buffer (minutes)"
                    hint="Extra cushion added on top of the estimated travel time between two services."
                  >
                    <NumberInput
                      value={settings.travel_time_buffer_minutes}
                      min={0}
                      max={120}
                      onChange={(v) => handleChange("travel_time_buffer_minutes", v)}
                    />
                  </Field>
                </Section>

                {/* ── Section: Working hours ──────────────────────────────── */}
                <Section
                  title="Working Hours"
                  description="Defines the daily window used to calculate availability and generate bookable slots."
                >
                  <Field
                    label="Start hour"
                    hint="Cleaning teams are not available for booking before this hour."
                  >
                    <SelectInput
                      value={settings.work_start_hour}
                      options={HOUR_OPTIONS}
                      labels={HOUR_LABELS}
                      onChange={(v) => handleChange("work_start_hour", v)}
                    />
                  </Field>

                  <Field
                    label="End hour"
                    hint="Cleaning teams are not available for booking at or after this hour."
                  >
                    <SelectInput
                      value={settings.work_end_hour}
                      options={HOUR_OPTIONS}
                      labels={HOUR_LABELS}
                      onChange={(v) => handleChange("work_end_hour", v)}
                    />
                  </Field>

                  <WorkWindowPreview
                    startHour={parseInt(settings.work_start_hour, 10) || 7}
                    endHour={parseInt(settings.work_end_hour, 10) || 19}
                  />
                </Section>

                {/* ── Section: Public booking ─────────────────────────────── */}
                <Section
                  title="Public Booking"
                  description="Temporary controls for the client-facing quote and booking flow."
                >
                  <Field
                    label="Block near-term bookings (weeks)"
                    hint="Number of weeks — counting the current one — closed to online booking when there's no staff availability. 2 = this week and next week. Clients can't pick those dates, and the quote email asks them to reply with their preferred dates instead. Set back to 0 to lift the block."
                  >
                    <NumberInput
                      value={settings.booking_blackout_weeks}
                      min={0}
                      max={8}
                      onChange={(v) => handleChange("booking_blackout_weeks", v)}
                    />
                  </Field>

                  <BookingBlackoutPreview
                    weeks={parseInt(settings.booking_blackout_weeks, 10) || 0}
                  />
                </Section>
              </>
            )}
          </div>
        </div>
      </div>

      {showHistory && (
        <HistoryDrawer
          entityType="setting"
          title="Settings history"
          onClose={() => setShowHistory(false)}
        />
      )}
    </RequireAdmin>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
        <h2 className="text-sm font-semibold text-[#031634]">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-400">{description}</p>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 px-6 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#031634]">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{hint}</p>
      </div>
      <div className="flex-shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: number;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 text-center text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white"
    />
  );
}

function EmailInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="email"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="joaquin.labtinos@gmail.com"
      className="w-64 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white"
    />
  );
}

function SelectInput({
  value,
  options,
  labels,
  onChange,
}: {
  value: string;
  options: string[];
  labels: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white"
    >
      {options.map((opt, i) => (
        <option key={opt} value={opt}>
          {labels[i]}
        </option>
      ))}
    </select>
  );
}

// GCal colorId picker shared by team rows, the 3 special roles, and the
// "create team" mini-form. `taken` = colorId → owner label (from
// usedColorIds()), used to grey out options already claimed elsewhere.
// Muestra un círculo de color visual al lado del nombre de cada opción.
// Ordena: colores disponibles primero, luego colores usados.
function ColorIdSelect({
  value,
  onChange,
  taken,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  taken: Map<string, string>;
  placeholder?: string;
}) {
  const selectedColor = value ? GCAL_COLOR_HEX[value] : undefined;
  
  // Función helper para ordenar (reutiliza la del component)
  const sortColorOptions = (takenMap: Map<string, string>) => {
    const available = GCAL_COLOR_OPTIONS.filter((opt) => !takenMap.has(opt.id));
    const used = GCAL_COLOR_OPTIONS.filter((opt) => takenMap.has(opt.id));
    return { available, used };
  };

  const { available, used } = sortColorOptions(taken);

  return (
    <div className="flex items-center gap-2">
      {selectedColor && (
        <div
          className="w-6 h-6 rounded-full border-2 border-gray-200 flex-shrink-0"
          style={{ backgroundColor: selectedColor }}
          title={`${GCAL_COLOR_OPTIONS.find((o) => o.id === value)?.name || ""} (${value})`}
        />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all bg-white flex-1"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {available.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
        {used.length > 0 && (
          <>
            {available.length > 0 && (
              <option disabled style={{ display: "none" }}>
                ─────────────────
              </option>
            )}
            {used.map((opt) => (
              <option key={opt.id} value={opt.id} disabled>
                {opt.name} (used by {taken.get(opt.id)})
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:ring-offset-2 ${checked ? "bg-[#031634]" : "bg-gray-200"
        }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"
          }`}
      />
    </button>
  );
}

function WorkWindowPreview({
  startHour,
  endHour,
}: {
  startHour: number;
  endHour: number;
}) {
  const isValid = startHour < endHour;
  if (!isValid) return null;

  const startPct = (startHour / 24) * 100;
  const widthPct = ((endHour - startHour) / 24) * 100;
  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <div className="mx-6 mb-4 mt-1 p-3 bg-gray-50 rounded-xl border border-gray-100">
      <p className="text-xs text-gray-400 mb-2 font-medium">Daily window preview</p>
      <div className="relative h-4 rounded-full overflow-hidden bg-gray-100">
        <div
          className="absolute h-full bg-[#031634]"
          style={{ left: `${startPct}%`, width: `${widthPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1.5">
        <span>00:00</span>
        <span className="font-medium text-[#031634]">
          {fmt(startHour)} – {fmt(endHour)}
        </span>
        <span>24:00</span>
      </div>
    </div>
  );
}

function BookingBlackoutPreview({ weeks }: { weeks: number }) {
  if (!weeks || weeks < 1) {
    return (
      <div className="mx-6 mb-4 mt-1 p-3 bg-gray-50 rounded-xl border border-gray-100">
        <p className="text-xs text-gray-400">
          No block active — clients can book any available date.
        </p>
      </div>
    );
  }

  // Mirror of the backend (settingsService.getBookingBlackout): Monday of the
  // current ISO week + `weeks`. weekStartsOn: 1 = Monday, to match Luxon.
  const earliest = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weeks);
  const lastBlocked = subDays(earliest, 1);

  return (
    <div className="mx-6 mb-4 mt-1 p-3 bg-amber-50 rounded-xl border border-amber-100">
      <p className="text-xs text-amber-700">
        Online booking is closed through{" "}
        <strong>{format(lastBlocked, "EEEE, MMMM d")}</strong> — the first
        bookable day is <strong>{format(earliest, "EEEE, MMMM d")}</strong>. This
        window rolls forward with the calendar until you set it back to 0.
      </p>
    </div>
  );
}

function ThresholdPreview({
  riskDays,
  inactiveDays,
}: {
  riskDays: number;
  inactiveDays: number;
}) {
  const isValid = riskDays < inactiveDays && riskDays > 0;
  if (!isValid) return null;

  const displayMax = Math.max(inactiveDays + 10, 40);
  const riskPct = (riskDays / displayMax) * 100;
  const inactivePct = (inactiveDays / displayMax) * 100;

  return (
    <div className="mx-6 mb-4 mt-1 p-3 bg-gray-50 rounded-xl border border-gray-100">
      <p className="text-xs text-gray-400 mb-2 font-medium">Zone preview</p>
      <div className="relative h-4 rounded-full overflow-hidden flex">
        <div className="h-full bg-emerald-400" style={{ width: `${riskPct}%` }} />
        <div className="h-full bg-amber-400" style={{ width: `${inactivePct - riskPct}%` }} />
        <div className="h-full bg-red-400 flex-1" />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1.5">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          Active (0–{riskDays - 1}d)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          At risk ({riskDays}–{inactiveDays - 1}d)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
          Inactive ({inactiveDays}d+)
        </span>
      </div>
    </div>
  );
}