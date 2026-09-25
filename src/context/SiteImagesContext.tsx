import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchSiteImages,
  readStoredSiteImages,
  writeStoredSiteImages,
  type SiteImageOverrides,
} from '../api/siteImages';
import { defaultSiteImage, type SiteImageKey } from '../config/siteImages';

interface SiteImagesContextValue {
  /** URL efectiva del slot: la subida desde Settings, o la imagen por defecto. */
  img: (key: SiteImageKey) => string;
  overrides: SiteImageOverrides;
  /** Reemplaza los overrides (respuesta de upload/reset) y los persiste en cache. */
  setOverrides: (next: SiteImageOverrides) => void;
}

const SiteImagesContext = createContext<SiteImagesContextValue | null>(null);

export function SiteImagesProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverridesState] = useState<SiteImageOverrides>(
    () => readStoredSiteImages() ?? {},
  );

  const setOverrides = useCallback((next: SiteImageOverrides) => {
    setOverridesState(next);
    writeStoredSiteImages(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSiteImages()
      .then((next) => {
        if (!cancelled) setOverrides(next);
      })
      .catch(() => {
        // Sin red / backend caído: se queda con el cache o los defaults.
      });
    return () => {
      cancelled = true;
    };
  }, [setOverrides]);

  const value = useMemo<SiteImagesContextValue>(
    () => ({
      img: (key) => overrides[key] ?? defaultSiteImage(key),
      overrides,
      setOverrides,
    }),
    [overrides, setOverrides],
  );

  return (
    <SiteImagesContext.Provider value={value}>
      {children}
    </SiteImagesContext.Provider>
  );
}

export function useSiteImages(): SiteImagesContextValue {
  const ctx = useContext(SiteImagesContext);
  if (!ctx) {
    throw new Error('useSiteImages must be used within SiteImagesProvider');
  }
  return ctx;
}
