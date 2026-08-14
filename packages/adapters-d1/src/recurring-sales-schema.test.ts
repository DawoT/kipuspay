import { describe, expect, it } from 'vitest';
import down0037 from '../migrations-down/0037_sprint44_recurring_sales.sql?raw';
import migration0037 from '../migrations/0037_sprint44_recurring_sales.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0037_SPRINT44_RECURRING_SALES } from './migrations-down.js';

const tables = [
  'recurring_plans',
  'recurring_plan_items',
  'recurring_occurrences',
  'recurring_occurrence_items',
  'recurring_proration_adjustments',
] as const;

describe('Sprint 44 recurring-sales schema', () => {
  it('defines normalized DAT-12 integer snapshots and constrained catalogs', () => {
    for (const table of tables) {
      expect(migration0037).toContain(`CREATE TABLE ${table}`);
      expect(migration0037).toContain('UNIQUE (tenant_id, id)');
    }
    expect(migration0037).not.toMatch(/\bREAL\b/);
    expect(migration0037).toContain("('DAILY','WEEKLY','MONTHLY')");
    expect(migration0037).toContain("('NV','03','01')");
    expect(migration0037).toContain("('FIXED','CURRENT')");
    expect(migration0037).toContain(
      "('ACTIVE','PAUSED','GRACE','CANCEL_AT_PERIOD_END','CANCELLED')",
    );
    expect(migration0037).toContain('UNIQUE (tenant_id, plan_id, period_start)');
    expect(migration0037).toContain('UNIQUE (tenant_id, sale_id)');
    expect(migration0037).toContain('UNIQUE (tenant_id, accounts_receivable_id)');
    expect(migration0037).toContain('UNIQUE (tenant_id, adjustment_sale_id)');
  });

  it('keeps applied snapshots immutable and operational state explicit', () => {
    expect(migration0037).toContain('recurring_plans_version_immutable');
    expect(migration0037).toContain('RECURRING_PLAN_VERSION_IMMUTABLE');
    expect(migration0037).toContain('recurring_plan_items_no_delete');
    expect(migration0037).toContain('recurring_occurrence_items_immutable');
    expect(migration0037).toContain('RECURRING_OCCURRENCE_ITEM_IMMUTABLE');
    expect(migration0037).toContain('recurring_proration_adjustments_immutable');
    expect(migration0037).toContain('lease_owner_hash TEXT');
    expect(migration0037).toContain('lease_expires_at DATETIME');
    expect(migration0037).toContain('version INTEGER NOT NULL');
    expect(migration0037).toContain('retry_count INTEGER');
    expect(migration0037).toContain('next_retry_at DATETIME');
  });

  it('persists hashed one-shot manual-run idempotency and replay state', () => {
    expect(migration0037).toMatch(
      /ALTER TABLE authorization_tokens\s+ADD COLUMN recurring_idempotency_key_hash TEXT/,
    );
    expect(migration0037).toMatch(
      /ALTER TABLE authorization_tokens\s+ADD COLUMN recurring_run_result_json TEXT/,
    );
    expect(migration0037).toContain('idx_authorization_tokens_recurring_manual');
    expect(down0037).toContain(
      'ALTER TABLE authorization_tokens DROP COLUMN recurring_run_result_json',
    );
    expect(down0037).toContain(
      'ALTER TABLE authorization_tokens DROP COLUMN recurring_idempotency_key_hash',
    );
  });

  it('registers every table as BUSINESS and owns 0037 epoch triggers', () => {
    const registry = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    for (const table of tables) {
      expect(registry.get(table)).toMatchObject({ classification: 'BUSINESS' });
      expect(migration0037).toContain(`epoch_${table}_insert`);
      expect(migration0037).toContain(`epoch_${table}_update`);
      expect(migration0037).toContain(`epoch_${table}_delete`);
    }
  });

  it('exports an exact protected child-first down mirror', () => {
    expect(DOWN_0037_SPRINT44_RECURRING_SALES.trim()).toBe(down0037.trim());
    expect(down0037).toContain('RECURRING_SALES_DOWN_PROTECTED');
    expect(down0037.indexOf('DROP TABLE recurring_occurrence_items')).toBeLessThan(
      down0037.indexOf('DROP TABLE recurring_plans'),
    );
  });
});
