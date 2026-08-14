/**
 * Sprint 8 — CxC/CxP consolidado del Modo Dueño (solo lectura, GTM-14).
 * El servidor es la fuente de verdad de saldos; esta vista nunca muta.
 */

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
    const res = await doFetch(`${input.apiBase.replace(/\/$/, '')}${path}`, {
      method: 'GET',
      headers: { authorization: input.authorization },
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
