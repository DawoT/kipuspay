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
};

describe('Sprint 43 offline fulfillment queue (RED)', () => {
  it('stores only opaque scoped authority and no tenant or price', async () => {
    const queue = new CustomerOrderFulfillmentQueue(createMemoryCustomerOrderQueue());
    await queue.enqueue(envelope);
    const [pending] = await queue.listPending();
    expect(pending).toMatchObject(envelope);
    expect(pending).not.toHaveProperty('tenantId');
    expect(pending).not.toHaveProperty('unitPriceCents');
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
    const first = await reconcileCustomerOrderFulfillments(queue, transport);
    const replay = await reconcileCustomerOrderFulfillments(queue, transport);
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
    const result = await reconcileCustomerOrderFulfillments(queue, transport);
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
  });
});
