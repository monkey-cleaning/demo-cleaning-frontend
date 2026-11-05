/**
 * Slide-in panel showing the detail of one invoice. Draft invoices can be
 * edited in place (client, line items, due date, notes) — everything else
 * is read-only since it's already published to QuickBooks.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { X, AlertCircle, Plus, Pencil, Save, History } from 'lucide-react';
import { updateInvoice, type Invoice, type LineItem } from '../../api/invoices';
import { fmt, clientDisplayName, searchClients, type Client } from '../../pages/AdminInvoicesPage';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-50 text-blue-700',
  sent: 'bg-indigo-50 text-indigo-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-red-50 text-red-600',
};

interface InvoiceDetailDrawerProps {
  invoice: Invoice;
  onClose: () => void;
  onUpdated: (invoice: Invoice) => void;
  onShowHistory: () => void;
  /** Open the drawer straight into edit mode (e.g. from the row's Edit button). */
  startInEditing?: boolean;
}

export default function InvoiceDetailDrawer({
  invoice,
  onClose,
  onUpdated,
  onShowHistory,
  startInEditing = false,
}: InvoiceDetailDrawerProps) {
  const isDraft = invoice.status === 'draft';
  const [editing, setEditing] = useState(startInEditing && isDraft);

  // Edit state
  const [selectedClient, setSelectedClient] = useState<Client | null>(
    invoice.clients ? { id: invoice.client_id, ...invoice.clients } : null,
  );
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>(invoice.line_items);
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '');
  const [notes, setNotes] = useState(invoice.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (clientQuery.length >= 2) setClientResults(await searchClients(clientQuery));
      else setClientResults([]);
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery]);

  function startEditing() {
    setSelectedClient(invoice.clients ? { id: invoice.client_id, ...invoice.clients } : null);
    setLineItems(invoice.line_items);
    setDueDate(invoice.due_date ?? '');
    setNotes(invoice.notes ?? '');
    setClientQuery('');
    setClientResults([]);
    setError(null);
    setEditing(true);
  }

  function updateLine(i: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, [field]: field === 'amount' ? Number(value) : value } : item
    ));
  }

  function addLine() {
    setLineItems(prev => [...prev, { description: '', amount: 0 }]);
  }

  function removeLine(i: number) {
    setLineItems(prev => prev.filter((_, idx) => idx !== i));
  }

  const total = lineItems.reduce((s, i) => s + i.amount, 0);

  async function handleSave() {
    if (!selectedClient) { setError('Select a client'); return; }
    const invalid = lineItems.some(i => !i.description || i.amount <= 0);
    if (invalid) { setError('All line items need a description and amount > 0'); return; }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateInvoice(invoice.id, {
        client_id: selectedClient.id,
        line_items: lineItems,
        due_date: dueDate || undefined,
        notes: notes || undefined,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const clientName = invoice.clients
    ? clientDisplayName(invoice.clients)
    : invoice.quickbooks_customer_name ?? 'Unknown';

  return createPortal(
    <div
      className="admin-scope fixed inset-0 z-[95] flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white h-full w-full max-w-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0 bg-[#031634] text-white">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
              Invoice {invoice.doc_number ? `#${invoice.doc_number}` : ''}
            </p>
            <h2 className="text-lg font-bold font-montserrat truncate">{clientName}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onShowHistory}
              title="History"
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <History size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Status + dates */}
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[invoice.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {invoice.status}
            </span>
            {isDraft && !editing && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 text-xs font-semibold text-gold hover:underline"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Issued</p>
              <p className="text-navy font-medium">
                {invoice.issued_date ? format(new Date(invoice.issued_date), 'MMM d, yyyy') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Due</p>
              {editing ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              ) : (
                <p className={invoice.status === 'overdue' ? 'text-red-500 font-medium' : 'text-navy font-medium'}>
                  {invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '—'}
                </p>
              )}
            </div>
          </div>

          {/* Client */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client</p>
            {editing ? (
              <div>
                <div className="bg-gray-50 rounded-xl px-4 py-2.5 flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">
                      {selectedClient ? clientDisplayName(selectedClient) : 'None selected'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{selectedClient?.email}</p>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Search client to change..."
                  value={clientQuery}
                  onChange={e => setClientQuery(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
                {clientResults.length > 0 && (
                  <ul className="mt-1.5 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
                    {clientResults.map(c => (
                      <li key={c.id}>
                        <button
                          onClick={() => { setSelectedClient(c); setClientQuery(''); setClientResults([]); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-navy">{clientDisplayName(c)}</p>
                          <p className="text-xs text-gray-400">{c.email}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl px-4 py-2.5">
                <p className="text-sm font-semibold text-navy">{clientName}</p>
                {invoice.clients?.email && <p className="text-xs text-gray-400">{invoice.clients.email}</p>}
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Line Items</p>
            <div className="space-y-2">
              {(editing ? lineItems : invoice.line_items).map((item, i) => (
                editing ? (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={e => updateLine(i, 'description', e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount || ''}
                      onChange={e => updateLine(i, 'amount', e.target.value)}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
                    />
                    {lineItems.length > 1 && (
                      <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-400 transition-colors p-1">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={i} className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-2.5">
                    <p className="text-sm text-navy">{item.description}</p>
                    <p className="text-sm font-semibold text-navy">{fmt(item.amount)}</p>
                  </div>
                )
              ))}
            </div>
            {editing && (
              <button onClick={addLine} className="mt-2 text-xs text-gold hover:underline flex items-center gap-1">
                <Plus size={12} /> Add line
              </button>
            )}
          </div>

          {/* Total */}
          <div className="flex justify-end">
            <div className="bg-navy text-white rounded-xl px-5 py-2.5 text-right">
              <p className="text-xs text-white/60">Total</p>
              <p className="text-lg font-bold">{fmt(editing ? total : invoice.total_amount)}</p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</p>
            {editing ? (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            ) : (
              <p className="text-sm text-gray-600">{invoice.notes || '—'}</p>
            )}
          </div>

          {invoice.quickbooks_invoice_id && (
            <p className="text-xs text-gray-400">QuickBooks ID: {invoice.quickbooks_invoice_id}</p>
          )}

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>

        {/* Footer */}
        {editing && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end flex-shrink-0">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-medium hover:bg-navy/90 disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
