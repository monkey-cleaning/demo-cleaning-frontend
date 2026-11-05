// pages/AdminCoverageAlertsPage.tsx
//
// "Coverage Alerts" — lists the findings of the recurring-series monitor
// (backend: services/coverageScan.js). Born from a real incident upstream:
// a recurring client ran out of future appointments and nobody noticed.
//
// Each row can be marked "Resolved for now" (hidden for 90 days) or
// "Silence permanently" — targeting the series, that specific warning, or the
// whole client. Stored in alert_suppressions via /api/admin/alert-suppressions.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon, AlertTriangle, Clock, Info, BellOff, RotateCcw,
  ChevronDown, X, Check, Loader2,
} from "lucide-react";
import RequireAdmin from "../components/admin/RequireAdmin";
import AdminNavbar from "../components/admin/AdminNavbar";
import { api, ApiError } from "../api/client";

type Severity = "red" | "amber" | "yellow" | "info";
type FindingKind = "no_coverage" | "on_demand" | "ending_soon" | "gap" | "overlap";

interface AckTarget {
  entityType: "client" | "recurring_series";
  entityId: string;
  findingKind: FindingKind | null;
  label: string;
}
interface CoverageAlert {
  id: string;
  kind: FindingKind;
  severity: Severity;
  headline: string;
  detail: string;
  actionable: boolean;
  client: { id: string; name: string; email: string | null; phone: string | null; status: string | null };
  series: { id: string; title: string | null; rrule: string | null } | null;
  ackTargets: AckTarget[];
  suppressedBy?: string | null;
  suppressedUntil?: string | null;
  suppressedScope?: string | null;
}
interface CoverageResponse {
  ok: boolean;
  ageSeconds: number;
  stale: boolean;
  scanError?: string;
  generatedAt: string | null;
  counts: Record<string, number>;
  alerts: CoverageAlert[];
  suppressed: CoverageAlert[];
}
interface Suppression {
  id: string;
  entity_type: "client" | "recurring_series";
  entity_id: string;
  finding_kind: FindingKind | null;
  reason: string | null;
  suppressed_by: string;
  created_at: string;
  expires_at: string | null;
  active: boolean;
}

const SEV_META: Record<Severity, { dot: string; Icon: typeof Info; label: string }> = {
  red: { dot: "bg-red-500", Icon: AlertOctagon, label: "Critical" },
  amber: { dot: "bg-amber-500", Icon: Clock, label: "Ending soon" },
  yellow: { dot: "bg-yellow-400", Icon: AlertTriangle, label: "Gap" },
  info: { dot: "bg-gray-300", Icon: Info, label: "Informational" },
};
const KIND_LABEL: Record<FindingKind, string> = {
  no_coverage: "No coverage",
  on_demand: "On-demand, no next appointment",
  ending_soon: "Series ending soon",
  gap: "Gap in the series",
  overlap: "Overlapping series",
};

function ago(seconds: number): string {
  if (seconds < 90) return "just now";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

export default function AdminCoverageAlertsPage() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [supps, setSupps] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [showSuppressed, setShowSuppressed] = useState(false);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    setError(null);
    Promise.all([
      api<CoverageResponse>(`/api/admin/coverage-alerts${refresh ? "?refresh=1" : ""}`),
      api<{ ok: boolean; suppressions: Suppression[] }>(`/api/admin/alert-suppressions`),
    ])
      .then(([cov, sup]) => {
        setData(cov);
        setSupps(sup.suppressions.filter((s) => s.active));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const order: Severity[] = ["red", "amber", "yellow", "info"];
    const g: Record<Severity, CoverageAlert[]> = { red: [], amber: [], yellow: [], info: [] };
    for (const a of data?.alerts ?? []) g[a.severity].push(a);
    return order.map((s) => [s, g[s]] as const).filter(([, arr]) => arr.length);
  }, [data]);

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar title="Coverage Alerts" onRefresh={() => load(false)} refreshing={loading} />

        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">
                {data
                  ? `${data.alerts.length} warning(s) · ${data.counts.suppressed ?? 0} silenced`
                  : "Loading…"}
              </p>
              {data && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Scanned {ago(data.ageSeconds)}
                  {data.stale && <span className="text-amber-600"> · out of date{data.scanError ? ` (${data.scanError})` : ""}</span>}
                </p>
              )}
            </div>
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Rescan
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>
          )}

          {data && data.alerts.length === 0 && !loading && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500 text-sm">
              <Check className="w-6 h-6 mx-auto mb-2 text-green-500" />
              Nothing to review. Every client with active service has future coverage.
            </div>
          )}

          {/* Active alerts */}
          {grouped.map(([sev, alerts]) => (
            <div key={sev} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`w-2 h-2 rounded-full ${SEV_META[sev].dot}`} />
                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  {SEV_META[sev].label} · {alerts.length}
                </h2>
              </div>
              {alerts.map((a) => (
                <AlertCard
                  key={a.id}
                  alert={a}
                  open={openRow === a.id}
                  onToggle={() => setOpenRow((r) => (r === a.id ? null : a.id))}
                  onDone={() => load(false)}
                />
              ))}
            </div>
          ))}

          {/* Suppressed */}
          {supps.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <button
                onClick={() => setShowSuppressed((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600"
              >
                <span className="flex items-center gap-2">
                  <BellOff className="w-4 h-4 text-gray-400" />
                  Silenced ({supps.length})
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showSuppressed ? "rotate-180" : ""}`} />
              </button>
              {showSuppressed && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {supps.map((s) => (
                    <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-700">
                          {s.entity_type === "client" ? "Client" : "Series"} ·{" "}
                          {s.finding_kind ? KIND_LABEL[s.finding_kind] : "all alerts"}
                        </span>
                        <span className="block text-xs text-gray-400 truncate">
                          {s.entity_id} · {s.reason || "no reason"} · by {s.suppressed_by}
                          {s.expires_at ? ` · until ${s.expires_at.slice(0, 10)}` : " · permanent"}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          await api(`/api/admin/alert-suppressions/${s.id}`, { method: "DELETE" });
                          load(false);
                        }}
                        className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2 py-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reinstate
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </RequireAdmin>
  );
}

// ── Alert card + ack panel ─────────────────────────────────────────────────
function AlertCard({
  alert, open, onToggle, onDone,
}: {
  alert: CoverageAlert;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const { Icon } = SEV_META[alert.severity];
  const [targetIdx, setTargetIdx] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | "snooze" | "forever">(null);
  const [err, setErr] = useState<string | null>(null);

  async function suppress(permanent: boolean) {
    const t = alert.ackTargets[targetIdx];
    if (!t) return;
    setBusy(permanent ? "forever" : "snooze");
    setErr(null);
    try {
      await api(`/api/admin/alert-suppressions`, {
        method: "POST",
        body: JSON.stringify({
          entityType: t.entityType,
          entityId: t.entityId,
          findingKind: t.findingKind,
          reason: reason.trim() || null,
          expiresAt: permanent ? null : new Date(Date.now() + 90 * 864e5).toISOString(),
        }),
      });
      onDone();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error";
      setErr(e instanceof ApiError && e.status === 409 ? "That combination is already silenced." : msg);
      setBusy(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
          alert.severity === "red" ? "text-red-500"
          : alert.severity === "amber" ? "text-amber-500"
          : alert.severity === "yellow" ? "text-yellow-500" : "text-gray-400"
        }`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{alert.client.name}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
              {KIND_LABEL[alert.kind]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {alert.client.email || "no email"} · {alert.client.phone || "no phone"}
          </p>
          <p className="text-sm text-gray-700 mt-1.5">{alert.detail}</p>
          {alert.series?.title && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{alert.series.title}</p>
          )}
        </div>
        <button
          onClick={onToggle}
          className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5"
        >
          {open ? <X className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          {open ? "Close" : "Resolve"}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">What to silence?</label>
            <div className="space-y-1">
              {alert.ackTargets.map((t, i) => (
                <label key={i} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name={`tgt-${alert.id}`}
                    checked={targetIdx === i}
                    onChange={() => setTargetIdx(i)}
                    className="accent-gray-700"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. reviewed, sent a reminder to book"
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
            />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => suppress(false)}
              disabled={!!busy}
              className="flex items-center gap-1.5 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {busy === "snooze" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Resolved for now (90 days)
            </button>
            <button
              onClick={() => suppress(true)}
              disabled={!!busy}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {busy === "forever" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
              Silence permanently
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            "Resolved for now" comes back in 90 days if it's still unresolved.
            If the client books an appointment, the alert clears itself sooner.
          </p>
        </div>
      )}
    </div>
  );
}
