import type { D1DatabaseLike } from './index.js';
import {
  claimDueRecurringPlanAtomic,
  processRecurringSaleAtomic,
  runRecurringScheduler,
} from './process-recurring-sale-atomic.js';

/* eslint-disable complexity -- integration fixture composes optional stock/fiscal scenarios */
interface FixtureOptions {
  readonly tenantId: string;
  readonly pricingPolicy?: 'FIXED' | 'CURRENT';
  readonly periodStart?: string;
  readonly now?: string;
  readonly catchUpLimit?: number;
  readonly documentType?: 'NV' | '03' | '01';
  readonly customerDocumentType?: string;
  readonly customerDocumentNumber?: string;
  readonly afterGracePolicy?: 'CONTINUE' | 'PAUSE_FUTURE_EXECUTION';
  readonly withPhysicalAndServiceItems?: boolean;
  readonly withSettledCurrentPeriod?: boolean;
}

function scalar(
  db: D1DatabaseLike,
  sql: string,
  params: readonly unknown[],
): Promise<{ value: number } | null> {
  return db
    .prepare(sql)
    .bind(...params)
    .first<{ value: number }>();
}

export async function seedRecurringSalesFixture(db: D1DatabaseLike, options: FixtureOptions) {
  const tenantId = options.tenantId;
  const branchId = `${tenantId}:branch`;
  const userId = `${tenantId}:user`;
  const customerId = `${tenantId}:customer`;
  const registerId = `${tenantId}:register`;
  const sessionId = `${tenantId}:session`;
  const planId = `${tenantId}:plan`;
  const serviceId = `${tenantId}:service`;
  const physicalId = 'physical-a';
  const serviceUomId = `${tenantId}:service-uom`;
  const physicalUomId = `${tenantId}:physical-uom`;
  const seriesId = `${tenantId}:series`;
  const returnSeriesId = `${tenantId}:return-series`;
  const locationId = `${tenantId}:location`;
  const periodStart = options.periodStart ?? '2026-08-01T00:00:00-05:00';
  const now = options.now ?? '2026-08-08T09:30:00-05:00';
  const physicalStock = 20_000_000;
  const documentType = options.documentType ?? '03';

  await db.batch([
    db
      .prepare(
        `INSERT INTO tenants (
           id, business_name, vertical_type, formalization_mode, tax_regime
         ) VALUES (?, ?, 'services', 'FULL_CPE', 'RER')`,
      )
      .bind(tenantId, `Recurring ${tenantId}`),
    db
      .prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, ?, 'Recurring', 'Lima')`,
      )
      .bind(branchId, tenantId, tenantId.slice(-8)),
  ]);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, ?, 'owner')`,
      )
      .bind(userId, tenantId, branchId, `${tenantId}@example.test`),
    db
      .prepare(
        `INSERT INTO customers (
           id, tenant_id, document_type_code, document_number, name, credit_limit_cents
         ) VALUES (?, ?, ?, ?, 'Cliente Recurrente', 99999999)`,
      )
      .bind(
        customerId,
        tenantId,
        options.customerDocumentType ?? '6',
        options.customerDocumentNumber ?? '20123456789',
      ),
    db
      .prepare(
        `INSERT INTO cash_registers (id, tenant_id, branch_id, name)
         VALUES (?, ?, ?, 'Caja recurrente')`,
      )
      .bind(registerId, tenantId, branchId),
    db
      .prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, product_type, unit_code, price_cents, cost_cents
         ) VALUES (?, ?, ?, 'Servicio', 'service', 'ZZ', 1000, 0)`,
      )
      .bind(serviceId, tenantId, `${tenantId}:service`),
  ]);
  await db.batch([
    db
      .prepare(
        `INSERT INTO cash_register_sessions (
           id, tenant_id, branch_id, cash_register_id, user_id, status
         ) VALUES (?, ?, ?, ?, ?, 'OPEN')`,
      )
      .bind(sessionId, tenantId, branchId, registerId, userId),
    db
      .prepare(
        `INSERT INTO product_uoms (
           id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
         ) VALUES (?, ?, ?, 'ZZ', 1, 1, 1)`,
      )
      .bind(serviceUomId, tenantId, serviceId),
    db
      .prepare(
        `INSERT INTO branch_document_series (
           id, tenant_id, branch_id, document_type_code, series,
           current_number, authorization_status, is_active
         ) VALUES (?, ?, ?, ?, ?, 0, ?, 1)`,
      )
      .bind(
        seriesId,
        tenantId,
        branchId,
        documentType,
        documentType === 'NV' ? 'NV01' : documentType === '01' ? 'F001' : 'B001',
        documentType === 'NV' ? 'INTERNAL' : 'AUTHORIZED',
      ),
    db
      .prepare(
        `INSERT INTO branch_document_series (
           id, tenant_id, branch_id, document_type_code, series,
           current_number, authorization_status, is_active
         ) VALUES (?, ?, ?, ?, ?, 0, ?, 1)`,
      )
      .bind(
        returnSeriesId,
        tenantId,
        branchId,
        documentType === 'NV' ? 'NV_RETURN' : '07',
        documentType === 'NV' ? 'NVR1' : 'FC01',
        documentType === 'NV' ? 'INTERNAL' : 'AUTHORIZED',
      ),
  ]);
  if (options.withPhysicalAndServiceItems) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO products (
             id, tenant_id, sku, name, product_type, unit_code,
             price_cents, cost_cents, stock
           ) VALUES (?, ?, ?, 'Physical', 'physical', 'NIU', 1500, 700, 20)`,
        )
        .bind(physicalId, tenantId, `${tenantId}:physical`),
      db
        .prepare(
          `INSERT INTO product_uoms (
             id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
           ) VALUES (?, ?, ?, 'NIU', 1, 1, 1)`,
        )
        .bind(physicalUomId, tenantId, physicalId),
      db
        .prepare(
          `INSERT INTO branch_product_stock (
             tenant_id, branch_id, product_id, stock, stock_microunits,
             pmp_unit_cost_cents, version
           ) VALUES (?, ?, ?, 20, ?, 700, 1)`,
        )
        .bind(tenantId, branchId, physicalId, physicalStock),
      db
        .prepare(
          `INSERT INTO inventory_locations (
             id, tenant_id, branch_id, code, name, is_active
           ) VALUES (?, ?, ?, 'DEFAULT', 'Default', 1)`,
        )
        .bind(locationId, tenantId, branchId),
      db
        .prepare(
          `INSERT INTO inventory_location_stock (
             tenant_id, branch_id, location_id, product_id, quantity_microunits, version
           ) VALUES (?, ?, ?, ?, ?, 1)`,
        )
        .bind(tenantId, branchId, locationId, physicalId, physicalStock),
    ]);
  }
  await db
    .prepare(
      `INSERT INTO recurring_plans (
         id, tenant_id, plan_key, plan_version, customer_id, branch_id,
         created_by_user_id, document_type, pricing_policy, frequency,
         anchor_day, anchor_time, after_grace_policy, catch_up_limit,
         next_run_at, effective_from
       ) VALUES (?, ?, 'membership', 1, ?, ?, ?, ?, ?, 'MONTHLY',
                 31, '09:30:00', ?, ?, ?, ?)`,
    )
    .bind(
      planId,
      tenantId,
      customerId,
      branchId,
      userId,
      documentType,
      options.pricingPolicy ?? 'FIXED',
      options.afterGracePolicy ?? 'CONTINUE',
      options.catchUpLimit ?? 3,
      periodStart,
      periodStart,
    )
    .run();
  const itemStatements = [
    db
      .prepare(
        `INSERT INTO recurring_plan_items (
           id, tenant_id, plan_id, line_number, product_id, product_uom_id,
           entered_quantity_microunits, factor_numerator, factor_denominator,
           base_quantity_microunits, fixed_unit_price_cents
         ) VALUES (?, ?, ?, 1, ?, ?, 1000000, 1, 1, 1000000, ?)`,
      )
      .bind(
        `${planId}:service-item`,
        tenantId,
        planId,
        serviceId,
        serviceUomId,
        (options.pricingPolicy ?? 'FIXED') === 'FIXED' ? 1000 : null,
      ),
  ];
  if (options.withPhysicalAndServiceItems) {
    itemStatements.push(
      db
        .prepare(
          `INSERT INTO recurring_plan_items (
             id, tenant_id, plan_id, line_number, product_id, product_uom_id,
             entered_quantity_microunits, factor_numerator, factor_denominator,
             base_quantity_microunits, fixed_unit_price_cents
           ) VALUES (?, ?, ?, 2, ?, ?, 1000000, 1, 1, 1000000, ?)`,
        )
        .bind(
          `${planId}:physical-item`,
          tenantId,
          planId,
          physicalId,
          physicalUomId,
          (options.pricingPolicy ?? 'FIXED') === 'FIXED' ? 1500 : null,
        ),
    );
  }
  await db.batch(itemStatements);

  const count = async (table: string, suffix = '', params: readonly unknown[] = []) => {
    const row = await scalar(
      db,
      `SELECT COUNT(*) AS value FROM ${table} WHERE tenant_id = ? ${suffix}`,
      [tenantId, ...params],
    );
    return row?.value ?? 0;
  };
  const runScheduler = () =>
    runRecurringScheduler(db, {
      now,
      tenantId,
      schedulerId: `${tenantId}:scheduler`,
      globalCatchUpLimit: options.catchUpLimit ?? 3,
    });

  if (options.withSettledCurrentPeriod) await runScheduler();

  return {
    tenantId,
    planId,
    periodStart,
    now,
    atomicStatementIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const,
    claimInput(schedulerId: string) {
      return {
        tenantId,
        planId,
        expectedVersion: 1,
        now,
        schedulerId,
        catchUpLimit: options.catchUpLimit ?? 3,
      };
    },
    settlementInput(leaseToken: string) {
      return { tenantId, planId, periodStart, leaseToken, now };
    },
    immediateCancelInput(idempotencyKey: string) {
      return {
        tenantId,
        planId,
        actorUserId: userId,
        mode: 'IMMEDIATE' as const,
        cancelledAt: now,
        idempotencyKey,
      };
    },
    runScheduler,
    async runWithFailureAt(statementIndex: number) {
      const plan = await db
        .prepare(`SELECT version FROM recurring_plans WHERE tenant_id = ? AND id = ?`)
        .bind(tenantId, planId)
        .first<{ version: number }>();
      const claim = await claimDueRecurringPlanAtomic(db, {
        tenantId,
        planId,
        expectedVersion: plan?.version ?? 1,
        now,
      });
      const wrapped: D1DatabaseLike = {
        prepare: (sql) => db.prepare(sql),
        batch: (statements) => {
          const replaced = [...statements];
          if (statementIndex >= 0 && statementIndex < replaced.length) {
            replaced[statementIndex] = db
              .prepare(`INSERT INTO atomic_guards (id, ok) VALUES (?, 0)`)
              .bind(`${tenantId}:injected:${statementIndex}`);
          }
          return db.batch(replaced);
        },
      };
      return processRecurringSaleAtomic(wrapped, {
        tenantId,
        planId,
        periodStart,
        leaseToken: claim.leaseToken,
        now,
      });
    },
    async reset() {
      await db.batch([
        db.prepare(`DELETE FROM recurring_occurrence_items WHERE tenant_id = ?`).bind(tenantId),
        db.prepare(`DELETE FROM recurring_occurrences WHERE tenant_id = ?`).bind(tenantId),
        db.prepare(`DELETE FROM fiscal_outbox WHERE tenant_id = ?`).bind(tenantId),
        db.prepare(`DELETE FROM usage_events WHERE tenant_id = ?`).bind(tenantId),
        db.prepare(`DELETE FROM usage_counters WHERE tenant_id = ?`).bind(tenantId),
        db.prepare(`DELETE FROM accounts_receivable WHERE tenant_id = ?`).bind(tenantId),
        db.prepare(`DELETE FROM sale_items WHERE tenant_id = ?`).bind(tenantId),
        db.prepare(`DELETE FROM sales WHERE tenant_id = ?`).bind(tenantId),
        db
          .prepare(
            `UPDATE recurring_plans
             SET status = 'ACTIVE', next_run_at = ?, retry_count = 0,
                 next_retry_at = NULL, last_error_code = NULL,
                 lease_owner_hash = NULL, lease_expires_at = NULL, version = 1
             WHERE tenant_id = ? AND id = ?`,
          )
          .bind(periodStart, tenantId, planId),
        db
          .prepare(
            `UPDATE branch_document_series SET current_number = 0
             WHERE tenant_id = ? AND id IN (?, ?)`,
          )
          .bind(tenantId, seriesId, returnSeriesId),
      ]);
      if (options.withPhysicalAndServiceItems) {
        await db.batch([
          db
            .prepare(
              `UPDATE branch_product_stock
               SET stock = 20, stock_microunits = ?, version = 1
               WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
            )
            .bind(physicalStock, tenantId, branchId, physicalId),
          db
            .prepare(
              `UPDATE inventory_location_stock
               SET quantity_microunits = ?, version = 1
               WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
            )
            .bind(physicalStock, tenantId, branchId, physicalId),
        ]);
      }
    },
    countOccurrences: () => count('recurring_occurrences'),
    countSales: () => count('sales', `AND offline_client_sale_id LIKE 'recurring:%'`),
    countAccountsReceivable: () => count('accounts_receivable'),
    countFiscalDocuments: () => count('fiscal_outbox'),
    countUsageEvents: () => count('usage_events'),
    countProrationAdjustments: () => count('recurring_proration_adjustments'),
    countReturnDocuments: () => count('sales', `AND document_type IN ('07','NV_RETURN')`),
    async stockDeltaMicrounits() {
      if (!options.withPhysicalAndServiceItems) return 0;
      const row = await scalar(
        db,
        `SELECT stock_microunits AS value FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
        [tenantId, branchId, physicalId],
      );
      return (row?.value ?? physicalStock) - physicalStock;
    },
    async readNextRunAt() {
      const row = await db
        .prepare(`SELECT next_run_at FROM recurring_plans WHERE tenant_id = ? AND id = ?`)
        .bind(tenantId, planId)
        .first<{ next_run_at: string }>();
      return row?.next_run_at ?? '';
    },
    async changeCatalogPrice(productId: string, priceCents: number) {
      await db
        .prepare(`UPDATE products SET price_cents = ? WHERE tenant_id = ? AND id = ?`)
        .bind(priceCents, tenantId, productId)
        .run();
    },
    async readAppliedPrice(productId: string) {
      const row = await db
        .prepare(
          `SELECT roi.applied_unit_price_cents
           FROM recurring_occurrence_items roi
           WHERE roi.tenant_id = ? AND roi.product_id = ? ORDER BY roi.created_at DESC LIMIT 1`,
        )
        .bind(tenantId, productId)
        .first<{ applied_unit_price_cents: number }>();
      return row?.applied_unit_price_cents ?? 0;
    },
    readPhysicalStockDelta() {
      return this.stockDeltaMicrounits();
    },
    async readServiceStockMovements() {
      return count('inventory_movements', 'AND product_id = ?', [serviceId]);
    },
    async originalSaleWasMutated() {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS value FROM sales s
           JOIN recurring_occurrences ro ON ro.tenant_id = s.tenant_id AND ro.sale_id = s.id
           WHERE s.tenant_id = ? AND s.deleted_at IS NOT NULL`,
        )
        .bind(tenantId)
        .first<{ value: number }>();
      return (row?.value ?? 0) > 0;
    },
    async auditChainIsLinear() {
      const rows = await db
        .prepare(
          `SELECT prev_hash, row_hash FROM audit_events
           WHERE tenant_id = ? ORDER BY rowid`,
        )
        .bind(tenantId)
        .all<{ prev_hash: string | null; row_hash: string }>();
      const values = rows.results ?? [];
      return values.every(
        (row, index) => index === 0 || row.prev_hash === values[index - 1]?.row_hash,
      );
    },
  };
}
