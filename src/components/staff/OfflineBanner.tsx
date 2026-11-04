// LAB463 — barra de estado del modo offline: sin conexión (con la hora de lo
// guardado), acciones pendientes de sincronizar, sesión vencida y acciones que
// el servidor rechazó. Todo el texto en inglés (la vista de cleaners es English-only).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useOfflineStatus } from '../../offline/status';
import {
  describeOp,
  discardFailedOps,
  failedOps,
  flushQueue,
  retryFailedOps,
  type QueueOp,
} from '../../offline/queue';
import { prefetchStaffData } from '../../offline/prefetch';
import { TZ } from '../../lib/timezone';


const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

export default function OfflineBanner() {
  const s = useOfflineStatus();
  const navigate = useNavigate();
  const [showFailed, setShowFailed] = useState(false);
  const [failed, setFailed] = useState<QueueOp[]>([]);

  useEffect(() => {
    if (!showFailed || s.failed === 0) return;
    let cancelled = false;
    failedOps().then((ops) => {
      if (!cancelled) setFailed(ops);
    });
    return () => {
      cancelled = true;
    };
  }, [showFailed, s.failed, s.syncTick]);

  const savedAt = s.lastSyncAt ? DateTime.fromMillis(s.lastSyncAt, { zone: TZ }).toFormat('h:mm a') : null;

  const bars: React.ReactNode[] = [];

  if (!s.online) {
    bars.push(
      <div key="offline" className="bg-amber-100 text-amber-900 px-4 py-2 text-xs flex items-start gap-2">
        <CloudOff size={14} className="mt-0.5 flex-shrink-0" />
        <p>
          <span className="font-semibold">You&apos;re offline.</span>{' '}
          {savedAt
            ? `Showing data saved at ${savedAt}.`
            : 'No saved data yet — open the app once with internet to save your visits.'}
          {s.pending > 0 && ` ${items(s.pending)} pending sync.`}
        </p>
      </div>
    );
  } else if (s.authExpired && s.pending > 0) {
    bars.push(
      <div key="auth" className="bg-red-100 text-red-900 px-4 py-2 text-xs flex items-center justify-between gap-3">
        <p>
          <span className="font-semibold">Your session expired.</span> Sign in again to sync {items(s.pending)}.
        </p>
        <button
          onClick={() => navigate('/staff/login')}
          className="flex-shrink-0 font-semibold underline underline-offset-2"
        >
          Sign in
        </button>
      </div>
    );
  } else if (s.pending > 0) {
    bars.push(
      <div key="pending" className="bg-blue-100 text-blue-900 px-4 py-2 text-xs flex items-center justify-between gap-3">
        <p className="flex items-center gap-2">
          {s.syncing && <Loader2 size={13} className="animate-spin" />}
          {s.syncing ? `Syncing ${items(s.pending)}…` : `${items(s.pending)} pending sync`}
        </p>
        {!s.syncing && (
          <button
            onClick={() => {
              void flushQueue();
              void prefetchStaffData({ force: true });
            }}
            className="flex-shrink-0 flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <RefreshCw size={12} /> Sync now
          </button>
        )}
      </div>
    );
  }

  if (s.failed > 0) {
    bars.push(
      <div key="failed" className="bg-red-100 text-red-900 px-4 py-2 text-xs space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2">
            <TriangleAlert size={14} className="flex-shrink-0" />
            <span>
              <span className="font-semibold">{items(s.failed)} couldn&apos;t be synced.</span>
            </span>
          </p>
          <button
            onClick={() => setShowFailed((v) => !v)}
            className="flex-shrink-0 font-semibold underline underline-offset-2"
          >
            {showFailed ? 'Hide' : 'Details'}
          </button>
        </div>
        {showFailed && (
          <div className="space-y-1.5">
            {failed.map((op) => (
              <p key={op.seq} className="bg-white/60 rounded px-2 py-1">
                {describeOp(op)}
                {op.error ? ` — ${op.error}` : ''}
              </p>
            ))}
            <div className="flex gap-3 pt-0.5">
              <button onClick={() => void retryFailedOps()} className="font-semibold underline underline-offset-2">
                Try again
              </button>
              <button
                onClick={() => {
                  void discardFailedOps();
                  setShowFailed(false);
                }}
                className="font-semibold underline underline-offset-2"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!bars.length) return null;
  return (
    <div className="sticky top-0 z-[60]" role="status" aria-live="polite">
      {bars}
    </div>
  );
}
