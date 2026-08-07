import { describe, expect, it, vi } from 'vitest';
import { reportMeteredOverage, StripeMeterConfigError } from './metered.js';

describe('reportMeteredOverage', () => {
  it('fail-closed sin apiKey', async () => {
    await expect(
      reportMeteredOverage(
        {
          tenantId: 't1',
          stripeCustomerId: 'cus_1',
          periodYm: '2026-08',
          units: 3,
          idempotencyKey: 't1:2026-08:2026-08-07',
        },
        { apiKey: undefined },
      ),
    ).rejects.toBeInstanceOf(StripeMeterConfigError);
  });

  it('noop si units <= 0', async () => {
    const fetchImpl = vi.fn();
    const res = await reportMeteredOverage(
      {
        tenantId: 't1',
        stripeCustomerId: 'cus_1',
        periodYm: '2026-08',
        units: 0,
        idempotencyKey: 'k',
      },
      { apiKey: 'sk_test', fetchImpl },
    );
    expect(res.ok).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POST meter_events con Idempotency-Key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"object":"billing.meter_event"}'),
    });
    const res = await reportMeteredOverage(
      {
        tenantId: 't1',
        stripeCustomerId: 'cus_x',
        periodYm: '2026-08',
        units: 5,
        idempotencyKey: 't1:2026-08:d',
      },
      { apiKey: 'sk_test_abc', fetchImpl, apiBase: 'https://api.stripe.test' },
    );
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.test/v1/billing/meter_events');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('t1:2026-08:d');
    expect(typeof init.body === 'string' ? init.body : '').toContain('payload%5Bvalue%5D=5');
  });

  it('propaga fallo HTTP', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: () => Promise.resolve('err'),
    });
    const res = await reportMeteredOverage(
      {
        tenantId: 't1',
        stripeCustomerId: 'cus_x',
        periodYm: '2026-08',
        units: 1,
        idempotencyKey: 'k',
      },
      { apiKey: 'sk_test', fetchImpl },
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(402);
  });
});
