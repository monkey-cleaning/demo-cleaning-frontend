// lib/quincena.ts
// LAB428 — navegación de quincenas para la pestaña "Payroll". A diferencia
// de QuincenalBanner.getQuincenalRange (components/admin/QuincenalBanner.tsx),
// que solo sabe moverse entre 'current' y 'previous', esto navega a
// CUALQUIER quincena pasada (± N).
//
// El rango REAL de fechas (from/to) lo calcula el backend en TZ del negocio
// (payrollSummaryService.quincenaRange) — acá solo se arma el
// year/month/half que se manda como query param, así no hay drift de huso
// horario entre el navegador del usuario y el server.

export interface Quincena {
  year: number;
  month: number; // 1-12
  half: 1 | 2;
}

export function currentQuincena(now: Date = new Date()): Quincena {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    half: now.getDate() <= 15 ? 1 : 2,
  };
}

export function shiftQuincena(q: Quincena, delta: number): Quincena {
  // Normalizamos a un índice lineal de "medios meses" para poder sumar/restar
  // sin reimplementar el acarreo de mes/año a mano.
  const halfIndex = (q.year * 12 + (q.month - 1)) * 2 + (q.half - 1) + delta;
  const monthsTotal = Math.floor(halfIndex / 2);
  const half = ((halfIndex % 2) + 2) % 2; // 0 o 1, a prueba de índices negativos
  const year = Math.floor(monthsTotal / 12);
  const month = ((monthsTotal % 12) + 12) % 12;
  return { year, month: month + 1, half: (half + 1) as 1 | 2 };
}

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function quincenaLabel(q: Quincena): string {
  return `Q${q.half} ${MONTH_LABELS[q.month - 1]} ${q.year}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Título legible del período: "September 1 – 15, 2026" (Q1) / "September
// 16 – 30, 2026" (Q2, hasta el último día real del mes). Pura aritmética de
// calendario — mismo criterio que quincenaRange del backend (día 1-15 /
// 16-fin de mes), sin depender del huso del navegador.
export function quincenaTitle(q: Quincena): string {
  const lastDay = new Date(q.year, q.month, 0).getDate();
  const [from, to] = q.half === 1 ? [1, 15] : [16, lastDay];
  return `${MONTH_NAMES[q.month - 1]} ${from} – ${to}, ${q.year}`;
}

// true si `q` es la quincena actual o una futura — usado para deshabilitar
// el botón "next" del navegador (no tiene sentido consultar "el histórico"
// de algo que todavía no pasó).
export function isCurrentOrFuture(q: Quincena, now: Date = new Date()): boolean {
  const current = currentQuincena(now);
  const qIndex = (q.year * 12 + (q.month - 1)) * 2 + (q.half - 1);
  const currentIndex = (current.year * 12 + (current.month - 1)) * 2 + (current.half - 1);
  return qIndex >= currentIndex;
}
