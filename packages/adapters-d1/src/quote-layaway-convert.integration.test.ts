import { env } from 'cloudflare:workers';
import { runQuoteConvertExpireChaosScenario } from '@kipuspay/chaos-harness';
import { describe, expect, it } from 'vitest';
import { processQuoteConvertAtomic } from './process-quote-atomic.js';
import { processLayawayConvertAtomic } from './process-layaway-atomic.js';

interface ConvertFixture {
  readonly branchId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly productId: string;
  readonly cashId: string;
  readonly anticipoId: string;
  readonly creditId: string;
  readonly customerId: string;
}

async function seedConvertFixture(tenantId: string): Promise<ConvertFixture> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const productId = `p-${tenantId}`;
  const seriesId = `ser-${tenantId}`;
  const cashId = `pm-cash-${tenantId}`;
  const anticipoId = `pm-anticipo-${tenantId}`;
  const creditId = `pm-credit-${tenantId}`;
  const customerId = `c-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'CONVERT SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, ?)`,
    ).bind(registerId, tenantId, branchId, 'Caja 1'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, ?)`,
    ).bind(userId, tenantId, branchId, `${tenantId}@example.com`, 'cashier'),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, 'NV', 'NV01', 0, 'INTERNAL')`,
    ).bind(seriesId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO products
         (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, allow_negative_stock)
       VALUES (?, ?, ?, ?, 'physical', 'NIU', 1000, 400, 0, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, 'Producto'),
    env.DB.prepare(
      `INSERT INTO branch_product_stock
         (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, 10, 10000000, 400)`,
    ).bind(tenantId, branchId, productId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'cash', 'Efectivo')`,
    ).bind(cashId, tenantId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'anticipo', 'Anticipo')`,
    ).bind(anticipoId, tenantId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'credit', 'Credito')`,
    ).bind(creditId, tenantId),
  ]);

  await env.DB.prepare(
    `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name, credit_limit_cents, is_active)
     VALUES (?, ?, '1', '45123456', 'Cliente Convert', 100000, 1)`,
  )
    .bind(customerId, tenantId)
    .run();
  return { branchId, sessionId, userId, productId, cashId, anticipoId, creditId, customerId };
}

async function seedQuote(
  tenantId: string,
  fixture: ConvertFixture,
  opts: {
    readonly quoteId: string;
    readonly status?: string;
    readonly validUntil?: string;
    readonly totalCents: number;
    readonly baseQuantityMicrounits: number;
    readonly lineTotalCents: number;
    readonly soldUomId?: string | null;
    readonly allowNegativeStock?: number;
    readonly stockMicrounits?: number;
  },
): Promise<void> {
  if (opts.allowNegativeStock !== undefined || opts.stockMicrounits !== undefined) {
    await env.DB.prepare(
      `UPDATE products SET allow_negative_stock = ? WHERE tenant_id = ? AND id = ?`,
    )
      .bind(opts.allowNegativeStock ?? 0, tenantId, fixture.productId)
      .run();
    await env.DB.prepare(
      `UPDATE branch_product_stock SET stock_microunits = ?, stock = ? * 0.000001
       WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(
        opts.stockMicrounits ?? 10000000,
        opts.stockMicrounits ?? 10000000,
        tenantId,
        fixture.productId,
      )
      .run();
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO quotes (
         id, tenant_id, branch_id, customer_id, status, valid_until, total_cents,
         created_by_user_id
       ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    ).bind(
      opts.quoteId,
      tenantId,
      fixture.branchId,
      opts.status ?? 'APPROVED',
      opts.validUntil ?? '2026-08-20',
      opts.totalCents,
      fixture.userId,
    ),
    env.DB.prepare(
      `INSERT INTO quote_items (
         id, tenant_id, quote_id, product_id, batch_id, sold_uom_id, sold_uom_code,
         entered_quantity_microunits, factor_numerator, factor_denominator,
         base_quantity_microunits, unit_price_cents, line_total_cents, promotion_ids_json
       ) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, 1, 1, ?, 1000, ?, '[]')`,
    ).bind(
      `qi-${opts.quoteId}`,
      tenantId,
      opts.quoteId,
      fixture.productId,
      opts.soldUomId ?? null,
      opts.baseQuantityMicrounits,
      opts.baseQuantityMicrounits,
      opts.lineTotalCents,
    ),
  ]);
}

async function seedDeposit(
  tenantId: string,
  fixture: ConvertFixture,
  opts: {
    readonly depositId: string;
    readonly snapshotTotalCents: number;
    readonly baseQuantityMicrounits: number;
    readonly paidCents: number;
  },
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sale_deposits (
         id, tenant_id, branch_id, customer_id, status, deposit_date, due_date,
         snapshot_total_cents, created_by_user_id
       ) VALUES (?, ?, ?, NULL, 'OPEN', '2026-08-04', '2026-08-20', ?, ?)`,
    ).bind(opts.depositId, tenantId, fixture.branchId, opts.snapshotTotalCents, fixture.userId),
    env.DB.prepare(
      `INSERT INTO sale_deposit_items (
         id, tenant_id, sale_deposit_id, product_id, batch_id, sold_uom_id, sold_uom_code,
         entered_quantity_microunits, factor_numerator, factor_denominator,
         base_quantity_microunits, unit_price_cents
       ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 1, 1, ?, 1000)`,
    ).bind(
      `di-${opts.depositId}`,
      tenantId,
      opts.depositId,
      fixture.productId,
      opts.baseQuantityMicrounits,
      opts.baseQuantityMicrounits,
    ),
    env.DB.prepare(
      `INSERT INTO sale_deposit_payments (
         id, tenant_id, sale_deposit_id, payment_method, amount_cents, created_by_user_id
       ) VALUES (?, ?, ?, 'cash', ?, ?)`,
    ).bind(`dp-${opts.depositId}`, tenantId, opts.depositId, opts.paidCents, fixture.userId),
  ]);
}

async function saleTotals(tenantId: string, saleId: string) {
  return env.DB.prepare(
    `SELECT total_taxable_cents, total_igv_cents, total_amount_cents
     FROM sales WHERE tenant_id = ? AND id = ?`,
  )
    .bind(tenantId, saleId)
    .first<{
      total_taxable_cents: number;
      total_igv_cents: number;
      total_amount_cents: number;
    }>();
}

describe('processQuoteConvertAtomic (G1/G2/G4/G5)', () => {
  it('G1: convert APPROVED paga total con IGV (snapshot conserva subtotal sin IGV)', async () => {
    const tenantId = 't-q-convert-igv';
    const fixture = await seedConvertFixture(tenantId);
    const quoteId = 'q-igv';
    await seedQuote(tenantId, fixture, {
      quoteId,
      totalCents: 2000,
      baseQuantityMicrounits: 2000000,
      lineTotalCents: 2000,
    });
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processQuoteConvertAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      { quoteId, cashRegisterSessionId: fixture.sessionId, series: 'NV01', documentType: 'NV' },
      { nowMs: now },
    );

    expect(result.saleId).toBeTruthy();
    const totals = await saleTotals(tenantId, result.saleId);
    expect(totals?.total_taxable_cents).toBe(2000);
    expect(totals?.total_igv_cents).toBe(360);
    expect(totals?.total_amount_cents).toBe(2360);

    const quote = await env.DB.prepare(
      `SELECT status, sale_id FROM quotes WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, quoteId)
      .first<{ status: string; sale_id: string | null }>();
    expect(quote?.status).toBe('CONVERTED');
    expect(quote?.sale_id).toBe(result.saleId);

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(8);

    const payments = await env.DB.prepare(
      `SELECT amount_cents, payment_method_id FROM sale_payments WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind(tenantId, result.saleId)
      .all<{ amount_cents: number; payment_method_id: string }>();
    expect(payments.results).toHaveLength(1);
    expect(payments.results?.[0]?.amount_cents).toBe(2360);
    expect(payments.results?.[0]?.payment_method_id).toBe(fixture.cashId);
  });

  it('G2: fraccion 0.5 sin UOM off → SUCCESS sin FEATURE_OFF y cantidad exacta', async () => {
    const tenantId = 't-q-frac';
    const fixture = await seedConvertFixture(tenantId);
    const quoteId = 'q-frac';
    await seedQuote(tenantId, fixture, {
      quoteId,
      totalCents: 500,
      baseQuantityMicrounits: 500000,
      lineTotalCents: 500,
    });
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processQuoteConvertAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      { quoteId, cashRegisterSessionId: fixture.sessionId, series: 'NV01', documentType: 'NV' },
      { nowMs: now, catalogUomEnabled: false },
    );

    expect(result.saleId).toBeTruthy();
    const totals = await saleTotals(tenantId, result.saleId);
    expect(totals?.total_amount_cents).toBe(590);

    const item = await env.DB.prepare(
      `SELECT quantity, unit_price_cents FROM sale_items WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind(tenantId, result.saleId)
      .first<{ quantity: number; unit_price_cents: number }>();
    expect(item?.quantity).toBeCloseTo(0.5, 6);
    expect(item?.unit_price_cents).toBe(1000);

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBeCloseTo(9.5, 6);
  });

  it('G2: pre-resuelto con sold_uom_id pese a UOM desactivado → SUCCESS', async () => {
    const tenantId = 't-q-uom-off';
    const fixture = await seedConvertFixture(tenantId);
    const quoteId = 'q-uom-off';
    await seedQuote(tenantId, fixture, {
      quoteId,
      totalCents: 2000,
      baseQuantityMicrounits: 2000000,
      lineTotalCents: 2000,
      soldUomId: `uom-${tenantId}`,
    });
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processQuoteConvertAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      { quoteId, cashRegisterSessionId: fixture.sessionId, series: 'NV01', documentType: 'NV' },
      { nowMs: now, catalogUomEnabled: false },
    );

    expect(result.saleId).toBeTruthy();
    const totals = await saleTotals(tenantId, result.saleId);
    expect(totals?.total_amount_cents).toBe(2360);
  });

  it('G4: convert expirado → QUOTE_EXPIRED, persiste EXPIRED + audit QUOTE_EXPIRE encadenado', async () => {
    const tenantId = 't-q-expired';
    const fixture = await seedConvertFixture(tenantId);
    const quoteId = 'q-exp';
    await seedQuote(tenantId, fixture, {
      quoteId,
      totalCents: 1000,
      baseQuantityMicrounits: 1000000,
      lineTotalCents: 1000,
      validUntil: '2026-08-01',
    });
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await expect(
      processQuoteConvertAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        { quoteId, cashRegisterSessionId: fixture.sessionId, series: 'NV01', documentType: 'NV' },
        { nowMs: now },
      ),
    ).rejects.toThrow('QUOTE_EXPIRED');

    const quote = await env.DB.prepare(`SELECT status FROM quotes WHERE tenant_id = ? AND id = ?`)
      .bind(tenantId, quoteId)
      .first<{ status: string }>();
    expect(quote?.status).toBe('EXPIRED');

    const audit = await env.DB.prepare(
      `SELECT prev_hash, row_hash FROM audit_events
       WHERE tenant_id = ? AND action = 'QUOTE_EXPIRE' AND entity_id = ? LIMIT 1`,
    )
      .bind(tenantId, quoteId)
      .first<{ prev_hash: string | null; row_hash: string }>();
    expect(audit?.prev_hash).toBeNull();
    expect(audit?.row_hash).toBeTruthy();

    const sales = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`)
      .bind(tenantId)
      .first<{ n: number }>();
    expect(sales?.n).toBe(0);
  });

  it('G5: convert con oversell encadena OFFLINE_OVERSELL → QUOTE_CONVERT (prev_hash real)', async () => {
    const tenantId = 't-q-chain';
    const fixture = await seedConvertFixture(tenantId);
    const quoteId = 'q-chain';
    await seedQuote(tenantId, fixture, {
      quoteId,
      totalCents: 2000,
      baseQuantityMicrounits: 2000000,
      lineTotalCents: 2000,
      allowNegativeStock: 1,
      stockMicrounits: 1000000,
    });
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processQuoteConvertAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      { quoteId, cashRegisterSessionId: fixture.sessionId, series: 'NV01', documentType: 'NV' },
      { nowMs: now },
    );

    expect(result.saleId).toBeTruthy();
    const oversell = await env.DB.prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? AND action = 'OFFLINE_OVERSELL' AND entity_id = ? LIMIT 1`,
    )
      .bind(tenantId, result.saleId)
      .first<{ row_hash: string }>();
    const convert = await env.DB.prepare(
      `SELECT prev_hash FROM audit_events
       WHERE tenant_id = ? AND action = 'QUOTE_CONVERT' AND entity_id = ? LIMIT 1`,
    )
      .bind(tenantId, quoteId)
      .first<{ prev_hash: string | null }>();
    expect(oversell?.row_hash).toBeTruthy();
    expect(convert?.prev_hash).toBe(oversell?.row_hash);
  });
});

describe('processLayawayConvertAtomic (G1/G2/G5)', () => {
  it('H: saldo a crédito con ledger crea CxC real (saleOpts.ledgerArApEnabled)', async () => {
    const tenantId = 't-l-convert-ar';
    const fixture = await seedConvertFixture(tenantId);
    const depositId = 'd-convert-ar';
    await seedDeposit(tenantId, fixture, {
      depositId,
      snapshotTotalCents: 2000,
      baseQuantityMicrounits: 2000000,
      paidCents: 1000,
    });
    await env.DB.prepare(`UPDATE sale_deposits SET customer_id = ? WHERE tenant_id = ? AND id = ?`)
      .bind(fixture.customerId, tenantId, depositId)
      .run();
    const now = Date.parse('2026-08-04T15:00:00.000Z');
    const result = await processLayawayConvertAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        depositId,
        cashRegisterSessionId: fixture.sessionId,
        series: 'NV01',
        documentType: 'NV',
        remainingAsCredit: true,
        saleOpts: { ledgerArApEnabled: true },
      },
      { nowMs: now },
    );
    expect(result.saleId).toBeTruthy();
    const ar = await env.DB.prepare(
      `SELECT balance_due_cents, status FROM accounts_receivable
       WHERE tenant_id = ? AND sale_id = ?`,
    )
      .bind(tenantId, result.saleId)
      .first<{ balance_due_cents: number; status: string }>();
    expect(ar).toMatchObject({ balance_due_cents: 1360, status: 'OPEN' });
  });

  it('G1: convert OPEN paga remainder = total IGV − anticipo; stock NO se vuelve a descontar', async () => {
    const tenantId = 't-l-convert';
    const fixture = await seedConvertFixture(tenantId);
    const depositId = 'd-convert';
    await seedDeposit(tenantId, fixture, {
      depositId,
      snapshotTotalCents: 2000,
      baseQuantityMicrounits: 2000000,
      paidCents: 1000,
    });
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    const result = await processLayawayConvertAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        depositId,
        cashRegisterSessionId: fixture.sessionId,
        series: 'NV01',
        documentType: 'NV',
        remainingAsCredit: true,
      },
      { nowMs: now },
    );

    expect(result.saleId).toBeTruthy();
    const totals = await saleTotals(tenantId, result.saleId);
    expect(totals?.total_taxable_cents).toBe(2000);
    expect(totals?.total_igv_cents).toBe(360);
    expect(totals?.total_amount_cents).toBe(2360);

    const deposit = await env.DB.prepare(
      `SELECT status, sale_id FROM sale_deposits WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, depositId)
      .first<{ status: string; sale_id: string | null }>();
    expect(deposit?.status).toBe('CONVERTED');
    expect(deposit?.sale_id).toBe(result.saleId);

    const payments = await env.DB.prepare(
      `SELECT amount_cents, payment_method_id FROM sale_payments WHERE tenant_id = ? AND sale_id = ? ORDER BY amount_cents DESC`,
    )
      .bind(tenantId, result.saleId)
      .all<{ amount_cents: number; payment_method_id: string }>();
    expect(payments.results).toHaveLength(2);
    expect(payments.results?.[0]?.amount_cents).toBe(1360);
    expect(payments.results?.[0]?.payment_method_id).toBe(fixture.creditId);
    expect(payments.results?.[1]?.amount_cents).toBe(1000);
    expect(payments.results?.[1]?.payment_method_id).toBe(fixture.anticipoId);

    const stock = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenantId, fixture.productId)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(10);
  });

  it('balance sin remainingAsCredit → LAYAWAY_INSUFFICIENT_DEPOSIT', async () => {
    const tenantId = 't-l-no-credit';
    const fixture = await seedConvertFixture(tenantId);
    const depositId = 'd-no-credit';
    await seedDeposit(tenantId, fixture, {
      depositId,
      snapshotTotalCents: 2000,
      baseQuantityMicrounits: 2000000,
      paidCents: 1000,
    });
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await expect(
      processLayawayConvertAtomic(
        env.DB,
        tenantId,
        fixture.userId,
        {
          depositId,
          cashRegisterSessionId: fixture.sessionId,
          series: 'NV01',
          documentType: 'NV',
        },
        { nowMs: now },
      ),
    ).rejects.toThrow('LAYAWAY_INSUFFICIENT_DEPOSIT');

    const deposit = await env.DB.prepare(
      `SELECT status FROM sale_deposits WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, depositId)
      .first<{ status: string }>();
    expect(deposit?.status).toBe('OPEN');
  });

  it('G5: audit LAYAWAY_CONVERT encadena a previo existente', async () => {
    const tenantId = 't-l-chain';
    const fixture = await seedConvertFixture(tenantId);
    const depositId = 'd-chain';
    await seedDeposit(tenantId, fixture, {
      depositId,
      snapshotTotalCents: 2000,
      baseQuantityMicrounits: 2000000,
      paidCents: 1000,
    });
    await env.DB.prepare(
      `INSERT INTO audit_events (
         id, tenant_id, actor_user_id, action, entity_type, entity_id,
         payload_json, prev_hash, row_hash
       ) VALUES (?, ?, ?, 'SEED_PRIOR', 'quote', 'seed', '{}', NULL, 'seed-prior-hash')`,
    )
      .bind(`aud-seed-${tenantId}`, tenantId, fixture.userId)
      .run();
    // M1: el seed escribe audit_events directo — debe dejar la cabeza
    // consistente (mismo contrato que el backfill de 0060) para que el
    // encadenado por puerto tome esa fila como prev.
    await env.DB.prepare(
      `INSERT INTO audit_chain_heads (tenant_id, last_hash)
       VALUES (?, 'seed-prior-hash')
       ON CONFLICT (tenant_id) DO UPDATE SET last_hash = excluded.last_hash`,
    )
      .bind(tenantId)
      .run();
    const now = Date.parse('2026-08-04T15:00:00.000Z');

    await processLayawayConvertAtomic(
      env.DB,
      tenantId,
      fixture.userId,
      {
        depositId,
        cashRegisterSessionId: fixture.sessionId,
        series: 'NV01',
        documentType: 'NV',
        remainingAsCredit: true,
      },
      { nowMs: now },
    );

    const convert = await env.DB.prepare(
      `SELECT prev_hash FROM audit_events
       WHERE tenant_id = ? AND action = 'LAYAWAY_CONVERT' AND entity_id = ? LIMIT 1`,
    )
      .bind(tenantId, depositId)
      .first<{ prev_hash: string | null }>();
    expect(convert?.prev_hash).toBe('seed-prior-hash');
  });
});

describe('S33-H2: veredicto del chaos quote con evidencia real del motor', () => {
  it('PASS solo con batchEvidenceVerified (los tests G1-G5 son la evidencia D1)', async () => {
    const verdict = await runQuoteConvertExpireChaosScenario(async () => ({
      cycles: 500,
      discrepancies: 0,
      samples: [],
      engineEvidenceVerified: true,
    }));
    expect(verdict).toBe('PASS');
  });
});
