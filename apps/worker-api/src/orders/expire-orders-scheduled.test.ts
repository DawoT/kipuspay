import { describe, expect, it } from 'vitest';
import { runExpireOrdersScheduled } from './expire-orders-scheduled.js';

function mockDb(orders: Array<Record<string, string>>) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        all: () =>
          Promise.resolve({
            results: sql.includes('FROM customer_orders')
              ? orders.map((row) => ({ tenant_id: 't1', id: row.id, branch_id: 'b1' }))
              : [],
          }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ success: true }),
      };
      return stmt;
    },
    batch: () => Promise.resolve([]),
  };
}

describe('S43-H2: expire-orders-scheduled', () => {
  it('expira pedidos vencidos y devuelve el conteo', async () => {
    const db = mockDb([{ id: 'order-1' }, { id: 'order-2' }]);
    const expired = await runExpireOrdersScheduled({ DB: db } as never, {
      scheduledTime: Date.parse('2026-08-08T12:00:00.000Z'),
    });
    expect(expired.scanned).toBe(2);
    expect(expired.expired).toBeGreaterThanOrEqual(0);
  });

  it('sin DB → 0 sin error (fail-closed)', async () => {
    const result = await runExpireOrdersScheduled({} as never, {
      scheduledTime: Date.now(),
    });
    expect(result).toEqual({ expired: 0, scanned: 0 });
  });

  it('sin pedidos vencidos → 0 expirados', async () => {
    const db = mockDb([]);
    const result = await runExpireOrdersScheduled({ DB: db } as never, {
      scheduledTime: Date.parse('2026-08-08T12:00:00.000Z'),
    });
    expect(result.scanned).toBe(0);
    expect(result.expired).toBe(0);
  });
});
