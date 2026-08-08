import { describe, expect, it, vi } from 'vitest';
import migration0036 from '../migrations/0036_sprint43_customer_orders.sql?raw';
import down0036 from '../migrations-down/0036_sprint43_customer_orders.sql?raw';
import {
  cancelCustomerOrderAtomic,
  createCustomerOrderAtomic,
  expireCustomerOrderAtomic,
  fulfillCustomerOrderAtomic,
  recordCustomerOrderNoticeAtomic,
} from './process-customer-order-atomic.js';

describe('Sprint 43 D1 schema target 0036 (RED)', () => {
  it('uses four DAT-12 tables, INTEGER microunits, checks, timestamps, and indexes', () => {
    for (const table of [
      'customer_orders',
      'customer_order_items',
      'customer_order_fulfillments',
      'customer_order_notifications',
    ]) {
      expect(migration0036).toContain(`CREATE TABLE ${table}`);
      expect(migration0036).toMatch(
        // eslint-disable-next-line security/detect-non-literal-regexp -- closed local table allowlist
        new RegExp(`CREATE TABLE ${table}[\\s\\S]*tenant_id TEXT NOT NULL`),
      );
    }
    expect(migration0036).not.toMatch(/\bREAL\b/);
    expect(migration0036).toContain('requested_quantity_microunits INTEGER');
    expect(migration0036).toMatch(
      /requested_quantity_microunits\s*=\s*fulfilled_quantity_microunits\s*\+\s*released_quantity_microunits\s*\+\s*reserved_quantity_microunits/,
    );
    expect(migration0036).toContain("('OPEN','PARTIAL','FULFILLED','CANCELLED','EXPIRED')");
    expect(migration0036).toContain('factor_numerator INTEGER');
    expect(migration0036).toContain('factor_denominator INTEGER');
    expect(migration0036).toContain('unit_price_cents INTEGER');
    expect(migration0036).toContain('FOREIGN KEY (tenant_id,');
    expect(migration0036).toContain('idempotency_key TEXT NOT NULL');
    expect(migration0036).toContain('updated_at DATETIME NOT NULL');
    expect(migration0036).toContain('idx_customer_order_notifications_retry');
  });

  it('supports multiple partial sales and a protected data-preserving down', () => {
    expect(migration0036).toContain('sale_id TEXT');
    expect(migration0036).not.toContain('UNIQUE (tenant_id, customer_order_id)');
    expect(down0036).toContain('CUSTOMER_ORDER_DOWN_PROTECTED');
    expect(down0036).toContain('atomic_guards');
    expect(down0036.indexOf('DROP TABLE customer_order_notifications')).toBeLessThan(
      down0036.indexOf('DROP TABLE customer_orders'),
    );
  });
});

function db() {
  const batch = vi.fn().mockResolvedValue([]);
  return {
    batch,
    prepare: vi.fn((sql: string) => {
      const statement = {
        sql,
        bind: vi.fn(() => statement),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
      };
      return statement;
    }),
  };
}

describe('Sprint 43 atomic lifecycle (RED)', () => {
  it('exports the lifecycle writers exercised by the workerd suite', () => {
    expect(createCustomerOrderAtomic).toBeTypeOf('function');
    expect(fulfillCustomerOrderAtomic).toBeTypeOf('function');
    expect(cancelCustomerOrderAtomic).toBeTypeOf('function');
    expect(expireCustomerOrderAtomic).toBeTypeOf('function');
  });

  it('notice retry is observable/idempotent and transport failure does not own release', async () => {
    const d1 = db();
    await recordCustomerOrderNoticeAtomic(d1, {
      tenantId: 'tenant-a',
      orderId: 'order-a',
      channel: 'IN_APP',
      idempotencyKey: 'notice-1',
      transportResult: { ok: false, code: 'TIMEOUT' },
    });
    const sql = JSON.stringify(d1.batch.mock.calls[0]?.[0]);
    expect(sql).toContain('attempt_count');
    expect(sql).toContain('next_attempt_at');
    expect(sql).toContain('RETRY');
    expect(sql).not.toContain('ROLLBACK');
  });
});
