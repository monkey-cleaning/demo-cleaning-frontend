// Fuente unica de marca y contacto del frontend.
//
// Espeja el patron que ya usa el backend (`process.env.BRAND_NAME || "Demo
// Cleaning Co."` en src/services/clientQuoteEmailService.js): la env manda y
// el default deja el fork funcionando sin configurar nada.
//
// OJO: las env de Vite se hornean en BUILD TIME, no se leen en runtime. Cambiar
// VITE_* obliga a rebuild + redeploy del frontend; no basta con reiniciar el
// proceso como en el backend. Por eso los defaults de abajo son los valores
// reales del fork y no placeholders vacios: un build sin .env sigue siendo
// correcto.
//
// Para re-brandear a otro cliente: setear las VITE_* del build, o tocar solo
// los defaults de este archivo. Nada de buscar strings por el resto del codigo.

const env = import.meta.env;

/** Devuelve la env si trae contenido util, si no el default. */
function fromEnv(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

/** Deja solo digitos: tolera que la env venga como "+1 (604) 555-0142". */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/** Formatea NANP para mostrar. Fuera de NANP cae a E.164, que siempre es legible. */
function formatPhone(digits: string): string {
  const nanp = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (nanp.length !== 10) return `+${digits}`;
  return `1 (${nanp.slice(0, 3)}) ${nanp.slice(3, 6)}-${nanp.slice(6)}`;
}

/** Nombre comercial. Usar siempre esto en vez de escribirlo a mano. */
export const BRAND_NAME = fromEnv(env.VITE_BRAND_NAME, 'Demo Cleaning Co.');

/**
 * Telefono de contacto en digitos E.164 sin '+'.
 * Default: placeholder ficticio (rango NANP reservado 555-01XX).
 */
export const CONTACT_PHONE = digitsOf(fromEnv(env.VITE_CONTACT_PHONE, '16045550142'));

/** Valor para `href="tel:..."`. */
export const CONTACT_PHONE_TEL = `+${CONTACT_PHONE}`;

/**
 * Telefono ya formateado para mostrar al usuario.
 * Se deriva de CONTACT_PHONE a proposito: asi el texto visible nunca puede
 * quedar desfasado del href, que es exactamente como se colo el numero viejo.
 */
export const CONTACT_PHONE_DISPLAY = formatPhone(CONTACT_PHONE);

/** Numero de WhatsApp. Por defecto es el mismo que el telefono de contacto. */
export const WHATSAPP_NUMBER = digitsOf(fromEnv(env.VITE_WHATSAPP_NUMBER, CONTACT_PHONE));

/** Link a WhatsApp sin mensaje prellenado. */
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

/** Link a WhatsApp con mensaje prellenado. */
export function whatsappUrl(message: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}

/**
 * URL pública de reseñas (p.ej. Google Business). Opcional.
 * Si está vacía, las tarjetas de testimonials no son clickeables —
 * no hay fallback de búsqueda (evitar negocios homónimos).
 */
export const GOOGLE_REVIEWS_URL = fromEnv(env.VITE_GOOGLE_REVIEWS_URL, '');
