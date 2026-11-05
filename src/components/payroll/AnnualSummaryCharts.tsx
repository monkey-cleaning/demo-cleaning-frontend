// components/payroll/AnnualSummaryCharts.tsx
// Payroll (2026-10-01) — réplica de los 3 gráficos de la hoja "Resumen_Anual"
// del Excel, adaptados a 2: el original mete los 7 números en un solo bar
// chart de 1 eje (Ing.Bruto/Nominee/Profit se aplastan contra los 3 gastos,
// que son 10-50x más chicos) — se separa en "Revenue & profit" (4 series
// comparables en magnitud) y "Expenses by category" (los 3 gastos, área
// apilada — igual al chart "Gastos Operativos" de la hoja, que ya vivía
// separado del resto por el mismo motivo). Sin librería de charts: SVG a
// mano, consistente con el resto de la app (no hay recharts/chart.js acá).
import { useState, type ReactNode } from 'react';

// Paleta categórica validada (CVD-safe, ver skill de dataviz) — mismo color
// para la misma entidad en los dos gráficos (Operational expenses, si en
// algún momento aparece en ambos).
const BLUE = '#2a78d6';
const ORANGE = '#eb6834';
const AQUA = '#1baf7a';
const VIOLET = '#4a3aa7';
const YELLOW = '#eda100';
const MAGENTA = '#e87ba4';
const GREEN = '#008300';

const INK_MUTED = '#898781';
const GRIDLINE = '#e1e0d9';
const BASELINE = '#c3c2b7';

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtFull(n: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

// Ticks "redondos" (spec: 0 / 1,000 / 2,000…) para un máximo dado. El último
// tick SIEMPRE cubre `max` (antes el loop podía cortar antes de llegar, lo
// que recortaba el pico del área apilada — bug visto 2026-10-01).
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rawStep = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 0.5; v += step) ticks.push(Math.round(v));
  return ticks;
}

interface Series {
  name: string;
  color: string;
}
interface MonthPoint {
  label: string;
  values: number[]; // mismo orden que `series`
}

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5 text-xs text-[#52514e]">
          <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, children }: { x: string; y: string; children: ReactNode }) {
  return (
    <div
      className="absolute z-10 pointer-events-none bg-navy text-white text-xs rounded-lg px-2.5 py-2 shadow-lg whitespace-nowrap"
      style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}
    >
      {children}
    </div>
  );
}

// ── Grouped bar chart — "Revenue & profit" ──────────────────────────────────
export function GroupedBarChart({ months, series }: { months: MonthPoint[]; series: Series[] }) {
  const W = 760;
  const H = 260;
  const padL = 44;
  const padB = 28;
  const padT = 8;
  const padR = 8;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = Math.max(1, ...months.flatMap((m) => m.values));
  const ticks = niceTicks(max);
  const niceMax = ticks[ticks.length - 1];

  const groupW = plotW / Math.max(months.length, 1);
  const barGap = 2;
  const barW = Math.min(14, (groupW - barGap * (series.length + 1)) / series.length);

  const [hover, setHover] = useState<{ mi: number; si: number; cx: number; cy: number } | null>(null);
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  return (
    <div className="relative">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label="Revenue and profit by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRIDLINE} strokeWidth={1} />
            <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={INK_MUTED}>
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke={BASELINE} strokeWidth={1} />

        {months.map((m, mi) => {
          const groupX = padL + mi * groupW;
          const totalBarsW = barW * series.length + barGap * (series.length - 1);
          const startX = groupX + (groupW - totalBarsW) / 2;
          return (
            <g key={m.label}>
              {series.map((s, si) => {
                const v = m.values[si] ?? 0;
                const barH = Math.max(0, (v / niceMax) * plotH);
                const bx = startX + si * (barW + barGap);
                const by = padT + plotH - barH;
                const isHovered = hover?.mi === mi && hover?.si === si;
                return (
                  <rect
                    key={s.name}
                    x={bx}
                    y={by}
                    width={barW}
                    height={barH}
                    rx={3}
                    fill={s.color}
                    opacity={isHovered ? 1 : 0.88}
                    onMouseEnter={() => setHover({ mi, si, cx: bx + barW / 2, cy: by })}
                    onMouseLeave={() => setHover((h) => (h?.mi === mi && h?.si === si ? null : h))}
                  />
                );
              })}
              <text x={groupX + groupW / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
                {m.label.slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tooltip x={`${(hover.cx / W) * 100}%`} y={`${(hover.cy / H) * 100}%`}>
          <p className="font-semibold">{months[hover.mi].label}</p>
          <p>
            <span className="inline-block w-2 h-0.5 align-middle mr-1" style={{ backgroundColor: series[hover.si].color }} />
            {series[hover.si].name}: <strong>{fmtFull(months[hover.mi].values[hover.si] ?? 0)}</strong>
          </p>
        </Tooltip>
      )}
    </div>
  );
}

// ── Stacked area chart — "Expenses by category" ─────────────────────────────
export function StackedAreaChart({ months, series }: { months: MonthPoint[]; series: Series[] }) {
  // Mismas W/H/paddings que GroupedBarChart (pedido 2026-10-01): con la misma
  // altura de viewBox y el mismo padT/padB, la línea de $0 (padT + plotH)
  // cae en la misma posición absoluta en pantalla en los dos gráficos.
  const W = 760;
  const H = 260;
  const padL = 44;
  const padB = 28;
  const padT = 8;
  const padR = 8;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const totals = months.map((m) => m.values.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  const ticks = niceTicks(max, 3);
  const niceMax = ticks[ticks.length - 1];

  // Centro de cada mes dentro de su banda — mismo modelo que GroupedBarChart
  // (groupX + groupW/2), así los dos gráficos quedan alineados verticalmente
  // (pedido 2026-10-01: antes este usaba un punto en cada borde, el otro
  // centraba cada banda, y los meses no coincidían entre los dos charts).
  const groupW = plotW / months.length;
  const x = (i: number) => padL + i * groupW + groupW / 2;
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  // Acumulado por serie (stack) para cada mes.
  const cumulative: number[][] = months.map((m) => {
    const out: number[] = [];
    let acc = 0;
    for (const v of m.values) {
      acc += v;
      out.push(acc);
    }
    return out;
  });

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Con un solo mes con datos, un área se degenera en una línea sin ancho —
  // se dibuja como una barra apilada en su lugar (mismo eje/ticks/leyenda).
  if (months.length < 2) {
    const m = months[0];
    const barX = padL + plotW / 2 - 20;
    let acc = 0;
    return (
      <div className="relative">
        <Legend series={series} />
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label="Expenses by category">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRIDLINE} strokeWidth={1} />
              <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={INK_MUTED}>
                {fmtCompact(t)}
              </text>
            </g>
          ))}
          <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke={BASELINE} strokeWidth={1} />
          {m
            ? series.map((s, si) => {
                const v = m.values[si] ?? 0;
                const segH = Math.max(0, (v / niceMax) * plotH);
                const segY = padT + plotH - acc / niceMax * plotH - segH;
                acc += v;
                return (
                  <rect
                    key={s.name}
                    x={barX}
                    y={segY}
                    width={40}
                    height={Math.max(0, segH - 1)}
                    fill={s.color}
                    rx={2}
                    onMouseEnter={() => setHoverIdx(0)}
                    onMouseLeave={() => setHoverIdx(null)}
                  />
                );
              })
            : null}
          {m && (
            <text x={barX + 20} y={H - 6} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
              {m.label.slice(0, 3)}
            </text>
          )}
        </svg>
        {hoverIdx === 0 && m && (
          <Tooltip x={`${((barX + 20) / W) * 100}%`} y="20%">
            <p className="font-semibold">{m.label}</p>
            {series.map((s, si) => (
              <p key={s.name}>
                <span className="inline-block w-2 h-0.5 align-middle mr-1" style={{ backgroundColor: s.color }} />
                {s.name}: <strong>{fmtFull(m.values[si] ?? 0)}</strong>
              </p>
            ))}
          </Tooltip>
        )}
      </div>
    );
  }

  function pathFor(si: number) {
    const top = months.map((_, mi) => [x(mi), y(cumulative[mi][si])] as const);
    const bottom = months
      .map((_, mi) => [x(mi), y(si === 0 ? 0 : cumulative[mi][si - 1])] as const)
      .reverse();
    return `M ${top.map((p) => p.join(',')).join(' L ')} L ${bottom.map((p) => p.join(',')).join(' L ')} Z`;
  }

  return (
    <div className="relative">
      <Legend series={series} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto mt-2"
        role="img"
        aria-label="Expenses by category, by month"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRIDLINE} strokeWidth={1} />
            <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={INK_MUTED}>
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke={BASELINE} strokeWidth={1} />

        {series.map((s, si) => (
          <path key={s.name} d={pathFor(si)} fill={s.color} opacity={0.22} />
        ))}
        {series.map((s, si) => (
          <polyline
            key={s.name}
            points={months.map((_, mi) => `${x(mi)},${y(cumulative[mi][si])}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}

        {/* Crosshair + hit targets — una franja invisible por mes */}
        {months.map((_, mi) => (
          <rect
            key={mi}
            x={x(mi) - groupW / 2}
            y={padT}
            width={groupW}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(mi)}
          />
        ))}
        {hoverIdx != null && (
          <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={padT + plotH} stroke={BASELINE} strokeWidth={1} />
        )}

        {months.map((m, mi) => (
          <text key={m.label} x={x(mi)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
            {m.label.slice(0, 3)}
          </text>
        ))}
      </svg>
      {hoverIdx != null && (
        <Tooltip x={`${(x(hoverIdx) / W) * 100}%`} y={`${(y(cumulative[hoverIdx][series.length - 1]) / H) * 100}%`}>
          <p className="font-semibold">{months[hoverIdx].label}</p>
          {series.map((s, si) => (
            <p key={s.name}>
              <span className="inline-block w-2 h-0.5 align-middle mr-1" style={{ backgroundColor: s.color }} />
              {s.name}: <strong>{fmtFull(months[hoverIdx!].values[si] ?? 0)}</strong>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export const CHART_COLORS = { BLUE, ORANGE, AQUA, VIOLET, YELLOW, MAGENTA, GREEN };
