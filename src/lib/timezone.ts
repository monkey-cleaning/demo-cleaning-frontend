// Zona horaria del negocio, resuelta en el dispositivo.
//
// Espejo de src/config/timezone.js del backend; vale la pena leer aquel primero.
//
// ── Por que existe (nov 2026) ───────────────────────────────────────────────
// British Columbia paso a hora de verano permanente: America/Vancouver queda en
// UTC-7 todo el año. tzdata lo modela como una transicion el 2026-11-01 (la
// ley es del 2026-03-09; el 1/11 es un rodeo por una limitacion de CLDR/ICU).
// Las reglas llegan en tzdata >= 2026b.
//
// En el navegador la base de zonas NO es nuestra: la pone el sistema operativo
// del telefono. Un equipo sin actualizar sigue creyendo que Vancouver en
// invierno es UTC-8, asi que al re-zonar una hora correcta dibuja una hora
// MENOS. Reportado el 3/11/2026: una cleaner vio a las 9:00 una visita que era
// a las 10:00. El arreglo del backend (subir Node) no alcanza para esto, porque
// el calculo que falla ocurre en el telefono.
//
// ── Dos herramientas, para dos casos distintos ──────────────────────────────
// `atOffset()` para lo que viene del servidor con su offset ya calculado
// (startIso/endIso de Google Calendar: "2026-11-03T10:00:00.000-07:00"). Se
// respeta ese offset y no se consulta la base del dispositivo: es exacto para
// cualquier fecha, pasada o futura, en cualquier equipo.
//
// `TZ` para lo que SI necesita una zona: la hora actual, que dia es "hoy", o un
// timestamp UTC de la base (sin offset propio). Ahi se mide si el dispositivo
// conoce la regla nueva y, si no, se calcula con UTC-7 fijo.
import { DateTime } from 'luxon';

const CONFIGURED = 'America/Vancouver';

// Un dia de pleno invierno, despues del 2026-11-01.
const PROBE = '2026-12-01T12:00:00';
// Etc/GMT+7 (el signo esta invertido a proposito) es UTC-7 fijo y es un nombre
// IANA de verdad: lo entienden tanto luxon como Intl.DateTimeFormat. El mismo
// respaldo que usa el backend.
const FIXED_UTC_MINUS_7 = 'Etc/GMT+7';

function resolveZone(): string {
  const probe = DateTime.fromISO(PROBE, { zone: CONFIGURED });
  return probe.isValid && probe.offset === -420 ? CONFIGURED : FIXED_UTC_MINUS_7;
}

/**
 * Zona para CALCULAR. Es `America/Vancouver` cuando el dispositivo tiene las
 * reglas nuevas, y UTC-7 fijo cuando no.
 *
 * El respaldo es correcto desde el 2026-03-09 en adelante. Para fechas
 * anteriores a esa (un invierno viejo en el historial de payroll) un
 * dispositivo desactualizado va a mostrar una hora de mas; se elige ese mal
 * menor igual que en el backend, porque el trabajo del dia a dia es hacia
 * adelante. Lo que se ve en pantalla de una visita NO depende de esto: eso usa
 * `atOffset()`.
 */
export const TZ = resolveZone();

/** El dispositivo no conoce la regla nueva y se esta usando el respaldo. */
export const TZ_IS_FALLBACK = TZ !== CONFIGURED;

/** Ahora, en hora del negocio. */
export function nowInTz(): DateTime {
  return DateTime.now().setZone(TZ);
}

/**
 * Parsea un ISO del servidor respetando el offset que ya trae
 * ("...-07:00"), sin re-zonarlo contra la base del dispositivo.
 * Para horas de visitas, siempre esto.
 */
export function atOffset(iso: string): DateTime {
  return DateTime.fromISO(iso, { setZone: true });
}
