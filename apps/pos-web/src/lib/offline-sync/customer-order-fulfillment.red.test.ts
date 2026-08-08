import { describe, expect, it, vi } from 'vitest';
import {
  CustomerOrderFulfillmentQueue,
  createMemoryCustomerOrderQueue,
  reconcileCustomerOrderFulfillments,
} from './customer-order-fulfillment-queue.js';

const envelope = {
  orderId: 'order-a',
  branchId: 'branch-a',
  terminalId: 'terminal-a',
  envelope: 'opaque-server-envelope',
  idempotencyKey: 'fulfill-offline-1',
  expiresAt: '2026-08-08T12:10:00.000Z',
  items: [
    { itemId: 'item-a', quantityMicrounits: 1_000_000 },
    { itemId: 'item-b', quantityMicrounits: 2_000_000 },
  ],
};

describe('Sprint 43 offline fulfillment queue (RED)', () => {
  it('stores only opaque scoped authority and no tenant or price', async () => {
    const queue = new CustomerOrderFulfillmentQueue(createMemoryCustomerOrderQueue());
    await queue.enqueue(envelope);
    const [pending] = await queue.listPending();
    expect(pending).toMatchObject(envelope);
    expect(pending).not.toHaveProperty('tenantId');
    expect(pending).not.toHaveProperty('unitPriceCents');
    expect(pending).not.toHaveProperty('supervisorToken');
  });

  it('survives queue reconstruction like an F5 and keeps multi-item quantities', async () => {
    const store = createMemoryCustomerOrderQueue();
    await new CustomerOrderFulfillmentQueue(store).enqueue(envelope);
    const afterReload = new CustomerOrderFulfillmentQueue(store);
    expect(await afterReload.listPending()).toEqual([
      expect.objectContaining({ items: envelope.items, status: 'PENDING' }),
    ]);
  });

  it('rejects a lease for another trusted branch or terminal before transport', async () => {
    const queue = new CustomerOrderFulfillmentQueue(createMemoryCustomerOrderQueue(), {
      branchId: 'branch-b',
      terminalId: 'terminal-a',
    });
    await expect(queue.enqueue(envelope)).rejects.toThrow('CUSTOMER_ORDER_LEASE_SCOPE_MISMATCH');
  });

  it('replays one-shot idempotently and removes only server-acknowledged entries', async () => {
    const queue = new CustomerOrderFulfillmentQueue(createMemoryCustomerOrderQueue());
    await queue.enqueue(envelope);
    const transport = {
      fulfill: vi.fn().mockResolvedValue({
        status: 'SUCCESS',
        saleId: 'sale-a',
        fulfillmentId: 'fulfillment-a',
      }),
    };
    const first = await reconcileCustomerOrderFulfillments(queue, transport, {
      now: '2026-08-08T12:00:00.000Z',
    });
    const replay = await reconcileCustomerOrderFulfillments(queue, transport, {
      now: '2026-08-08T12:00:00.000Z',
    });
    expect(first.succeeded).toBe(1);
    expect(replay.succeeded).toBe(0);
    expect(await queue.listPending()).toEqual([]);
  });

  it('keeps retry observable on lease/network failure without blocking ordinary sales', async () => {
    const queue = new CustomerOrderFulfillmentQueue(createMemoryCustomerOrderQueue());
    await queue.enqueue(envelope);
    const ordinaryCheckout = vi.fn().mockResolvedValue({ offlineSaleId: 'ordinary-sale-a' });
    const transport = {
      fulfill: vi.fn().mockRejectedValue(new Error('network unavailable')),
    };
    const result = await reconcileCustomerOrderFulfillments(queue, transport, {
      now: '2026-08-08T12:00:00.000Z',
    });
    expect(result.failed).toBe(1);
    expect((await queue.listPending())[0]).toMatchObject({ status: 'RETRY', attempts: 1 });
    await expect(ordinaryCheckout()).resolves.toEqual({ offlineSaleId: 'ordinary-sale-a' });
  });

  it('does not rewrite an expired order as an authoritative client-priced sale', async () => {
    const queue = new CustomerOrderFulfillmentQueue(createMemoryCustomerOrderQueue());
    await queue.enqueue({ ...envelope, expiresAt: '2026-08-07T12:00:00.000Z' });
    const transport = { fulfill: vi.fn() };
    const result = await reconcileCustomerOrderFulfillments(queue, transport, {
      now: '2026-08-08T12:00:00.000Z',
    });
    expect(result.expired).toBe(1);
    expect(transport.fulfill).not.toHaveBeenCalled();
    expect(JSON.stringify(await queue.listPending())).not.toContain('unitPriceCents');
    expect((await queue.listPending())[0]).toMatchObject({ status: 'CONFLICT' });
  });

  it('keeps expired or consumed leases as recoverable conflicts', async () => {
    const queue = new CustomerOrderFulfillmentQueue(createMemoryCustomerOrderQueue());
    await queue.enqueue(envelope);
    const transport = {
      fulfill: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('lease used'), { code: 'CUSTOMER_ORDER_LEASE_CONFLICT' }),
        ),
    };
    const result = await reconcileCustomerOrderFulfillments(queue, transport, {
      now: '2026-08-08T12:00:00.000Z',
    });
    expect(result.conflicted).toBe(1);
    expect((await queue.listPending())[0]).toMatchObject({
      status: 'CONFLICT',
      lastErrorCode: 'CUSTOMER_ORDER_LEASE_CONFLICT',
    });
  });
});
