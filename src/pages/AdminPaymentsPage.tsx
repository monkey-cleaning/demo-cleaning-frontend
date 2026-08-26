// v2.1 — Clean architecture: two separate endpoints, no frontend merge between methods.
//
// methodFilter === 'Credit Card'  → GET /api/payments?method=Credit+Card
// methodFilter === 'Cheque'        → GET /api/payments?method=Cheque
// methodFilter === 'Direct Debit'  → GET /api/payments?method=Direct+Debit
// methodFilter === 'e-Transfer'    → GET /api/quickbooks/etransfers (Gmail/Interac only, backend paginated)
// methodFilter === 'unmatched'     → GET /api/quickbooks/etransfers?unmatched=true (no lead_id)
// methodFilter === 'all'           → both endpoints in parallel, merge on current page
//
// Date filter always goes to the backend — no date filtering in frontend.
// This eliminates "infiltrators" (e-transfers in CC, payments outside date range).

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ChevronLeft, ChevronRight,
  X, Mail, Search, CalendarDays,
} from 'lucide-react';
import { format } from 'date-fns';
import { listPayments, getPayment, type Payment } from '../api/payments';
import { paymentsCache } from '../lib/paymentsCache';
import RequireAdmin from '../components/admin/RequireAdmin';
import QuincenalBanner, { type Period } from '../components/admin/QuincenalBanner';
import AdminNavbar from '../components/admin/AdminNavbar';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Auth helper ───────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('admin_blog_token') ?? '';
  return { Authorization: `Bearer ${token}` };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ETransferRow {
  id: string | null;
  date: string | null;
  senderName: string;
  received: number;
  invoicedAmount: number | null;
  diff: number | null;
  status: 'received' | 'pending' | 'discrepancy';
  linkedInvoice: {
    id: string;
    docNumber: string;
    total: number;
    balance: number;
    dueDate: string;
  } | null;
  client: { id: string; name: string } | null;
  paymentId: string | null;  // set when matched to an existing QB payment
}

interface ETransferPagination {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

interface EnrichedPayment extends Payment {
  _etransfer?: ETransferRow;
  _isUnmatchedEtransfer?: true;
  _etransferRaw?: ETransferRow;
}

interface PendingReviewItem {
  id: string;
  payment_id: string;
  client_id: string;
  invoice_id: string | null;
  amount: number;
  note: string | null;
  created_at: string;
  payments: {
    payment_date: string;
    amount: number;
    quickbooks_customer_name: string | null;
    payment_method: string | null;
  } | null;
}

interface OpenInvoice {
  id: string;
  doc_number: string | null;
  quickbooks_invoice_id: string | null;
  total_amount: number;
  balance: number;
  issued_date: string | null;
  due_date: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  'QuickBooks Payments-Credit Card': 'Credit Card',
  'QuickBooks Payments - Credit Card': 'Credit Card',
  'Direct Debit': 'Direct Debit',
  'E-transfer': 'e-Transfer',
  'e-Transfer': 'e-Transfer',
  'Cheque': 'Cheque',
  'Cash': 'Cash',
  'Credit Card': 'Credit Card',
};

function fmtMethod(method: string | null | undefined): string | null {
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

const METHOD_STYLES: Record<string, string> = {
  'e-Transfer': 'bg-indigo-50 text-indigo-700',
  'Credit Card': 'bg-blue-50 text-blue-700',
  'Cheque': 'bg-amber-50 text-amber-700',
  'Cash': 'bg-emerald-50 text-emerald-700',
  'Direct Debit': 'bg-violet-50 text-violet-700',
};

function MethodBadge({ method }: { method: string | null | undefined }) {
  const label = fmtMethod(method);
  if (!label) return <span className="text-xs text-gray-300">—</span>;
  const style = METHOD_STYLES[label] ?? 'bg-gray-100 text-gray-600';
  const isEtransfer = label === 'e-Transfer';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${style}`}>
      {isEtransfer && <Mail size={10} className="flex-shrink-0" />}
      {label}
    </span>
  );
}

/** Convert a raw ETransferRow into an EnrichedPayment row for display. */
function etransferToRow(et: ETransferRow): EnrichedPayment {
  // When matched to a QB payment (paymentId set), use the client's display name.
  // Otherwise fall back to the raw sender name from the Interac notification.
  const displayName = et.client?.name ?? et.senderName;
  return {
    id: `etransfer-${et.id ?? et.senderName}`,
    quickbooks_payment_id: et.paymentId ?? null,
    quickbooks_customer_id: null,
    quickbooks_customer_name: displayName,
    amount: et.received,
    currency: 'CAD',
    payment_date: et.date ? et.date.split('T')[0] : '',
    status: et.status as any,
    payment_method: 'e-Transfer',
    notes: null,
    synced_at: null,
    created_at: et.date ?? '',
    leads: et.client ? { full_name: et.client.name, email: '' } : null,
    invoice_payments: [],
    _isUnmatchedEtransfer: !et.client && !et.paymentId,
    _etransferRaw: et,
  } as unknown as EnrichedPayment;
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function PaymentDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);

  const isEtransferOnly = id.startsWith('etransfer-');

  useEffect(() => {
    if (isEtransferOnly) { setLoading(false); return; }
    getPayment(id).then(setPayment).finally(() => setLoading(false));
  }, [id, isEtransferOnly]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-stretch justify-end"
      onClick={onClose}>
      <div className="bg-white h-auto sm:h-full w-full sm:max-w-md shadow-2xl flex flex-col overflow-y-auto rounded-t-2xl sm:rounded-none max-h-[92vh] sm:max-h-none"
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-navy text-white">
          <h2 className="font-bold text-sm sm:text-base">Payment Detail</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm py-12">Loading...</div>
        ) : isEtransferOnly ? (
          <div className="flex-1 px-5 sm:px-6 py-5">
            <div className="bg-indigo-50 rounded-2xl px-5 py-4 text-center">
              <Mail size={20} className="text-indigo-400 mx-auto mb-2" />
              <p className="text-xs text-indigo-500 font-medium">Pending e-Transfer</p>
              <p className="text-xs text-indigo-400 mt-1">Not yet matched to a QB payment</p>
            </div>
          </div>
        ) : !payment ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-12">Not found</div>
        ) : (
          <div className="flex-1 px-5 sm:px-6 py-5 space-y-5 sm:space-y-6 font-montserrat">
            <div className="bg-gray-50 rounded-2xl px-5 py-4 text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Amount</p>
              <p className="text-3xl font-bold text-navy">{fmt(payment.amount)}</p>
              <p className="text-xs text-gray-400 mt-1">{payment.currency}</p>
              {payment.payment_method && (
                <div className="mt-3 flex justify-center">
                  <MethodBadge method={payment.payment_method} />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Row label="Date" value={format(new Date(payment.payment_date), 'MMMM d, yyyy')} />
              <Row label="Client" value={payment.leads?.full_name ?? payment.quickbooks_customer_name ?? 'Unknown'} />
              <Row label="Email" value={payment.leads?.email ?? '—'} />
              {payment.payment_method && (
                <Row label="Method" value={fmtMethod(payment.payment_method) ?? payment.payment_method} />
              )}
              <Row label="QB Payment ID" value={payment.quickbooks_payment_id ?? '—'} mono />
              {payment.notes && <Row label="Notes" value={payment.notes} />}
            </div>

            {payment.invoice_payments?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Applied to Invoices
                </p>
                <div className="space-y-2">
                  {payment.invoice_payments.map((ip, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">
                          {ip.invoice.doc_number ? `#${ip.invoice.doc_number}` : 'Invoice'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Total: {fmt(ip.invoice.total_amount)}</span>
                        <span className="text-sm font-semibold text-navy">Applied: {fmt(ip.amount_applied)}</span>
                      </div>
                      {ip.invoice.due_date && (
                        <p className="text-xs text-gray-400 mt-1">
                          Due: {format(new Date(ip.invoice.due_date), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingReviewResolvePanel({ item, onClose, onResolved }: {
  item: PendingReviewItem;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [mode, setMode] = useState<'choose' | 'invoice'>('choose');
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<
    | { allocation_type: 'tip' | 'credit_balance' }
    | { allocation_type: 'invoice_payment'; invoice: OpenInvoice }
    | null
  >(null);

  useEffect(() => {
    if (mode !== 'invoice') return;
    setLoadingInvoices(true);
    fetch(`${API_BASE}/api/admin/clients/${item.client_id}/open-invoices`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setInvoices(data.ok ? (data.items ?? []) : []))
      .catch(() => setInvoices([]))
      .finally(() => setLoadingInvoices(false));
  }, [mode, item.client_id]);

  async function resolve(allocation_type: 'tip' | 'credit_balance' | 'invoice_payment', invoice_id?: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/payments/allocations/${item.id}/resolve`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocation_type, invoice_id, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'Failed to resolve');
      onResolved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const clientName = item.payments?.quickbooks_customer_name ?? 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-stretch justify-end" onClick={onClose}>
      <div className="bg-white h-auto sm:h-full w-full sm:max-w-md shadow-2xl flex flex-col overflow-y-auto rounded-t-2xl sm:rounded-none max-h-[92vh] sm:max-h-none"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-navy text-white">
          <h2 className="font-bold text-sm sm:text-base">Resolve Payment</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-5 sm:px-6 py-5 space-y-5">
          <div className="bg-amber-50 rounded-2xl px-5 py-4 text-center">
            <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Pending Amount</p>
            <p className="text-3xl font-bold text-amber-700">{fmt(item.amount)}</p>
            {item.payments && (
              <p className="text-xs text-amber-500 mt-1">of {fmt(item.payments.amount)} total payment</p>
            )}
          </div>

          <div className="space-y-3 text-sm">
            <Row label="Client" value={clientName} />
            {item.payments?.payment_date && (
              <Row label="Date" value={format(new Date(item.payments.payment_date), 'MMMM d, yyyy')} />
            )}
            {item.note && <Row label="System note" value={item.note} />}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-xs">
              {error}
            </div>
          )}

          {mode === 'choose' && !pendingChoice && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">How should this be classified?</p>
              <button
                onClick={() => setPendingChoice({ allocation_type: 'tip' })}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
              >
                <p className="text-sm font-semibold text-navy">It's a tip</p>
                <p className="text-xs text-gray-400">Doesn't apply to any invoice or credit</p>
              </button>
              <button
                onClick={() => setPendingChoice({ allocation_type: 'credit_balance' })}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <p className="text-sm font-semibold text-navy">Credit balance</p>
                <p className="text-xs text-gray-400">Client overpaid — keep as credit for future invoices</p>
              </button>
              <button
                onClick={() => setMode('invoice')}
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <p className="text-sm font-semibold text-navy">Apply to an invoice</p>
                <p className="text-xs text-gray-400">Pick which open invoice this covers</p>
              </button>
            </div>
          )}

          {mode === 'invoice' && !pendingChoice && (
            <div className="space-y-3">
              <button onClick={() => setMode('choose')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Open invoices for {clientName}</p>
              {loadingInvoices ? (
                <p className="text-sm text-gray-300 text-center py-6">Loading...</p>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No open invoices for this client</p>
              ) : (
                <div className="space-y-2">
                  {invoices.map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => setPendingChoice({ allocation_type: 'invoice_payment', invoice: inv })}
                      className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-navy">
                          {inv.doc_number ? `#${inv.doc_number}` : inv.quickbooks_invoice_id ?? 'Invoice'}
                        </span>
                        <span className="text-sm text-gray-600">{fmt(inv.total_amount)}</span>
                      </div>
                      {inv.due_date && (
                        <p className="text-xs text-gray-400 mt-0.5">Due {format(new Date(inv.due_date), 'MMM d, yyyy')}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {pendingChoice && (
            <div className="rounded-xl border border-navy/20 bg-navy/5 px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-navy">Confirm this action?</p>
              <p className="text-xs text-gray-600">
                {pendingChoice.allocation_type === 'tip' &&
                  `Mark ${fmt(item.amount)} as a tip for ${clientName}.`}
                {pendingChoice.allocation_type === 'credit_balance' &&
                  `Keep ${fmt(item.amount)} as credit balance for ${clientName}.`}
                {pendingChoice.allocation_type === 'invoice_payment' &&
                  `Apply ${fmt(item.amount)} to invoice ${pendingChoice.invoice.doc_number ? `#${pendingChoice.invoice.doc_number}` : pendingChoice.invoice.quickbooks_invoice_id}.`}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={submitting}
                  onClick={() => setPendingChoice(null)}
                  className="flex-1 text-sm font-semibold px-3 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting}
                  onClick={() =>
                    pendingChoice.allocation_type === 'invoice_payment'
                      ? resolve('invoice_payment', pendingChoice.invoice.id)
                      : resolve(pendingChoice.allocation_type)
                  }
                  className="flex-1 text-sm font-semibold px-3 py-2 rounded-xl bg-navy text-white hover:bg-navy/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Applying...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              placeholder="Any context for this decision..."
              className="w-full text-sm rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40 transition resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{label}</span>
      <span className={`text-sm text-navy text-right break-all ${mono ? 'font-mono text-xs' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  );
}

// ── Filter toolbar ────────────────────────────────────────────────────────────

type MethodFilter = 'all' | 'Credit Card' | 'e-Transfer' | 'Cheque' | 'Direct Debit' | 'unmatched' | 'pending-review';

const METHOD_OPTIONS: { value: MethodFilter; label: string }[] = [
  { value: 'all', label: 'All methods' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'e-Transfer', label: 'e-Transfer' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'Direct Debit', label: 'Direct Debit' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'pending-review', label: 'Review' },
];

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  method: MethodFilter;
  onMethod: (v: MethodFilter) => void;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  resultCount: number;
  loading: boolean;
  pendingReviewCount: number;
}

function FilterBar({
  search, onSearch,
  method, onMethod,
  dateFrom, dateTo, onDateFrom, onDateTo,
  pendingReviewCount,
}: FilterBarProps) {
  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col gap-3">

      {/* Row 1: search + method toggle + result count */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">

        {/* Search input */}
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search client..."
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40 placeholder:text-gray-300 transition"
          />
          {search && (
            <button
              onClick={() => onSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">

          {/* Method filter */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-semibold">
            {METHOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onMethod(opt.value)}
                className={`relative px-3 py-2 transition-colors whitespace-nowrap ${method === opt.value
                  ? 'bg-navy text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
              >
                {opt.label}
                {opt.value === 'pending-review' && pendingReviewCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-[10px] font-bold rounded-full bg-amber-400 text-amber-900">
                    {pendingReviewCount}
                  </span>
                )}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Row 2: date range */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays size={14} className="text-gray-300 flex-shrink-0" />

        <input
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={e => onDateFrom(e.target.value)}
          className="text-xs rounded-xl border border-gray-200 bg-gray-50 px-3 py-2
                     focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40
                     text-gray-600 transition w-36"
        />

        <span className="text-xs text-gray-300 select-none">→</span>

        <input
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={e => onDateTo(e.target.value)}
          className="text-xs rounded-xl border border-gray-200 bg-gray-50 px-3 py-2
                     focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40
                     text-gray-600 transition w-36"
        />

        {hasDateFilter && (
          <button
            onClick={() => { onDateFrom(''); onDateTo(''); }}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            title="Clear date filter"
          >
            <X size={12} />
            <span>Clear</span>
          </button>
        )}

        {!hasDateFilter && (
          <span className="text-xs text-gray-300 select-none">All dates</span>
        )}
      </div>

    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // QB payments (Credit Card, Direct Debit, etc.)
  const [qbPayments, setQbPayments] = useState<Payment[]>([]);
  const [qbPagination, setQbPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [loadingQb, setLoadingQb] = useState(false);

  // e-Transfer rows (from Gmail/Supabase via /api/quickbooks/etransfers)
  const [etPayments, setEtPayments] = useState<ETransferRow[]>([]);
  const [etPagination, setEtPagination] = useState<ETransferPagination>({ total: 0, page: 1, pages: 1, limit: 20 });
  const [loadingEt, setLoadingEt] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [period, setPeriod] = useState<Period>('current');
  const [pendingReview, setPendingReview] = useState<PendingReviewItem[]>([]);
  const [loadingPendingReview, setLoadingPendingReview] = useState(false);
  const [resolvingItem, setResolvingItem] = useState<PendingReviewItem | null>(null);

  const page = Number(searchParams.get('page') ?? 1);

  // ── Derived flags ─────────────────────────────────────────────────────────
  const needsQb = methodFilter !== 'e-Transfer' && methodFilter !== 'unmatched' && methodFilter !== 'pending-review';
  const needsEt = methodFilter !== 'pending-review'
    && (methodFilter === 'all' || methodFilter === 'e-Transfer' || methodFilter === 'unmatched');
  const loading = (needsQb && loadingQb) || (needsEt && loadingEt);

  // ── Debounce search → avoids one request per keystroke ────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Load QB payments ──────────────────────────────────────────────────────
  const loadQbPayments = useCallback(async (force = false) => {
    if (!needsQb) {
      setQbPayments([]);
      setQbPagination({ total: 0, page: 1, pages: 0, limit: 200 });
      return;
    }
    setLoadingQb(true);
    setError(null);
    try {
      const res = await listPayments({
        page,
        limit: 200,
        force,
        method: methodFilter === 'all' ? 'exclude-etransfers' : methodFilter,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        search: debouncedSearch.trim().length >= 2 ? debouncedSearch.trim() : undefined,
      });
      setQbPayments(res.data);
      setQbPagination(res.pagination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingQb(false);
    }
  }, [page, methodFilter, dateFrom, dateTo, needsQb, debouncedSearch]);

  // ── Load e-transfers ──────────────────────────────────────────────────────
  const loadEtransfers = useCallback(async (force = false) => {
    if (!needsEt) {
      setEtPayments([]);
      setEtPagination({ total: 0, page: 1, pages: 0, limit: 200 });
      return;
    }
    setLoadingEt(true);
    try {
      const params = new URLSearchParams();
      const isEtPage = methodFilter === 'e-Transfer' || methodFilter === 'unmatched';
      params.set('page', isEtPage ? String(page) : '1');
      params.set('limit', '200');
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (debouncedSearch.trim().length >= 2) params.set('search', debouncedSearch.trim());
      if (methodFilter === 'unmatched') params.set('unmatched', 'true');

      const cacheKey = `etransfers_${params.toString()}`;
      if (!force) {
        const cached = paymentsCache.get<{ etransfers: ETransferRow[]; pagination: ETransferPagination }>(cacheKey);
        if (cached) {
          setEtPayments(cached.etransfers);
          setEtPagination(cached.pagination);
          setLoadingEt(false);
          return;
        }
      }

      const result = await paymentsCache.dedupe(cacheKey, async () => {
        const res = await fetch(`${API_BASE}/api/quickbooks/etransfers?${params}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        const etransfers: ETransferRow[] = data.ok ? (data.etransfers ?? []) : [];
        const pagination: ETransferPagination = data.pagination ?? {
          total: etransfers.length,
          page: 1,
          pages: 1,
          limit: 200,
        };
        paymentsCache.set(cacheKey, { etransfers, pagination });
        return { etransfers, pagination };
      });

      setEtPayments(result.etransfers);
      setEtPagination(result.pagination);
    } catch { } finally {
      setLoadingEt(false);
    }
  }, [page, methodFilter, dateFrom, dateTo, debouncedSearch, needsEt]);

  const loadPendingReview = useCallback(async () => {
    setLoadingPendingReview(true);
    try {
      const res = await fetch(`${API_BASE}/api/payments/pending-review`, { headers: authHeaders() });
      const data = await res.json();
      setPendingReview(data.ok ? (data.items ?? []) : []);
    } catch {
      // silent — the badge simply won't show a number
    } finally {
      setLoadingPendingReview(false);
    }
  }, []);

  useEffect(() => { loadPendingReview(); }, [loadPendingReview]);

  // Reset to page 1 when filters change.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('page', '1');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodFilter, dateFrom, dateTo, search]);

  useEffect(() => { loadQbPayments(); }, [loadQbPayments]);
  useEffect(() => { loadEtransfers(); }, [loadEtransfers]);

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  // ── Merge for display ─────────────────────────────────────────────────────
  const merged: EnrichedPayment[] = useMemo(() => {
    if (loading) return [];

    const q = search.trim().toLowerCase();

    if (methodFilter === 'Credit Card') {
      let rows: EnrichedPayment[] = qbPayments;
      if (q) rows = rows.filter(p =>
        (p.leads?.full_name ?? p.quickbooks_customer_name ?? '').toLowerCase().includes(q) ||
        (p.leads?.email ?? '').toLowerCase().includes(q)
      );
      return rows;
    }

    if (methodFilter === 'e-Transfer') {
      let rows: EnrichedPayment[] = etPayments.map(etransferToRow);
      if (q) rows = rows.filter(p =>
        (p.leads?.full_name ?? p.quickbooks_customer_name ?? '').toLowerCase().includes(q) ||
        (p.leads?.email ?? '').toLowerCase().includes(q)
      );
      return rows;
    }

    if (methodFilter === 'unmatched') {
      const groups = new Map<string, ETransferRow[]>();
      for (const et of etPayments) {
        const key = et.senderName.trim().toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(et);
      }

      let rows: EnrichedPayment[] = Array.from(groups.values()).map(group => {
        const representative = group.reduce((latest, cur) =>
          (cur.date ?? '') > (latest.date ?? '') ? cur : latest
        );
        const totalReceived = group.reduce((sum, cur) => sum + cur.received, 0);

        return {
          ...etransferToRow(representative),
          id: `etransfer-group-${representative.senderName.trim().toLowerCase()}`,
          amount: totalReceived,
          _etransferRaw: representative,
        } as EnrichedPayment;
      });

      rows.sort((a, b) => (b.payment_date ?? '').localeCompare(a.payment_date ?? ''));

      if (q) rows = rows.filter(p =>
        (p.leads?.full_name ?? p.quickbooks_customer_name ?? '').toLowerCase().includes(q) ||
        (p.leads?.email ?? '').toLowerCase().includes(q)
      );
      return rows;
    }

    const etRows: EnrichedPayment[] = etPayments.map(etransferToRow);
    const matchedPaymentIds = new Set(
      etPayments.filter(et => et.paymentId).map(et => et.paymentId as string)
    );

    const qbRows: EnrichedPayment[] = qbPayments.map(p =>
      matchedPaymentIds.has(p.id) && !p.payment_method
        ? { ...p, payment_method: 'e-Transfer' }
        : p
    );

    const filteredEtRows = etRows.filter(r => !r._etransferRaw?.paymentId);

    let combined: EnrichedPayment[] = [
      ...qbRows,
      ...filteredEtRows,
    ].sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());

    if (q) {
      combined = combined.filter(p =>
        (p.leads?.full_name ?? p.quickbooks_customer_name ?? '').toLowerCase().includes(q) ||
        (p.leads?.email ?? '').toLowerCase().includes(q)
      );
    }

    return combined;
  }, [loading, qbPayments, etPayments, methodFilter, search]);

  // ── Pagination display ────────────────────────────────────────────────────
  const isEtMode = methodFilter === 'e-Transfer' || methodFilter === 'unmatched';
  const unmatchedEtCount = methodFilter === 'all'
    ? etPayments.filter(et => !et.paymentId).length
    : 0;
  const displayTotal = isEtMode ? etPagination.total : qbPagination.total + unmatchedEtCount;
  const displayPages = displayTotal === 0
    ? 0
    : Math.max(1, Math.ceil(displayTotal / (isEtMode ? etPagination.limit : qbPagination.limit)));

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50 font-montserrat">
        {/* Navbar */}
        <AdminNavbar
          title="Payments"
          sectionLabel="Finance"
          onRefresh={() => {
            paymentsCache.clear();
            loadQbPayments(true);
            loadEtransfers(true);
            loadPendingReview();
          }}
          refreshing={loading}
        />

        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4">

          {/* Quincenal summary banner */}
          <QuincenalBanner period={period} onPeriodChange={setPeriod} />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <FilterBar
            search={search}
            onSearch={val => { setSearch(val); }}
            method={methodFilter}
            onMethod={setMethodFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFrom={setDateFrom}
            onDateTo={setDateTo}
            resultCount={merged.length}
            loading={loading}
            pendingReviewCount={pendingReview.length}
          />

          {/* Table (md+) / Card list (mobile) */}
          {methodFilter === 'pending-review' ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {loadingPendingReview ? (
                <div className="py-12 text-center text-gray-300 text-sm">Loading...</div>
              ) : pendingReview.length === 0 ? (
                <div className="py-12 text-center text-gray-300 text-sm">Nothing pending review 🎉</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {pendingReview.map(item => (
                    <li
                      key={item.id}
                      onClick={() => setResolvingItem(item)}
                      className="px-4 sm:px-5 py-4 hover:bg-amber-50/50 active:bg-amber-50 transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-navy truncate">
                          {item.payments?.quickbooks_customer_name ?? 'Unknown'}
                        </p>
                        {item.note && <p className="text-xs text-gray-400 truncate mt-0.5">{item.note}</p>}
                        {item.payments?.payment_date && (
                          <p className="text-xs text-gray-300 mt-0.5">
                            {format(new Date(item.payments.payment_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-amber-600 flex-shrink-0">{fmt(item.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50/60 border-b border-gray-100">
                      <th className="px-5 py-3 text-left font-medium">Client</th>
                      <th className="px-5 py-3 text-left font-medium">Date</th>
                      <th className="px-5 py-3 text-left font-medium hidden lg:table-cell">Invoices</th>
                      <th className="px-5 py-3 text-right font-medium">Amount</th>
                      <th className="px-5 py-3 text-left font-medium">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-gray-300 text-sm">Loading...</td>
                      </tr>
                    ) : merged.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-gray-300 text-sm">No payments found</td>
                      </tr>
                    ) : (
                      merged.map(pay => (
                        <tr
                          key={pay.id}
                          onClick={() => setDetailId(pay.id)}
                          className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${pay._isUnmatchedEtransfer ? 'opacity-60' : ''}`}
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-navy truncate">
                              {pay.leads?.full_name ?? pay.quickbooks_customer_name ?? 'Unknown'}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{pay.leads?.email ?? ''}</p>
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                            {pay.payment_date
                              ? format(new Date(pay.payment_date + 'T12:00:00'), 'MMM d, yyyy')
                              : '—'}
                          </td>
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {pay.invoice_payments?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {pay.invoice_payments.map((ip, i) => (
                                  <span key={i} className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                                    {ip.invoice?.doc_number ? `#${ip.invoice.doc_number}` : ip.invoice?.quickbooks_invoice_id ?? '—'}
                                  </span>
                                ))}
                              </div>
                            ) : pay._isUnmatchedEtransfer && pay._etransferRaw?.linkedInvoice ? (
                              <span className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                                #{pay._etransferRaw.linkedInvoice.docNumber}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold text-navy">
                            {fmt(pay.amount)}
                          </td>
                          <td className="px-5 py-3.5">
                            <MethodBadge method={pay.payment_method} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden">
                {loading ? (
                  <div className="py-12 text-center text-gray-300 text-sm">Loading...</div>
                ) : merged.length === 0 ? (
                  <div className="py-12 text-center text-gray-300 text-sm">No payments found</div>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {merged.map(pay => (
                      <li
                        key={pay.id}
                        onClick={() => setDetailId(pay.id)}
                        className={`px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer ${pay._isUnmatchedEtransfer ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-navy truncate">
                              {pay.leads?.full_name ?? pay.quickbooks_customer_name ?? 'Unknown'}
                            </p>
                            {pay.leads?.email && (
                              <p className="text-xs text-gray-400 truncate mt-0.5">{pay.leads.email}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs text-gray-400">
                                {pay.payment_date
                                  ? format(new Date(pay.payment_date + 'T12:00:00'), 'MMM d, yyyy')
                                  : '—'}
                              </span>
                              {pay.invoice_payments?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {pay.invoice_payments.map((ip, i) => (
                                    <span key={i} className="text-xs font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                                      {ip.invoice?.doc_number ? `#${ip.invoice.doc_number}` : ip.invoice?.quickbooks_invoice_id ?? '—'}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <span className="text-sm font-bold text-navy">{fmt(pay.amount)}</span>
                            <MethodBadge method={pay.payment_method} />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Pagination */}
              {!loading && (
                <div className="px-4 sm:px-5 py-3 border-t border-gray-50 flex items-center justify-between text-sm">
                  <span className="text-gray-400 text-xs">
                    {displayTotal} total
                  </span>
                  {displayPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-navy disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="px-2 text-gray-600">{page} / {displayPages}</span>
                      <button
                        disabled={page >= displayPages}
                        onClick={() => setPage(page + 1)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-navy disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {detailId && (
          <PaymentDetailPanel id={detailId} onClose={() => setDetailId(null)} />
        )}
        {resolvingItem && (
          <PendingReviewResolvePanel
            item={resolvingItem}
            onClose={() => setResolvingItem(null)}
            onResolved={() => loadPendingReview()}
          />
        )}
      </div>
    </RequireAdmin>
  );
}