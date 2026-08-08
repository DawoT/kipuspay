/* eslint-disable no-secrets/no-secrets, security/detect-non-literal-regexp -- DDL identifiers and test-only table interpolation */
import { describe, expect, it } from 'vitest';
import down0036 from '../migrations-down/0036_sprint43_customer_orders.sql?raw';
import migration0036 from '../migrations/0036_sprint43_customer_orders.sql?raw';
import { D1_BACKUP_TABLES } from './data-backup-registry.generated.js';
import { DOWN_0036_SPRINT43_CUSTOMER_ORDERS } from './migrations-down.js';

const tables = [
  'customer_orders',
  'customer_order_items',
  'customer_order_fulfillments',
  'customer_order_notifications',
] as const;

describe('Sprint 43 customer-order schema', () => {
  it('mirrors the §5.10 DAT-12 target with exact integer snapshots and constraints', () => {
    for (const table of tables) {
      expect(migration0036).toContain(`CREATE TABLE ${table}`);
      expect(migration0036).toMatch(
        new RegExp(`CREATE TABLE ${table}[\\s\\S]*?tenant_id TEXT NOT NULL`),
      );
      expect(migration0036).toContain(`UNIQUE (tenant_id, id)`);
    }
    expect(migration0036).not.toMatch(/\bREAL\b/);
    expect(migration0036).toContain("('OPEN','PARTIAL','FULFILLED','CANCELLED','EXPIRED')");
    expect(migration0036).toContain(
      'requested_quantity_microunits = fulfilled_quantity_microunits + released_quantity_microunits + reserved_quantity_microunits',
    );
    expect(migration0036).toContain('entered_quantity_microunits INTEGER NOT NULL');
    expect(migration0036).toContain('factor_numerator INTEGER NOT NULL');
    expect(migration0036).toContain('factor_denominator INTEGER NOT NULL');
    expect(migration0036).toContain('unit_price_cents INTEGER NOT NULL');
    expect(migration0036).toContain("event_type IN ('EXPIRY_WARNING')");
    expect(migration0036).toContain("channel IN ('WHATSAPP','IN_APP')");
    expect(migration0036).toContain("'PENDING','DISPATCHING','SENT','DELIVERED'");
    expect(migration0036).toContain("'RETRY','ESCALATED','FAILED'");
  });

  it('guards lifecycle, conservation, notice-before-expire, and fulfillment replay', () => {
    expect(migration0036).toContain('customer_orders_status_transition_guard');
    expect(migration0036).toContain('CUSTOMER_ORDER_INVALID_TRANSITION');
    expect(migration0036).toContain('customer_orders_expiry_notice_guard');
    expect(migration0036).toContain('CUSTOMER_ORDER_EXPIRY_NOTICE_REQUIRED');
    expect(migration0036).toContain('customer_order_fulfillments_quantity_guard');
    expect(migration0036).toContain('CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_ITEM');
    expect(migration0036).toContain('UNIQUE (tenant_id, sale_id, sale_item_id)');
    expect(migration0036).toContain('UNIQUE (tenant_id, envelope_id, customer_order_item_id)');
    expect(migration0036).toContain('UNIQUE (tenant_id, token_hash, customer_order_item_id)');
  });

  it('registers all business tables and epoch triggers', () => {
    const registered = new Map(D1_BACKUP_TABLES.map((entry) => [entry.name, entry]));
    for (const table of tables) {
      expect(registered.get(table)).toMatchObject({ classification: 'BUSINESS' });
      expect(migration0036).toContain(`backup_epoch_${table}_insert`);
      expect(migration0036).toContain(`backup_epoch_${table}_update`);
      expect(migration0036).toContain(`backup_epoch_${table}_delete`);
    }
  });

  it('exports an exact protected child-first down mirror', () => {
    expect(DOWN_0036_SPRINT43_CUSTOMER_ORDERS.trim()).toBe(down0036.trim());
    expect(down0036).toContain('CUSTOMER_ORDER_DOWN_PROTECTED');
    expect(down0036).toContain('atomic_guards');
    expect(down0036.indexOf('DROP TABLE customer_order_notifications')).toBeLessThan(
      down0036.indexOf('DROP TABLE customer_orders'),
    );
    for (const table of tables) {
      expect(down0036).toContain(`DROP TRIGGER IF EXISTS backup_epoch_${table}_insert`);
    }
  });
});
