// pages/admin/AdminClientsPage.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  Users, Plus, Search, X, ChevronLeft, ChevronRight,
  Phone, Mail, MapPin, Pencil, Trash2, Tag, Loader2,
  AlertCircle, Clock, RefreshCw, ExternalLink,
  CalendarPlus, CheckCircle2, DollarSign, ClipboardList,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import AdminNavbar from "../components/admin/AdminNavbar";
import RequireAdmin from "../components/admin/RequireAdmin";
import {
  ClientFormModal,
  clientDisplayName,
  type Client,
} from "../components/admin/ClientFormModal";


interface Pagination { page: number; pages: number; total: number; limit: number; }

interface AppointmentTeamMember {
  role: "leader" | "member" | string;
  employee: { id: string; name: string; is_team_leader: boolean | null } | null;
}

interface Appointment {
  id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: string;
  service_type: string | null;
  value: number | null;
  property_address: string | null;
  actual_hours: number | null;
  estimated_hours: number | null;
  google_calendar_event_id: string | null;
  teams?: AppointmentTeamMember[];
}

interface ClientHistoryResponse {
  appointments: Appointment[];
  stats: { totalServices: number; estimatedSpend: number; completedCount: number };
}

interface Invoice {
  id: string;
  doc_number: string | null;
  total_amount: number | null;
  balance: number | null;
  status: string;
  issued_date: string | null;
  due_date: string | null;
  quickbooks_invoice_id: string | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  status: string;
  quickbooks_payment_id: string | null;
}

interface PendingReviewItem {
  id: string;
  payment_id: string;
  invoice_id: string | null;
  amount: number;
  note: string | null;
  created_at: string;
  payments: { payment_date: string; amount: number; quickbooks_customer_name: string | null } | null;
}

interface OpenInvoiceOption {
  id: string;
  doc_number: string | null;
  quickbooks_invoice_id: string | null;
  total_amount: number;
  due_date: string | null;
}

interface ClientBillingResponse {
  ok: boolean;
  invoices: Invoice[];
  payments: Payment[];
  stats: { totalBilled: number; totalPaid: number; balance: number } | null;
}

interface ListClientsResponse {
  clients: Client[];
  pagination: Pagination;
  status_counts: { active: number; at_risk: number; inactive: number };
  billing_counts: { up_to_date: number; balance_due: number; credit: number; no_billing: number };
  service_types: string[];
}

// ── API ───────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function authHeaders() {
  const token = localStorage.getItem("admin_blog_token") ?? "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  // lowercase (new records created via dashboard)
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  at_risk: { label: "At risk", cls: "bg-amber-50 text-amber-700" },
  inactive: { label: "Inactive", cls: "bg-red-50 text-red-600" },
  // Capitalised variants imported from Zoho
  Active: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  "At risk": { label: "At risk", cls: "bg-amber-50 text-amber-700" },
  Inactive: { label: "Inactive", cls: "bg-red-50 text-red-600" },
};

function StatusBadge({ status }: { status: string | null }) {
  const meta = STATUS_META[status ?? ""] ?? { label: status ?? "—", cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ── ClientDrawer ──────────────────────────────────────────────────────────────

const APPT_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-gray-100 text-gray-500" },
  confirmed: { label: "Confirmed", cls: "bg-blue-50 text-blue-600" },
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-500" },
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700" },
};

const INVOICE_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-gray-100 text-gray-500" },
  published: { label: "Sent", cls: "bg-blue-50 text-blue-600" },
  sent: { label: "Sent", cls: "bg-blue-50 text-blue-600" },
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700" },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-500" },
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  "quickbooks payments-credit card": "Credit Card",
  "quickbooks payments - credit card": "Credit Card",
  "credit card": "Credit Card",
  "e-transfer": "e-Transfer",
  "e-transfer (interac)": "e-Transfer",
};

function normalizePaymentMethod(raw: string | null): string {
  if (!raw) return "—";
  return PAYMENT_METHOD_LABEL[raw.toLowerCase()] ?? raw;
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-CA", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function PendingReviewRow({
  item, clientId, isResolving, onToggle, onResolved,
}: {
  item: PendingReviewItem;
  clientId: string;
  isResolving: boolean;
  onToggle: () => void;
  onResolved: (wasInvoicePayment: boolean) => void;
}) {
  const [mode, setMode] = useState<"choose" | "invoice">("choose");
  const [invoices, setInvoices] = useState<OpenInvoiceOption[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<
    | { allocation_type: "tip" | "credit_balance" }
    | { allocation_type: "invoice_payment"; invoice: OpenInvoiceOption }
    | null
  >(null);

  useEffect(() => {
    if (!isResolving || mode !== "invoice") return;
    setLoadingInvoices(true);
    apiFetch<{ ok: boolean; items: OpenInvoiceOption[] }>(`/api/admin/clients/${clientId}/open-invoices`)
      .then(data => setInvoices(data.items ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setLoadingInvoices(false));
  }, [isResolving, mode, clientId]);

  async function resolve(allocation_type: "tip" | "credit_balance" | "invoice_payment", invoice_id?: string) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/payments/allocations/${item.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ allocation_type, invoice_id }),
      });
      onResolved(allocation_type === "invoice_payment");
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-amber-200/60">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{item.note ?? "Pending classification"}</p>
          <p className="text-[11px] text-gray-400">
            {item.payments?.payment_date ? formatDate(item.payments.payment_date) : "—"}
          </p>
        </div>
        <span className="text-xs font-bold text-amber-600 flex-shrink-0">${item.amount.toFixed(2)}</span>
      </button>

      {isResolving && (
        <div className="px-3 pb-3 pt-1 border-t border-amber-100 space-y-2">
          {error && <p className="text-[11px] text-red-500">{error}</p>}

          {mode === "choose" && !pendingChoice ? (
            <div className="space-y-1.5">
              <button onClick={() => setPendingChoice({ allocation_type: "tip" })}
                className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-emerald-50 hover:border-emerald-300">
                It's a tip
              </button>
              <button onClick={() => setPendingChoice({ allocation_type: "credit_balance" })}
                className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300">
                Credit balance
              </button>
              <button onClick={() => setMode("invoice")}
                className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300">
                Apply to an invoice
              </button>
            </div>
          ) : mode === "invoice" && !pendingChoice ? (
            <div className="space-y-1.5">
              <button onClick={() => setMode("choose")} className="text-[11px] text-gray-400 hover:text-gray-600">← Back</button>
              {loadingInvoices ? (
                <p className="text-xs text-gray-300 text-center py-3">Loading...</p>
              ) : invoices.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">No open invoices</p>
              ) : invoices.map(inv => (
                <button
                  key={inv.id}
                  onClick={() => setPendingChoice({ allocation_type: "invoice_payment", invoice: inv })}
                  className="w-full flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300"
                >
                  <span>#{inv.doc_number ?? inv.quickbooks_invoice_id ?? "Invoice"}</span>
                  <span>${inv.total_amount.toFixed(2)}</span>
                </button>
              ))}
            </div>
          ) : pendingChoice ? (
            <div className="rounded-lg border border-navy/20 bg-navy/5 px-2.5 py-2.5 space-y-2">
              <p className="text-xs font-semibold text-[#031634]">Confirm this action?</p>
              <p className="text-[11px] text-gray-600">
                {pendingChoice.allocation_type === "tip" && `Mark $${item.amount.toFixed(2)} as a tip.`}
                {pendingChoice.allocation_type === "credit_balance" && `Keep $${item.amount.toFixed(2)} as credit balance.`}
                {pendingChoice.allocation_type === "invoice_payment" &&
                  `Apply $${item.amount.toFixed(2)} to invoice #${pendingChoice.invoice.doc_number ?? pendingChoice.invoice.quickbooks_invoice_id}.`}
              </p>
              <div className="flex gap-1.5">
                <button disabled={submitting} onClick={() => setPendingChoice(null)}
                  className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  onClick={() =>
                    pendingChoice.allocation_type === "invoice_payment"
                      ? resolve("invoice_payment", pendingChoice.invoice.id)
                      : resolve(pendingChoice.allocation_type)
                  }
                  className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-[#031634] text-white hover:bg-[#031634]/90 disabled:opacity-50"
                >
                  {submitting ? "Applying..." : "Confirm"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

async function downloadClientExport(
  clientId: string,
  clientName: string,
  format: "xlsx" | "pdf",
) {
  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/api/admin/clients/${clientId}/export?format=${format}`,
      { headers: authHeaders() },
    );
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Export failed (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error("The server returned an empty file.");
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${clientName.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_billing.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ClientDrawer({
  client, onClose, onEdit, onDeleted, onSchedule, onUpdated, scrollToMessage = false, onExport,
  exportingKey,
}: {
  client: Client;
  onClose: () => void;
  onEdit: (c: Client) => void;
  onDeleted: (id: string) => void;
  onSchedule: (c: Client) => void;
  onUpdated?: (c: Client) => void;
  scrollToMessage?: boolean;
  onExport: (clientId: string, clientName: string, format: "xlsx" | "pdf") => void;
  exportingKey: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  // Local state for optimistic updates (e.g. toggling tags without closing the drawer)
  const [localClient, setLocalClient] = useState<Client>(client);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  // History state
  const [history, setHistory] = useState<Appointment[]>([]);
  const [stats, setStats] = useState<ClientHistoryResponse["stats"] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    apiFetch<ClientHistoryResponse>(`/api/admin/clients/${client.id}/appointments`)
      .then(data => {
        if (cancelled) return;
        setHistory(data.appointments);
        setStats(data.stats);
      })
      .catch(e => { if (!cancelled) setHistoryError(e.message); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [client.id]);

  // Billing state
  const [billing, setBilling] = useState<ClientBillingResponse | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Pending review state
  const [pendingReview, setPendingReview] = useState<PendingReviewItem[]>([]);
  const [pendingReviewLoading, setPendingReviewLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [billingRefreshKey, setBillingRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBillingLoading(true);
    setBillingError(null);
    apiFetch<ClientBillingResponse>(`/api/admin/clients/${client.id}/billing`)
      .then(data => { if (!cancelled) setBilling(data); })
      .catch(e => { if (!cancelled) setBillingError(e.message); })
      .finally(() => { if (!cancelled) setBillingLoading(false); });
    return () => { cancelled = true; };
  }, [client.id, billingRefreshKey]);


  useEffect(() => {
    let cancelled = false;
    setPendingReviewLoading(true);
    apiFetch<{ ok: boolean; items: PendingReviewItem[] }>(`/api/admin/clients/${client.id}/pending-review`)
      .then(data => { if (!cancelled) setPendingReview(data.items ?? []); })
      .catch(() => { if (!cancelled) setPendingReview([]); })
      .finally(() => { if (!cancelled) setPendingReviewLoading(false); });
    return () => { cancelled = true; };
  }, [client.id]);

  // Scroll to suggested message section when opened from "Contact" button
  useEffect(() => {
    if (!scrollToMessage) return;
    const timeout = setTimeout(() => {
      messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150); // small delay so the drawer finishes rendering first
    return () => clearTimeout(timeout);
  }, [scrollToMessage]);

  const days = daysSince(localClient.last_activity_at);
  const name = clientDisplayName(localClient);
  const isAtRisk = localClient.status === "at_risk" || localClient.status === "inactive";
  const isNoRecontratar = localClient.tags?.includes("Do Not Rehire") ?? false;
  const message = `Hi ${localClient.first_name ?? name}, it's been ${days ?? "a while"} days since your last service with Demo Cleaning Co.. We'd love to schedule your next appointment — reply here or call us anytime! 🧹`;

  async function toggleNoRecontratar() {
    const currentTags = localClient.tags ?? [];
    const newTags = isNoRecontratar
      ? currentTags.filter(t => t !== "Do Not Rehire")
      : [...currentTags, "Do Not Rehire"];
    // Optimistic update
    setLocalClient(prev => ({ ...prev, tags: newTags }));
    try {
      const result = await apiFetch<{ client: Client }>(
        `/api/admin/clients/${localClient.id}`,
        { method: "PATCH", body: JSON.stringify({ tags: newTags }) }
      );
      setLocalClient(result.client);
      onUpdated?.(result.client);
    } catch (e: any) {
      // Revert on failure
      setLocalClient(prev => ({ ...prev, tags: currentTags }));
      alert(`Error: ${e.message}`);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/clients/${localClient.id}`, { method: "DELETE" });
      onDeleted(localClient.id);
      onClose();
    } catch (e: any) { alert(`Failed to delete: ${e.message}`); setDeleting(false); }
  }

  function copyMessage() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div ref={ref} className="bg-white h-full w-full max-w-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0 bg-[#031634] text-white">
          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Client</p>
            <h2 className="text-lg font-bold font-montserrat">{name}</h2>
            {localClient.status && (
              <span className={`inline-flex items-center text-xs font-semibold mt-1.5 px-2.5 py-0.5 rounded-full
                ${localClient.status === "active" ? "bg-emerald-500/20 text-emerald-300"
                  : localClient.status === "at_risk" ? "bg-amber-400/20 text-amber-300"
                    : "bg-red-400/20 text-red-300"}`}>
                {STATUS_META[localClient.status]?.label ?? localClient.status}
              </span>
            )}
            {/* Badge prominente si está marcado */}
            {isNoRecontratar && (
              <div className="mt-2 inline-flex items-center gap-1.5 bg-red-500/30 border border-red-400/40 text-red-200 text-xs font-bold px-2.5 py-1 rounded-lg">
                <AlertCircle size={12} /> DO NOT REHIRE
              </div>
            )}
            {/* Toggle button — always visible */}
            <div className="mt-2">
              <button
                onClick={toggleNoRecontratar}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${isNoRecontratar
                  ? "bg-red-500/20 border-red-400/40 text-red-300 hover:bg-red-500/30"
                  : "bg-white/10 border-white/20 text-white/60 hover:bg-white/20 hover:text-white"
                  }`}>
                <Tag size={11} />
                {isNoRecontratar ? "Remove flag" : "Mark Do Not Rehire"}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Stats cards */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Overview</h3>
            {stats ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <ClipboardList size={14} className="text-gray-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-[#031634]">{stats.totalServices}</p>
                  <p className="text-xs text-gray-400">Services</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <CheckCircle2 size={14} className="text-emerald-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-[#031634]">{stats.completedCount}</p>
                  <p className="text-xs text-gray-400">Completed</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <DollarSign size={14} className="text-gray-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-[#031634]">
                    ${stats.estimatedSpend > 0 ? stats.estimatedSpend.toFixed(0) : "—"}
                  </p>
                  <p className="text-xs text-gray-400">Est. spend</p>
                </div>
              </div>
            ) : historyLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 h-20 animate-pulse" />
                ))}
              </div>
            ) : null}

            {/* Last service + service type inline */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">Last service</p>
                <p className="text-sm font-semibold text-[#031634]">
                  {days !== null ? `${days}d ago` : "—"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-0.5">Rate</p>
                <p className="text-sm font-semibold text-[#031634]">
                  {client.rate != null ? `$${Number(client.rate).toFixed(2)}/hr` : "—"}
                </p>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Contact</h3>
            <div className="space-y-2">
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-[#031634] group">
                  <Mail size={14} className="text-gray-400 group-hover:text-[#031634] flex-shrink-0" />
                  <span className="truncate">{client.email}</span>
                </a>
              )}
              {(client.mobile || client.phone) && (
                <a href={`tel:${client.mobile ?? client.phone}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-[#031634] group">
                  <Phone size={14} className="text-gray-400 group-hover:text-[#031634] flex-shrink-0" />
                  <span>{client.mobile ?? client.phone}</span>
                </a>
              )}
              {client.default_address && (
                <div className="flex items-start gap-2.5 text-sm text-gray-700">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <span>{client.default_address}{client.city ? `, ${client.city}` : ""}{client.state ? ` ${client.state}` : ""}</span>
                </div>
              )}
            </div>
          </section>

          {/* Service history */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Last 10 services
            </h3>
            {historyLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : historyError ? (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <AlertCircle size={12} /> {historyError}
              </p>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No services recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(appt => {
                  const meta = APPT_STATUS_META[appt.status] ?? { label: appt.status, cls: "bg-gray-100 text-gray-500" };
                  const teamMembers = (appt.teams ?? [])
                    .filter(t => t.employee)
                    .sort((a, _b) => (a.role === "leader" ? -1 : 1));
                  return (
                    <div key={appt.id} className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#031634]">
                            {formatDate(appt.scheduled_date)}
                          </p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {appt.service_type ?? "Cleaning"} · {appt.scheduled_start_time?.slice(0, 5)}–{appt.scheduled_end_time?.slice(0, 5)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>
                            {meta.label}
                          </span>
                          {appt.value != null && (
                            <span className="text-xs text-gray-400">${appt.value.toFixed(0)}</span>
                          )}
                        </div>
                      </div>
                      {teamMembers.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          <Users size={10} className="text-gray-300 flex-shrink-0" />
                          {teamMembers.map((t, _i) => (
                            <span key={t.employee!.id}
                              className={`text-xs px-1.5 py-0.5 rounded-md ${t.role === "leader" ? "bg-[#031634]/8 text-[#031634] font-semibold" : "bg-gray-100 text-gray-500"}`}>
                              {t.employee!.name.split(" ")[0]}
                              {t.role === "leader" && <span className="ml-0.5 text-[10px] opacity-60">★</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Billing history */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Invoices & Payments
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onExport(client.id, clientDisplayName(client), "xlsx")}
                  disabled={exportingKey === `${client.id}:xlsx`}
                  title="Export XLSX"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
                  {exportingKey === `${client.id}:xlsx`
                    ? <Loader2 size={14} className="animate-spin" />
                    : <FileSpreadsheet size={14} />}
                </button>
                <button
                  onClick={() => onExport(client.id, clientDisplayName(client), "pdf")}
                  disabled={exportingKey === `${client.id}:pdf`}
                  title="Export PDF"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
                  {exportingKey === `${client.id}:pdf`
                    ? <Loader2 size={14} className="animate-spin" />
                    : <FileText size={14} />}
                </button>
              </div>
            </div>

            {/* Stats row */}
            {billingLoading ? (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[0, 1, 2].map(i => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 h-16 animate-pulse" />
                ))}
              </div>
            ) : billingError ? (
              <p className="text-xs text-red-400 flex items-center gap-1.5 mb-3">
                <AlertCircle size={12} /> {billingError}
              </p>
            ) : billing?.stats ? (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-[#031634]">
                    ${billing.stats.totalBilled.toFixed(0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Billed</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-emerald-600">
                    ${billing.stats.totalPaid.toFixed(0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Paid</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className={`text-sm font-bold ${billing.stats.balance > 0 ? "text-red-500" : "text-gray-400"}`}>
                    ${billing.stats.balance.toFixed(0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Balance</p>
                </div>
              </div>
            ) : null}

            {/* Pending review alert */}
            {!pendingReviewLoading && pendingReview.length > 0 && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertCircle size={13} className="text-amber-500" />
                  <p className="text-xs font-bold text-amber-700">
                    {pendingReview.length} payment{pendingReview.length > 1 ? "s" : ""} need review
                  </p>
                </div>
                <div className="space-y-2">
                  {pendingReview.map(item => (
                    <PendingReviewRow
                      key={item.id}
                      item={item}
                      clientId={client.id}
                      isResolving={resolvingId === item.id}
                      onToggle={() => setResolvingId(resolvingId === item.id ? null : item.id)}
                      onResolved={(wasInvoicePayment) => {
                        setPendingReview(prev => prev.filter(p => p.id !== item.id));
                        setResolvingId(null);
                        if (wasInvoicePayment) setBillingRefreshKey(k => k + 1);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Invoices */}
            {!billingLoading && (billing?.invoices ?? []).length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-400 mb-2">Invoices</p>
                <div className="space-y-1.5">
                  {billing!.invoices.map(inv => {
                    const meta = INVOICE_STATUS_META[inv.status] ?? { label: inv.status, cls: "bg-gray-100 text-gray-500" };
                    return (
                      <div key={inv.id} className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#031634]">
                            #{inv.doc_number ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {inv.issued_date ?? "—"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>
                            {meta.label}
                          </span>
                          <span className="text-xs text-gray-500">
                            ${Number(inv.total_amount ?? 0).toFixed(2)}
                            {inv.balance != null && inv.balance > 0 && (
                              <span className="text-red-400 ml-1">(${Number(inv.balance).toFixed(2)} due)</span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}



            {/* Payments */}
            {!billingLoading && (billing?.payments ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 mb-2">Payments</p>
                <div className="space-y-1.5">
                  {billing!.payments.filter(pay => pay.amount > 0).map(pay => (
                    <div key={pay.id} className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#031634]">
                          {normalizePaymentMethod(pay.payment_method)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{pay.payment_date}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-xs font-semibold text-emerald-600">
                          ${Number(pay.amount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!billingLoading && !billingError && (billing?.invoices ?? []).length === 0 && (billing?.payments ?? []).length === 0 && (
              <p className="text-sm text-gray-400 italic">No billing records found.</p>
            )}
          </section>



          {/* Tags */}
          {localClient.tags && localClient.tags.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {localClient.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#031634]/8 text-[#031634] font-medium">
                    <Tag size={10} /> {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          {localClient.notes && (
            <section>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Notes</h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{localClient.notes}</p>
            </section>
          )}

          {/* Suggested message — only for at_risk / inactive */}
          {isAtRisk && (
            <section ref={messageRef}>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Suggested message</h3>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
                <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
                <button onClick={copyMessage}
                  className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors">
                  {copied ? "✓ Copied!" : "Copy message"}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2 flex-shrink-0">
          {/* Schedule button — primary CTA */}
          <button onClick={() => onSchedule(localClient)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold bg-[#031634] text-white rounded-xl hover:bg-[#031634]/90 transition-colors">
            <CalendarPlus size={14} /> Schedule service
          </button>

          <button onClick={() => onEdit(localClient)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
            <Pencil size={13} />
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-2 text-sm font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : "Confirm"}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="px-2 py-2 text-sm border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50 transition-colors">
                No
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center py-2 px-3 border border-red-100 text-red-400 rounded-xl hover:bg-red-50 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "at_risk", label: "At risk" },
  { value: "inactive", label: "Inactive" },
];

export default function AdminClientsPage() {
  const location = useLocation();
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: 25 });
  const [statusCounts, setStatusCounts] = useState({ active: 0, at_risk: 0, inactive: 0 });
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [billingFilter, setBillingFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [page, setPage] = useState(1);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [schedulingClient, setSchedulingClient] = useState<Client | null>(null);
  const [openedFromContact, setOpenedFromContact] = useState(false);

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Export state — `exportingKey` tracks which client+format is in flight
  // (shared between the table rows and the drawer, since both can trigger it).
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport(clientId: string, clientName: string, format: "xlsx" | "pdf") {
    const key = `${clientId}:${format}`;
    setExportingKey(key);
    setExportError(null);
    try {
      await downloadClientExport(clientId, clientName, format);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed. Please try again.");
    } finally {
      setExportingKey(null);
    }
  }

  // ── Pre-select client and status filter from query params (e.g. from dashboard "Contact" link) ──
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    const initStatus = params.get('status');
    if (initStatus) {
      setStatusFilter(initStatus);
      setPage(1);
      load(search, initStatus, serviceTypeFilter, 1);
    }
    if (openId) {
      apiFetch<{ client: Client }>(`/api/admin/clients/${openId}`)
        .then(r => { setSelectedClient(r.client); setOpenedFromContact(true); })
        .catch(() => { });
    }
  }, []); // only on mount

  const load = useCallback(async (q = search, st = statusFilter, stype = serviceTypeFilter, pg = page, billing = billingFilter) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: "25" });
      if (q.trim()) params.set("search", q.trim());
      if (st) params.set("status", st);
      if (stype) params.set("service_type", stype);
      if (billing) params.set("billing_status", billing);
      const data = await apiFetch<ListClientsResponse>(`/api/admin/clients?${params}`);
      setClients(data.clients);
      setPagination(data.pagination);
      setStatusCounts(data.status_counts ?? { active: 0, at_risk: 0, inactive: 0 });
      // Only overwrite serviceTypes on the first load (no filters) so chips don't disappear when filtering
      if (!st && !stype && !q.trim()) setServiceTypes(data.service_types ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, statusFilter, serviceTypeFilter, billingFilter, page]);

  useEffect(() => { load(); }, [load]);

  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => { setPage(1); load(v, statusFilter, serviceTypeFilter, 1); }, 350);
  }

  function handleStatusFilter(v: string) {
    setStatusFilter(v); setPage(1); load(search, v, serviceTypeFilter, 1);
  }

  function handleServiceTypeFilter(v: string) {
    setServiceTypeFilter(v); setPage(1); load(search, statusFilter, v, 1);
  }

  function handleBillingFilter(v: string) {
    setBillingFilter(v); setPage(1); load(search, statusFilter, serviceTypeFilter, 1, v);
  }

  function handlePageChange(p: number) {
    setPage(p); load(search, statusFilter, serviceTypeFilter, p);
  }

  function handleClientSaved(saved: Client) {
    setClients(prev => {
      const i = prev.findIndex(c => c.id === saved.id);
      if (i >= 0) { const n = [...prev]; n[i] = saved; return n; }
      return [saved, ...prev];
    });
    setEditingClient(null);
    setCreatingNew(false);
    if (selectedClient?.id === saved.id) setSelectedClient(saved);
  }

  function handleClientDeleted(id: string) {
    setClients(prev => prev.filter(c => c.id !== id));
    if (selectedClient?.id === id) setSelectedClient(null);
  }

  // Client-side tag filter (works within the current page of 25 results)
  const displayedClients = tagFilter
    ? clients.filter(c => c.tags?.includes(tagFilter))
    : clients;
  const noRecontratarCount = clients.filter(c => c.tags?.includes("Do Not Rehire")).length;

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50">

        {/* Shared admin navbar */}
        <AdminNavbar
          title="Clients"
          onRefresh={() => load()}
          refreshing={loading}
          rightSlot={
            <button
              onClick={() => setCreatingNew(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-navy text-xs font-semibold rounded-lg hover:bg-white/90 transition-colors"
            >
              <Plus size={13} /> New client
            </button>
          }
        />

        {/* Status counters strip */}
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-400">{pagination.total} total</span>
              {statusCounts.active > 0 && <span className="font-semibold text-emerald-600">{statusCounts.active} active</span>}
              {statusCounts.at_risk > 0 && <span className="font-semibold text-amber-500">{statusCounts.at_risk} at risk</span>}
              {statusCounts.inactive > 0 && <span className="font-semibold text-red-400">{statusCounts.inactive} inactive</span>}
              {noRecontratarCount > 0 && (
                <span className="font-semibold text-red-600 flex items-center gap-0.5">
                  <AlertCircle size={10} /> {noRecontratarCount} do not rehire
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Filters bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text" value={search} onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search by name, email, phone…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#031634]/20 focus:border-[#031634] transition-all"
                />
                {search && (
                  <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Status chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {STATUS_FILTERS.map(f => (
                  <button key={f.value} onClick={() => handleStatusFilter(f.value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${statusFilter === f.value ? "bg-[#031634] text-white" : "text-gray-500 hover:bg-gray-100"
                      }`}>
                    {f.label}
                  </button>
                ))}
                {/* Tag filter chip */}
                <button
                  onClick={() => setTagFilter(prev => prev === "Do Not Rehire" ? "" : "Do Not Rehire")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${tagFilter === "Do Not Rehire"
                    ? "bg-red-600 text-white"
                    : "text-red-500 bg-red-50 hover:bg-red-100"
                    }`}>
                  <AlertCircle size={11} /> Do Not Rehire
                </button>
              </div>
            </div>

            {/* Service type chips — only shown when types are available */}
            {serviceTypes.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-50 pt-2.5">
                <span className="text-xs text-gray-400 font-medium mr-1 flex-shrink-0">Type:</span>
                <button onClick={() => handleServiceTypeFilter("")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${serviceTypeFilter === "" ? "bg-[#031634] text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}>
                  All
                </button>
                {serviceTypes.map(t => (
                  <button key={t} onClick={() => handleServiceTypeFilter(serviceTypeFilter === t ? "" : t)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${serviceTypeFilter === t ? "bg-[#031634] text-white" : "text-gray-500 hover:bg-gray-100"
                      }`}>
                    {t}
                  </button>
                ))}

              </div>
            )}

            {/* Billing status chips */}
            <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-50 pt-2.5">
              <span className="text-xs text-gray-400 font-medium mr-1 flex-shrink-0">Billing:</span>
              {[
                { value: "", label: "All" },
                { value: "up_to_date", label: "Up to date" },
                { value: "balance_due", label: "Balance due" },
                { value: "credit", label: "Credit" },
                { value: "no_billing", label: "No billing" },
              ].map(f => (
                <button key={f.value} onClick={() => handleBillingFilter(f.value)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${billingFilter === f.value
                    ? "bg-[#031634] text-white"
                    : "text-gray-500 hover:bg-gray-100"
                    }`}>
                  {f.label}
                </button>
              ))}
            </div>

          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Contact</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden xl:table-cell">Service Type</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Services</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Last activity</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading && clients.length === 0 ? (
                    <tr><td colSpan={7} className="py-16 text-center text-gray-300 text-sm">
                      <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-gray-200" />Loading…
                    </td></tr>
                  ) : clients.length === 0 ? (
                    <tr><td colSpan={7} className="py-16 text-center text-gray-300 text-sm">No clients found</td></tr>
                  ) : displayedClients.map(c => {
                    const days = daysSince(c.last_activity_at);
                    return (
                      <tr key={c.id}
                        className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedClient(c)}>
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-[#031634]">{clientDisplayName(c)}</p>
                          {c.city && <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MapPin size={10} />{c.city}{c.state ? `, ${c.state}` : ""}</p>}
                          {c.tags?.includes("Do Not Rehire") && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600 mt-0.5">
                              <AlertCircle size={9} /> Do Not Rehire
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          <div className="space-y-0.5">
                            {c.email && <p className="text-xs text-gray-500 truncate max-w-[180px]">{c.email}</p>}
                            {(c.mobile ?? c.phone) && <p className="text-xs text-gray-400">{c.mobile ?? c.phone}</p>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5"><StatusBadge status={c.status} /></td>
                        <td className="px-5 py-3.5 hidden xl:table-cell">
                          <p className="text-xs text-gray-600">{c.service_type ?? "—"}</p>
                          {c.is_recurring && <p className="text-xs text-emerald-600 font-medium mt-0.5">Recurring</p>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                            <ClipboardList size={11} className="text-gray-300" />
                            {c.total_services ?? 0}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {days !== null ? (
                            <span className={`text-xs font-medium flex items-center gap-1 ${days >= 30 ? "text-red-500" : days >= 21 ? "text-amber-600" : "text-gray-400"}`}>
                              <Clock size={10} /> {days}d ago
                            </span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        
                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleExport(c.id, clientDisplayName(c), "xlsx")}
                              disabled={exportingKey === `${c.id}:xlsx`}
                              title="Export XLSX"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
                              {exportingKey === `${c.id}:xlsx`
                                ? <Loader2 size={13} className="animate-spin" />
                                : <FileSpreadsheet size={13} />}
                            </button>
                            <button
                              onClick={() => handleExport(c.id, clientDisplayName(c), "pdf")}
                              disabled={exportingKey === `${c.id}:pdf`}
                              title="Export PDF"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-wait">
                              {exportingKey === `${c.id}:pdf`
                                ? <Loader2 size={13} className="animate-spin" />
                                : <FileText size={13} />}
                            </button>
                            <button onClick={() => setEditingClient(c)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-[#031634] hover:bg-gray-100 transition-colors">
                              <Pencil size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {loading && clients.length === 0 ? (
                <div className="py-16 text-center text-gray-300 text-sm">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-gray-200" />Loading…
                </div>
              ) : clients.length === 0 ? (
                <div className="py-16 text-center text-gray-300 text-sm">No clients found</div>
              ) : displayedClients.map(c => {
                const days = daysSince(c.last_activity_at);
                return (
                  <div key={c.id} className="px-4 py-4 flex items-start justify-between gap-3 active:bg-gray-50"
                    onClick={() => setSelectedClient(c)}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#031634]">{clientDisplayName(c)}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{c.email ?? c.mobile ?? "No contact"}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge status={c.status} />
                        {c.tags?.includes("Do Not Rehire") && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">
                            <AlertCircle size={9} /> Do Not Rehire
                          </span>
                        )}
                        {days !== null && (
                          <span className={`text-xs font-medium ${days >= 30 ? "text-red-500" : days >= 21 ? "text-amber-600" : "text-gray-400"}`}>
                            {days}d ago
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink size={13} className="text-gray-300 flex-shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between text-sm">
                <span className="text-gray-400 text-xs">{pagination.total} clients</span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#031634] disabled:opacity-30 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2 text-gray-600 text-xs">{page} / {pagination.pages}</span>
                  <button disabled={page >= pagination.pages} onClick={() => handlePageChange(page + 1)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#031634] disabled:opacity-30 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export error toast */}
      {exportError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl shadow-lg flex items-start gap-2 max-w-sm animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">{exportError}</span>
          <button onClick={() => setExportError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Drawer */}
      {selectedClient && !editingClient && (
        <ClientDrawer
          client={selectedClient}
          scrollToMessage={openedFromContact}
          onClose={() => { setSelectedClient(null); setOpenedFromContact(false); }}
          onEdit={c => { setEditingClient(c); setSelectedClient(null); setOpenedFromContact(false); }}
          onDeleted={handleClientDeleted}
          onUpdated={handleClientSaved}
          onSchedule={c => {
            // Close the drawer and open the new-appointment modal with client pre-selected.
            // Replace this with your actual scheduling modal trigger when it exists.
            setSelectedClient(null);
            setSchedulingClient(c);
          }}
          onExport={handleExport}
          exportingKey={exportingKey}
        />
      )}

      {/* Scheduling modal — opened from drawer's "Schedule service" button.
          Wire this to your existing appointment modal, passing schedulingClient
          as the pre-selected client. Example:
          {schedulingClient && (
            <NewAppointmentModal
              preselectedClient={schedulingClient}
              onClose={() => setSchedulingClient(null)}
              onSaved={() => { setSchedulingClient(null); load(); }}
            />
          )}
      */}
      {schedulingClient && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-3">
            <p className="font-bold text-[#031634] font-montserrat">Schedule service</p>
            <p className="text-sm text-gray-500">
              Connect this to your appointment modal and pass{" "}
              <code className="bg-gray-100 px-1 rounded text-xs">schedulingClient</code> as the pre-selected client.
            </p>
            <p className="text-sm font-semibold text-[#031634]">Client: {clientDisplayName(schedulingClient)}</p>
            <button
              onClick={() => setSchedulingClient(null)}
              className="w-full py-2 text-sm font-semibold border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Form modal */}
      {(creatingNew || editingClient) && (
        <ClientFormModal
          client={editingClient ?? undefined}
          onClose={() => { setCreatingNew(false); setEditingClient(null); }}
          onSaved={handleClientSaved}
        />
      )}
    </RequireAdmin>
  );
}