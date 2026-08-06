import { describe, expect, it } from 'vitest';
import {
  expireLoyaltyReservationsAtomic,
  reserveLoyaltyPointsAtomic,
} from './reserve-loyalty-atomic.js';
import type { D1Bound, D1DatabaseLike, D1Result } from './index.js';

function okResult<T>(results: readonly T[] = []): D1Result<T> {
  return { results, success: true, meta: {} };
}

function mockDb(opts: {
  existing?: { id: string; status: string; points: number } | null;
  balance?: number;
  reservedSum?: number;
  expireRows?: Array<{ id: string; tenant_id: string; status: string }>;
}): D1DatabaseLike {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM loyalty_reservations') && sql.includes('sale_idempotency_key')) {
            return Promise.resolve((opts.existing ?? null) as T | null);
          }
          if (sql.includes('FROM loyalty_accounts') && sql.includes('points_balance')) {
            return Promise.resolve({ points_balance: opts.balance ?? 100 } as T);
          }
          if (sql.includes('SUM(points)')) {
            return Promise.resolve({ reserved_points: opts.reservedSum ?? 0 } as T);
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve(okResult((opts.expireRows ?? []) as unknown as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return stmt;
    },
    batch: (stmts: readonly D1Bound[]) => Promise.resolve(stmts.map(() => okResult())),
  };
}

describe('reserve-loyalty-atomic', () => {
  it('reserva nueva cuando hay saldo', async () => {
    const res = await reserveLoyaltyPointsAtomic(mockDb({ existing: null, balance: 50 }), 't1', {
      customerId: 'c1',
      saleIdempotencyKey: 'sale-1',
      points: 10,
    });
    expect(res.status).toBe('RESERVED');
    expect(res.idempotent).toBe(false);
    expect(res.points).toBe(10);
  });

  it('idempotente por sale_idempotency_key', async () => {
    const res = await reserveLoyaltyPointsAtomic(
      mockDb({ existing: { id: 'r1', status: 'RESERVED', points: 7 } }),
      't1',
      { customerId: 'c1', saleIdempotencyKey: 'sale-1', points: 7 },
    );
    expect(res.id).toBe('r1');
    expect(res.idempotent).toBe(true);
  });

  it('rechaza puntos insuficientes', async () => {
    await expect(
      reserveLoyaltyPointsAtomic(mockDb({ existing: null, balance: 5, reservedSum: 0 }), 't1', {
        customerId: 'c1',
        saleIdempotencyKey: 'sale-2',
        points: 10,
      }),
    ).rejects.toThrow('LOYALTY_INSUFFICIENT_POINTS');
  });

  it('expire marca RESERVED vencidas', async () => {
    const res = await expireLoyaltyReservationsAtomic(
      mockDb({
        expireRows: [{ id: 'r-exp', tenant_id: 't1', status: 'RESERVED' }],
      }),
      '2026-08-06 12:00:00',
    );
    expect(res.expired).toBe(1);
    expect(res.ids).toEqual(['r-exp']);
  });
});
