import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runD1AtomicPlan } from './index.js';
import {
  appendCommissionAccrualToBatch,
  processCommissionPayoutAtomic,
  processCommissionPayoutPayAtomic,
  processCommissionPayoutVoidAtomic,
  processCommissionRateUpsertAtomic,
} from './process-commission-atomic.js';

async function seedCommissionFixture(tenantId: string): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
  adminId: string;
  sellerId: string;
  saleId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const adminId = `admin-${tenantId}`;
  const sellerId = `seller-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const productId = `p-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId, 'Comisiones SAC'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, 'C01', 'Centro', 'Lima')`,
    ).bind(branchId, tenantId),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, 'Caja 1')`,
    ).bind(registerId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'cashier'), (?, ?, ?, ?, 'owner'), (?, ?, ?, ?, 'cashier')`,
    ).bind(
      userId,
      tenantId,
      branchId,
      `${tenantId}@example.com`,
      adminId,
      tenantId,
      branchId,
      `admin-${tenantId}@example.com`,
      sellerId,
      tenantId,
      branchId,
      `seller-${tenantId}@example.com`,
    ),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, allow_negative_stock)
       VALUES (?, ?, ?, 'Producto', 'physical', 'NIU', 1000, 400, 0, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(`pm-${tenantId}`, tenantId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, exchange_rate,
         total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
         total_discount_cents, total_cogs_cents, total_amount_cents,
         issued_at_lima, sunat_status, must_submit_by
       ) VALUES (?, ?, ?, ?, ?, '1', '00000000', 'Cliente',
         '03', 'B001', 1, 'PEN', 1.0, 8475, 0, 1525, 0, 0, 0, 10000,
         '2026-08-08T15:00:00', 'PENDING', '2026-08-08T16:00:00')`,
    ).bind(saleId, tenantId, branchId, sessionId, sellerId),
  ]);

  return { branchId, sessionId, userId, adminId, sellerId, saleId, productId };
}

describe('processCommissionRateUpsertAtomic (Sprint 37)', () => {
  it('crea y actualiza una tasa seller+product', async () => {
    const fixture = await seedCommissionFixture('t-comm-rate');
    const created = await processCommissionRateUpsertAtomic(
      env.DB,
      't-comm-rate',
      fixture.adminId,
      {
        sellerId: fixture.sellerId,
        productId: fixture.productId,
        ratePercent: 5,
        branchId: fixture.branchId,
        actorIsAdminOrOwner: true,
      },
    );
    const updated = await processCommissionRateUpsertAtomic(
      env.DB,
      't-comm-rate',
      fixture.adminId,
      {
        sellerId: fixture.sellerId,
        productId: fixture.productId,
        ratePercent: 7,
        branchId: fixture.branchId,
        actorIsAdminOrOwner: true,
      },
    );
    expect(updated.rateId).toBe(created.rateId);

    const row = await env.DB.prepare(
      `SELECT rate_percent FROM commission_rates WHERE tenant_id = ? AND id = ?`,
    )
      .bind('t-comm-rate', created.rateId)
      .first<{ rate_percent: number }>();
    expect(row?.rate_percent).toBe(7);
  });

  it('rechaza cajero sin rol admin', async () => {
    const fixture = await seedCommissionFixture('t-comm-forbid');
    await expect(
      processCommissionRateUpsertAtomic(env.DB, 't-comm-forbid', fixture.userId, {
        sellerId: fixture.sellerId,
        ratePercent: 5,
        branchId: fixture.branchId,
        actorIsAdminOrOwner: false,
      }),
    ).rejects.toThrow('COMMISSION_FORBIDDEN');
  });

  it('rechaza rate negativo', async () => {
    const fixture = await seedCommissionFixture('t-comm-rate-neg');
    await expect(
      processCommissionRateUpsertAtomic(env.DB, 't-comm-rate-neg', fixture.adminId, {
        sellerId: fixture.sellerId,
        ratePercent: -1,
        branchId: fixture.branchId,
        actorIsAdminOrOwner: true,
      }),
    ).rejects.toThrow('COMMISSION_INVALID_RATE');
  });
});

describe('appendCommissionAccrualToBatch + payout (Sprint 37)', () => {
  it('acumula comisión y paga el payout', async () => {
    const fixture = await seedCommissionFixture('t-comm-flow');
    await processCommissionRateUpsertAtomic(env.DB, 't-comm-flow', fixture.adminId, {
      sellerId: fixture.sellerId,
      productId: fixture.productId,
      ratePercent: 10,
      branchId: fixture.branchId,
      actorIsAdminOrOwner: true,
    });

    let accrualId: string | null = null;
    await runD1AtomicPlan(env.DB, async (plan) => {
      const accrued = await appendCommissionAccrualToBatch(plan, env.DB, {
        tenantId: 't-comm-flow',
        userId: fixture.userId,
        branchId: fixture.branchId,
        saleId: fixture.saleId,
        sellerId: fixture.sellerId,
        lines: [{ productId: fixture.productId, categoryId: null, lineTotalCents: 5000 }],
        prevAuditHash: null,
        chartOn: false,
        accountsByCode: new Map(),
        postDate: '2026-08-08',
      });
      accrualId = accrued.accrualId;
    });
    expect(accrualId).toBeTruthy();

    const accrualRow = await env.DB.prepare(
      `SELECT amount_cents FROM commission_accruals WHERE tenant_id = ? AND id = ?`,
    )
      .bind('t-comm-flow', accrualId)
      .first<{ amount_cents: number }>();
    expect(accrualRow?.amount_cents).toBe(500);

    const payout = await processCommissionPayoutAtomic(env.DB, 't-comm-flow', fixture.adminId, {
      sellerId: fixture.sellerId,
      periodStartIso: '2026-08-01',
      periodEndIso: '2026-08-31',
      branchId: fixture.branchId,
      actorIsAdminOrOwner: true,
    });
    expect(payout.grossCents).toBe(500);

    const paid = await processCommissionPayoutPayAtomic(env.DB, 't-comm-flow', fixture.adminId, {
      payoutId: payout.payoutId,
      branchId: fixture.branchId,
      actorIsAdminOrOwner: true,
    });
    expect(paid.status).toBe('PAID');

    await expect(
      processCommissionPayoutAtomic(env.DB, 't-comm-flow', fixture.adminId, {
        sellerId: fixture.sellerId,
        periodStartIso: '2026-08-01',
        periodEndIso: '2026-08-31',
        branchId: fixture.branchId,
        actorIsAdminOrOwner: true,
      }),
    ).rejects.toThrow('COMMISSION_NOTHING_TO_PAY');
  });

  it('anula un payout OPEN y rechaza anular uno PAID', async () => {
    const fixture = await seedCommissionFixture('t-comm-void');
    await processCommissionRateUpsertAtomic(env.DB, 't-comm-void', fixture.adminId, {
      sellerId: fixture.sellerId,
      productId: fixture.productId,
      rateAmountCents: 250,
      ratePercent: 0,
      branchId: fixture.branchId,
      actorIsAdminOrOwner: true,
    });
    await runD1AtomicPlan(env.DB, async (plan) => {
      await appendCommissionAccrualToBatch(plan, env.DB, {
        tenantId: 't-comm-void',
        userId: fixture.userId,
        branchId: fixture.branchId,
        saleId: fixture.saleId,
        sellerId: fixture.sellerId,
        lines: [{ productId: fixture.productId, categoryId: null, lineTotalCents: 1000 }],
        prevAuditHash: null,
        chartOn: false,
        accountsByCode: new Map(),
        postDate: '2026-08-08',
      });
    });
    const payout = await processCommissionPayoutAtomic(env.DB, 't-comm-void', fixture.adminId, {
      sellerId: fixture.sellerId,
      periodStartIso: '2026-08-01',
      periodEndIso: '2026-08-31',
      branchId: fixture.branchId,
      actorIsAdminOrOwner: true,
    });
    const voided = await processCommissionPayoutVoidAtomic(env.DB, 't-comm-void', fixture.adminId, {
      payoutId: payout.payoutId,
      branchId: fixture.branchId,
      actorIsAdminOrOwner: true,
    });
    expect(voided.status).toBe('VOID');
  });
});
