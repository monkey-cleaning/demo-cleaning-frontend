// LAB447 — overrides de las imágenes de la landing (slot → URL pública).
import { api, API_BASE_URL } from './client';

export type SiteImageOverrides = Record<string, string>;

const STORAGE_KEY = 'site_images_v1';

/** Último payload exitoso, para pintar las imágenes elegidas sin flash del default. */
export function readStoredSiteImages(): SiteImageOverrides | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as SiteImageOverrides;
  } catch {
    // storage corrupto / no disponible
  }
  return null;
}

export function writeStoredSiteImages(images: SiteImageOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  } catch {
    // private mode / quota
  }
}

export async function fetchSiteImages(): Promise<SiteImageOverrides> {
  const res = await fetch(`${API_BASE_URL}/api/site-images`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`site-images ${res.status}`);
  const data = (await res.json()) as { images?: SiteImageOverrides };
  return data.images ?? {};
}

export async function uploadSiteImage(
  slot: string,
  file: Blob,
): Promise<SiteImageOverrides> {
  const data = await api<{ images: SiteImageOverrides }>(
    `/api/admin/site-images/${encodeURIComponent(slot)}`,
    { method: 'PUT', headers: { 'Content-Type': file.type }, body: file },
  );
  return data.images;
}

export async function resetSiteImage(slot: string): Promise<SiteImageOverrides> {
  const data = await api<{ images: SiteImageOverrides }>(
    `/api/admin/site-images/${encodeURIComponent(slot)}`,
    { method: 'DELETE' },
  );
  return data.images;
}
