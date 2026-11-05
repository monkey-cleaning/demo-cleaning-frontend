import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Google-Calendar-style time options, 15-minute increments ("9:00 AM").
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h24 = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const pad = (n: number) => String(n).padStart(2, "0");
  const value = `${pad(h24)}:${pad(m)}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return { value, label: `${h12}:${pad(m)} ${ampm}` };
});

export function formatTimeLabel(value24: string) {
  if (!value24) return "";
  const [h, m] = value24.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Acepta "9", "930", "9:30", "9:30am", "9:30 PM", "21:30", etc.
// Sin AM/PM asume 24h. Devuelve "HH:MM" (24h) o null si no matchea nada.
function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap]\.?m?\.?)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (min > 59) return null;
  const ampm = m[3] ? m[3][0] : null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = ampm === "a" ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
  } else if (h > 23) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(min)}`;
}

export const TimeSelect = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; min?: string }>(
  ({ value, onChange, className, placeholder, min }, ref) => {
    const [text, setText] = useState(() => formatTimeLabel(value));
    const [invalid, setInvalid] = useState(false);
    const [open, setOpen] = useState(false);
    const [typing, setTyping] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    // La lista se renderiza en un portal con position:fixed para que no
    // agrande el área scrolleable del contenedor (ej. el modal de Schedule).
    const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

    useLayoutEffect(() => {
      if (!open) return;
      function place() {
        const r = wrapRef.current?.getBoundingClientRect();
        if (!r) return;
        const listH = 208 + 8;
        const below = window.innerHeight - r.bottom;
        const flip = below < listH && r.top > below;
        setPos({
          left: r.left,
          width: Math.max(r.width, 110),
          ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        });
      }
      place();
      window.addEventListener("resize", place);
      window.addEventListener("scroll", place, true);
      return () => {
        window.removeEventListener("resize", place);
        window.removeEventListener("scroll", place, true);
      };
    }, [open]);

    useEffect(() => { setText(formatTimeLabel(value)); }, [value]);

    // Cierra el dropdown al clickear afuera.
    useEffect(() => {
      if (!open) return;
      function handler(e: MouseEvent) {
        const t = e.target as Node;
        if (wrapRef.current && !wrapRef.current.contains(t) && !listRef.current?.contains(t)) setOpen(false);
      }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Filtra la lista mientras se escribe — prefijo primero (GCal-style:
    // "9:0" prioriza "9:00 AM"/"9:00 PM"), y si no matchea nada por
    // prefijo, busca como substring en cualquier parte del label.
    // GCal-style: al abrir sin haber tipeado nada, muestra la lista completa
    // (scrolleada hasta la hora actual). Recién filtra en vivo cuando el
    // usuario empieza a escribir.
    const options = useMemo(() => (min ? TIME_OPTIONS.filter(t => t.value > min) : TIME_OPTIONS), [min]);
    const filtered = useMemo(() => {
      if (!typing) return options;
      const q = text.trim().toLowerCase();
      if (!q) return options;
      const starts = options.filter(t => t.label.toLowerCase().startsWith(q));
      return starts.length > 0 ? starts : options.filter(t => t.label.toLowerCase().includes(q));
    }, [text, typing, options]);

    // Al abrir, hace scroll hasta la opción actualmente seleccionada
    // (mismo comportamiento que el dropdown de GCal).
    useEffect(() => {
      if (open && listRef.current) {
        listRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
      }
    }, [open]);

    function selectOption(opt: { value: string; label: string }) {
      onChange(opt.value);
      setText(opt.label);
      setInvalid(false);
      setOpen(false);
      setTyping(false);
    }

    function commit() {
      const parsed = parseTimeInput(text);
      if (parsed && min && parsed <= min) {
        // Hora de fin no puede ser <= al inicio: mismo trato que un texto inválido.
        setInvalid(true);
        setTimeout(() => setInvalid(false), 1200);
        setText(formatTimeLabel(value));
      } else if (parsed) {
        onChange(parsed);
        setText(formatTimeLabel(parsed));
        setInvalid(false);
      } else if (text.trim() !== "") {
        // No se pudo interpretar — vuelve al último valor válido en vez de
        // mandar basura al form o dejar el campo en un estado raro.
        setInvalid(true);
        setTimeout(() => setInvalid(false), 1200);
        setText(formatTimeLabel(value));
      } else {
        setText(formatTimeLabel(value));
      }
      setOpen(false);
      setTyping(false);
    }

    return (
      <div ref={wrapRef} className={`relative ${(className ?? "").replace(/\bfocus:/g, "focus-within:")}`}>
        <input
          ref={ref}
          type="text"
          value={text}
          placeholder={placeholder}
          onChange={e => { setText(e.target.value); setOpen(true); setTyping(true); setHighlightIdx(-1); }}
          onFocus={() => { setOpen(true); setTyping(false); }}
          // Delay para que un click en una opción (que dispara blur primero)
          // alcance a registrarse antes de que commit() cierre el dropdown.
          onBlur={() => setTimeout(commit, 120)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && highlightIdx >= 0 && filtered[highlightIdx]) selectOption(filtered[highlightIdx]);
              else commit();
            } else if (e.key === "Escape") {
              setText(formatTimeLabel(value));
              setOpen(false);
              setTyping(false);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setTyping(false);
              setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIdx(i => Math.max(i - 1, 0));
            }
          }}
          className={`w-full h-full bg-transparent border-0 outline-none px-0 py-0 transition-shadow duration-300 ${invalid ? "ring-2 ring-red-400 rounded" : ""}`}
        />
        {open && pos && filtered.length > 0 && createPortal(
          <div
            ref={listRef}
            style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
            // Evita que arrastrar la scrollbar le saque el foco al input.
            onMouseDown={e => e.preventDefault()}
            className="z-[10000] max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
          >
            {filtered.map((t, i) => (
              <button
                key={t.value}
                type="button"
                data-active={t.value === value}
                // onMouseDown + preventDefault en vez de onClick: evita que
                // el input pierda el foco (y dispare blur/commit) antes de
                // que el click en la opción llegue a procesarse.
                onMouseDown={e => { e.preventDefault(); selectOption(t); }}
                className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${t.value === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
                  } ${i === highlightIdx ? "bg-gray-100" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  }
);
TimeSelect.displayName = "TimeSelect";

export default TimeSelect;
