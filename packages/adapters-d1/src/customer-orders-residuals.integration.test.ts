import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import {
  cancelCustomerOrderAtomic,
  createCustomerOrderAtomic,
  dispatchCustomerOrderNotice,
  ensureCustomerOrderExpiryNoticeAtomic,
  expireCustomerOrderAtomic,
  fulfillCustomerOrderAtomic,
  mintCustomerOrderLeaseAtomic,
  mintCustomerOrderRepriceAuthorizationAtomic,
  processExpiredCustomerOrderRepriceHandoffAtomic,
} from './process-customer-order-atomic.js';
import { seedCustomerOrderFixture } from './customer-order-test-fixture.js';
import type { D1Bound, D1DatabaseLike } from './index.js';

function failBatchAt(db: D1DatabaseLike, index: number): D1DatabaseLike {
  return {
    prepare: (sql) => db.prepare(sql),
    async batch(statements: readonly D1Bound[]) {
      const injected = [...statements];
      injected.splice(
        Math.min(index, injected.length),
        0,
        db.prepare(`INSERT INTO sprint43_forced_rollback_missing(id) VALUES ('fail')`).bind(),
      );
      return db.batch(injected);
    },
  };
}

async function count(db: D1DatabaseLike, sql: string, params: readonly unknown[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<{ value: number }>();
  return row?.value ?? 0;
}

describe('Sprint 43 mandatory residual integration', () => {
  it('consumes every line in a multi-item envelope in one sale and replays that sale', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: `tenant-multi-${crypto.randomUUID()}`,
      quantityMicrounits: 1_000_000,
    });
    const created = await createCustomerOrderAtomic(env.DB, {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      customerId: fixture.customerId,
      actorUserId: fixture.actorUserId,
      reservedUntil: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: `multi-create-${crypto.randomUUID()}`,
      items: [
        { productId: fixture.productId, quantityMicrounits: 1_000_000 },
        { productId: fixture.productId, quantityMicrounits: 1_000_000 },
      ],
    });
    const detail = await env.DB.prepare(
      `SELECT id FROM customer_order_items
       WHERE tenant_id = ? AND customer_order_id = ? ORDER BY id`,
    )
      .bind(fixture.tenantId, created.orderId)
      .all<{ id: string }>();
    const itemIds = (detail.results ?? []).map((row) => row.id);
    const lease = await mintCustomerOrderLeaseAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: created.orderId,
      terminalId: fixture.terminalId,
      terminalSessionId: fixture.terminalSessionId,
      actorUserId: fixture.actorUserId,
      idempotencyKey: `multi-lease-${crypto.randomUUID()}`,
      items: itemIds.map((itemId) => ({ itemId, quantityMicrounits: 1_000_000 })),
    });
    const input = {
      tenantId: fixture.tenantId,
      orderId: created.orderId,
      terminalId: fixture.terminalId,
      terminalSessionId: fixture.terminalSessionId,
      actorUserId: fixture.actorUserId,
      envelope: lease.envelope,
      idempotencyKey: `multi-fulfill-${crypto.randomUUID()}`,
      cashRegisterSessionId: fixture.sessionId,
      documentType: '03' as const,
      series: fixture.series,
      paymentMethodId: fixture.paymentMethodId,
    };
    const racerInput = { ...input, idempotencyKey: `multi-racer-${crypto.randomUUID()}` };
    const race = await Promise.allSettled([
      fulfillCustomerOrderAtomic(env.DB, input),
      fulfillCustomerOrderAtomic(env.DB, racerInput),
    ]);
    expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const fulfilled = race.find(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fulfillCustomerOrderAtomic>>> =>
        result.status === 'fulfilled',
    )!.value;
    const winnerInput = race[0]?.status === 'fulfilled' ? input : racerInput;
    const replay = await fulfillCustomerOrderAtomic(env.DB, winnerInput);
    expect(fulfilled.saleItemIds).toHaveLength(2);
    expect(replay.saleId).toBe(fulfilled.saleId);
    const conserved = await env.DB.prepare(
      `SELECT COUNT(*) AS line_count,
              SUM(fulfilled_quantity_microunits) AS fulfilled,
              SUM(reserved_quantity_microunits) AS remaining
       FROM customer_order_items WHERE tenant_id = ? AND customer_order_id = ?`,
    )
      .bind(fixture.tenantId, created.orderId)
      .first<{ line_count: number; fulfilled: number; remaining: number }>();
    expect(conserved).toEqual({ line_count: 2, fulfilled: 2_000_000, remaining: 0 });
  });

  it('releases expiry once and consumes scoped supervisor auth for current-price handoff', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: `tenant-reprice-${crypto.randomUUID()}`,
      quantityMicrounits: 1_000_000,
    });
    await env.DB.prepare(
      `UPDATE customer_orders SET reserved_until = datetime('now', '-1 minute')
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(fixture.tenantId, fixture.orderId)
      .run();
    await expireCustomerOrderAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      actorUserId: fixture.actorUserId,
      idempotencyKey: `expire-${crypto.randomUUID()}`,
    });
    await expect(
      fulfillCustomerOrderAtomic(env.DB, {
        tenantId: fixture.tenantId,
        orderId: fixture.orderId,
        terminalId: fixture.terminalId,
        terminalSessionId: fixture.terminalSessionId,
        actorUserId: fixture.actorUserId,
        envelope: fixture.envelope,
        idempotencyKey: `expired-old-snapshot-${crypto.randomUUID()}`,
        cashRegisterSessionId: fixture.sessionId,
        documentType: '03',
        series: fixture.series,
        paymentMethodId: fixture.paymentMethodId,
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_LEASE_INVALID' });
    await env.DB.prepare(`UPDATE products SET price_cents = 2500 WHERE tenant_id = ? AND id = ?`)
      .bind(fixture.tenantId, fixture.productId)
      .run();
    const authorization = await mintCustomerOrderRepriceAuthorizationAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      approvedByUserId: fixture.actorUserId,
      actorUserId: fixture.actorUserId,
      terminalId: fixture.terminalId,
      terminalSessionId: fixture.terminalSessionId,
      requestedTtlSeconds: 300,
    });
    const rawPersisted = await env.DB.prepare(
      `SELECT COUNT(*) AS value FROM authorization_tokens
       WHERE tenant_id = ? AND token_hash = ?`,
    )
      .bind(fixture.tenantId, authorization.token)
      .first<{ value: number }>();
    expect(rawPersisted?.value).toBe(0);
    await expect(
      processExpiredCustomerOrderRepriceHandoffAtomic(env.DB, {
        tenantId: fixture.tenantId,
        orderId: fixture.orderId,
        actorUserId: fixture.actorUserId,
        terminalId: 'cross-terminal',
        terminalSessionId: fixture.terminalSessionId,
        authorizationToken: authorization.token,
        idempotencyKey: `reprice-cross-terminal-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_LEASE_INVALID' });
    const handoff = await processExpiredCustomerOrderRepriceHandoffAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      actorUserId: fixture.actorUserId,
      terminalId: fixture.terminalId,
      terminalSessionId: fixture.terminalSessionId,
      authorizationToken: authorization.token,
      idempotencyKey: `reprice-${crypto.randomUUID()}`,
    });
    expect(handoff).toMatchObject({
      source: 'CURRENT_SERVER_PRICING',
      requiresOrdinaryCheckout: true,
      lines: [{ unitPriceCents: 2500 }],
    });
    await expect(
      processExpiredCustomerOrderRepriceHandoffAtomic(env.DB, {
        tenantId: fixture.tenantId,
        orderId: fixture.orderId,
        actorUserId: fixture.actorUserId,
        terminalId: fixture.terminalId,
        terminalSessionId: fixture.terminalSessionId,
        authorizationToken: authorization.token,
        idempotencyKey: `reprice-reuse-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_REPRICE_AUTH_INVALID' });
    const stale = await mintCustomerOrderRepriceAuthorizationAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      approvedByUserId: fixture.actorUserId,
      actorUserId: fixture.actorUserId,
      terminalId: fixture.terminalId,
      terminalSessionId: fixture.terminalSessionId,
      requestedTtlSeconds: 300,
    });
    await env.DB.prepare(
      `UPDATE authorization_tokens SET expires_at = datetime('now', '-1 minute')
       WHERE tenant_id = ? AND customer_order_id = ? AND action = 'CUSTOMER_ORDER_REPRICE'
         AND used_at IS NULL`,
    )
      .bind(fixture.tenantId, fixture.orderId)
      .run();
    await expect(
      processExpiredCustomerOrderRepriceHandoffAtomic(env.DB, {
        tenantId: fixture.tenantId,
        orderId: fixture.orderId,
        actorUserId: fixture.actorUserId,
        terminalId: fixture.terminalId,
        terminalSessionId: fixture.terminalSessionId,
        authorizationToken: stale.token,
        idempotencyKey: `reprice-stale-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: 'CUSTOMER_ORDER_REPRICE_AUTH_INVALID' });
    expect(await fixture.readOrder()).toMatchObject({
      status: 'EXPIRED',
      reserved_quantity_microunits: 0,
      released_quantity_microunits: 1_000_000,
    });
  });

  it('claims WhatsApp delivery before transport and bounds failed retries', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: `tenant-notice-${crypto.randomUUID()}`,
      quantityMicrounits: 1_000_000,
    });
    const notice = await ensureCustomerOrderExpiryNoticeAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      actorUserId: fixture.actorUserId,
      idempotencyKey: `notice-${crypto.randomUUID()}`,
      whatsappCapabilityEnabled: true,
      whatsappOptInActive: true,
    });
    const sender = { sendExpiryWarning: vi.fn().mockResolvedValue({ accepted: false }) };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        dispatchCustomerOrderNotice(
          env.DB,
          { tenantId: fixture.tenantId, notificationId: notice.notificationId },
          sender,
        ),
      ).resolves.toEqual({ status: 'RETRY' });
    }
    await expect(
      dispatchCustomerOrderNotice(
        env.DB,
        { tenantId: fixture.tenantId, notificationId: notice.notificationId },
        sender,
      ),
    ).resolves.toEqual({ status: 'FAILED' });
    await expect(
      dispatchCustomerOrderNotice(
        env.DB,
        { tenantId: fixture.tenantId, notificationId: notice.notificationId },
        sender,
      ),
    ).resolves.toEqual({ status: 'FAILED' });
    expect(sender.sendExpiryWarning).toHaveBeenCalledTimes(5);
    await expect(
      fulfillCustomerOrderAtomic(env.DB, {
        tenantId: fixture.tenantId,
        orderId: fixture.orderId,
        terminalId: fixture.terminalId,
        terminalSessionId: fixture.terminalSessionId,
        actorUserId: fixture.actorUserId,
        envelope: fixture.envelope,
        idempotencyKey: `checkout-after-notice-${crypto.randomUUID()}`,
        cashRegisterSessionId: fixture.sessionId,
        documentType: '03',
        series: fixture.series,
        paymentMethodId: fixture.paymentMethodId,
      }),
    ).resolves.toMatchObject({ status: 'FULFILLED' });

    const expiring = await seedCustomerOrderFixture(env.DB, {
      tenantId: `tenant-notice-expire-${crypto.randomUUID()}`,
      quantityMicrounits: 1_000_000,
    });
    const expiringNotice = await ensureCustomerOrderExpiryNoticeAtomic(env.DB, {
      tenantId: expiring.tenantId,
      orderId: expiring.orderId,
      actorUserId: expiring.actorUserId,
      idempotencyKey: `notice-expire-${crypto.randomUUID()}`,
      whatsappCapabilityEnabled: true,
      whatsappOptInActive: true,
    });
    await dispatchCustomerOrderNotice(
      env.DB,
      { tenantId: expiring.tenantId, notificationId: expiringNotice.notificationId },
      sender,
    );
    await env.DB.prepare(
      `UPDATE customer_orders SET reserved_until = datetime('now', '-1 minute')
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(expiring.tenantId, expiring.orderId)
      .run();
    await expect(
      expireCustomerOrderAtomic(env.DB, {
        tenantId: expiring.tenantId,
        orderId: expiring.orderId,
        actorUserId: expiring.actorUserId,
        idempotencyKey: `expire-after-notice-${crypto.randomUUID()}`,
      }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
  });

  it('deduplicates concurrent WhatsApp dispatch by durable send key', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: `tenant-notice-dedupe-${crypto.randomUUID()}`,
      quantityMicrounits: 1_000_000,
    });
    const notice = await ensureCustomerOrderExpiryNoticeAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: fixture.orderId,
      actorUserId: fixture.actorUserId,
      idempotencyKey: `notice-dedupe-${crypto.randomUUID()}`,
      whatsappCapabilityEnabled: true,
      whatsappOptInActive: true,
    });
    const sender = { sendExpiryWarning: vi.fn().mockResolvedValue({ accepted: true }) };
    const attempts = await Promise.allSettled([
      dispatchCustomerOrderNotice(
        env.DB,
        { tenantId: fixture.tenantId, notificationId: notice.notificationId },
        sender,
      ),
      dispatchCustomerOrderNotice(
        env.DB,
        { tenantId: fixture.tenantId, notificationId: notice.notificationId },
        sender,
      ),
    ]);
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    expect(sender.sendExpiryWarning).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare(
        `SELECT status, attempt_count FROM customer_order_notifications
         WHERE tenant_id = ? AND id = ?`,
      )
        .bind(fixture.tenantId, notice.notificationId)
        .first<{ status: string; attempt_count: number }>(),
    ).toEqual({ status: 'SENT', attempt_count: 1 });
  });

  it('reserves and releases batch, location, serial, and non-base UOM exactly once', async () => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: `tenant-dimensions-${crypto.randomUUID()}`,
      quantityMicrounits: 1_000_000,
      withBatchLocationSerialUom: true,
    });
    const serialId = `serial-${crypto.randomUUID()}`;
    const alternateUomId = `uom-${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO product_uoms (
           id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
         ) VALUES (?, ?, ?, 'BX', 2, 1, 0)`,
      ).bind(alternateUomId, fixture.tenantId, fixture.productId),
      env.DB.prepare(
        `INSERT INTO serial_numbers (
           id, tenant_id, branch_id, location_id, product_id, serial_number,
           serial_number_normalized, status, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', 1)`,
      ).bind(
        serialId,
        fixture.tenantId,
        fixture.branchId,
        fixture.locationId,
        fixture.productId,
        `SN-${serialId}`,
        `SN-${serialId}`.toUpperCase(),
      ),
    ]);
    const created = await createCustomerOrderAtomic(env.DB, {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      customerId: fixture.customerId,
      actorUserId: fixture.actorUserId,
      reservedUntil: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: `dimensions-${crypto.randomUUID()}`,
      items: [
        {
          productId: fixture.productId,
          productUomId: alternateUomId,
          enteredQuantityMicrounits: 500_000,
          locationId: fixture.locationId,
          batchId: fixture.batchId!,
          serialIds: [serialId],
        },
      ],
    });
    const snapshot = await env.DB.prepare(
      `SELECT entered_quantity_microunits, factor_numerator, factor_denominator,
              requested_quantity_microunits, serial_id
       FROM customer_order_items WHERE tenant_id = ? AND customer_order_id = ?`,
    )
      .bind(fixture.tenantId, created.orderId)
      .first<Record<string, number | string>>();
    expect(snapshot).toMatchObject({
      entered_quantity_microunits: 500_000,
      factor_numerator: 2,
      factor_denominator: 1,
      requested_quantity_microunits: 1_000_000,
      serial_id: serialId,
    });
    expect(
      await env.DB.prepare(`SELECT status FROM serial_numbers WHERE tenant_id = ? AND id = ?`)
        .bind(fixture.tenantId, serialId)
        .first<{ status: string }>(),
    ).toEqual({ status: 'RESERVED' });
    await cancelCustomerOrderAtomic(env.DB, {
      tenantId: fixture.tenantId,
      orderId: created.orderId,
      actorUserId: fixture.actorUserId,
      reason: 'CUSTOMER_REQUEST',
      idempotencyKey: `dimensions-cancel-${crypto.randomUUID()}`,
    });
    expect(
      await env.DB.prepare(`SELECT status FROM serial_numbers WHERE tenant_id = ? AND id = ?`)
        .bind(fixture.tenantId, serialId)
        .first<{ status: string }>(),
    ).toEqual({ status: 'AVAILABLE' });
    expect(await fixture.inventoryDimensionsRemainConsistent()).toBe(true);
  });

  it.each([1, 3, 5])('rolls back create reservation at injected phase %s', async (phase) => {
    const fixture = await seedCustomerOrderFixture(env.DB, {
      tenantId: `tenant-create-rollback-${phase}-${crypto.randomUUID()}`,
      quantityMicrounits: 1_000_000,
    });
    const beforeStock = await count(
      env.DB,
      `SELECT stock_microunits AS value FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
      [fixture.tenantId, fixture.branchId, fixture.productId],
    );
    const beforeOrders = await count(
      env.DB,
      `SELECT COUNT(*) AS value FROM customer_orders WHERE tenant_id = ?`,
      [fixture.tenantId],
    );
    const beforeAudits = await count(
      env.DB,
      `SELECT COUNT(*) AS value FROM audit_events WHERE tenant_id = ?`,
      [fixture.tenantId],
    );
    await expect(
      createCustomerOrderAtomic(failBatchAt(env.DB, phase), {
        tenantId: fixture.tenantId,
        branchId: fixture.branchId,
        customerId: fixture.customerId,
        actorUserId: fixture.actorUserId,
        reservedUntil: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: `create-rollback-${phase}-${crypto.randomUUID()}`,
        items: [{ productId: fixture.productId, quantityMicrounits: 1_000_000 }],
      }),
    ).rejects.toThrow();
    expect(
      await count(
        env.DB,
        `SELECT stock_microunits AS value FROM branch_product_stock
           WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
        [fixture.tenantId, fixture.branchId, fixture.productId],
      ),
    ).toBe(beforeStock);
    expect(
      await count(env.DB, `SELECT COUNT(*) AS value FROM customer_orders WHERE tenant_id = ?`, [
        fixture.tenantId,
      ]),
    ).toBe(beforeOrders);
    expect(
      await count(env.DB, `SELECT COUNT(*) AS value FROM audit_events WHERE tenant_id = ?`, [
        fixture.tenantId,
      ]),
    ).toBe(beforeAudits);
  });

  it.each([2, 5, 8, 12])(
    'rolls back fulfillment sale/payment/fiscal/audit/state at injected phase %s',
    async (phase) => {
      const fixture = await seedCustomerOrderFixture(env.DB, {
        tenantId: `tenant-fulfill-rollback-${phase}-${crypto.randomUUID()}`,
        quantityMicrounits: 1_000_000,
      });
      const beforeAudits = await count(
        env.DB,
        `SELECT COUNT(*) AS value FROM audit_events WHERE tenant_id = ?`,
        [fixture.tenantId],
      );
      await expect(
        fulfillCustomerOrderAtomic(failBatchAt(env.DB, phase), {
          tenantId: fixture.tenantId,
          orderId: fixture.orderId,
          terminalId: fixture.terminalId,
          actorUserId: fixture.actorUserId,
          envelope: fixture.envelope,
          idempotencyKey: `fulfill-rollback-${phase}-${crypto.randomUUID()}`,
          cashRegisterSessionId: fixture.sessionId,
          documentType: '03',
          series: fixture.series,
          paymentMethodId: fixture.paymentMethodId,
        }),
      ).rejects.toThrow();
      expect(await fixture.countSales()).toBe(0);
      expect(await fixture.countFiscalOutbox()).toBe(0);
      expect(await fixture.readOrder()).toMatchObject({
        status: 'OPEN',
        reserved_quantity_microunits: 1_000_000,
        fulfilled_quantity_microunits: 0,
      });
      expect(
        await count(env.DB, `SELECT COUNT(*) AS value FROM audit_events WHERE tenant_id = ?`, [
          fixture.tenantId,
        ]),
      ).toBe(beforeAudits);
      expect(await fixture.stockConservationDelta()).toBe(1_000_000);
    },
  );

  it.each(['cancel', 'expire'] as const)(
    'rolls back %s release, notice, audit, and order state',
    async (operation) => {
      const fixture = await seedCustomerOrderFixture(env.DB, {
        tenantId: `tenant-${operation}-rollback-${crypto.randomUUID()}`,
        quantityMicrounits: 1_000_000,
      });
      if (operation === 'expire') {
        await env.DB.prepare(
          `UPDATE customer_orders SET reserved_until = datetime('now', '-1 minute')
           WHERE tenant_id = ? AND id = ?`,
        )
          .bind(fixture.tenantId, fixture.orderId)
          .run();
      }
      const beforeAudits = await count(
        env.DB,
        `SELECT COUNT(*) AS value FROM audit_events WHERE tenant_id = ?`,
        [fixture.tenantId],
      );
      const db = failBatchAt(env.DB, 3);
      const mutation =
        operation === 'expire'
          ? expireCustomerOrderAtomic(db, {
              tenantId: fixture.tenantId,
              orderId: fixture.orderId,
              actorUserId: fixture.actorUserId,
              idempotencyKey: `expire-rollback-${crypto.randomUUID()}`,
            })
          : cancelCustomerOrderAtomic(db, {
              tenantId: fixture.tenantId,
              orderId: fixture.orderId,
              actorUserId: fixture.actorUserId,
              reason: 'CUSTOMER_REQUEST',
              idempotencyKey: `cancel-rollback-${crypto.randomUUID()}`,
            });
      await expect(mutation).rejects.toThrow();
      expect(await fixture.readOrder()).toMatchObject({
        status: 'OPEN',
        reserved_quantity_microunits: 1_000_000,
        released_quantity_microunits: 0,
      });
      expect(
        await count(
          env.DB,
          `SELECT COUNT(*) AS value FROM customer_order_notifications
           WHERE tenant_id = ? AND customer_order_id = ?`,
          [fixture.tenantId, fixture.orderId],
        ),
      ).toBe(0);
      expect(
        await count(env.DB, `SELECT COUNT(*) AS value FROM audit_events WHERE tenant_id = ?`, [
          fixture.tenantId,
        ]),
      ).toBe(beforeAudits);
    },
  );
});
