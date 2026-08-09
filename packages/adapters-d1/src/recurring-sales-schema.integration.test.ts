import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertBackupRegistryComplete } from './data-backup.js';
import { DOWN_0037_SPRINT44_RECURRING_SALES } from './migrations-down.js';

const tenantA = 'recurring-schema-a';
const tenantB = 'recurring-schema-b';
const branchA = 'recurring-branch-a';
const branchB = 'recurring-branch-b';
const userA = 'recurring-user-a';
const customerA = 'recurring-customer-a';

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type)
       VALUES (?, 'Recurring A', 'services')`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type)
       VALUES (?, 'Recurring B', 'services')`,
    ).bind(tenantB),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'RA', 'Recurring A', 'Lima')`,
    ).bind(branchA, tenantA),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'RB', 'Recurring B', 'Lima')`,
    ).bind(branchB, tenantB),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, 'recurring@example.test', 'owner')`,
    ).bind(userA, tenantA, branchA),
    env.DB.prepare(
      `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name)
       VALUES (?, ?, '1', '44000001', 'Cliente Recurrente')`,
    ).bind(customerA, tenantA),
    env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, name, product_type, unit_code, price_cents)
       VALUES ('recurring-product-a', ?, 'REC-A', 'Servicio', 'service', 'ZZ', 1000)`,
    ).bind(tenantA),
  ]);
  await env.DB.prepare(
    `INSERT INTO product_uoms (
       id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
     ) VALUES ('recurring-uom-a', ?, 'recurring-product-a', 'ZZ', 1, 1, 1)`,
  )
    .bind(tenantA)
    .run();
});

function insertPlan(id: string, planVersion = 1) {
  return env.DB.prepare(
    `INSERT INTO recurring_plans (
       id, tenant_id, plan_key, plan_version, customer_id, branch_id,
       created_by_user_id, document_type, frequency, anchor_day, anchor_time,
       next_run_at, effective_from
     ) VALUES (?, ?, 'membership-a', ?, ?, ?, ?, 'NV', 'MONTHLY', 31,
       '09:30:00', '2026-08-31T09:30:00-05:00', '2026-08-01T09:30:00-05:00')`,
  ).bind(id, tenantA, planVersion, customerA, branchA, userA);
}

describe('Sprint 44 recurring-sales schema in workerd', () => {
  it('is complete in the generated backup registry and increments tenant epoch', async () => {
    await expect(assertBackupRegistryComplete(env.DB)).resolves.toBeUndefined();
    const before = await env.DB.prepare('SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?')
      .bind(tenantA)
      .first<{ epoch: number }>();
    await insertPlan('recurring-plan-a').run();
    const after = await env.DB.prepare('SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?')
      .bind(tenantA)
      .first<{ epoch: number }>();
    expect(after?.epoch).toBe((before?.epoch ?? 0) + 1);
  });

  it('rejects cross-tenant references, invalid catalogs, and duplicate versions', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO recurring_plans (
           id, tenant_id, plan_key, plan_version, customer_id, branch_id,
           created_by_user_id, document_type, frequency, anchor_day, anchor_time,
           next_run_at, effective_from
         ) VALUES ('recurring-cross-tenant', ?, 'cross', 1, ?, ?, ?, 'NV',
           'MONTHLY', 31, '09:30:00', '2026-08-31T09:30:00-05:00',
           '2026-08-01T09:30:00-05:00')`,
      )
        .bind(tenantA, customerA, branchB, userA)
        .run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `UPDATE recurring_plans SET frequency = 'YEARLY'
         WHERE tenant_id = ? AND id = 'recurring-plan-a'`,
      )
        .bind(tenantA)
        .run(),
    ).rejects.toThrow();
    await expect(insertPlan('recurring-plan-duplicate').run()).rejects.toThrow();
  });

  it('freezes plan item versions and guards nonnegative monetary snapshots', async () => {
    await env.DB.prepare(
      `INSERT INTO recurring_plan_items (
         id, tenant_id, plan_id, line_number, product_id, product_uom_id,
         entered_quantity_microunits, factor_numerator, factor_denominator,
         base_quantity_microunits, fixed_unit_price_cents
       ) VALUES ('recurring-plan-item-a', ?, 'recurring-plan-a', 1,
         'recurring-product-a', 'recurring-uom-a', 1000000, 1, 1, 1000000, 1000)`,
    )
      .bind(tenantA)
      .run();
    await expect(
      env.DB.prepare(
        `UPDATE recurring_plan_items SET fixed_unit_price_cents = 2000
         WHERE tenant_id = ? AND id = 'recurring-plan-item-a'`,
      )
        .bind(tenantA)
        .run(),
    ).rejects.toThrow('RECURRING_PLAN_ITEM_VERSION_IMMUTABLE');
    await expect(
      env.DB.prepare(
        `INSERT INTO recurring_plan_items (
           id, tenant_id, plan_id, line_number, product_id, product_uom_id,
           entered_quantity_microunits, factor_numerator, factor_denominator,
           base_quantity_microunits, fixed_unit_price_cents
         ) VALUES ('recurring-plan-item-negative', ?, 'recurring-plan-a', 2,
           'recurring-product-a', 'recurring-uom-a', 1000000, 1, 1, 1000000, -1)`,
      )
        .bind(tenantA)
        .run(),
    ).rejects.toThrow();
  });

  it('physically prevents duplicate period, sale, receivable, and return credit links', async () => {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO cash_registers (id, tenant_id, branch_id, name)
         VALUES ('recurring-register-a', ?, ?, 'Caja recurrente')`,
      ).bind(tenantA, branchA),
      env.DB.prepare(
        `INSERT INTO cash_register_sessions (
           id, tenant_id, branch_id, cash_register_id, user_id, status
         ) VALUES ('recurring-session-a', ?, ?, 'recurring-register-a', ?, 'OPEN')`,
      ).bind(tenantA, branchA, userA),
    ]);
    for (let index = 1; index <= 4; index += 1) {
      await env.DB.prepare(
        `INSERT INTO sales (
           id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
           client_document_type, client_document_number, client_name, document_type,
           series, number, total_amount_cents, issued_at_lima, sunat_status
         ) VALUES (?, ?, ?, 'recurring-session-a', ?, ?, '1', '44000001',
           'Cliente Recurrente', 'NV', 'R001', ?, 1000,
           '2026-08-01T09:30:00-05:00', 'NOT_APPLICABLE')`,
      )
        .bind(`recurring-sale-${index}`, tenantA, branchA, userA, customerA, index)
        .run();
      await env.DB.prepare(
        `INSERT INTO accounts_receivable (
           id, tenant_id, customer_id, sale_id, original_amount_cents,
           balance_due_cents, due_date
         ) VALUES (?, ?, ?, ?, 1000, 1000, '2026-08-31T09:30:00-05:00')`,
      )
        .bind(`recurring-ar-${index}`, tenantA, customerA, `recurring-sale-${index}`)
        .run();
    }
    const occurrence = (id: string, periodStart: string, saleId: string, receivableId: string) =>
      env.DB.prepare(
        `INSERT INTO recurring_occurrences (
           id, tenant_id, plan_id, plan_version, period_start, period_end,
           sale_id, accounts_receivable_id, document_type, total_amount_cents,
           idempotency_key, settled_at
         ) VALUES (?, ?, 'recurring-plan-a', 1, ?, '2026-10-01T09:30:00-05:00',
           ?, ?, 'NV', 1000, ?, '2026-08-01T09:30:00-05:00')`,
      ).bind(id, tenantA, periodStart, saleId, receivableId, `idem-${id}`);
    await occurrence(
      'recurring-occurrence-1',
      '2026-08-01T09:30:00-05:00',
      'recurring-sale-1',
      'recurring-ar-1',
    ).run();
    await expect(
      occurrence(
        'recurring-occurrence-period-duplicate',
        '2026-08-01T09:30:00-05:00',
        'recurring-sale-2',
        'recurring-ar-2',
      ).run(),
    ).rejects.toThrow();
    await expect(
      occurrence(
        'recurring-occurrence-sale-duplicate',
        '2026-09-01T09:30:00-05:00',
        'recurring-sale-1',
        'recurring-ar-2',
      ).run(),
    ).rejects.toThrow();
    await expect(
      occurrence(
        'recurring-occurrence-ar-duplicate',
        '2026-09-01T09:30:00-05:00',
        'recurring-sale-2',
        'recurring-ar-1',
      ).run(),
    ).rejects.toThrow();
    await occurrence(
      'recurring-occurrence-2',
      '2026-09-01T09:30:00-05:00',
      'recurring-sale-3',
      'recurring-ar-3',
    ).run();
    const adjustment = (id: string, occurrenceId: string) =>
      env.DB.prepare(
        `INSERT INTO recurring_proration_adjustments (
           id, tenant_id, plan_id, occurrence_id, original_sale_id,
           adjustment_sale_id, adjustment_document_type, cancellation_mode,
           service_days, unused_service_days, rational_numerator,
           rational_denominator, credit_amount_cents, idempotency_key
         ) VALUES (?, ?, 'recurring-plan-a', ?, 'recurring-sale-1',
           'recurring-sale-4', 'NV_RETURN', 'IMMEDIATE', 31, 9, 9000, 31, 290, ?)`,
      ).bind(id, tenantA, occurrenceId, `idem-${id}`);
    await adjustment('recurring-adjustment-1', 'recurring-occurrence-1').run();
    await expect(
      adjustment('recurring-adjustment-credit-duplicate', 'recurring-occurrence-2').run(),
    ).rejects.toThrow();
  });

  it('protects down while any recurring business row exists', async () => {
    await expect(env.DB.exec(DOWN_0037_SPRINT44_RECURRING_SALES)).rejects.toThrow(
      'RECURRING_SALES_DOWN_PROTECTED',
    );
  });
});
