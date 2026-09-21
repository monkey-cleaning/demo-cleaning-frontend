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
  fetchSiteConfig,
  readStoredSiteConfig,
  writeStoredSiteConfig,
  type BlogMode,
  type SiteConfig,
} from '../api/siteConfig';

/** Used only in-memory when there is no stored value and the fetch has not succeeded. Never persisted. */
const UNSAVED_FALLBACK: SiteConfig = {
  blogEnabled: false,
  blogMode: 'off',
};

interface SiteConfigContextValue {
  blogEnabled: boolean;
  blogMode: BlogMode;
  /** True once we have a value safe to drive UI (from cache or a finished fetch). */
  ready: boolean;
  /** True if the initial state came from localStorage (repeat visits — no late nav flash). */
  hasCachedConfig: boolean;
  refresh: () => Promise<void>;
}

const SiteConfigContext = createContext<SiteConfigContextValue | null>(null);

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const stored = readStoredSiteConfig();
  const [config, setConfig] = useState<SiteConfig>(stored ?? UNSAVED_FALLBACK);
  const [ready, setReady] = useState(!!stored);
  const [hasCachedConfig] = useState(!!stored);

  const applySuccess = useCallback((next: SiteConfig) => {
    setConfig(next);
    writeStoredSiteConfig(next);
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchSiteConfig();
      applySuccess(next);
    } catch {
      // Keep current config. If we never had a successful/stored value, leave
      // the in-memory fallback (blog off) and mark ready — do not persist it.
      setReady(true);
    }
  }, [applySuccess]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchSiteConfig();
        if (!cancelled) applySuccess(next);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySuccess]);

  const value = useMemo<SiteConfigContextValue>(
    () => ({
      blogEnabled: config.blogEnabled,
      blogMode: config.blogMode,
      ready,
      hasCachedConfig,
      refresh,
    }),
    [config.blogEnabled, config.blogMode, ready, hasCachedConfig, refresh],
  );

  return (
    <SiteConfigContext.Provider value={value}>
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfig(): SiteConfigContextValue {
  const ctx = useContext(SiteConfigContext);
  if (!ctx) {
    throw new Error('useSiteConfig must be used within SiteConfigProvider');
  }
  return ctx;
}
