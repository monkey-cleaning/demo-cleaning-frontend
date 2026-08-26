import { api } from './client';

export interface LineItem {
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  client_id: string;
  line_items: LineItem[];
  total_amount: number;
  balance: number;
  due_date: string | null;
  issued_date: string | null;
  doc_number: string | null;
  notes: string | null;
  status: 'draft' | 'published' | 'sent' | 'paid' | 'overdue';
  quickbooks_invoice_id: string | null;
  quickbooks_customer_name: string | null;
  currency: string;
  is_sandbox: boolean;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  clients: { first_name?: string; last_name?: string; name?: string; email: string; phone?: string } | null;
}

export interface InvoiceListResponse {
  data: Invoice[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface CreateInvoicePayload {
  client_id: string;
  line_items: LineItem[];
  due_date?: string;
  notes?: string;
}

export async function listInvoices(params: {
  status?: string;
  client_id?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<InvoiceListResponse> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) q.set(k, String(v)); });
  return api(`/api/invoices?${q.toString()}`);
}

export async function getInvoice(id: string): Promise<Invoice> {
  return api(`/api/invoices/${id}`);
}

export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  return api('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateInvoice(id: string, payload: Partial<CreateInvoicePayload>): Promise<Invoice> {
  return api(`/api/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteInvoice(id: string): Promise<void> {
  return api(`/api/invoices/${id}`, { method: 'DELETE' });
}

export async function publishInvoice(id: string): Promise<Invoice> {
  return api(`/api/invoices/${id}/publish`, { method: 'POST' });
}

export async function sendInvoiceEmail(id: string): Promise<{ success: boolean; sent_to: string }> {
  return api(`/api/invoices/${id}/send`, { method: 'POST' });
}