// LAB617 — patrones de recurrencia del evento (lado frontend).
//
// Espejo de landing-monkey-backend/src/services/recurrenceRule.js: el backend
// es el que manda (valida y arma el RRULE); acá solo se calculan las fechas
// candidatas para el pre-check de conflictos / la vista previa del modal, y se
// avisa ANTES de guardar si la fecha de inicio no calza con el patrón. Si
// cambia la lógica de uno, cambiarla en el otro.
//
// Presets del selector "Repeats":
//   Weekly                   → cada 1 semana
//   Every 2 weeks            → cada 2 semanas
//   Monthly (every 4 weeks)  → cada 4 semanas, MISMO DÍA DE LA SEMANA
//                              (no "mismo número de día del mes")
//   Custom…                  → modal: cada N semanas en uno o varios días, o
//                              cada N meses el mismo número de día / el
//                              "primer lunes", "último viernes", etc.
import { DateTime } from "luxon";
import { TZ } from './timezone';



export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export const WEEKDAYS: { code: Weekday; short: string; long: string }[] = [
  { code: "MO", short: "Mon", long: "Monday" },
  { code: "TU", short: "Tue", long: "Tuesday" },
  { code: "WE", short: "Wed", long: "Wednesday" },
  { code: "TH", short: "Thu", long: "Thursday" },
  { code: "FR", short: "Fri", long: "Friday" },
  { code: "SA", short: "Sat", long: "Saturday" },
  { code: "SU", short: "Sun", long: "Sunday" },
];
const longName = (c: Weekday) => WEEKDAYS.find(w => w.code === c)!.long;
const shortName = (c: Weekday) => WEEKDAYS.find(w => w.code === c)!.short;

export type Nth = 1 | 2 | 3 | 4 | -1;
export const NTH_OPTIONS: { value: Nth; label: string }[] = [
  { value: 1, label: "first" },
  { value: 2, label: "second" },
  { value: 3, label: "third" },
  { value: 4, label: "fourth" },
  { value: -1, label: "last" },
];
const nthLabel = (n: Nth) => NTH_OPTIONS.find(o => o.value === n)!.label;

export type MonthlyOption =
  | { type: "dayOfMonth" }
  | { type: "nthWeekday"; nth: Nth; weekday: Weekday };

/** Estado del selector "Repeats". "UNSUPPORTED" = regla que el panel no sabe editar. */
export type RepeatMode = "" | "WEEKLY" | "BIWEEKLY" | "EVERY_4_WEEKS" | "CUSTOM" | "UNSUPPORTED";

export interface CustomPattern {
  unit: "WEEKLY" | "MONTHLY";
  interval: number;
  /** solo unit="WEEKLY" */
  byDay: Weekday[];
  /** solo unit="MONTHLY" */
  monthly: MonthlyOption;
}

/** Lo que viaja al backend (sin el fin de la serie, que se agrega aparte). */
export interface RecurrencePattern {
  freq: "WEEKLY" | "MONTHLY";
  interval: number;
  byDay?: Weekday[];
  monthly?: MonthlyOption;
}

// ── helpers de fecha (día de pared "yyyy-mm-dd", sin zona horaria) ───────────
const d = (iso: string) => DateTime.fromISO(iso.slice(0, 10), { zone: "utc" });
const weekdayOf = (iso: string): Weekday => WEEKDAYS[d(iso).weekday - 1].code;
/** Qué número de lunes/martes/… del mes es esta fecha (1..5) y si es el último. */
function nthOf(iso: string): { nth: number; isLast: boolean } {
  const x = d(iso);
  return { nth: Math.ceil(x.day / 7), isLast: x.day + 7 > x.daysInMonth! };
}
const fmtDate = (iso: string) => d(iso).setLocale("en").toFormat("cccc, LLL d");

// ── modo → patrón ────────────────────────────────────────────────────────────
export function patternFromMode(mode: RepeatMode, custom: CustomPattern | null): RecurrencePattern | null {
  switch (mode) {
    case "WEEKLY": return { freq: "WEEKLY", interval: 1 };
    case "BIWEEKLY": return { freq: "WEEKLY", interval: 2 };
    case "EVERY_4_WEEKS": return { freq: "WEEKLY", interval: 4 };
    case "CUSTOM":
      if (!custom) return null;
      return custom.unit === "WEEKLY"
        ? { freq: "WEEKLY", interval: custom.interval, byDay: custom.byDay }
        : { freq: "MONTHLY", interval: custom.interval, monthly: custom.monthly };
    default: return null;
  }
}

/** "El primer miércoles" / "el último viernes" según la fecha de inicio (sugerencia del modal). */
export function startNthWeekday(startDate: string): Extract<MonthlyOption, { type: "nthWeekday" }> {
  const { nth, isLast } = nthOf(startDate);
  return { type: "nthWeekday", nth: (isLast && nth >= 4 ? -1 : Math.min(nth, 4)) as Nth, weekday: weekdayOf(startDate) };
}

/** Punto de partida del modal: cada semana, el día de la fecha de inicio. */
export function defaultCustomPattern(startDate: string): CustomPattern {
  return {
    unit: "WEEKLY",
    interval: 1,
    byDay: [weekdayOf(startDate)],
    monthly: { type: "dayOfMonth" }, // como Google; "primer lunes" es opt-in
  };
}

/** Respuesta de GET /series/:id/recurrence → estado del selector. */
export interface SeriesRecurrenceInfo {
  freq: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | string;
  endType: "never" | "count" | "until";
  count: number | null;
  until: string | null;
  // LAB617 (backends anteriores no los mandan)
  preset?: "WEEKLY" | "BIWEEKLY" | "EVERY_4_WEEKS" | "CUSTOM";
  supported?: boolean;
  interval?: number;
  byDay?: Weekday[] | null;
  monthly?: MonthlyOption | null;
  raw?: string;
}

export function modeFromSeries(info: SeriesRecurrenceInfo, startDate: string): { mode: RepeatMode; custom: CustomPattern | null } {
  if (info.supported === false) return { mode: "UNSUPPORTED", custom: null };
  if (info.preset && info.preset !== "CUSTOM") return { mode: info.preset, custom: null };
  if (!info.preset) {
    // backend anterior: solo conoce weekly / biweekly / monthly por número de día
    if (info.freq === "WEEKLY") return { mode: "WEEKLY", custom: null };
    if (info.freq === "BIWEEKLY") return { mode: "BIWEEKLY", custom: null };
  }
  const base = defaultCustomPattern(startDate);
  const isWeekly = (info.freq === "WEEKLY" || info.freq === "BIWEEKLY");
  return {
    mode: "CUSTOM",
    custom: {
      ...base,
      unit: isWeekly ? "WEEKLY" : "MONTHLY",
      interval: info.interval ?? 1,
      byDay: info.byDay?.length ? info.byDay : base.byDay,
      monthly: info.monthly ?? { type: "dayOfMonth" },
    },
  };
}

// ── texto ────────────────────────────────────────────────────────────────────
export function describePattern(p: RecurrencePattern): string {
  if (p.freq === "WEEKLY") {
    const every = p.interval === 1 ? "Every week" : `Every ${p.interval} weeks`;
    return p.byDay?.length ? `${every} on ${p.byDay.map(shortName).join(", ")}` : every;
  }
  const every = p.interval === 1 ? "Every month" : `Every ${p.interval} months`;
  const m = p.monthly ?? { type: "dayOfMonth" as const };
  return m.type === "nthWeekday"
    ? `${every} on the ${nthLabel(m.nth)} ${longName(m.weekday)}`
    : `${every} on the same day number`;
}

export function modeLabel(mode: RepeatMode): string {
  switch (mode) {
    case "WEEKLY": return "Weekly";
    case "BIWEEKLY": return "Every 2 weeks";
    case "EVERY_4_WEEKS": return "Monthly (every 4 weeks)";
    case "CUSTOM": return "Custom…";
    case "UNSUPPORTED": return "Custom pattern (set in Google Calendar)";
    default: return "Does not repeat";
  }
}

// ── ¿la fecha de inicio calza con el patrón? (mismos mensajes que el backend) ─
export function fitError(p: RecurrencePattern, startDate: string): string | null {
  if (!d(startDate).isValid) return null;
  const wd = weekdayOf(startDate);
  if (p.freq === "WEEKLY" && p.byDay?.length && !p.byDay.includes(wd)) {
    return `The start date (${fmtDate(startDate)}) isn't one of the selected days (${p.byDay.map(longName).join(", ")}).`;
  }
  if (p.freq === "MONTHLY" && p.monthly?.type === "nthWeekday") {
    const { nth, weekday } = p.monthly;
    const x = nthOf(startDate);
    const ok = wd === weekday && (nth === -1 ? x.isLast : nth === x.nth);
    if (!ok) return `The start date (${fmtDate(startDate)}) isn't the ${nthLabel(nth)} ${longName(weekday)} of its month.`;
  }
  return null;
}

/** Primera fecha >= startDate que calza con el patrón (la del botón "Move start"). */
export function firstMatchingDate(p: RecurrencePattern, startDate: string): string {
  return occurrenceDates(p, startDate, { max: 1 })[0] ?? startDate.slice(0, 10);
}

// ── fechas de las ocurrencias ────────────────────────────────────────────────
interface OccurrenceOpts {
  count?: number | null;
  /** "yyyy-mm-dd" inclusive */
  untilDate?: string | null;
  /** tope de seguridad */
  max?: number;
}

const MAX_OCCURRENCES = 520;

export function occurrenceDates(p: RecurrencePattern, startDate: string, opts: OccurrenceOpts = {}): string[] {
  const start = d(startDate);
  if (!start.isValid) return [];
  const startIso = start.toISODate()!;
  // Sin fin explícito la serie se corta al año desde el inicio, o desde hoy si el
  // inicio es anterior (igual que el backend); con N
  // ocurrencias el backend usa COUNT sin tope de fecha, así que acá tampoco.
  const cap = opts.untilDate
    ? opts.untilDate.slice(0, 10)
    : opts.count
      ? "9999-12-31"
      : (start > DateTime.now().setZone(TZ) ? start : DateTime.now().setZone(TZ)).plus({ years: 1 }).toISODate()!;
  const maxCount = Math.min(opts.count ?? Infinity, opts.max ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const out: string[] = [];
  const push = (iso: string): boolean => {
    if (iso < startIso) return true; // antes del inicio: se ignora, sigue
    if (iso > cap) return false;
    out.push(iso);
    return out.length < maxCount;
  };

  if (p.freq === "WEEKLY") {
    const days = (p.byDay?.length ? p.byDay : [weekdayOf(startIso)])
      .map(c => WEEKDAYS.findIndex(w => w.code === c))
      .sort((a, b) => a - b);
    const week0 = start.minus({ days: start.weekday - 1 }); // lunes de la semana del inicio
    for (let k = 0; k < MAX_OCCURRENCES * 2; k++) {
      const weekStart = week0.plus({ weeks: k * p.interval });
      if (weekStart.toISODate()! > cap) break;
      for (const i of days) {
        if (!push(weekStart.plus({ days: i }).toISODate()!)) return out;
      }
    }
    return out;
  }

  // MONTHLY
  const m = p.monthly ?? { type: "dayOfMonth" as const };
  for (let k = 0; k < MAX_OCCURRENCES * 2; k++) {
    const month = start.startOf("month").plus({ months: k * p.interval });
    if (month.toISODate()! > cap) break;
    let day: DateTime | null = null;
    if (m.type === "dayOfMonth") {
      // RFC 5545 saltea los meses donde ese día no existe (p. ej. día 31)
      day = start.day <= month.daysInMonth! ? month.set({ day: start.day }) : null;
    } else {
      const target = WEEKDAYS.findIndex(w => w.code === m.weekday) + 1;
      if (m.nth === -1) {
        const last = month.endOf("month").startOf("day");
        day = last.minus({ days: (last.weekday - target + 7) % 7 });
      } else {
        const first = month.plus({ days: (target - month.weekday + 7) % 7 });
        const cand = first.plus({ weeks: m.nth - 1 });
        day = cand.month === month.month ? cand : null;
      }
    }
    if (day && !push(day.toISODate()!)) return out;
  }
  return out;
}
