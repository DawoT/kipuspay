import { describe, expect, it, vi } from 'vitest';
import { createRecurringSalesApi } from './recurring-sales-client.js';

describe('Sprint 44 POS recurring-sales client contract (RED)', () => {
  it('sends IDs, schedule and quantities but never tenant or money authority', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          planId: 'plan-a',
          planVersion: 1,
          pricingPolicy: 'FIXED',
          nextRunAt: '2026-08-31T09:30:00-05:00',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    const api = createRecurringSalesApi({ authenticatedFetch: fetchFn });
    await api.create({
      customerId: 'customer-a',
      branchId: 'branch-a',
      documentType: '03',
      pricingPolicy: 'FIXED',
      frequency: 'MONTHLY',
      anchorDay: 31,
      items: [{ productId: 'service-a', quantityMicrounits: 1_000_000 }],
    });
    const call = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(typeof call[1].body === 'string' ? call[1].body : '') as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('tenantId');
    expect(JSON.stringify(body)).not.toMatch(
      /unitPriceCents|totalAmountCents|balanceDueCents|card|paymentToken/i,
    );
  });

  it('supports list, preview, pause, resume, cancel and occurrence history', async () => {
    const ok = (body: Record<string, unknown>) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(ok({ plans: [] }))
      .mockResolvedValueOnce(
        ok({
          planId: 'plan-a',
          nextRunAt: '2026-09-01T09:00:00-05:00',
          items: [],
          serverAuthoritative: true,
        }),
      )
      .mockResolvedValueOnce(ok({ status: 'PAUSED' }))
      .mockResolvedValueOnce(ok({ status: 'ACTIVE' }))
      .mockResolvedValueOnce(
        ok({
          status: 'CANCEL_AT_PERIOD_END',
          creditAmountCents: 0,
        }),
      )
      .mockResolvedValueOnce(ok({ occurrences: [], retry: { count: 0, status: 'SAFE' } }));
    const api = createRecurringSalesApi({ authenticatedFetch: fetchFn });
    await api.list({ branchId: 'branch-a' });
    await api.preview({ planId: 'plan-a' });
    await api.pause({ planId: 'plan-a', expectedVersion: 1 });
    await api.resume({ planId: 'plan-a', expectedVersion: 2 });
    await api.cancel({ planId: 'plan-a', mode: 'AT_PERIOD_END', expectedVersion: 3 });
    await api.occurrences({ planId: 'plan-a' });
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it('rejects malformed success DTOs without exposing internal retry details', async () => {
    const api = createRecurringSalesApi({
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ planId: 7, sql: 'private' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    });
    await expect(
      api.create({
        customerId: 'customer-a',
        branchId: 'branch-a',
        documentType: 'NV',
        frequency: 'DAILY',
        items: [{ productId: 'service-a', quantityMicrounits: 1_000_000 }],
      }),
    ).rejects.toMatchObject({ code: 'RECURRING_RESPONSE_INVALID' });
  });
});
