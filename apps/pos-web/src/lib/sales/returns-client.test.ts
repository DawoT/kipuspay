import { describe, expect, it, vi, afterEach } from 'vitest';
import { submitSalesReturn } from './returns-client.js';

describe('submitSalesReturn', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ok → returnId y refund', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            returnId: 'r1',
            documentSaleId: 'd1',
            docType: 'NV_RETURN',
            refundAmountCents: 1000,
          }),
      }),
    );
    const res = await submitSalesReturn('https://api.example', 'Bearer x', {
      originSaleId: 's1',
      series: 'NVR1',
      reason: 'defecto',
      lines: [{ originalSaleItemId: 'i1', qty: 1 }],
    });
    expect(res.ok).toBe(true);
    expect(res.returnId).toBe('r1');
    expect(res.refundAmountCents).toBe(1000);
  });

  it('OUTSIDE_WINDOW → error con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ code: 'OUTSIDE_WINDOW', error: 'fuera' }),
      }),
    );
    const res = await submitSalesReturn('https://api.example/', 'Bearer x', {
      originSaleId: 's1',
      series: 'NVR1',
      reason: 'tarde',
      lines: [{ originalSaleItemId: 'i1', qty: 1 }],
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('OUTSIDE_WINDOW');
    expect(res.message).toBe('fuera');
  });

  it('json inválido en error → mensaje default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('bad json')),
      }),
    );
    const res = await submitSalesReturn('https://api.example', 'Bearer x', {
      originSaleId: 's1',
      series: 'NVR1',
      reason: 'x',
      lines: [{ originalSaleItemId: 'i1', qty: 1 }],
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Error/);
  });
});
