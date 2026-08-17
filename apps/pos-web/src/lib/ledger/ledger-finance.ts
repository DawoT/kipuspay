/**
 * Sprint 8 — CxC/CxP del Modo Dueño. El diario sigue solo lectura (GTM-14);
 * los abonos van a /api/ledger/ar/pay y /api/ledger/ap/pay.
 */
import { applyApiAuthHeaders } from '../auth/api-client.js';

export interface ArItem {
  readonly id: string;
  readonly customerId: string;
  readonly saleId: string;
  readonly originalAmountCents: number;
  readonly balanceDueCents: number;
  readonly status: string;
  readonly dueDate: string;
}

export interface ApItem {
  readonly id: string;
  readonly supplierId: string;
  readonly purchaseOrderId: string | null;
  readonly originalAmountCents: number;
  readonly balanceDueCents: number;
  readonly status: string;
  readonly dueDate: string;
}

interface LedgerItem {
  id: string;
  customer_id?: string;
  supplier_id?: string;
  sale_id?: string;
  purchase_order_id?: string | null;
  original_amount_cents: number;
  balance_due_cents: number;
  status: string;
  due_date: string;
}

type Result<T> = { ok: true; items: T[] } | { ok: false; code: string; message: string };

async function get(
  path: string,
  input: { fetcher?: typeof fetch; apiBase: string; authorization: string },
): Promise<{ items: LedgerItem[] } | { code: string; message: string }> {
  const doFetch = input.fetcher ?? fetch;
  try {
    const headers = new Headers({ authorization: input.authorization });
    applyApiAuthHeaders(headers);
    const res = await doFetch(`${input.apiBase.replace(/\/$/, '')}${path}`, {
      method: 'GET',
      headers,
    });
    const data = (await res.json()) as { items?: LedgerItem[]; code?: string; error?: string };
    if (!res.ok) {
      return {
        code: data.code ?? 'REJECTED',
        message: data.error ?? data.code ?? 'Solicitud rechazada.',
      };
    }
    return { items: data.items ?? [] };
  } catch {
    return { code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }
}

function mapAr(row: LedgerItem): ArItem {
  return {
    id: row.id,
    customerId: row.customer_id ?? '',
    saleId: row.sale_id ?? '',
    originalAmountCents: row.original_amount_cents,
    balanceDueCents: row.balance_due_cents,
    status: row.status,
    dueDate: row.due_date,
  };
}

function mapAp(row: LedgerItem): ApItem {
  return {
    id: row.id,
    supplierId: row.supplier_id ?? '',
    purchaseOrderId: row.purchase_order_id ?? null,
    originalAmountCents: row.original_amount_cents,
    balanceDueCents: row.balance_due_cents,
    status: row.status,
    dueDate: row.due_date,
  };
}

export async function fetchAccountsReceivable(input: {
  fetcher?: typeof fetch;
  apiBase: string;
  authorization: string;
}): Promise<Result<ArItem>> {
  const res = await get('/api/ledger/ar', input);
  if ('code' in res) return { ok: false, code: res.code, message: res.message };
  return { ok: true, items: res.items.map(mapAr) };
}

export async function fetchAccountsPayable(input: {
  fetcher?: typeof fetch;
  apiBase: string;
  authorization: string;
}): Promise<Result<ApItem>> {
  const res = await get('/api/ledger/ap', input);
  if ('code' in res) return { ok: false, code: res.code, message: res.message };
  return { ok: true, items: res.items.map(mapAp) };
}

async function post(
  path: string,
  input: { fetcher?: typeof fetch; apiBase: string; authorization: string; body: unknown },
): Promise<{ ok: true; data: Record<string, unknown> } | { code: string; message: string }> {
  const doFetch = input.fetcher ?? fetch;
  try {
    const headers = new Headers({
      authorization: input.authorization,
      'content-type': 'application/json',
    });
    applyApiAuthHeaders(headers);
    const res = await doFetch(`${input.apiBase.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input.body),
    });
    const data = (await res.json()) as Record<string, unknown> & { code?: string; error?: string };
    if (!res.ok) {
      return {
        code: data.code ?? 'REJECTED',
        message: data.error ?? data.code ?? 'Solicitud rechazada.',
      };
    }
    return { ok: true, data };
  } catch {
    return { code: 'OFFLINE', message: 'Sin conexión con el servidor.' };
  }
}

export async function payAccountsReceivable(input: {
  fetcher?: typeof fetch;
  apiBase: string;
  authorization: string;
  accountsReceivableId: string;
  amountCents: number;
  cashRegisterSessionId: string;
}): Promise<{ ok: true; nextBalanceCents: number } | { ok: false; code: string; message: string }> {
  const res = await post('/api/ledger/ar/pay', {
    ...input,
    body: {
      accountsReceivableId: input.accountsReceivableId,
      amountCents: input.amountCents,
      paymentMethod: 'cash',
      cashRegisterSessionId: input.cashRegisterSessionId,
    },
  });
  if (!('ok' in res) || !res.ok) {
    const fail = res as { code: string; message: string };
    return { ok: false, code: fail.code, message: fail.message };
  }
  const next = res.data.nextBalanceCents;
  return { ok: true, nextBalanceCents: typeof next === 'number' ? next : 0 };
}

export async function payAccountsPayable(input: {
  fetcher?: typeof fetch;
  apiBase: string;
  authorization: string;
  accountsPayableId: string;
  amountCents: number;
  cashRegisterSessionId: string;
}): Promise<{ ok: true; nextBalanceCents: number } | { ok: false; code: string; message: string }> {
  const res = await post('/api/ledger/ap/pay', {
    ...input,
    body: {
      accountsPayableId: input.accountsPayableId,
      amountCents: input.amountCents,
      paymentMethod: 'transfer',
      cashRegisterSessionId: input.cashRegisterSessionId,
    },
  });
  if (!('ok' in res) || !res.ok) {
    const fail = res as { code: string; message: string };
    return { ok: false, code: fail.code, message: fail.message };
  }
  const next = res.data.nextBalanceCents;
  return { ok: true, nextBalanceCents: typeof next === 'number' ? next : 0 };
}
