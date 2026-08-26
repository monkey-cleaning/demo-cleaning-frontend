import { api } from './client';
import { paymentsCache } from '../lib/paymentsCache';

export interface Payment {
  id: string;
  quickbooks_payment_id: string | null;
  lead_id: string | null;
  quickbooks_customer_name: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  notes: string | null;
  synced_at: string | null;
  created_at: string;
  leads: { full_name: string; email: string } | null;
  payment_method?: string
  invoice_payments: {
    amount_applied: number;
    invoice: {
      id: string;
      quickbooks_invoice_id: string | null;
      doc_number: string | null;
      total_amount: number;
      status: string;
      issued_date: string | null;
      due_date: string | null;
    };
  }[];
}

export interface PaymentListResponse {
  data: Payment[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface PaymentsSummary {
  totalCollected: number;
  countPayments: number;
  byStatus: {
    completed: { count: number; amount: number };
    pending: { count: number; amount: number };
    failed: { count: number; amount: number };
    refunded: { count: number; amount: number };
  };
  byMonth: { month: string; count: number; amount: number }[];
}



export async function listPayments(params: {
  lead_id?: string;
  status?: string;
  method?: string;   // 'Credit Card' | 'e-Transfer' | any raw value
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
  force?: boolean;
}): Promise<PaymentListResponse> {
  const { force, ...rest } = params;
  const q = new URLSearchParams();
  Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) q.set(k, String(v)); });

  const cacheKey = `payments_list_${q.toString()}`;

  if (!force) {
    const cached = paymentsCache.get<PaymentListResponse>(cacheKey);
    if (cached) return cached;
  }

  const result = await paymentsCache.dedupe(cacheKey, () =>
    api(`/api/payments?${q.toString()}`) as Promise<PaymentListResponse>
  );
  paymentsCache.set(cacheKey, result);
  return result;
}

export async function getPayment(id: string): Promise<Payment> {
  return api(`/api/payments/${id}`);
}

export async function getPaymentsSummary(params: { from?: string; to?: string } = {}, force = false): Promise<PaymentsSummary> {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });

  const cacheKey = `payments_summary_${q.toString()}`;

  if (!force) {
    const cached = paymentsCache.get<PaymentsSummary>(cacheKey);
    if (cached) return cached;
  }

  const result = await paymentsCache.dedupe(cacheKey, () =>
    api(`/api/payments/summary?${q.toString()}`) as Promise<PaymentsSummary>
  );
  paymentsCache.set(cacheKey, result);
  return result;
}