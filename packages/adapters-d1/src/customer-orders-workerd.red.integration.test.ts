import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  cancelCustomerOrderAtomic,
  expireCustomerOrderAtomic,
  fulfillCustomerOrderAtomic,
  getCustomerOrderDetail,
  listCustomerOrders,
  mintCustomerOrderLeaseAtomic,
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
      terminalSessionId: fixture.terminalSessionId,
      actorUserId: fixture.actorUserId,
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
              reason: 'CUSTOMER_REQUEST',
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
          terminalSessionId: fixture.terminalSessionId,
          actorUserId: fixture.actorUserId,
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

  it.each(['cancel', 'expire'] as const)(
    'returns opaque not-found and preserves state for cross-branch %s',
    async (operation) => {
      const fixture = await seedCustomerOrderFixture(env.DB, {
        tenantId: `tenant-cross-branch-${operation}`,
        quantityMicrounits: 1_000_000,
      });
      const close = operation === 'cancel' ? cancelCustomerOrderAtomic : expireCustomerOrderAtomic;
      await expect(
        close(env.DB, {
          tenantId: fixture.tenantId,
          orderId: fixture.orderId,
          branchId: 'branch-not-owned-by-actor',
          actorUserId: fixture.actorUserId,
          reason: operation === 'cancel' ? 'CUSTOMER_REQUEST' : undefined,
          idempotencyKey: `cross-branch-${operation}`,
        }),
      ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_NOT_FOUND' });
      expect(await fixture.readOrder()).toMatchObject({
        status: 'OPEN',
        reserved_quantity_microunits: 1_000_000,
      });
    },
  );

  it('hides cross-branch list and detail reads in workerd', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: 'tenant-cross-branch-read',
      quantityMicrounits: 1_000_000,
    });
    await expect(
      listCustomerOrders(env.DB, {
        tenantId: fixture.tenantId,
        branchId: 'branch-not-owned-by-actor',
      }),
    ).resolves.toEqual([]);
    await expect(
      getCustomerOrderDetail(
        env.DB,
        fixture.tenantId,
        fixture.orderId,
        'branch-not-owned-by-actor',
      ),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_NOT_FOUND' });
  });

  it('fails closed when the terminal session is revoked after lease minting', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: 'tenant-terminal-session-revoked',
      quantityMicrounits: 1_000_000,
    });
    await env.DB.prepare(
      `UPDATE pos_terminal_sessions SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.terminalSessionId)
      .run();
    await expect(
      fulfillCustomerOrderAtomic(env.DB, {
        tenantId: fixture.tenantId,
        orderId: fixture.orderId,
        terminalId: fixture.terminalId,
        terminalSessionId: fixture.terminalSessionId,
        actorUserId: fixture.actorUserId,
        envelope: fixture.envelope,
        idempotencyKey: 'revoked-after-lease',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_LEASE_INVALID' });
    expect(await fixture.countSales()).toBe(0);
  });

  it('rejects missing, wrong, and register-expired terminal sessions at lease minting', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: 'tenant-terminal-session-invalid',
      quantityMicrounits: 1_000_000,
    });
    const base = {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      terminalId: fixture.terminalId,
      actorUserId: fixture.actorUserId,
      quantityMicrounits: 1_000_000,
    };
    await expect(
      mintCustomerOrderLeaseAtomic(env.DB, {
        ...base,
        terminalSessionId: '',
        idempotencyKey: 'missing-terminal-session',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_LEASE_INVALID' });
    await expect(
      mintCustomerOrderLeaseAtomic(env.DB, {
        ...base,
        terminalSessionId: 'spoofed-terminal-session',
        idempotencyKey: 'wrong-terminal-session',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_LEASE_INVALID' });

    await env.DB.prepare(
      `UPDATE cash_register_sessions SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.sessionId)
      .run();
    await expect(
      mintCustomerOrderLeaseAtomic(env.DB, {
        ...base,
        terminalSessionId: fixture.terminalSessionId,
        idempotencyKey: 'expired-register-session',
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_LEASE_INVALID' });
  });
});
