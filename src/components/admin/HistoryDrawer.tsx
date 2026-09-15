/**
 * LAB418 (T9) — slide-in panel showing the change log of one record
 * (appointment / client / invoice / employee), reading
 * GET /api/admin/history?entity_type=&entity_id= (backend: historyController.js).
 *
 * Always renders through a portal to document.body with the `admin-scope`
 * class on its own root — same reasoning as EventDetailPopover in
 * AdminCalendarPage: some callers (that popover) are themselves portaled
 * and only ~320px wide, so this can't assume it's nesting inside an
 * already-scoped, full-size container. Self-contained, works from any caller.
 *
 * Usage:
 *   {showHistory && (
 *     <HistoryDrawer
 *       entityType="appointment"
 *       entityId={appointment.id}
 *       title={appointment.summary}
 *       onClose={() => setShowHistory(false)}
 *     />
 *   )}
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import { X, History as HistoryIcon, AlertCircle } from "lucide-react";
import { api } from "../../api/client";
import HistoryValueDiff from "./HistoryValueDiff";
import {
  type HistoryEntityType,
  type HistoryRow,
  type HistoryResponse,
  VAN,
  fieldLabel,
  SOURCE_META,
  dayLabel,
} from "../../lib/historyFormat";

interface HistoryDrawerProps {
  entityType: HistoryEntityType;
  /**
   * Supabase uuid of the record. Se omite para `setting` (no tiene id propio —
   * todas sus filas comparten un id global) → el drawer muestra TODO el
   * historial de settings.
   */
  entityId?: string;
  /** Shown in the header — e.g. the client's name or the event summary. */
  title: string;
  onClose: () => void;
}

export default function HistoryDrawer({
  entityType,
  entityId,
  title,
  onClose,
}: HistoryDrawerProps) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const params = new URLSearchParams({ entity_type: entityType, limit: "100" });
    if (entityId) params.set("entity_id", entityId);
    api<HistoryResponse>(`/api/admin/history?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setRows(data.history);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message ?? "Failed to load history");
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups: { label: string; rows: HistoryRow[] }[] = [];
  for (const row of rows ?? []) {
    const label = dayLabel(row.changed_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  return createPortal(
    <div
      className="admin-scope fixed inset-0 z-[95] flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white h-full w-full max-w-md shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0 bg-[#031634] text-white">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <HistoryIcon size={12} /> History
            </p>
            <h2 className="text-lg font-bold font-montserrat truncate">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertCircle size={12} /> {error}
            </p>
          ) : rows === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No changes recorded yet.</p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.label}>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    {group.label}
                  </h3>
                  <div className="space-y-2">
                    {group.rows.map((row) => {
                      const meta = SOURCE_META[row.source] ?? SOURCE_META.platform;
                      const Icon = meta.icon;
                      return (
                        <div key={row.id} className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-semibold text-[#031634]">
                              {fieldLabel(row.changed_field)}
                            </p>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">
                              {DateTime.fromISO(row.changed_at, { zone: "utc" })
                                .setZone(VAN)
                                .toFormat("h:mm a")}
                            </span>
                          </div>
                          <HistoryValueDiff
                            field={row.changed_field}
                            oldValue={row.old_value}
                            newValue={row.new_value}
                            className="text-xs text-gray-600"
                          />
                          {row.reason && (
                            <p className="text-[11px] text-gray-400 italic">{row.reason}</p>
                          )}
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md bg-[#031634]/8 text-[#031634]">
                              {row.changed_by}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md ${meta.cls}`}
                            >
                              <Icon size={10} /> {meta.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
