import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  cancelCustomerOrderAtomic,
  expireCustomerOrderAtomic,
  fulfillCustomerOrderAtomic,
} from './process-customer-order-atomic.js';
import { seedCustomerOrderFixture } from './customer-order-test-fixture.js';

describe('Sprint 43 customer-order workerd concurrency (RED)', () => {
  it('rejects cross-tenant order, item, lease, sale, and notification references', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: 'tenant-order-a',
      otherTenantId: 'tenant-order-b',
      quantityMicrounits: 2_000_000,
    });
    await expect(
      fulfillCustomerOrderAtomic(env.DB, {
        tenantId: fixture.otherTenantId,
        orderId: fixture.orderId,
        terminalId: fixture.otherTenantTerminalId,
        envelope: fixture.envelope,
        idempotencyKey: 'cross-tenant',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_NOT_FOUND' });
    expect(await fixture.readOrder()).toMatchObject({
      reserved_quantity_microunits: 2_000_000,
      fulfilled_quantity_microunits: 0,
    });
  });

  it('makes duplicate fulfillment one-shot and idempotent', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: 'tenant-order-replay',
      quantityMicrounits: 1_000_000,
    });
    const input = {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      terminalId: fixture.terminalId,
      envelope: fixture.envelope,
      idempotencyKey: 'fulfill-replay',
    };
    const first = await fulfillCustomerOrderAtomic(env.DB, input);
    const replay = await fulfillCustomerOrderAtomic(env.DB, input);
    expect(replay).toEqual(first);
    expect(await fixture.countSales()).toBe(1);
    expect(await fixture.countFiscalOutbox()).toBe(1);
  });

  it.each(['cancel', 'expire'] as const)(
    'serializes concurrent fulfill versus %s with one conservative winner',
    async (competitor) => {
      const fixture = await seedCustomerOrderFixture(env.DB, {
        tenantId: `tenant-race-${competitor}`,
        quantityMicrounits: 2_000_000,
      });
      const close =
        competitor === 'cancel'
          ? cancelCustomerOrderAtomic(env.DB, {
              tenantId: fixture.tenantId,
              orderId: fixture.orderId,
              actorUserId: fixture.actorUserId,
              idempotencyKey: 'race-close',
            })
          : expireCustomerOrderAtomic(env.DB, {
              tenantId: fixture.tenantId,
              orderId: fixture.orderId,
              idempotencyKey: 'race-expire',
            });
      const results = await Promise.allSettled([
        fulfillCustomerOrderAtomic(env.DB, {
          tenantId: fixture.tenantId,
          orderId: fixture.orderId,
          terminalId: fixture.terminalId,
          envelope: fixture.envelope,
          idempotencyKey: 'race-fulfill',
        }),
        close,
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const row = await fixture.readOrder();
      expect(
        row.fulfilled_quantity_microunits +
          row.released_quantity_microunits +
          row.reserved_quantity_microunits,
      ).toBe(row.requested_quantity_microunits);
      expect(await fixture.stockConservationDelta()).toBe(0);
      expect(await fixture.auditChainIsLinear()).toBe(true);
    },
  );

  it('supports multiple partial sales across batch/location/serial/UOM allocations', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: 'tenant-order-partials',
      quantityMicrounits: 2_000_000,
      withBatchLocationSerialUom: true,
    });
    await fixture.fulfillPartial(1_000_000, 'partial-1');
    await fixture.fulfillPartial(1_000_000, 'partial-2');
    expect(await fixture.countSales()).toBe(2);
    expect(await fixture.readOrder()).toMatchObject({
      status: 'FULFILLED',
      reserved_quantity_microunits: 0,
      fulfilled_quantity_microunits: 2_000_000,
      released_quantity_microunits: 0,
    });
    expect(await fixture.inventoryDimensionsRemainConsistent()).toBe(true);
  });
});
