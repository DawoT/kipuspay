/**
 * Game Day 001 — evidencia D1 real (vitest-pool-workers) para los escenarios
 * E1/E2 del núcleo transaccional (§13.5; Proceso §4 fila "Motor transaccional ACID"
 * y §6). Los jueces viven en @kipuspay/chaos-harness (offline-sale-concurrency);
 * aquí solo se orquesta la adversidad y se recolecta evidencia.
 *
 * E1: 8 ventas simultáneas (Promise.all) mismo tenant+caja vía processOfflineSaleAtomic.
 * Cobertura preexistente citada: chaos concurrent-writers N=5 y sobre-demanda en
 * process-offline-sale-atomic.integration.test.ts — este escenario agrega el ángulo
 * Game Day: correlativos únicos contiguos, totales exactos y barrido de escrituras
 * parciales sobre TODAS las tablas del plan.
 *
 * E2: aborto a mitad de operación. Dos inyecciones:
 *  (a) wrapper del puerto D1 que lanza tras observar el k-ésimo statement del plan
 *      sin ejecutar nada (fallo de transporte a mitad del envío del batch — con D1
 *      atómico, ejecutar parcialmente NO es un modo de fallo real, es un artefacto
 *      del harness; el batch o commitea completo o no commitea);
 *  (b) statement intermedio que viola CHECK (abort server-side) con barrido completo
 *      de tablas — extiende el patrón preexistente `t-acid-midroll` (venta/pagos/
 *      stock) con sale_items, correlativo de serie, audit_events y atomic_guards.
 */
import { env } from 'cloudflare:workers';
import {
  judgeOfflineSaleConcurrency,
  judgeOfflineSaleMidBatchAbort,
  type OfflineSaleAttemptEvidence,
} from '@kipuspay/chaos-harness';
import type { OfflineSalePayload } from '@kipuspay/domain-sales';
import { describe, expect, it } from 'vitest';
import { processOfflineSaleAtomic } from './process-offline-sale-atomic.js';
import type { D1DatabaseLike } from './index.js';

const N = 8;
const PRICE_CENTS = 1000;
const QTY = 1;
const IGV_RATE = 0.18;
const EXPECTED_TOTAL_CENTS = Math.round(PRICE_CENTS * QTY * (1 + IGV_RATE));

async function seedGameDayFixture(
  tenantId: string,
  stock: number,
): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
  productId: string;
  paymentMethodId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const productId = `p-${tenantId}`;
  const paymentMethodId = `pm-${tenantId}`;
  const seriesId = `ser-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants
         (id, business_name, vertical_type, shard_id, formalization_mode, enabled_document_types)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      tenantId,
      'Game Day SAC',
      'retail',
      'shard-1',
      'INTERNAL_CONTROL',
      '["NV","NV_RETURN","01","03","07","08"]',
    ),
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
       VALUES (?, ?, ?, ?, 'physical', 'NIU', ?, 400, 0, 0)`,
    ).bind(productId, tenantId, `SKU-${tenantId}`, 'Producto GD', PRICE_CENTS),
    env.DB.prepare(
      `INSERT INTO branch_product_stock
         (tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents)
       VALUES (?, ?, ?, ?, ?, 400)`,
    ).bind(tenantId, branchId, productId, stock, stock * 1000000),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(paymentMethodId, tenantId),
  ]);

  return { branchId, sessionId, userId, productId, paymentMethodId };
}

function gdPayload(
  fixture: Awaited<ReturnType<typeof seedGameDayFixture>>,
  offlineSaleId: string,
): OfflineSalePayload {
  return {
    offlineSaleId,
    branchId: fixture.branchId,
    cashRegisterSessionId: fixture.sessionId,
    documentType: 'NV',
    series: 'NV01',
    clientDocumentType: '1',
    clientDocumentNumber: '00000000',
    clientName: 'Cliente GD',
    items: [{ productId: fixture.productId, quantity: QTY }],
    payments: [{ paymentMethodId: fixture.paymentMethodId, amountCents: EXPECTED_TOTAL_CENTS }],
  };
}

async function count(sql: string, ...bind: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...bind)
    .first<{ n: number }>();
  return row?.n ?? -1;
}

describe('Game Day 001 E1 — ráfaga concurrente offline (D1 real)', () => {
  it('8 ventas simultáneas mismo tenant+caja: sin silencio, correlativos 1..8, cero parciales', async () => {
    const tenant = 't-gd1-conc';
    const fixture = await seedGameDayFixture(tenant, 10);
    const now = Date.parse('2026-08-23T15:00:00.000Z');

    const attempts: OfflineSaleAttemptEvidence[] = await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        try {
          const r = await processOfflineSaleAtomic(
            env.DB,
            tenant,
            fixture.userId,
            gdPayload(fixture, `off-gd1-${i}`),
            { nowMs: now },
          );
          if (r.status === 'SUCCESS') {
            return {
              offlineSaleId: `off-gd1-${i}`,
              outcome: 'SUCCESS' as const,
              explicitError: null,
              correlativeNumber: r.number,
              totalAmountCents: r.authoritativeTotalAmount,
            };
          }
          return {
            offlineSaleId: `off-gd1-${i}`,
            outcome: 'ALREADY_SYNCED' as const,
            explicitError: null,
            correlativeNumber: null,
            totalAmountCents: null,
          };
        } catch (error) {
          return {
            offlineSaleId: `off-gd1-${i}`,
            outcome: 'REJECTED' as const,
            explicitError: String(error),
            correlativeNumber: null,
            totalAmountCents: null,
          };
        }
      }),
    );

    const [saleRows, numbersRow, itemRows, paymentRows, guards] = await Promise.all([
      count(`SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ?`, tenant),
      env.DB.prepare(`SELECT number FROM sales WHERE tenant_id = ? ORDER BY number`)
        .bind(tenant)
        .all<{ number: number }>(),
      count(
        `SELECT COUNT(*) AS n FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.tenant_id = ?`,
        tenant,
      ),
      count(
        `SELECT COUNT(*) AS n FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
         WHERE s.tenant_id = ?`,
        tenant,
      ),
      count(`SELECT COUNT(*) AS n FROM atomic_guards`),
    ]);
    const stockRow = await env.DB.prepare(
      `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
    )
      .bind(tenant, fixture.productId)
      .first<{ stock: number }>();
    const seriesRow = await env.DB.prepare(
      `SELECT current_number FROM branch_document_series WHERE tenant_id = ? AND series = 'NV01'`,
    )
      .bind(tenant)
      .first<{ current_number: number }>();

    const judgement = judgeOfflineSaleConcurrency({
      attempts,
      post: {
        saleRows,
        saleItemRows: itemRows,
        salePaymentRows: paymentRows,
        stockAfter: stockRow?.stock ?? -1,
        seriesCurrentNumberAfter: seriesRow?.current_number ?? -1,
        residualAtomicGuards: guards,
      },
      stockBefore: 10,
      seriesCurrentNumberBefore: 0,
      qtyPerSale: QTY,
      itemsPerSale: 1,
      expectedTotalCentsPerSale: EXPECTED_TOTAL_CENTS,
    });
    console.log('STATS_GD1_E1', JSON.stringify({ judgement, numbers: numbersRow.results ?? [] }));

    expect(judgement.verdict).toBe('PASS');
    expect(judgement.successes).toBe(N);
    expect(judgement.failures).toEqual([]);
    expect((numbersRow.results ?? []).map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('Game Day 001 E2 — aborto a mitad de operación (D1 real)', () => {
  it('wrapper D1 lanza tras el k-ésimo statement: error explícito y rollback total', async () => {
    const tenant = 't-gd1-midbatch';
    const fixture = await seedGameDayFixture(tenant, 10);
    const now = Date.parse('2026-08-23T15:05:00.000Z');

    const auditEventsBefore = await count(
      `SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id = ?`,
      tenant,
    );

    let statementsInPlan = 0;
    const abortAfterStatement = 4;
    const chaosDb: D1DatabaseLike = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async (statements) => {
        statementsInPlan = statements.length;
        if (statementsInPlan <= abortAfterStatement) {
          throw new Error('CHAOS_ABORT_PLAN_NOT_MID_OPERATION');
        }
        // Fallo de transporte a mitad del envío: nada persiste.
        throw new Error('CHAOS_MIDBATCH_ABORT_AFTER_STATEMENT_4');
      },
    };

    let observedError: string | null = null;
    try {
      await processOfflineSaleAtomic(
        chaosDb,
        tenant,
        fixture.userId,
        gdPayload(fixture, 'off-gd-abort'),
        {
          nowMs: now,
        },
      );
    } catch (error) {
      observedError = String(error);
    }

    const [sales, items, payments, auditEventsAfter, guards, stockRow, seriesRow] =
      await Promise.all([
        count(
          `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
          tenant,
          'off-gd-abort',
        ),
        count(
          `SELECT COUNT(*) AS n FROM sale_items si JOIN sales s ON s.id = si.sale_id
           WHERE s.tenant_id = ? AND s.offline_client_sale_id = ?`,
          tenant,
          'off-gd-abort',
        ),
        count(
          `SELECT COUNT(*) AS n FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
           WHERE s.tenant_id = ? AND s.offline_client_sale_id = ?`,
          tenant,
          'off-gd-abort',
        ),
        count(`SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id = ?`, tenant),
        count(`SELECT COUNT(*) AS n FROM atomic_guards`),
        env.DB.prepare(
          `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
        )
          .bind(tenant, fixture.productId)
          .first<{ stock: number }>(),
        env.DB.prepare(
          `SELECT current_number FROM branch_document_series WHERE tenant_id = ? AND series = 'NV01'`,
        )
          .bind(tenant)
          .first<{ current_number: number }>(),
      ]);

    console.log('STATS_GD1_E2A', JSON.stringify({ statementsInPlan, observedError }));
    expect(
      judgeOfflineSaleMidBatchAbort({
        threwExplicitError: observedError,
        statementsInPlan,
        abortAfterStatement,
        postCounts: {
          sales,
          saleItems: items,
          salePayments: payments,
          auditEvents: auditEventsAfter,
          atomicGuards: guards,
        },
        baseline: {
          stockBefore: 10,
          seriesCurrentNumberBefore: 0,
          auditEventsBefore,
        },
        stockAfter: stockRow?.stock ?? -1,
        seriesCurrentNumberAfter: seriesRow?.current_number ?? -1,
      }),
    ).toBe('PASS');
  });

  it('CHECK violado a mitad del plan revierte venta, items, pagos, stock, serie y auditoría', async () => {
    const tenant = 't-gd1-midcheck';
    const fixture = await seedGameDayFixture(tenant, 10);
    const now = Date.parse('2026-08-23T15:10:00.000Z');

    const auditEventsBefore = await count(
      `SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id = ?`,
      tenant,
    );

    // Wrapper passthrough que registra el tamaño REAL del plan; la inyección
    // es un statement intermedio (último del bloque de escrituras) que viola
    // CHECK document_type → abort server-side del batch completo.
    let statementsInPlan = 0;
    const recordingDb: D1DatabaseLike = {
      prepare: (sql: string) => env.DB.prepare(sql),
      batch: async (statements) => {
        statementsInPlan = statements.length;
        return env.DB.batch(statements);
      },
    };

    const observedError: string | null = await processOfflineSaleAtomic(
      recordingDb,
      tenant,
      fixture.userId,
      gdPayload(fixture, 'off-gd-check'),
      {
        nowMs: now,
        afterSaleStatements: (plan) => {
          plan.add(
            env.DB.prepare(
              `INSERT INTO sales (
                 id, tenant_id, branch_id, cash_register_session_id, user_id,
                 client_document_type, client_document_number, client_name,
                 document_type, series, number, total_amount_cents, issued_at_lima
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'XX', 'NV99', 1, 0, ?)`,
            ).bind(
              'sale-gd-check-fail',
              tenant,
              fixture.branchId,
              fixture.sessionId,
              fixture.userId,
              '1',
              '00000000',
              'Cliente',
              now,
            ),
          );
        },
      },
    ).then(
      () => null,
      (error: unknown) => String(error),
    );
    expect(observedError).not.toBeNull();

    const [sales, items, payments, auditEventsAfter, guards, stockRow, seriesRow] =
      await Promise.all([
        count(
          `SELECT COUNT(*) AS n FROM sales WHERE tenant_id = ? AND offline_client_sale_id = ?`,
          tenant,
          'off-gd-check',
        ),
        count(
          `SELECT COUNT(*) AS n FROM sale_items si JOIN sales s ON s.id = si.sale_id
           WHERE s.tenant_id = ? AND s.offline_client_sale_id = ?`,
          tenant,
          'off-gd-check',
        ),
        count(
          `SELECT COUNT(*) AS n FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
           WHERE s.tenant_id = ? AND s.offline_client_sale_id = ?`,
          tenant,
          'off-gd-check',
        ),
        count(`SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id = ?`, tenant),
        count(`SELECT COUNT(*) AS n FROM atomic_guards`),
        env.DB.prepare(
          `SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND product_id = ?`,
        )
          .bind(tenant, fixture.productId)
          .first<{ stock: number }>(),
        env.DB.prepare(
          `SELECT current_number FROM branch_document_series WHERE tenant_id = ? AND series = 'NV01'`,
        )
          .bind(tenant)
          .first<{ current_number: number }>(),
      ]);

    console.log('STATS_GD1_E2B', JSON.stringify({ statementsInPlan, observedError }));
    expect(statementsInPlan).toBeGreaterThan(5);
    // El statement inyectado ocupa la última posición del bloque de escrituras
    // (tras venta/stock/pagos, antes del claim de auditoría y guard delete).
    const abortAfterStatement = statementsInPlan - 1;
    expect(
      judgeOfflineSaleMidBatchAbort({
        threwExplicitError: observedError,
        statementsInPlan,
        abortAfterStatement,
        postCounts: {
          sales,
          saleItems: items,
          salePayments: payments,
          auditEvents: auditEventsAfter,
          atomicGuards: guards,
        },
        baseline: {
          stockBefore: 10,
          seriesCurrentNumberBefore: 0,
          auditEventsBefore,
        },
        stockAfter: stockRow?.stock ?? -1,
        seriesCurrentNumberAfter: seriesRow?.current_number ?? -1,
      }),
    ).toBe('PASS');
  });
});
