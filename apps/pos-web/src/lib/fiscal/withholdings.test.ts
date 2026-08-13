import { afterEach, describe, expect, it, vi } from 'vitest';
import { issuePerception, issueRetention } from './withholdings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withholdings cliente (P1c)', () => {
  it('percepción: valida campos y emite con monto server-side', async () => {
    const invalid = await issuePerception({
      branchId: 'b1',
      originSaleId: '',
      series: 'P001',
      category: 'goods',
      baseAmountCents: 10_000,
    });
    expect(invalid.ok).toBe(false);

    let sent: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      const rawBody = init?.body;
      sent = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<string, unknown>;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            series: 'P001',
            number: 12,
            baseAmountCents: 10_000,
            amountCents: 200,
            ratePercentage: 200,
            sunatStatus: 'PENDING',
          }),
          { status: 201 },
        ),
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    const res = await issuePerception({
      branchId: 'b1',
      originSaleId: 's1',
      series: 'P001',
      category: 'goods',
      baseAmountCents: 10_000,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.amountCents).toBe(200);
    expect(sent).toMatchObject({ originSaleId: 's1', category: 'goods' });
  });

  it('retención: valida campos y traduce guard', async () => {
    const invalid = await issueRetention({
      branchId: 'b1',
      originSupplierInvoiceId: '',
      series: 'R001',
      category: 'services',
      baseAmountCents: 10_000,
    });
    expect(invalid.ok).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 'INVALID_RETENTION_CATEGORY' }), { status: 422 }),
        ),
      ),
    );
    const res = await issueRetention({
      branchId: 'b1',
      originSupplierInvoiceId: 'si1',
      series: 'R001',
      category: 'x',
      baseAmountCents: 10_000,
    });
    expect(res.ok).toBe(false);
  });

  it('sin red no lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network'))),
    );
    const res = await issuePerception({
      branchId: 'b1',
      originSaleId: 's1',
      series: 'P001',
      category: 'goods',
      baseAmountCents: 100,
    });
    expect(res.ok).toBe(false);
  });
});
