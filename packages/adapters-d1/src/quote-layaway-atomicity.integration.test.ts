import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { D1Bound, D1DatabaseLike } from './index.js';
import {
  processLayawayCancelAtomic,
  processLayawayConvertAtomic,
} from './process-layaway-atomic.js';
import { processQuoteConvertAtomic } from './process-quote-atomic.js';

/**
 * US-03 — atomicidad real sobre D1 (workerd) para los flujos que la capa HTTP
 * del worker-api expone vía quote-routes / layaway-routes:
 *
 *  1. Fallo parcial de batch (Arquitectura §6 / SYN-12): un statement que
 *     falla A MITAD de `db.batch()` debe revertir TODA la secuencia — cero
 *     ventas parciales, cero stock movido, cero correlativo consumido,
 *     cero audit huérfano.
 *  2. Interleaving multi-device: dos dispositivos operando el MISMO recurso
 *     producen exactamente UN efecto — respaldado por el preflight
 *     ALREADY_SYNCED y por `idx_sales_offline_id` (UNIQUE parcial).
 *
 * El fallo intermedio se inyecta con un guard `atomic_guards (ok = 0)` —
 * el mismo idioma CHECK(ok=1) que usa el motor — empalmado en el medio del
 * arreglo real de statements; todos los statements reales corren sobre D1
 * workerd real. Nada aquí mockea D1.
 */

const NOW = Date.parse('2026-08-04T15:00:00.000Z');

interface AtomicityFixture {
  readonly branchId: string;
  readonly sessionId: string;
  readonly userIdA: string;
  readonly userIdB: string;
  readonly productId: string;
  readonly cashId: string;
  readonly anticipoId: string;
  readonly creditId: string;
}

async function seedAtomicityFixture(tenantId: string): Promise<AtomicityFixture> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const userIdA = `ua-${tenantId}`;
  const userIdB = `ub-${tenantId}`;
  const productId = `p-${tenantId}`;
  const cashId = `pm-cash-${tenantId}`;
  const anticipoId = `pm-anticipo-${tenantId}`;
  const creditId = `pm-credit-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'US03 ACID SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, ?, ?, ?)`,
    ).bind(branchId, tenantId, 'C01', 'Centro', 'Lima'),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, ?)`,
    ).bind(registerId, tenantId, branchId, 'Caja 1'),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, 'cashier')`,
    ).bind(userIdA, tenantId, branchId, `${userIdA}@example.com`),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, 'cashier')`,
    ).bind(userIdB, tenantId, branchId, `${userIdB}@example.com`),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userIdA),
    env.DB.prepare(
      `INSERT INTO branch_document_series
         (id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status)
       VALUES (?, ?, ?, 'NV', 'NV01', 0, 'INTERNAL')`,
    ).bind(`ser-${tenantId}`, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO products
         (id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents, stock, allow_negative_stock)
       VALUES (?, ?, ?, ?, 'physical', 'NIU', 1000, 400, 0, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, 'Producto US03'),
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

  return { branchId, sessionId, userIdA, userIdB, productId, cashId, anticipoId, creditId };
}

async function seedQuoteConvertible(
  tenantId: string,
  fixture: AtomicityFixture,
  quoteId: string,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO quotes (
         id, tenant_id, branch_id, customer_id, status, valid_until, total_cents,
         created_by_user_id
       ) VALUES (?, ?, ?, NULL, 'APPROVED', '2026-08-20', 2000, ?)`,
    ).bind(quoteId, tenantId, fixture.branchId, fixture.userIdA),
    env.DB.prepare(
      `INSERT INTO quote_items (
         id, tenant_id, quote_id, product_id, batch_id, sold_uom_id, sold_uom_code,
         entered_quantity_microunits, factor_numerator, factor_denominator,
         base_quantity_microunits, unit_price_cents, line_total_cents, promotion_ids_json
       ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 1, 1, ?, 1000, 2000, '[]')`,
    ).bind(`qi-${quoteId}`, tenantId, quoteId, fixture.productId, 2000000, 2000000),
  ]);
}

async function seedOpenDeposit(
  tenantId: string,
  fixture: AtomicityFixture,
  depositId: string,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sale_deposits (
         id, tenant_id, branch_id, customer_id, status, deposit_date, due_date,
         snapshot_total_cents, created_by_user_id, created_at
       ) VALUES (?, ?, ?, NULL, 'OPEN', '2026-08-04', '2026-08-20', 2000, ?, ?)`,
    ).bind(depositId, tenantId, fixture.branchId, fixture.userIdA, '2026-08-04 14:00:00'),
    env.DB.prepare(
      `INSERT INTO sale_deposit_items (
         id, tenant_id, sale_deposit_id, product_id, batch_id, sold_uom_id, sold_uom_code,
         entered_quantity_microunits, factor_numerator, factor_denominator,
         base_quantity_microunits, unit_price_cents
       ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 1, 1, ?, 1000)`,
    ).bind(`di-${depositId}`, tenantId, depositId, fixture.productId, 2000000, 2000000),
    env.DB.prepare(
      `INSERT INTO sale_deposit_payments (
         id, tenant_id, sale_deposit_id, payment_method, amount_cents, created_by_user_id
       ) VALUES (?, ?, ?, 'cash', 500, ?)`,
    ).bind(`dp-${depositId}`, tenantId, depositId, fixture.userIdA),
  ]);
}

/**
 * Envuelve SOLO `batch`: deja pasar `prepare` intacto y empalma un guard
 * `ok = 0` en la mitad del arreglo REAL de statements. Al violar el
 * `CHECK (ok = 1)` de `atomic_guards`, D1 aborta y revierte la transacción
 * completa — fallo genuino a mitad de secuencia, sin mocks.
 */
function withMidBatchPoison(source: typeof env.DB, poisonGuardId: string): D1DatabaseLike {
  const db = source as unknown as D1DatabaseLike;
  return {
    prepare: (sql: string) => db.prepare(sql),
    batch: async (statements: readonly D1Bound[]) => {
      const poisoned = [...statements];
      poisoned.splice(
        Math.max(1, Math.floor(poisoned.length / 2)),
        0,
        db.prepare(`INSERT INTO atomic_guards (id, ok) VALUES (?, ?)`).bind(poisonGuardId, 0),
      );
      return db.batch(poisoned);
    },
  };
}

async function countSalesByOfflineId(tenantId: string, offlineSaleId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
  )
    .bind(tenantId, offlineSaleId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function stockMicrounits(tenantId: string, productId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT stock_microunits FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
  )
    .bind(tenantId, productId)
    .first<{ stock_microunits: number }>();
  return row?.stock_microunits ?? -1;
}

async function seriesCurrentNumber(tenantId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT current_number FROM branch_document_series
     WHERE tenant_id = ? AND document_type_code = 'NV' AND series = 'NV01'`,
  )
    .bind(tenantId)
    .first<{ current_number: number }>();
  return row?.current_number ?? -1;
}

async function auditCount(tenantId: string, action: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id = ? AND action = ?`,
  )
    .bind(tenantId, action)
    .first<{ n: number }>();
  return row?.n ?? -1;
}

async function refundMovementCount(tenantId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cash_register_cash_movements
     WHERE tenant_id = ? AND movement_type = 'LAYAWAY_REFUND'`,
  )
    .bind(tenantId)
    .first<{ n: number }>();
  return row?.n ?? -1;
}

describe('US-03 atomicidad real: fallo parcial de batch revierte TODO (D1 workerd)', () => {
  it('quote convert con statement envenenado a mitad → 0 venta, 0 stock, 0 correlativo, quote APPROVED', async () => {
    const tenantId = 't-us03-q-poison';
    const fixture = await seedAtomicityFixture(tenantId);
    // Control: una conversión limpia SÍ aplica (prueba que el flujo llega al batch).
    await seedQuoteConvertible(tenantId, fixture, 'q-us03-ok');
    const control = await processQuoteConvertAtomic(env.DB, tenantId, fixture.userIdA, {
      quoteId: 'q-us03-ok',
      cashRegisterSessionId: fixture.sessionId,
      series: 'NV01',
      documentType: 'NV',
    }, { nowMs: NOW });
    expect(control.saleId).toBeTruthy();
    expect(await seriesCurrentNumber(tenantId)).toBe(1);

    await seedQuoteConvertible(tenantId, fixture, 'q-us03-poison');
    await expect(
      processQuoteConvertAtomic(
        withMidBatchPoison(env.DB, `us03-guard-${tenantId}`),
        tenantId,
        fixture.userIdA,
        {
          quoteId: 'q-us03-poison',
          cashRegisterSessionId: fixture.sessionId,
          series: 'NV01',
          documentType: 'NV',
        },
        { nowMs: NOW },
      ),
    ).rejects.toThrow();

    expect(await countSalesByOfflineId(tenantId, 'quote-q-us03-poison')).toBe(0);
    // El control quedó intacto: el fallo a mitad no filtró efectos parciales.
    expect(await stockMicrounits(tenantId, fixture.productId)).toBe(8_000_000);
    expect(await seriesCurrentNumber(tenantId)).toBe(1);
    expect(await auditCount(tenantId, 'QUOTE_CONVERT')).toBe(1);
    const quote = await env.DB.prepare(
      `SELECT status FROM quotes WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, 'q-us03-poison')
      .first<{ status: string }>();
    expect(quote?.status).toBe('APPROVED');
  });

  it('layaway convert con statement envenenado a mitad → 0 venta, depósito OPEN, anticipo intacto', async () => {
    const tenantId = 't-us03-l-convert-poison';
    const fixture = await seedAtomicityFixture(tenantId);
    // Control: conversión limpia de otro apartado SÍ aplica.
    await seedOpenDeposit(tenantId, fixture, `d-${tenantId}-ok`);
    const control = await processLayawayConvertAtomic(env.DB, tenantId, fixture.userIdA, {
      depositId: `d-${tenantId}-ok`,
      cashRegisterSessionId: fixture.sessionId,
      series: 'NV01',
      documentType: 'NV',
      remainingAsCredit: true,
    }, { nowMs: NOW });
    expect(control.saleId).toBeTruthy();

    await seedOpenDeposit(tenantId, fixture, `d-${tenantId}-poison`);
    await expect(
      processLayawayConvertAtomic(
        withMidBatchPoison(env.DB, `us03-guard-${tenantId}`),
        tenantId,
        fixture.userIdA,
        {
          depositId: `d-${tenantId}-poison`,
          cashRegisterSessionId: fixture.sessionId,
          series: 'NV01',
          documentType: 'NV',
          remainingAsCredit: true,
        },
        { nowMs: NOW },
      ),
    ).rejects.toThrow();

    expect(await countSalesByOfflineId(tenantId, `layaway-d-${tenantId}-poison`)).toBe(0);
    // Solo el audit del control: el envenenado no dejó rastro huérfano.
    expect(await auditCount(tenantId, 'LAYAWAY_CONVERT')).toBe(1);
    const deposit = await env.DB.prepare(
      `SELECT status FROM sale_deposits WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, `d-${tenantId}-poison`)
      .first<{ status: string }>();
    expect(deposit?.status).toBe('OPEN');
    const paid = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS paid FROM sale_deposit_payments
       WHERE tenant_id = ? AND sale_deposit_id = ?`,
    )
      .bind(tenantId, `d-${tenantId}-poison`)
      .first<{ paid: number }>();
    expect(paid?.paid).toBe(500);
  });

  it('layaway cancel con statement envenenado a mitad → depósito OPEN y stock reservado NO restaurado', async () => {
    const tenantId = 't-us03-l-cancel-poison';
    const fixture = await seedAtomicityFixture(tenantId);
    // Control: cancelación limpia de otro apartado SÍ restaura stock (+2 µu).
    await seedOpenDeposit(tenantId, fixture, `d-${tenantId}-ok`);
    const control = await processLayawayCancelAtomic(env.DB, tenantId, fixture.userIdA, {
      depositId: `d-${tenantId}-ok`,
      reason: 'cliente desiste',
      cashRegisterSessionId: fixture.sessionId,
    }, { nowMs: NOW });
    expect(control.status).toBe('CANCELLED');
    expect(control.refundCents).toBe(500);
    expect(await stockMicrounits(tenantId, fixture.productId)).toBe(12_000_000);

    await seedOpenDeposit(tenantId, fixture, `d-${tenantId}-cancel`);
    await expect(
      processLayawayCancelAtomic(
        withMidBatchPoison(env.DB, `us03-guard-${tenantId}`),
        tenantId,
        fixture.userIdA,
        { depositId: `d-${tenantId}-cancel`, reason: 'cliente desiste', cashRegisterSessionId: fixture.sessionId },
        { nowMs: NOW },
      ),
    ).rejects.toThrow();

    // El lote abortado NO sumó una segunda restauración sobre el stock ya liberado.
    expect(await stockMicrounits(tenantId, fixture.productId)).toBe(12_000_000);
    expect(await auditCount(tenantId, 'LAYAWAY_CANCEL')).toBe(1);
    expect(await refundMovementCount(tenantId)).toBe(1);
    const deposit = await env.DB.prepare(
      `SELECT status FROM sale_deposits WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, `d-${tenantId}-cancel`)
      .first<{ status: string }>();
    expect(deposit?.status).toBe('OPEN');
  });
});

describe('US-03 interleaving multi-device: exactamente UN efecto (D1 serializa)', () => {
  it('dos dispositivos convierten la MISMA cotización → 1 gana, 1 rechazado, efectos exactos', async () => {
    const tenantId = 't-us03-q-race';
    const fixture = await seedAtomicityFixture(tenantId);
    await seedQuoteConvertible(tenantId, fixture, 'q-us03-race');

    const attempt = (userId: string) =>
      processQuoteConvertAtomic(env.DB, tenantId, userId, {
        quoteId: 'q-us03-race',
        cashRegisterSessionId: fixture.sessionId,
        series: 'NV01',
        documentType: 'NV',
      }, { nowMs: NOW });

    const outcomes = await Promise.allSettled([attempt(fixture.userIdA), attempt(fixture.userIdB)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);

    expect(await countSalesByOfflineId(tenantId, 'quote-q-us03-race')).toBe(1);
    expect(await stockMicrounits(tenantId, fixture.productId)).toBe(8_000_000);
    expect(await seriesCurrentNumber(tenantId)).toBe(1);
    expect(await auditCount(tenantId, 'QUOTE_CONVERT')).toBe(1);
    const quote = await env.DB.prepare(
      `SELECT status FROM quotes WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, 'q-us03-race')
      .first<{ status: string }>();
    expect(quote?.status).toBe('CONVERTED');
  });

  it('dos dispositivos convierten el MISMO apartado → 1 venta; anticipo cobrado UNA vez', async () => {
    const tenantId = 't-us03-l-race';
    const fixture = await seedAtomicityFixture(tenantId);
    await seedOpenDeposit(tenantId, fixture, `d-${tenantId}-race`);

    const attempt = (userId: string) =>
      processLayawayConvertAtomic(env.DB, tenantId, userId, {
        depositId: `d-${tenantId}-race`,
        cashRegisterSessionId: fixture.sessionId,
        series: 'NV01',
        documentType: 'NV',
        remainingAsCredit: true,
      }, { nowMs: NOW });

    const outcomes = await Promise.allSettled([attempt(fixture.userIdA), attempt(fixture.userIdB)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);

    expect(await countSalesByOfflineId(tenantId, `layaway-d-${tenantId}-race`)).toBe(1);
    // La reserva ocurrió al crear el apartado: convertir NO vuelve a descontar.
    expect(await stockMicrounits(tenantId, fixture.productId)).toBe(10_000_000);
    expect(await auditCount(tenantId, 'LAYAWAY_CONVERT')).toBe(1);

    const payments = await env.DB.prepare(
      `SELECT pm.code AS method_code, sp.amount_cents AS amount_cents
       FROM sale_payments sp
       INNER JOIN payment_methods pm ON pm.tenant_id = sp.tenant_id AND pm.id = sp.payment_method_id
       WHERE sp.tenant_id = ?
         AND sp.sale_id IN (SELECT id FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?)
       ORDER BY method_code`,
    )
      .bind(tenantId, tenantId, `layaway-d-${tenantId}-race`)
      .all<{ method_code: string; amount_cents: number }>();
    expect(payments.results).toHaveLength(2);
    const anticipo = payments.results.filter((row) => row.method_code === 'anticipo');
    const credit = payments.results.filter((row) => row.method_code === 'credit');
    expect(anticipo).toHaveLength(1);
    expect(anticipo[0]?.amount_cents).toBe(500);
    expect(credit).toHaveLength(1);
    expect(credit[0]?.amount_cents).toBe(1860);

    const deposit = await env.DB.prepare(
      `SELECT status FROM sale_deposits WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantId, `d-${tenantId}-race`)
      .first<{ status: string }>();
    expect(deposit?.status).toBe('CONVERTED');
  });
});
