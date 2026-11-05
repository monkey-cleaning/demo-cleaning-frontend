// LAB617 — modal "Custom recurrence" del evento del calendario.
//
// Cubre lo que el selector "Repeats" no tiene como preset:
//   · cada N semanas, en uno o varios días de la semana
//   · cada N meses, el mismo número de día
//   · cada N meses, "el primer lunes", "el último viernes", etc.
// El fin de la serie (never / N ocurrencias / fecha) se sigue eligiendo en el
// formulario del evento, no acá.
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { DateTime } from "luxon";
import {
  NTH_OPTIONS,
  WEEKDAYS,
  describePattern,
  firstMatchingDate,
  fitError,
  occurrenceDates,
  patternFromMode,
  startNthWeekday,
  type CustomPattern,
  type MonthlyOption,
  type Nth,
  type Weekday,
} from "../../lib/recurrence";

const fieldCls =
  "text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-blue-500";

const MAX_INTERVAL = { WEEKLY: 52, MONTHLY: 24 } as const;

export default function RecurrenceCustomModal({
  initial,
  startDate,
  onSave,
  onCancel,
  onMoveStart,
}: {
  initial: CustomPattern;
  /** Fecha de inicio del evento, "yyyy-mm-dd". */
  startDate: string;
  onSave: (p: CustomPattern) => void;
  onCancel: () => void;
  /** Mueve el Start del evento a otra fecha (mismo horario). */
  onMoveStart?: (date: string) => void;
}) {
  const [unit, setUnit] = useState<CustomPattern["unit"]>(initial.unit);
  const [intervalText, setIntervalText] = useState(String(initial.interval));
  const [byDay, setByDay] = useState<Weekday[]>(initial.byDay);
  const [monthly, setMonthly] = useState<MonthlyOption>(initial.monthly);
  // Última elección de "el [primer] [lunes]": se recuerda al alternar con "mismo número de día".
  const [nthDraft, setNthDraft] = useState<Extract<MonthlyOption, { type: "nthWeekday" }>>(
    initial.monthly.type === "nthWeekday" ? initial.monthly : startNthWeekday(startDate),
  );

  const max = MAX_INTERVAL[unit];
  const interval = Number(intervalText);
  const intervalOk = Number.isInteger(interval) && interval >= 1 && interval <= max;

  const draft: CustomPattern = { unit, interval: intervalOk ? interval : 1, byDay, monthly };
  const pattern = patternFromMode("CUSTOM", draft)!;

  const misfit = fitError(pattern, startDate);
  const nextDates = useMemo(() => occurrenceDates(pattern, startDate, { max: 4 }), [pattern, startDate]);
  const fixDate = misfit ? firstMatchingDate(pattern, startDate) : null;

  function toggleDay(code: Weekday) {
    setByDay(prev => {
      if (prev.includes(code)) return prev.length === 1 ? prev : prev.filter(c => c !== code); // al menos uno
      return [...prev, code];
    });
  }

  const nthMonthly = monthly.type === "nthWeekday" ? monthly : null;
  const updateNth = (patch: Partial<typeof nthDraft>) => {
    const next = { ...nthDraft, ...patch };
    setNthDraft(next);
    setMonthly(next);
  };
  const fmtShort = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setLocale("en").toFormat("ccc, LLL d");

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/30 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-800">Custom recurrence</h3>
          <button onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Repeat every N weeks / months */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600">Repeat every</span>
          <input
            type="number" min={1} max={max} inputMode="numeric"
            value={intervalText}
            onChange={e => setIntervalText(e.target.value)}
            className={`${fieldCls} w-16 text-center ${intervalOk ? "" : "border-red-300"}`}
            aria-label="Repeat every"
          />
          <select value={unit} onChange={e => setUnit(e.target.value as CustomPattern["unit"])} className={fieldCls} aria-label="Unit">
            <option value="WEEKLY">{interval === 1 ? "week" : "weeks"}</option>
            <option value="MONTHLY">{interval === 1 ? "month" : "months"}</option>
          </select>
        </div>
        {!intervalOk && (
          <p className="text-[11px] text-red-500 -mt-2">Enter a whole number between 1 and {max}.</p>
        )}

        {/* Weekly: which days */}
        {unit === "WEEKLY" && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-400">Repeat on</p>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAYS.map(w => {
                const on = byDay.includes(w.code);
                return (
                  <button
                    key={w.code} type="button" onClick={() => toggleDay(w.code)}
                    aria-pressed={on} title={w.long}
                    className={`w-10 h-10 rounded-full text-xs font-medium border transition-colors ${
                      on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {w.short}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Monthly: same day number, or "first Monday" */}
        {unit === "MONTHLY" && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400">Repeat on</p>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio" name="monthly-mode" checked={monthly.type === "dayOfMonth"}
                onChange={() => setMonthly({ type: "dayOfMonth" })}
              />
              The same day number each month
              <span className="text-gray-400">(day {DateTime.fromISO(startDate, { zone: "utc" }).day})</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer flex-wrap">
              <input
                type="radio" name="monthly-mode" checked={monthly.type === "nthWeekday"}
                onChange={() => setMonthly(nthDraft)}
              />
              The
              <select
                value={nthDraft.nth}
                disabled={!nthMonthly}
                onChange={e => updateNth({ nth: Number(e.target.value) as Nth })}
                className={fieldCls} aria-label="Position in the month"
              >
                {NTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select
                value={nthDraft.weekday}
                disabled={!nthMonthly}
                onChange={e => updateNth({ weekday: e.target.value as Weekday })}
                className={fieldCls} aria-label="Day of the week"
              >
                {WEEKDAYS.map(w => <option key={w.code} value={w.code}>{w.long}</option>)}
              </select>
              of the month
            </label>
          </div>
        )}

        {/* Summary + preview */}
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1">
          <p className="text-sm font-medium text-gray-700">{intervalOk ? describePattern(pattern) : "—"}</p>
          {intervalOk && nextDates.length > 0 && (
            <p className="text-xs text-gray-500">
              Next dates: {nextDates.map(fmtShort).join(" · ")}
            </p>
          )}
        </div>

        {misfit && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1.5">
            <p className="text-xs text-amber-700">{misfit} The event can't start on a date outside the pattern.</p>
            {onMoveStart && fixDate && (
              <button
                type="button" onClick={() => onMoveStart(fixDate)}
                className="text-xs font-medium text-amber-800 underline hover:text-amber-900"
              >
                Move the start to {fmtShort(fixDate)}
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-full border border-gray-200">
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)} disabled={!intervalOk}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-full"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
