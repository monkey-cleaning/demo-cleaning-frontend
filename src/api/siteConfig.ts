import { API_BASE_URL } from './client';

export type BlogMode = 'off' | 'manual' | 'auto';

export interface SiteConfig {
  blogEnabled: boolean;
  blogMode: BlogMode;
}

const STORAGE_KEY = 'site_config_v1';

function isBlogMode(value: unknown): value is BlogMode {
  return value === 'off' || value === 'manual' || value === 'auto';
}

/** Last successful /api/site-config payload, if any. Never stores a synthetic fallback. */
export function readStoredSiteConfig(): SiteConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SiteConfig>;
    if (typeof parsed.blogEnabled === 'boolean' && isBlogMode(parsed.blogMode)) {
      return { blogEnabled: parsed.blogEnabled, blogMode: parsed.blogMode };
    }
  } catch {
    // ignore corrupt storage
  }
  return null;
}

export function writeStoredSiteConfig(config: SiteConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // private mode / quota — ignore
  }
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const res = await fetch(`${API_BASE_URL}/api/site-config`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`site-config ${res.status}`);
  }
  const data = (await res.json()) as Partial<SiteConfig>;
  if (typeof data.blogEnabled !== 'boolean' || !isBlogMode(data.blogMode)) {
    throw new Error('site-config invalid payload');
  }
  return { blogEnabled: data.blogEnabled, blogMode: data.blogMode };
}
