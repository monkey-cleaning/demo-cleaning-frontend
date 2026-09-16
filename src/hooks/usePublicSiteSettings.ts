// Contacto y redes sociales públicos del sitio (Footer, /contact-us, CTA de
// WhatsApp), editables desde AdminSettings → "Contact & Social Links".
//
// Fail-open: si el fetch falla o todavía no resolvió, se usan estos mismos
// valores hardcodeados como fallback (espejo de src/config/brand.ts) — el
// sitio público nunca se rompe ni queda sin contacto por un error de red.
import { useEffect, useState } from "react";
import { CONTACT_PHONE_DISPLAY, WHATSAPP_NUMBER } from "../config/brand";

export interface PublicSiteSettings {
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  whatsapp_number: string;
  social_instagram_url: string;
  social_facebook_url: string;
}

export const DEFAULT_PUBLIC_SITE_SETTINGS: PublicSiteSettings = {
  contact_phone: CONTACT_PHONE_DISPLAY,
  contact_email: "contact@democleaning.co",
  contact_address: "123 Main St, Victoria, BC V9A 0H7, Canada",
  whatsapp_number: WHATSAPP_NUMBER,
  social_instagram_url: "",
  social_facebook_url: "",
};

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Cache a nivel de módulo: Footer, ContactPage y FormSection pueden montar
// este hook al mismo tiempo (todos en la misma carga de página) y comparten
// un único request en vez de dispararlo 3 veces.
let fetchPromise: Promise<PublicSiteSettings> | null = null;

function fetchPublicSiteSettings(): Promise<PublicSiteSettings> {
  if (!fetchPromise) {
    fetchPromise = fetch(`${API_BASE}/api/public/site-settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          return { ...DEFAULT_PUBLIC_SITE_SETTINGS, ...data.settings };
        }
        return DEFAULT_PUBLIC_SITE_SETTINGS;
      })
      .catch(() => DEFAULT_PUBLIC_SITE_SETTINGS);
  }
  return fetchPromise;
}

export function usePublicSiteSettings(): {
  settings: PublicSiteSettings;
  loading: boolean;
} {
  const [settings, setSettings] = useState<PublicSiteSettings>(
    DEFAULT_PUBLIC_SITE_SETTINGS,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSiteSettings().then((s) => {
      if (!cancelled) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading };
}
