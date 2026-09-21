/**
 * Shown on /blog* while site-config is loading and there is no cached value.
 * Must not render blog content or a 404 (avoids flash on first visit / cold cache).
 */
export default function BlogConfigPendingPage() {
  return (
    <div
      className="min-h-screen bg-white"
      aria-busy="true"
      aria-label="Loading"
    />
  );
}
