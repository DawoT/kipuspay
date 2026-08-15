import { describe, expect, it, vi } from 'vitest';
import {
  cancelStripeSubscription,
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  createStripeCustomer,
  isHttpsUrl,
  listStripeSubscriptions,
} from './stripe-billing.js';

describe('Stripe billing (cancel + portal)', () => {
  it('lista suscripciones del customer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'sub_1', status: 'active' }] }), { status: 200 }),
    );
    const list = await listStripeSubscriptions('cus_1', { apiKey: 'sk_test', fetchImpl });
    expect(list.data?.[0]?.id).toBe('sub_1');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('customer=cus_1');
  });

  it('cancela con prorrateo (DELETE prorate=true)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await cancelStripeSubscription('sub_1', { apiKey: 'sk_test', fetchImpl });
    expect(res.ok).toBe(true);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(init.body).toBe('prorate=true');
  });

  it('abre Customer Portal y devuelve url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session' }), { status: 200 }),
    );
    const res = await createStripeBillingPortalSession('cus_1', 'https://app.kipuspay.com/', {
      apiKey: 'sk_test',
      fetchImpl,
    });
    expect(res.url).toBe('https://billing.stripe.com/p/session');
  });

  it('crea Customer Stripe con metadata tenant_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'cus_new' }), { status: 200 }),
    );
    const res = await createStripeCustomer(
      { name: 'Bodega', tenantId: 't1' },
      { apiKey: 'sk_test', fetchImpl },
    );
    expect(res.id).toBe('cus_new');
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.body as string).toContain('metadata%5Btenant_id%5D=t1');
  });

  it('crea Checkout Session y exige https en helpers', async () => {
    expect(isHttpsUrl('https://app.kipuspay.com/ok')).toBe(true);
    expect(isHttpsUrl('ftp://app.kipuspay.com/ok')).toBe(false);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay' }), { status: 200 }),
    );
    const res = await createStripeCheckoutSession(
      {
        customerId: 'cus_1',
        priceId: 'price_arr',
        successUrl: 'https://app.kipuspay.com/ok',
        cancelUrl: 'https://app.kipuspay.com/cancel',
        tenantId: 't1',
      },
      { apiKey: 'sk_test', fetchImpl },
    );
    expect(res.url).toContain('checkout.stripe.com');
  });
});
