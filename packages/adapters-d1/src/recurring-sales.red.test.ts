import { describe, expect, it, vi } from 'vitest';
import migration0037 from '../migrations/0037_sprint44_recurring_sales.sql?raw';
import down0037 from '../migrations-down/0037_sprint44_recurring_sales.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import {
  cancelRecurringPlanAtomic,
  claimDueRecurringPlanAtomic,
  processRecurringSaleAtomic,
} from './process-recurring-sale-atomic.js';

const recurringTables = [
  'recurring_plans',
  'recurring_plan_items',
  'recurring_occurrences',
  'recurring_occurrence_items',
  'recurring_proration_adjustments',
] as const;

describe('Sprint 44 D1 schema target 0037 (RED)', () => {
  it('uses normalized DAT-12 tables, integer money/quantities, and physical idempotency', () => {
    for (const table of recurringTables) {
      expect(migration0037).toContain(`CREATE TABLE ${table}`);
      expect(migration0037).toMatch(
        // eslint-disable-next-line security/detect-non-literal-regexp -- closed local table allowlist
        new RegExp(`CREATE TABLE ${table}[\\s\\S]*tenant_id TEXT NOT NULL`),
      );
    }
    expect(migration0037).not.toMatch(/\bREAL\b/);
    expect(migration0037).not.toContain('items_json');
    expect(migration0037).toContain("DEFAULT 'FIXED'");
    expect(migration0037).toContain("('FIXED','CURRENT')");
    expect(migration0037).toContain('applied_unit_price_cents INTEGER');
    expect(migration0037).toContain('applied_quantity_microunits INTEGER');
    expect(migration0037).toContain('UNIQUE (tenant_id, plan_id, period_start)');
    expect(migration0037).toContain('FOREIGN KEY (tenant_id,');
    expect(migration0037).toContain('lease_expires_at DATETIME');
    expect(migration0037).toContain('retry_count INTEGER');
    expect(migration0037).toContain('next_retry_at DATETIME');
    expect(migration0037).toContain('idx_recurring_plans_due');
  });

  it('protects down and registers every table as BUSINESS with epoch triggers', () => {
    expect(down0037).toContain('RECURRING_SALES_DOWN_PROTECTED');
    expect(down0037.indexOf('DROP TABLE recurring_occurrence_items')).toBeLessThan(
      down0037.indexOf('DROP TABLE recurring_plans'),
    );
    for (const table of recurringTables) {
      expect(D1_BACKUP_TABLES).toContainEqual(
        expect.objectContaining({ name: table, classification: 'BUSINESS' }),
      );
      expect(migration0037).toContain(`epoch_${table}`);
      expect(migration0037).toContain('tenant_data_epochs');
    }
  });
});

function db() {
  const batch = vi.fn().mockResolvedValue([]);
  return {
    batch,
    prepare: vi.fn((sql: string) => {
      const settlementRow = {
        id: 'plan-a',
        tenant_id: 'tenant-a',
        plan_key: 'membership-a',
        plan_version: 1,
        customer_id: 'customer-a',
        branch_id: 'branch-a',
        created_by_user_id: 'user-a',
        document_type: '03',
        pricing_policy: 'FIXED',
        frequency: 'MONTHLY',
        anchor_day: 1,
        anchor_is_last_day: 0,
        anchor_time: '00:00:00',
        status: 'ACTIVE',
        after_grace_policy: 'CONTINUE',
        grace_days: 3,
        catch_up_limit: 3,
        next_run_at: '2026-08-01T00:00:00-05:00',
        retry_count: 0,
        version: 2,
        effective_from: '2026-08-01T00:00:00-05:00',
        tenant_formalization_mode: 'FULL_CPE',
        tenant_tax_regime: 'RER',
        customer_document_type: '1',
        customer_document_number: '44000001',
        customer_name: 'Customer',
        customer_active: 1,
        customer_erased: 0,
        plan_item_id: 'item-a',
        line_number: 1,
        product_id: 'service-a',
        product_uom_id: 'uom-a',
        entered_quantity_microunits: 1_000_000,
        factor_numerator: 1,
        factor_denominator: 1,
        base_quantity_microunits: 1_000_000,
        fixed_unit_price_cents: 1_000,
        price_list_id: null,
        product_name: 'Service',
        product_type: 'service',
        current_unit_price_cents: 1_000,
        cost_cents: 0,
        igv_affectation_code_default: '10',
        branch_stock_microunits: 0,
        branch_stock_version: 0,
        location_id: null,
        location_stock_microunits: null,
        batch_id: null,
        batch_stock_microunits: null,
        serial_id: null,
        serial_version: null,
        series_id: 'series-a',
        series: 'B001',
        current_number: 0,
      };
      const statement = {
        sql,
        bind: vi.fn(() => statement),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({
          results: sql.includes('FROM recurring_plans rp') ? [settlementRow] : [],
          success: true,
          meta: {},
        }),
        run: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
      };
      return statement;
    }),
  };
}

describe('Sprint 44 scheduler and atomic settlement contract (RED)', () => {
  it('claims with an opaque bounded lease and deterministic catch-up cap', async () => {
    const d1 = db();
    const claim = await claimDueRecurringPlanAtomic(d1, {
      tenantId: 'tenant-a',
      planId: 'plan-a',
      expectedVersion: 7,
      now: '2026-08-08T09:00:00-05:00',
      requestedLeaseSeconds: 86_400,
      catchUpLimit: 3,
    });
    expect(claim).toMatchObject({
      scope: 'RECURRING_PLAN_EXECUTION',
      leaseToken: expect.any(String),
      leaseSeconds: expect.any(Number),
      catchUpLimit: 3,
    });
    expect(claim.leaseSeconds).toBeLessThanOrEqual(300);
    expect(JSON.stringify(d1.batch.mock.calls)).not.toContain(claim.leaseToken);
  });

  it('settles sale/items/one AR/fiscal/usage/stock/occurrence/next-run/audit in one batch', async () => {
    const d1 = db();
    await processRecurringSaleAtomic(d1, {
      tenantId: 'tenant-a',
      planId: 'plan-a',
      periodStart: '2026-08-01T00:00:00-05:00',
      leaseToken: 'opaque',
    });
    expect(d1.batch).toHaveBeenCalledTimes(1);
    const statements = JSON.stringify(d1.batch.mock.calls[0]?.[0]);
    for (const target of [
      'sales',
      'sale_items',
      'accounts_receivable',
      'fiscal_outbox',
      'usage_events',
      'recurring_occurrences',
      'next_run_at',
      'audit_events',
    ]) {
      expect(statements).toContain(target);
    }
    expect(statements.match(/INSERT INTO accounts_receivable \(/g)).toHaveLength(1);
    expect(statements).not.toMatch(/card|tokenized|autocharg/i);
  });

  it('does not advance on failure and only mutates stock for physical products', async () => {
    const d1 = db();
    d1.batch.mockRejectedValueOnce(new Error('statement 6 failed'));
    await expect(
      processRecurringSaleAtomic(d1, {
        tenantId: 'tenant-a',
        planId: 'plan-a',
        periodStart: '2026-08-01T00:00:00-05:00',
        leaseToken: 'opaque',
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^RECURRING_/) });
    expect(d1.batch).toHaveBeenCalledTimes(1);
    expect(cancelRecurringPlanAtomic).toBeTypeOf('function');
  });
});
