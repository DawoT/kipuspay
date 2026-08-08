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
      expect(migration0036).toMatch(new RegExp(`CREATE TABLE ${table}[\\s\\S]*tenant_id TEXT NOT NULL`));
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
      };
      return statement;
    }),
  };
}

describe('Sprint 43 atomic lifecycle (RED)', () => {
  it('creates reservation, order, audit, and no sale/payment/CPE in one batch', async () => {
    const d1 = db();
    await createCustomerOrderAtomic(d1, {
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      customerId: 'customer-a',
      actorUserId: 'user-a',
      idempotencyKey: 'create-1',
      reservedUntil: '2026-08-09T12:00:00.000Z',
      items: [{ productId: 'p1', quantityMicrounits: 1_000_000 }],
    });
    expect(d1.batch).toHaveBeenCalledTimes(1);
    const sql = JSON.stringify(d1.batch.mock.calls[0]?.[0]);
    expect(sql).toContain('customer_orders');
    expect(sql).toContain('inventory_location_stock');
    expect(sql).toContain('CUSTOMER_ORDER_CREATED');
    expect(sql).not.toContain('sale_payments');
    expect(sql).not.toContain('fiscal_outbox');
  });

  it('fulfills with sale/CPE/outbox/order updates and no second stock deduction', async () => {
    const d1 = db();
    await fulfillCustomerOrderAtomic(d1, {
      tenantId: 'tenant-a',
      orderId: 'order-a',
      terminalId: 'terminal-a',
      envelope: 'server-minted-envelope',
      idempotencyKey: 'fulfill-1',
    });
    expect(d1.batch).toHaveBeenCalledTimes(1);
    const sql = JSON.stringify(d1.batch.mock.calls[0]?.[0]);
    expect(sql).toContain('sales');
    expect(sql).toContain('fiscal_outbox');
    expect(sql).toContain('customer_order_fulfillments');
    expect(sql).toContain('fulfilled_quantity_microunits');
    expect(sql).not.toMatch(/stock_microunits\s*=\s*stock_microunits\s*-/);
  });

  it('cancel and expire release only remainder; expiry persists notice first', async () => {
    const cancelDb = db();
    await cancelCustomerOrderAtomic(cancelDb, {
      tenantId: 'tenant-a',
      orderId: 'order-a',
      actorUserId: 'user-a',
      idempotencyKey: 'cancel-1',
    });
    expect(JSON.stringify(cancelDb.batch.mock.calls[0]?.[0])).toContain(
      'reserved_quantity_microunits',
    );

    const expireDb = db();
    await expireCustomerOrderAtomic(expireDb, {
      tenantId: 'tenant-a',
      orderId: 'order-a',
      idempotencyKey: 'expire-1',
    });
    const statements = expireDb.batch.mock.calls[0]?.[0] as { sql: string }[];
    const noticeIndex = statements.findIndex((s) => s.sql.includes('customer_order_notifications'));
    const noticeAuditIndex = statements.findIndex((s) =>
      s.sql.includes('CUSTOMER_ORDER_EXPIRY_NOTICE'),
    );
    const releaseIndex = statements.findIndex((s) => s.sql.includes("status = 'EXPIRED'"));
    expect(noticeIndex).toBeGreaterThanOrEqual(0);
    expect(noticeAuditIndex).toBeGreaterThan(noticeIndex);
    expect(noticeAuditIndex).toBeLessThan(releaseIndex);
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
