import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Send, Upload, Trash2, ArrowLeft, AlertCircle, X, ChevronLeft, ChevronRight, Search, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import {
  listInvoices, createInvoice, publishInvoice, sendInvoiceEmail, deleteInvoice,
  type Invoice, type LineItem,
} from '../api/invoices';
import { api } from '../api/client';
import RequireAdmin from '../components/admin/RequireAdmin';
import AdminNavbar from '../components/admin/AdminNavbar';
import { ClientFormModal } from '../components/admin/ClientFormModal';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-50 text-blue-700',
  sent: 'bg-indigo-50 text-indigo-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-red-50 text-red-600',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

// ── Client search ─────────────────────────────────────────────────────────────

interface Client { id: string; name?: string; first_name?: string; last_name?: string; email: string; }

function clientDisplayName(c: { name?: string; first_name?: string; last_name?: string }) {
  return c.name ?? ([c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)');
}

async function searchClients(q: string): Promise<Client[]> {
  if (!q || q.length < 2) return [];
  const res = await api(`/api/admin/clients/search?q=${encodeURIComponent(q)}&limit=8`) as { ok: boolean; clients: Client[] };
  return Array.isArray(res?.clients) ? res.clients : [];
}

// ── Create Invoice Modal ──────────────────────────────────────────────────────

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<'client' | 'items'>('client');
  const [clientQuery, setClientQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: '', amount: 0 }]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (clientQuery.length >= 2) setClients(await searchClients(clientQuery));
      else setClients([]);
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery]);

  function addLine() {
    setLineItems(prev => [...prev, { description: '', amount: 0 }]);
  }

  function removeLine(i: number) {
    setLineItems(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateLine(i: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, [field]: field === 'amount' ? Number(value) : value } : item
    ));
  }

  const total = lineItems.reduce((s, i) => s + i.amount, 0);

  async function handleSave(publish: boolean) {
    if (!selectedClient) return;
    const invalid = lineItems.some(i => !i.description || i.amount <= 0);
    if (invalid) { setError('All line items need a description and amount > 0'); return; }

    setSaving(true);
    setError(null);
    try {
      const inv = await createInvoice({
        client_id: selectedClient.id,
        line_items: lineItems,
        due_date: dueDate || undefined,
        notes: notes || undefined,
      });

      if (publish) {
        await publishInvoice(inv.id);
      }

      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      {/* On mobile: bottom sheet. On sm+: centered modal */}
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh]">
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {step === 'items' && (
              <button onClick={() => setStep('client')} className="text-gray-400 hover:text-navy">
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="font-bold text-navy text-sm sm:text-base">
              {step === 'client' ? 'Select Client' : 'Invoice Details'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-navy p-1">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">

          {/* Step 1: Lead selection */}
          {step === 'client' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Search client
              </label>
              <input
                type="text"
                placeholder="Name or email..."
                value={clientQuery}
                onChange={e => setClientQuery(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                autoFocus
              />
              {clients.length > 0 && (
                <ul className="mt-2 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                  {clients.map(client => (
                    <li key={client.id}>
                      <button
                        onClick={() => { setSelectedClient(client); setStep('items'); }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors active:bg-gray-100"
                      >
                        <p className="text-sm font-medium text-navy">{clientDisplayName(client)}</p>
                        <p className="text-xs text-gray-400">{client.email}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {clientQuery.length >= 2 && clients.length === 0 && (
                <button
                  onClick={() => setShowNewClientModal(true)}
                  className="mt-2 w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-navy hover:bg-gray-50 rounded-xl border border-dashed border-gray-200 transition-colors"
                >
                  <Plus size={14} className="text-gold flex-shrink-0" />
                  Add "{clientQuery}" as new client
                </button>
              )}

              {showNewClientModal && (
                <ClientFormModal
                  zIndex="z-[90]"
                  initialName={clientQuery}
                  onClose={() => setShowNewClientModal(false)}
                  onSaved={(c) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
                    setSelectedClient({ id: c.id, name: name || '—', email: c.email ?? '' });
                    setStep('items');
                    setShowNewClientModal(false);
                  }}
                />
              )}
            </div>
          )}

          {/* Step 2: Line items */}
          {step === 'items' && (
            <>
              {/* Selected client */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Client</p>
                  <p className="text-sm font-semibold text-navy">{selectedClient ? clientDisplayName(selectedClient) : ''}</p>
                  <p className="text-xs text-gray-400">{selectedClient?.email}</p>
                </div>
                <button onClick={() => setStep('client')} className="text-xs text-gold hover:underline">Change</button>
              </div>

              {/* Line items */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Line Items
                </label>
                <div className="space-y-2">
                  {lineItems.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description}
                        onChange={e => updateLine(i, 'description', e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.amount || ''}
                        onChange={e => updateLine(i, 'amount', e.target.value)}
                        className="w-20 sm:w-24 border border-gray-200 rounded-lg px-2 sm:px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                      />
                      {lineItems.length > 1 && (
                        <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-400 transition-colors p-1">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addLine}
                  className="mt-2 text-xs text-gold hover:underline flex items-center gap-1"
                >
                  <Plus size={12} /> Add line
                </button>
              </div>

              {/* Total */}
              <div className="flex justify-end">
                <div className="bg-navy text-white rounded-xl px-5 py-2.5 text-right">
                  <p className="text-xs text-white/60">Total</p>
                  <p className="text-lg font-bold">{fmt(total)}</p>
                </div>
              </div>

              {/* Due date & notes — stack on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Optional..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'items' && (
          <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Save as Draft
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-medium hover:bg-navy/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              <Upload size={14} />
              {saving ? 'Publishing...' : 'Publish to QB'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  resultCount: number;
  loading: boolean;
}

const STATUSES = ['', 'draft', 'published', 'sent', 'paid', 'overdue'];
const STATUS_LABELS: Record<string, string> = {
  '': 'All',
  draft: 'Draft',
  published: 'Published',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
};

function FilterBar({
  search, onSearch,
  dateFrom, dateTo, onDateFrom, onDateTo,
  status, onStatus,
  resultCount, loading,
}: FilterBarProps) {
  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 sm:px-5 py-3 sm:py-3.5 flex flex-col gap-3">

      {/* Row 1: search + status pills + result count */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">

        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search client or invoice #..."
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
          {/* Status pills */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-semibold">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => onStatus(s)}
                className={`px-3 py-2 transition-colors whitespace-nowrap ${status === s
                  ? 'bg-navy text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {!loading && (
            <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:inline">
              {resultCount} result{resultCount !== 1 ? 's' : ''}
            </span>
          )}
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

export default function AdminInvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const status = searchParams.get('status') ?? '';
  const page = Number(searchParams.get('page') ?? 1);
  const searchParam = searchParams.get('search') ?? '';

  const [dateFrom, setDateFrom] = useState(searchParams.get('from') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') ?? '');

  // Local input state — debounced before writing to searchParams
  const [searchInput, setSearchInput] = useState(searchParam);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync inputs ← searchParams on external navigation (back/forward button)
  useEffect(() => { setSearchInput(searchParam); }, [searchParam]);
  useEffect(() => { setDateFrom(searchParams.get('from') ?? ''); }, [searchParams.get('from')]);
  useEffect(() => { setDateTo(searchParams.get('to') ?? ''); }, [searchParams.get('to')]);

  // Write debounced search to URL
  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (val.trim()) next.set('search', val.trim());
      else next.delete('search');
      next.delete('page');
      setSearchParams(next);
    }, 300);
  }

  function handleDateFrom(val: string) {
    setDateFrom(val);
    const next = new URLSearchParams(searchParams);
    if (val) next.set('from', val); else next.delete('from');
    next.delete('page');
    setSearchParams(next);
  }

  function handleDateTo(val: string) {
    setDateTo(val);
    const next = new URLSearchParams(searchParams);
    if (val) next.set('to', val); else next.delete('to');
    next.delete('page');
    setSearchParams(next);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listInvoices({
        status: status || undefined,
        search: searchParam || undefined,
        from: searchParams.get('from') || undefined,
        to: searchParams.get('to') || undefined,
        page,
        limit: 20,
      });
      setInvoices(res.data);
      setPagination(res.pagination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, searchParam, page, searchParams.get('from'), searchParams.get('to')]);

  useEffect(() => { load(); }, [load]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  async function handlePublish(id: string) {
    setActionLoading(id + '-publish');
    try {
      await publishInvoice(id);
      showToast('Invoice published to QuickBooks ✓');
      load();
    } catch (e: any) {
      showToast('Error: ' + e.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSend(id: string) {
    setActionLoading(id + '-send');
    try {
      await sendInvoiceEmail(id);
      showToast('Email sent to client ✓');
      load();
    } catch (e: any) {
      showToast('Error: ' + e.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this draft invoice?')) return;
    setActionLoading(id + '-delete');
    try {
      await deleteInvoice(id);
      showToast('Draft deleted ✓');
      load();
    } catch (e: any) {
      showToast('Error: ' + e.message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <RequireAdmin>
      <div className="min-h-screen bg-gray-50 font-montserrat">
        {/* Navbar */}
        <AdminNavbar
          title="Invoices"
          sectionLabel="Finance"
          rightSlot={
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 sm:gap-2 bg-gold text-navy text-sm font-bold px-3 sm:px-4 py-2 rounded-xl hover:bg-gold/90 transition-colors"
            >
              <Plus size={16} />
              <span className="hidden xs:inline">New Invoice</span>
              <span className="xs:hidden">New</span>
            </button>
          }
        />

        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-4">
          {/* Filter bar */}
          <FilterBar
            search={searchInput}
            onSearch={handleSearchChange}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFrom={handleDateFrom}
            onDateTo={handleDateTo}
            status={status}
            onStatus={s => setFilter('status', s)}
            resultCount={invoices.length}
            loading={loading}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Table (md+) / Card list (mobile) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide bg-gray-50/60 border-b border-gray-100">
                    <th className="px-5 py-3 text-left font-medium">Client</th>
                    <th className="px-5 py-3 text-left font-medium hidden lg:table-cell">Doc #</th>
                    <th className="px-5 py-3 text-left font-medium">Issued</th>
                    <th className="px-5 py-3 text-left font-medium">Due</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-300 text-sm">Loading...</td></tr>
                  ) : invoices.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-300 text-sm">No invoices found</td></tr>
                  ) : (
                    invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-navy truncate max-w-[160px]">
                            {inv.clients ? clientDisplayName(inv.clients) : (inv.quickbooks_customer_name ?? 'Unknown')}
                          </p>
                          <p className="text-xs text-gray-400 truncate max-w-[160px]">{inv.clients?.email ?? ''}</p>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 hidden lg:table-cell">{inv.doc_number ?? '—'}</td>
                        <td className="px-5 py-3.5 text-gray-500">
                          {inv.issued_date ? format(new Date(inv.issued_date), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={inv.status === 'overdue' ? 'text-red-500 font-medium' : 'text-gray-500'}>
                            {inv.due_date ? format(new Date(inv.due_date), 'MMM d, yyyy') : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-navy">{fmt(inv.total_amount)}</td>
                        <td className="px-5 py-3.5"><StatusBadge status={inv.status} /></td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            {inv.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => handlePublish(inv.id)}
                                  disabled={actionLoading === inv.id + '-publish'}
                                  title="Publish to QuickBooks"
                                  className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 disabled:opacity-40 transition-colors"
                                >
                                  <Upload size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(inv.id)}
                                  disabled={actionLoading === inv.id + '-delete'}
                                  title="Delete draft"
                                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 disabled:opacity-40 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                            {inv.status === 'published' && (
                              <button
                                onClick={() => handleSend(inv.id)}
                                disabled={actionLoading === inv.id + '-send'}
                                title="Send email to client"
                                className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 disabled:opacity-40 transition-colors"
                              >
                                <Send size={14} />
                              </button>
                            )}
                          </div>
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
              ) : invoices.length === 0 ? (
                <div className="py-12 text-center text-gray-300 text-sm">No invoices found</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {invoices.map(inv => (
                    <li key={inv.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-navy truncate">
                            {inv.clients ? clientDisplayName(inv.clients) : (inv.quickbooks_customer_name ?? 'Unknown')}
                          </p>
                          {inv.clients?.email && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">{inv.clients.email}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                            {inv.doc_number && <span>#{inv.doc_number}</span>}
                            {inv.due_date && (
                              <span className={inv.status === 'overdue' ? 'text-red-500 font-medium' : ''}>
                                Due {format(new Date(inv.due_date), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-navy">{fmt(inv.total_amount)}</span>
                          <StatusBadge status={inv.status} />
                        </div>
                      </div>
                      {/* Actions row */}
                      {(inv.status === 'draft' || inv.status === 'published') && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                          {inv.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handlePublish(inv.id)}
                                disabled={actionLoading === inv.id + '-publish'}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold disabled:opacity-40 transition-colors active:bg-blue-100"
                              >
                                <Upload size={12} /> Publish
                              </button>
                              <button
                                onClick={() => handleDelete(inv.id)}
                                disabled={actionLoading === inv.id + '-delete'}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-xs font-semibold disabled:opacity-40 transition-colors active:bg-red-100"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </>
                          )}
                          {inv.status === 'published' && (
                            <button
                              onClick={() => handleSend(inv.id)}
                              disabled={actionLoading === inv.id + '-send'}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold disabled:opacity-40 transition-colors active:bg-indigo-100"
                            >
                              <Send size={12} /> Send email
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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

        {/* Modal */}
        {showModal && (
          <CreateInvoiceModal
            onClose={() => setShowModal(false)}
            onCreated={load}
          />
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 bg-navy text-white text-sm px-4 py-3 rounded-xl shadow-lg animate-in fade-in whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>
    </RequireAdmin>
  );
}