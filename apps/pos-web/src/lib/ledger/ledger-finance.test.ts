import { describe, expect, it, vi } from 'vitest';
import { fetchAccountsPayable, fetchAccountsReceivable } from './ledger-finance.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function captureFetcher(body: unknown, status = 200) {
  const captured: { url?: string; init?: RequestInit } = {};
  const fetcher = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    captured.url = url instanceof URL || typeof url === 'string' ? url.toString() : url.url;
    captured.init = init;
    return Promise.resolve(jsonResponse(body, status));
  });
  return { fetcher, captured };
}

const AUTH = 'Bearer jwt-owner';

describe('ledger financiero (CxC/CxP, F2)', () => {
  it('trae cuentas por cobrar mapeando el DTO del worker', async () => {
    const { fetcher, captured } = captureFetcher({
      items: [
        {
          id: 'ar-1',
          customer_id: 'c-1',
          sale_id: 's-1',
          original_amount_cents: 10_000,
          balance_due_cents: 4_000,
          status: 'PARTIAL',
          due_date: '2026-08-20',
        },
      ],
    });
    const res = await fetchAccountsReceivable({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toEqual([
      {
        id: 'ar-1',
        customerId: 'c-1',
        saleId: 's-1',
        originalAmountCents: 10_000,
        balanceDueCents: 4_000,
        status: 'PARTIAL',
        dueDate: '2026-08-20',
      },
    ]);
    expect(captured.url).toBe('https://api.test/api/ledger/ar');
    expect((captured.init?.headers as Record<string, string>).authorization).toBe(AUTH);
  });

  it('trae cuentas por pagar con el mismo contrato', async () => {
    const { fetcher, captured } = captureFetcher({
      items: [
        {
          id: 'ap-1',
          supplier_id: 'sp-1',
          purchase_order_id: 'po-1',
          original_amount_cents: 50_000,
          balance_due_cents: 50_000,
          status: 'OPEN',
          due_date: '2026-08-25',
        },
      ],
    });
    const res = await fetchAccountsPayable({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0]).toMatchObject({
      id: 'ap-1',
      supplierId: 'sp-1',
      balanceDueCents: 50_000,
      status: 'OPEN',
    });
    expect(captured.url).toBe('https://api.test/api/ledger/ap');
  });

  it('FEATURE_OFF se traduce sin reventar', async () => {
    const { fetcher } = captureFetcher({ error: 'off', code: 'FEATURE_OFF' }, 404);
    const res = await fetchAccountsReceivable({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('FEATURE_OFF');
  });

  it('falla offline sin reventar', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await fetchAccountsPayable({
      fetcher,
      apiBase: 'https://api.test',
      authorization: AUTH,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain('Sin conexión');
  });
});
