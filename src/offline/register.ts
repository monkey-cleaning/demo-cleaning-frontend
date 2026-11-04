// LAB463 — arranque del modo offline del staff: service worker (app shell),
// manifest (instalable en la pantalla de inicio), cola de sincronización y
// precarga de datos. Se llama desde las pantallas /staff; la landing y el admin
// no pasan por acá.
import { startSyncEngine } from './queue';
import { prefetchStaffData } from './prefetch';
import { loadLastSync } from './cache';
// Efecto de módulo: escucha `beforeinstallprompt` desde el arranque (llega
// antes de que se monte la home, donde está el botón "Install app").
import './install';

let started = false;

function addHeadTag(tag: 'link' | 'meta', attrs: Record<string, string>): void {
  const selector = tag === 'link' ? `link[rel="${attrs.rel}"]` : `meta[name="${attrs.name}"]`;
  if (document.head.querySelector(selector)) return;
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
}

// El manifest se agrega solo en /staff (no en index.html): si no, la landing
// pública también se ofrecería como app instalable con start_url /staff.
function ensureInstallMeta(): void {
  addHeadTag('link', { rel: 'manifest', href: '/staff.webmanifest' });
  addHeadTag('link', { rel: 'apple-touch-icon', href: '/staff-icons/apple-touch-icon.png' });
  addHeadTag('meta', { name: 'theme-color', content: '#031634' });
  addHeadTag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  addHeadTag('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  addHeadTag('meta', { name: 'apple-mobile-web-app-title', content: 'Staff' });
  // `black` (no `black-translucent`): iOS deja el contenido POR DEBAJO de la
  // barra de estado en la app instalada. Con translucent el header navy
  // quedaba tapado por el reloj, y encima el reloj se dibujaba en negro sobre
  // navy. Ver también las reglas .staff-safe-area de styles/staff-a11y.css.
  addHeadTag('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' });
}

/** Registra el service worker (solo en el build de producción; `vite dev` no lo genera). */
export function registerStaffServiceWorker(): void {
  ensureInstallMeta();
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/staff' }).catch((e) => {
    console.warn('Service worker registration failed:', e);
  });
}

/** Sesión de staff válida: cola + precarga. Idempotente. */
export function startStaffOffline(): void {
  registerStaffServiceWorker();
  if (started) {
    void prefetchStaffData();
    return;
  }
  started = true;
  void loadLastSync();
  // Pedir almacenamiento persistente: el navegador es menos propenso a borrar
  // el caché local (en Safari sin instalar, el sistema igual puede vaciarlo
  // tras ~7 días sin abrir la app).
  void navigator.storage?.persist?.().catch(() => undefined);
  startSyncEngine(() => void prefetchStaffData());
  void prefetchStaffData({ force: true });
}
