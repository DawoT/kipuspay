import { describe, expect, it } from 'vitest';
import {
  isCashBlindZEnabled,
  runBlindCloseHttp,
  runCashMovementHttp,
  runSaleReprintHttp,
} from './cash-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  const statements: unknown[] = [];
  const meta = {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };

  const okResult = <T>(results: T[] = [] as T[]) => ({
    success: true as const,
    meta,
    results,
  });

  function prepareStatement(sql: string): D1PreparedStatement {
    const binds: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        binds.push(...args);
        return stmt;
      },
      first<T>() {
        if (sql.includes('FROM cash_register_sessions')) {
          return Promise.resolve({
            id: 'sess-1',
            tenant_id: 't1',
            branch_id: 'b1',
            opening_balance_cents: 10_000,
            status: 'OPEN',
          } as T);
        }
        if (sql.includes('cash_cents')) {
          return Promise.resolve({ cash_cents: 5_000 } as T);
        }
        if (sql.includes('expense_cents')) {
          return Promise.resolve({ expense_cents: 0 } as T);
        }
        if (sql.includes('FROM sales')) {
          return Promise.resolve({ id: 'sale-1' } as T);
        }
        if (sql.includes('FROM audit_events')) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      },
      all<T>() {
        if (sql.includes('cash_register_cash_movements')) {
          return Promise.resolve(
            okResult<T>([
              { movement_type: 'CHANGE_FUND_IN', amount_cents: 2_000 },
              { movement_type: 'DEPOSIT_VALUES', amount_cents: 1_000 },
            ] as T[]),
          );
        }
        return Promise.resolve(okResult<T>());
      },
      run<T>() {
        statements.push({ sql, binds });
        return Promise.resolve(okResult<T>());
      },
      raw<T>(): Promise<[string[], ...T[]]> {
        return Promise.resolve([[] as string[], ...([] as T[])]);
      },
    };
    return stmt;
  }

  const db = {
    prepare(sql: string) {
      return prepareStatement(sql);
    },
    batch<T>(stmts: D1PreparedStatement[]) {
      statements.push({ batch: stmts.length });
      return Promise.resolve(stmts.map(() => okResult<T>()));
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0 });
    },
    withSession() {
      return {
        prepare(sql2: string) {
          return prepareStatement(sql2);
        },
        batch<T>(stmts: D1PreparedStatement[]) {
          return Promise.resolve(stmts.map(() => okResult<T>()));
        },
        getBookmark() {
          return null;
        },
      };
    },
    dump() {
      return Promise.resolve(new ArrayBuffer(0));
    },
  } satisfies D1Database;
  return {
    FEATURE_CASH_BLIND_Z: '1',
    DB: db,
    TENANT_KV: { get: () => null },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => new Response('{}') }),
    },
    ...overrides,
  } as WorkerEnv;
}

describe('isCashBlindZEnabled', () => {
  it('default off', () => {
    expect(isCashBlindZEnabled({} as WorkerEnv)).toBe(false);
    expect(isCashBlindZEnabled({ FEATURE_CASH_BLIND_Z: '1' } as WorkerEnv)).toBe(true);
  });
});

describe('runBlindCloseHttp', () => {
  it('FEATURE_OFF sin flag', async () => {
    const res = await runBlindCloseHttp({ FEATURE_CASH_BLIND_Z: '0' } as WorkerEnv, 't1', 'u1', {});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_OFF');
  });

  it('exige conteo en modo estricto', async () => {
    const res = await runBlindCloseHttp(mockEnv(), 't1', 'u1', {
      sessionId: 'sess-1',
      countLines: [],
      strictMode: true,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('BLIND_Z_REQUIRES_COUNT');
  });

  it('cierra ciego y revela expected solo al final', async () => {
    // expected = 10000 + 5000 + 2000 - 1000 = 16000
    const res = await runBlindCloseHttp(mockEnv(), 't1', 'u1', {
      sessionId: 'sess-1',
      countLines: [{ denominationCents: 1000, quantity: 16 }],
      differenceThresholdCents: 0,
      differenceReason: null,
      strictMode: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.countedTotalCents).toBe(16_000);
    expect(res.body.expectedTotalCents).toBe(16_000);
    expect(res.body.differenceAmountCents).toBe(0);
    expect(res.body.closedBlind).toBe(true);
    expect(res.body.attributedTo).toBe('cash_register_session');
  });

  it('bloquea si stub outbox pending > 0 (contrato S25)', async () => {
    const res = await runBlindCloseHttp(mockEnv(), 't1', 'u1', {
      sessionId: 'sess-1',
      countLines: [{ denominationCents: 100, quantity: 1 }],
      stubOutboxPending: 2,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRINT_OUTBOX_BLOCK');
  });
});

describe('runCashMovementHttp', () => {
  it('403 si supera umbral sin authz', async () => {
    const res = await runCashMovementHttp(mockEnv(), 't1', 'u1', {
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'DEPOSIT_VALUES',
      amountCents: 50_000,
      authThresholdCents: 10_000,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH_TOKEN_REQUIRED');
  });

  it('crea movimiento bajo umbral', async () => {
    const res = await runCashMovementHttp(mockEnv(), 't1', 'u1', {
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'CHANGE_FUND_IN',
      amountCents: 500,
    });
    expect(res.status).toBe(200);
    expect(res.body.amountCents).toBe(500);
  });
});

describe('runSaleReprintHttp', () => {
  it('siempre COPIA', async () => {
    const res = await runSaleReprintHttp(mockEnv(), 't1', 'u1', {
      saleId: 'sale-1',
      branchId: 'b1',
    });
    expect(res.status).toBe(200);
    expect(res.body.copiedWatermark).toBe(true);
    expect(res.body.watermarkLabel).toBe('COPIA');
  });
});
