/**
 * LAB418 (T9) — formatting shared between HistoryDrawer (one record's log)
 * and AdminActivityPage (the global feed). Both read the same
 * GET /api/admin/history shape; keeping the label/value formatting in one
 * place avoids the two views drifting apart.
 */

import { DateTime } from "luxon";
import { User, RefreshCw, Globe, Clock as ClockIcon } from "lucide-react";
import { htmlToPlainText } from "./htmlToPlainText";

export type HistoryEntityType = "appointment" | "client" | "invoice" | "employee" | "payment" | "setting";

export interface HistoryRow {
  id: string;
  entity_type: string;
  entity_id: string;
  /**
   * Human-readable name of the record (client name, event title, invoice
   * doc #, employee name), resolved server-side — see
   * historyController.js#attachEntityLabels. Null when the lookup failed
   * (entity was hard-deleted, or entity_type has no resolver yet).
   */
  entity_label: string | null;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  source: string;
  reason: string | null;
  changed_at: string;
}

export interface HistoryResponse {
  ok: boolean;
  history: HistoryRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export const VAN = "America/Vancouver";

// Usuarios del panel — debe reflejar TEST_USERS en adminAuthRoutes.js (backend).
// No hay endpoint para listarlos dinámicamente; es una lista chica y estable.
export const KNOWN_ACTORS = [
  "jhony", "jony1", "yudith1", "javier1", "clara", "tech",
];
export const KNOWN_SYSTEM_ACTORS = ["cron", "system", "client"];

export const ENTITY_TYPES: { value: HistoryEntityType; label: string }[] = [
  { value: "appointment", label: "Appointment" },
  { value: "client", label: "Client" },
  { value: "invoice", label: "Invoice" },
  { value: "employee", label: "Employee" },
  { value: "payment", label: "Payment" },
  { value: "setting", label: "Settings" },
];

export const SOURCES: { value: string; label: string }[] = [
  { value: "platform", label: "Panel" },
  { value: "cron", label: "Scheduled job" },
  { value: "public", label: "Client-facing" },
];

// ── Field labels ──────────────────────────────────────────────────────────────
// Falls back to a humanized version of the raw snake_case field for anything
// not listed here, so a new audited field never shows up blank.
const FIELD_LABELS: Record<string, string> = {
  starts_at: "Start time",
  ends_at: "End time",
  scheduled_start_time: "Start time",
  scheduled_end_time: "End time",
  scheduled_date: "Date",
  status: "Status",
  service_type: "Service type",
  property_address: "Address",
  default_address: "Address",
  special_instructions: "Notes",
  notes: "Notes",
  team: "Team",
  created: "Created",
  deleted: "Deleted",
  client_id: "Client",
  is_active: "Active",
  is_locked: "Locked",
  is_recurring: "Recurring",
  is_team_leader: "Team leader",
  has_license: "Has license",
  line_items: "Line items",
  total_amount: "Total",
  due_date: "Due date",
  hire_date: "Hire date",
  hourly_work_rate: "Work rate",
  hourly_travel_rate: "Travel rate",
  e_transfer_email: "e-Transfer email",
  zip_code: "ZIP code",
  preferred_time: "Preferred time",
  expected_frequency: "Frequency",
  postponed_until: "Postponed until",
  transfer_sender_aliases: "e-Transfer aliases",
};

export function fieldLabel(field: string): string {
  return (
    FIELD_LABELS[field] ??
    field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

const TIMESTAMP_FIELDS = new Set(["starts_at", "ends_at", "due_date", "hire_date", "postponed_until"]);
const TIME_ONLY_FIELDS = new Set(["scheduled_start_time", "scheduled_end_time"]);

export function fmtValue(field: string, raw: string | null): string {
  if (raw == null || raw === "") return "—";
  if (TIMESTAMP_FIELDS.has(field)) {
    const dt = DateTime.fromISO(raw, { zone: "utc" }).setZone(VAN);
    if (dt.isValid) return dt.toFormat("MMM d, yyyy 'at' h:mm a");
  }
  if (TIME_ONLY_FIELDS.has(field)) return raw.slice(0, 5);
  // special_instructions/notes can be raw HTML (events created via Zoho/GCal
  // integrations) — htmlToPlainText is a no-op on already-plain values.
  return htmlToPlainText(raw);
}

// ── Truncation for long values (notes, line_items JSON, …) ─────────────────────
export const TRUNCATE_AT = 140;

export function isLongValue(text: string): boolean {
  return text.length > TRUNCATE_AT || text.includes("\n");
}

export function truncateValue(text: string): string {
  const firstLine = text.split("\n")[0];
  const cut = firstLine.length > TRUNCATE_AT ? firstLine.slice(0, TRUNCATE_AT) : firstLine;
  return cut.length < text.length ? `${cut}…` : cut;
}

// ── Source badge ──────────────────────────────────────────────────────────────
export const SOURCE_META: Record<string, { label: string; icon: typeof User; cls: string }> = {
  platform: { label: "Panel", icon: User, cls: "bg-blue-50 text-blue-600" },
  gcal_sync: { label: "GCal sync", icon: RefreshCw, cls: "bg-gray-100 text-gray-500" },
  quickbooks_sync: { label: "QuickBooks", icon: RefreshCw, cls: "bg-gray-100 text-gray-500" },
  cron: { label: "Scheduled job", icon: ClockIcon, cls: "bg-gray-100 text-gray-500" },
  public: { label: "Client", icon: Globe, cls: "bg-purple-50 text-purple-600" },
};

// ── Entity type badge ──────────────────────────────────────────────────────────
export const ENTITY_TYPE_META: Record<string, { label: string; cls: string }> = {
  appointment: { label: "Appointment", cls: "bg-emerald-50 text-emerald-700" },
  client: { label: "Client", cls: "bg-blue-50 text-blue-700" },
  invoice: { label: "Invoice", cls: "bg-amber-50 text-amber-700" },
  employee: { label: "Employee", cls: "bg-violet-50 text-violet-700" },
  payment: { label: "Payment", cls: "bg-teal-50 text-teal-700" },
  setting: { label: "Setting", cls: "bg-gray-100 text-gray-600" },
};

// ── Day grouping (HistoryDrawer) ────────────────────────────────────────────────
export function dayLabel(iso: string): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(VAN).startOf("day");
  const today = DateTime.now().setZone(VAN).startOf("day");
  const diffDays = today.diff(dt, "days").days;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return dt.toFormat("EEEE, MMM d, yyyy");
}

// ── Compact date+time (AdminActivityPage rows) ──────────────────────────────────
export function fmtDateTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(VAN).toFormat("MMM d, h:mm a");
}
