// pages/admin/AdminActivityPage.tsx
//
// LAB418 (T9) — global audit feed over GET /api/admin/history (no entity_id),
// filterable by user / entity type / source / date range. Answers "what did
// yudith1 change this week", as opposed to HistoryDrawer which answers
// "what happened to this one record".

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronLeft, ChevronRight, X, Copy, Check } from "lucide-react";
import RequireAdmin from "../components/admin/RequireAdmin";
import AdminNavbar from "../components/admin/AdminNavbar";
import HistoryValueDiff from "../components/admin/HistoryValueDiff";
import { api } from "../api/client";
import {
  type HistoryRow,
  type HistoryResponse,
  KNOWN_ACTORS,
  KNOWN_SYSTEM_ACTORS,
  ENTITY_TYPES,
  SOURCES,
  ENTITY_TYPE_META,
  SOURCE_META,
  fieldLabel,
  fmtDateTime,
} from "../lib/historyFormat";

export default function AdminActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const entityType = searchParams.get("entity_type") ?? "";
  const changedBy = searchParams.get("changed_by") ?? "";
  const source = searchParams.get("source") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const page = Number(searchParams.get("page") ?? 1);

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // clipboard permission denied or unavailable — nothing to fall back to
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (entityType) params.set("entity_type", entityType);
    if (changedBy) params.set("changed_by", changedBy);
    if (source) params.set("source", source);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    api<HistoryResponse>(`/api/admin/history?${params.toString()}`)
      .then((data) => {
        setRows(data.history);
        setPagination(data.pagination);
      })
      .catch((e: any) => setError(e.message ?? "Failed to load activity"))
      .finally(() => setLoading(false));
  }, [entityType, changedBy, source, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page"); // any filter change resets pagination
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    setSearchParams(next);
  }

  const hasFilters = entityType || changedBy || source || from || to;

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar
          title="Activity"
          onRefresh={load}
          refreshing={loading}
        />

        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4">
          {/* Filter bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">User</label>
              <select
                value={changedBy}
                onChange={(e) => setFilter("changed_by", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white"
              >
                <option value="">All users</option>
                {KNOWN_ACTORS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
                <optgroup label="System">
                  {KNOWN_SYSTEM_ACTORS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Entity</label>
              <select
                value={entityType}
                onChange={(e) => setFilter("entity_type", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white"
              >
                <option value="">All entities</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Source</label>
              <select
                value={source}
                onChange={(e) => setFilter("source", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700 bg-white"
              >
                <option value="">All sources</option>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFilter("from", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setFilter("to", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-700"
              />
            </div>

            {hasFilters && (
              <button
                onClick={() => setSearchParams({})}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-600 px-2 py-1.5"
              >
                <X size={12} /> Clear
              </button>
            )}

            <div className="ml-auto text-xs text-gray-400 self-center">
              {loading ? "Loading…" : `${pagination.total} changes`}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50/60 border-b border-gray-100">
                    <th className="px-5 py-3 text-left font-medium">When</th>
                    <th className="px-5 py-3 text-left font-medium">User</th>
                    <th className="px-5 py-3 text-left font-medium">Entity</th>
                    <th className="px-5 py-3 text-left font-medium">Field</th>
                    <th className="px-5 py-3 text-left font-medium">Change</th>
                    <th className="px-5 py-3 text-left font-medium hidden lg:table-cell">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-300 text-sm">Loading...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-300 text-sm">No activity found</td></tr>
                  ) : (
                    rows.map((row) => {
                      const entityMeta = ENTITY_TYPE_META[row.entity_type] ?? { label: row.entity_type, cls: "bg-gray-100 text-gray-500" };
                      const sourceMeta = SOURCE_META[row.source] ?? SOURCE_META.platform;
                      const SourceIcon = sourceMeta.icon;
                      return (
                        <tr key={row.id} className="hover:bg-gray-50/50 transition-colors align-top">
                          <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{fmtDateTime(row.changed_at)}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#031634]/8 text-[#031634]">
                              {row.changed_by}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entityMeta.cls}`}>
                              {entityMeta.label}
                            </span>
                            <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[160px]">
                              {row.entity_label ?? "—"}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <code className="text-[10px] text-gray-300 font-mono" title={row.entity_id}>
                                {row.entity_id.slice(0, 8)}
                              </code>
                              <button
                                onClick={() => copyId(row.entity_id)}
                                title={`Copy full id: ${row.entity_id}`}
                                className="text-gray-300 hover:text-gray-600 transition-colors"
                              >
                                {copiedId === row.entity_id ? (
                                  <Check size={10} className="text-emerald-500" />
                                ) : (
                                  <Copy size={10} />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-gray-700 font-medium">{fieldLabel(row.changed_field)}</td>
                          <td className="px-5 py-3.5 text-gray-600 max-w-xs">
                            <HistoryValueDiff
                              field={row.changed_field}
                              oldValue={row.old_value}
                              newValue={row.new_value}
                            />
                            {row.reason && <p className="text-[11px] text-gray-400 italic mt-0.5">{row.reason}</p>}
                          </td>
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md ${sourceMeta.cls}`}>
                              <SourceIcon size={10} /> {sourceMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="px-4 sm:px-5 py-3 border-t border-gray-50 flex items-center justify-between text-sm">
                <span className="text-gray-400 text-xs">{pagination.total} total</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-navy disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2 text-gray-600">{page} / {pagination.pages}</span>
                  <button
                    disabled={page >= pagination.pages}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-navy disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </RequireAdmin>
  );
}
