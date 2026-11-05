// LAB463 — instalar la app del staff desde un botón (StaffHomePage).
//
// Android/Chrome muestra un aviso propio para instalar, pero si el cleaner lo
// cierra sin querer tarda mucho en volver a aparecer. Chrome igual dispara
// `beforeinstallprompt` en cada carga: se guarda acá para poder abrir ese mismo
// diálogo cuando el cleaner toca "Install app". El listener va a nivel de
// módulo porque el evento llega temprano, antes de que se monte la home.
//
// Se llama a preventDefault() para tapar ese aviso propio de Chrome. Suena al
// revés, pero es lo que hace que el botón funcione siempre: el aviso se cierra
// con un toque en cualquier lado y Chrome después tarda en volver a ofrecerlo,
// que es justo el problema que se reportó. Tapándolo, el evento queda guardado
// acá y el botón abre el diálogo nativo de instalación en el momento.
//
// iPhone no tiene API de instalación: Apple no deja que un sitio se instale
// solo, solo existe Compartir → "Add to Home Screen". Ahí el botón muestra los
// pasos, que son distintos a los de Android.
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'ios' | 'android' | 'other';

export interface InstallState {
  /** Chrome nos dio un evento: el botón puede abrir el diálogo nativo. */
  canPrompt: boolean;
  /** Se está usando la app instalada (o se acaba de instalar en esta sesión). */
  installed: boolean;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: isStandalone() };
const listeners = new Set<() => void>();

function patch(next: Partial<InstallState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/**
 * Abriendo el SITIO en el navegador (no la app instalada) no hay forma directa
 * de saber si ya la instalaron: `display-mode` dice "browser" igual. Android
 * sí lo puede contestar con getInstalledRelatedApps(), que mira las apps que
 * el manifest declara como propias (ver related_applications en
 * staff.webmanifest). iPhone no tiene equivalente: ahí el cartel se sigue
 * viendo, que es preferible a esconderlo para siempre si la desinstalan.
 *
 * Se llama al montar la tarjeta, no al cargar el módulo, porque el manifest se
 * inyecta recién en las pantallas /staff (ver register.ts).
 */
export async function refreshInstalledState(): Promise<void> {
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
  };
  if (!nav.getInstalledRelatedApps) return;
  try {
    const apps = await nav.getInstalledRelatedApps();
    if (apps.some((a) => a.platform === 'webapp')) patch({ installed: true });
  } catch {
    /* el navegador no lo soporta o lo rechaza: queda como estaba */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin esto Chrome muestra su propio aviso, que el cleaner puede cerrar sin
    // querer (y entonces tarda días en volver). Ver la cabecera del archivo.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    // Chrome solo manda este evento si NO está instalada: si antes se la dio
    // por instalada (y la desinstalaron), esto lo corrige solo.
    patch({ canPrompt: true, installed: isStandalone() });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    patch({ canPrompt: false, installed: true });
  });
}

export function installPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac: se lo distingue por la pantalla táctil.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || iPadOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

/**
 * Abre el diálogo nativo de instalación. 'unavailable' = no hay evento (iPhone,
 * o Chrome todavía no lo volvió a mandar): la UI muestra las instrucciones.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred;
  if (!ev) return 'unavailable';
  // Cada evento sirve para un solo prompt(); Chrome manda otro en la próxima carga.
  deferred = null;
  patch({ canPrompt: false });
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') patch({ installed: true });
    return outcome;
  } catch {
    return 'unavailable';
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const getState = () => state;

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getState, getState);
}
