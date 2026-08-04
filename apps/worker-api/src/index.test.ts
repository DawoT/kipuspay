import { describe, expect, it } from 'vitest';
import app from './index.js';

describe('worker-api', () => {
  it('expone /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });

  it('calcula totales desde domain-sales', async () => {
    const res = await app.request('/api/pos/totals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ productId: 'a', priceCents: 5000, qty: 2 }] }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      subtotalCents: 10000,
      igvCents: 1800,
      totalCents: 11800,
    });
  });

  it('trata un body sin lines como cesta vacía', async () => {
    const res = await app.request('/api/pos/totals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    await expect(res.json()).resolves.toEqual({ subtotalCents: 0, igvCents: 0, totalCents: 0 });
  });
});
