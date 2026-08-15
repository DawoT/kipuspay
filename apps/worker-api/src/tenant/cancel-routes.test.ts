import { describe, expect, it, vi } from 'vitest';
import { runCancelTenantHttp, runBillingPortalHttp } from './cancel-routes.js';

function env(tenantExists: boolean, kvMap?: Map<string, string>) {
  const kv = kvMap ?? new Map<string, string>();
  return {
    DB: {
      prepare: vi.fn(() => {
        const stmt = {
          bind: vi.fn(() => stmt),
          first: vi.fn(() =>
            Promise.resolve(tenantExists ? { id: 't1', stripe_customer_id: 'cus_1' } : null),
          ),
          run: vi.fn(() => Promise.resolve({ success: true })),
        };
        return stmt;
      }),
      batch: vi.fn(),
    },
    TENANT_KV: {
      get: vi.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
      put: vi.fn((k: string, v: string) => {
        kv.set(k, v);
        return Promise.resolve();
      }),
    },
  } as never;
}

describe('runCancelTenantHttp (S11-E11 cancelación self-serve)', () => {
  it('owner cancela → 200, D1 + KV en canceled', async () => {
    const kv = new Map([
      ['tenant:t1', JSON.stringify({ subscriptionStatus: 'active', trialEndsAt: null })],
    ]);
    const db = env(true, kv) as unknown as { DB: { prepare: ReturnType<typeof vi.fn> } };
    const res = await runCancelTenantHttp(db as never, 't1', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.canceled).toBe(true);
    const calls = db.DB.prepare.mock.calls as [string][];
    expect(calls.some(([sql]) => sql.includes("subscription_status = 'canceled'"))).toBe(true);
    const snapshot = JSON.parse(kv.get('tenant:t1') ?? '{}') as { subscriptionStatus: string };
    expect(snapshot.subscriptionStatus).toBe('canceled');
  });

  it('con Stripe cancela suscripciones prorrateadas', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'sub_1', status: 'active' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const res = await runCancelTenantHttp(
      { ...env(true), STRIPE_SECRET_KEY: 'sk_test' } as never,
      't1',
      'owner',
      fetchImpl,
    );
    expect(res.status).toBe(200);
    expect(res.body.stripeCanceled).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('portal de facturación exige customer Stripe', async () => {
    const none = env(true);
    const res = await runBillingPortalHttp(none, 't1', 'owner', 'https://app.kipuspay.com/');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('STRIPE_UNAVAILABLE');
  });

  it('cashier no puede (403); tenant inexistente 404; sin DB 503', async () => {
    expect((await runCancelTenantHttp(env(true), 't1', 'cashier')).status).toBe(403);
    expect((await runCancelTenantHttp(env(false), 't1', 'owner')).status).toBe(404);
    expect((await runCancelTenantHttp(undefined, 't1', 'owner')).status).toBe(503);
  });
});
