import { describe, expect, it, vi } from 'vitest';
import {
  createCustomerOrderClient,
  fulfillCustomerOrderClient,
  mintOfflineFulfillmentEnvelope,
} from './customer-order-client.js';

describe('Sprint 43 POS customer-order client (RED)', () => {
  it('never sends tenant or authoritative price from the client', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ orderId: 'order-a' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await createCustomerOrderClient(
      {
        tenantId: 'must-not-cross-boundary',
        branchId: 'branch-a',
        customerId: 'customer-a',
        items: [
          {
            productId: 'product-a',
            enteredQuantityMicrounits: 1_000_000,
            unitPriceCents: 1,
          },
        ],
      },
      fetchFn,
    );
    const request = JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(request).not.toHaveProperty('tenantId');
    expect(JSON.stringify(request)).not.toContain('unitPriceCents');
  });

  it('uses an opaque server-minted scoped envelope with bounded TTL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          envelope: 'opaque-signed-envelope',
          scope: 'CUSTOMER_ORDER_FULFILL',
          expiresAt: '2026-08-08T12:10:00.000Z',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    const envelope = await mintOfflineFulfillmentEnvelope(
      {
        orderId: 'order-a',
        branchId: 'branch-a',
        terminalId: 'terminal-a',
      },
      fetchFn,
    );
    expect(envelope).toEqual({
      envelope: 'opaque-signed-envelope',
      scope: 'CUSTOMER_ORDER_FULFILL',
      expiresAt: '2026-08-08T12:10:00.000Z',
    });
  });

  it('replays one idempotency key without inventing a new sale or price', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ saleId: 'sale-a', fulfillmentId: 'fulfillment-a' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const input = {
      orderId: 'order-a',
      envelope: 'opaque-signed-envelope',
      idempotencyKey: 'offline-replay-1',
    };
    const first = await fulfillCustomerOrderClient(input, fetchFn);
    const replay = await fulfillCustomerOrderClient(input, fetchFn);
    expect(replay).toEqual(first);
    expect(JSON.stringify(fetchFn.mock.calls)).not.toContain('unitPriceCents');
  });
});
