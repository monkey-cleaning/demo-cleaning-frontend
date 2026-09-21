import type { ReactNode } from 'react';
import { useSiteConfig } from '../../context/SiteConfigContext';
import BlogConfigPendingPage from '../../pages/BlogConfigPendingPage';
import NotFoundPage from '../../pages/NotFoundPage';

/**
 * Gates public /blog and /blog/:slug by site-config.
 * - No cache + still loading → neutral shell (no blog, no 404).
 * - blogEnabled false → real NotFoundPage + noindex.
 * - blogEnabled true → children.
 */
export default function PublicBlogGate({ children }: { children: ReactNode }) {
  const { ready, blogEnabled, hasCachedConfig } = useSiteConfig();

  if (!ready && !hasCachedConfig) {
    return <BlogConfigPendingPage />;
  }

  if (!blogEnabled) {
    return <NotFoundPage noIndex />;
  }

  return <>{children}</>;
}
