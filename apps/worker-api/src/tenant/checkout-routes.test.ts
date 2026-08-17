import { describe, expect, it, vi } from 'vitest';
import { runCheckoutSessionHttp } from './checkout-routes.js';

function env(opts: {
  tenant?: { id: string; trade_name?: string; stripe_customer_id?: string | null } | null;
  price?: string;
  secret?: string;
}) {
  const db = {
    prepare: vi.fn(() => {
      const stmt = {
        bind: vi.fn(() => stmt),
        first: vi.fn(() => Promise.resolve(opts.tenant ?? null)),
        run: vi.fn(() => Promise.resolve({ success: true })),
      };
      return stmt;
    }),
  };
  return {
    DB: db,
    STRIPE_SECRET_KEY: opts.secret ?? 'sk_test',
    STRIPE_PRICE_ARRANQUE: opts.price ?? 'price_arr',
    STRIPE_PRICE_CRECE: 'price_crece',
    STRIPE_PRICE_CADENA: 'price_cadena',
  } as never;
}

describe('runCheckoutSessionHttp', () => {
  it('crea Checkout Session https y devuelve url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay_1' }), {
        status: 200,
      }),
    );
    const res = await runCheckoutSessionHttp(
      env({ tenant: { id: 't1', trade_name: 'Bodega', stripe_customer_id: 'cus_1' } }),
      't1',
      'owner',
      {
        planId: 'arranque',
        successUrl: 'https://app.kipuspay.com/ok',
        cancelUrl: 'https://app.kipuspay.com/cancel',
      },
      fetchImpl,
    );
    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.com/c/pay_1');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/v1/checkout/sessions');
  });

  it('Enterprise → 422 ENTERPRISE_SALES_ASSISTED', async () => {
    const res = await runCheckoutSessionHttp(env({ tenant: { id: 't1' } }), 't1', 'owner', {
      planId: 'enterprise',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ENTERPRISE_SALES_ASSISTED');
  });

  it('return URL no https → 422 INVALID_RETURN_URL', async () => {
    const res = await runCheckoutSessionHttp(
      env({ tenant: { id: 't1', stripe_customer_id: 'cus_1' } }),
      't1',
      'owner',
      {
        planId: 'crece',
        successUrl: 'ftp://evil.example/ok',
        cancelUrl: 'https://app.kipuspay.com/cancel',
      },
    );
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_RETURN_URL');
  });

  it('sin price id → 503', async () => {
    const res = await runCheckoutSessionHttp(
      env({ tenant: { id: 't1', stripe_customer_id: 'cus_1' }, price: '' }),
      't1',
      'owner',
      { planId: 'arranque' },
    );
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('STRIPE_PRICE_UNAVAILABLE');
  });

  it('cashier → 403', async () => {
    const res = await runCheckoutSessionHttp(env({ tenant: { id: 't1' } }), 't1', 'cashier', {
      planId: 'crece',
    });
    expect(res.status).toBe(403);
  });
});
