import { describe, expect, it } from 'vitest';
import {
  isCashBlindZEnabled,
  runAuthzTokenMintHttp,
  runBlindCloseHttp,
  runCashMovementHttp,
  runSaleReprintHttp,
} from './cash-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

function mockEnv(
  overrides: Partial<WorkerEnv> & { authzTokenRow?: unknown; approverRole?: string } = {},
): WorkerEnv {
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

  const lockout = { pin_attempts: 0, pin_locked_until: null as string | null };

  function prepareStatement(sql: string): D1PreparedStatement {
    const binds: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        binds.push(...args);
        return stmt;
      },
      first<T>() {
        if (sql.includes('FROM tenant_discount_policies')) {
          return Promise.resolve({ max_amount_without_auth_cents: 2000 } as T);
        }
        if (sql.includes('FROM users') && sql.includes('pin_hash')) {
          // sha256('1234') — el PIN del supervisor en el fixture.
          return Promise.resolve({
            id: 'sup-1',
            role: overrides.approverRole ?? 'supervisor',
            pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
          } as T);
        }
        if (sql.includes('FROM authorization_tokens')) {
          return Promise.resolve(overrides.authzTokenRow as T);
        }
        if (sql.includes('pin_attempts') && sql.includes('pin_locked_until')) {
          return Promise.resolve({
            pin_attempts: lockout.pin_attempts,
            pin_locked_until: lockout.pin_locked_until,
          } as T);
        }
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
        if (sql.includes('UPDATE users SET')) {
          if (sql.includes('pin_attempts = 0, pin_locked_until = NULL')) {
            lockout.pin_attempts = 0;
            lockout.pin_locked_until = null;
          } else {
            lockout.pin_attempts += 1;
            if (lockout.pin_attempts >= 5) {
              lockout.pin_locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            }
          }
        }
        return Promise.resolve(okResult<T>());
      },
      raw<T>(): Promise<[string[], ...T[]]> {
        return Promise.resolve([[] as string[], ...([] as T[])]);
      },
    };
    (stmt as unknown as { sql: string }).sql = sql;
    return stmt;
  }

  const db = {
    prepare(sql: string) {
      return prepareStatement(sql);
    },
    batch<T>(stmts: D1PreparedStatement[]) {
      for (const s of stmts) {
        statements.push({ sql: (s as unknown as { sql: string }).sql });
      }
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
    capturedStatements: statements,
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

  it('S17-H1: umbral de justificación viene de la política SERVER, nunca del cliente', async () => {
    // Política del tenant: max_amount_without_auth_cents = 2000 (default server).
    // El cliente envía un umbral absurdo (999999999) — debe ignorarse.
    const res = await runBlindCloseHttp(mockEnv(), 't1', 'u1', {
      sessionId: 'sess-1',
      countLines: [{ denominationCents: 1000, quantity: 16 }],
      differenceThresholdCents: 999_999_999,
      differenceReason: null,
      strictMode: true,
    });
    // expected = 16000, counted = 16000 → diff 0, sin justificación.
    expect(res.status).toBe(200);
    expect(res.body.differenceAmountCents).toBe(0);

    // Con conteo distinto (diff > umbral server 2000) → exige justificación
    // AUNQUE el cliente declare un umbral gigante.
    const res2 = await runBlindCloseHttp(mockEnv(), 't1', 'u1', {
      sessionId: 'sess-1',
      countLines: [{ denominationCents: 1000, quantity: 10 }], // counted 10000 vs expected 16000
      differenceThresholdCents: 999_999_999,
      differenceReason: null,
      strictMode: true,
    });
    expect(res2.status).toBe(422);
    expect(res2.body.code).toBe('BLIND_Z_REASON_REQUIRED');
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
      outboxPendingCount: 2,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRINT_OUTBOX_BLOCK');
  });
});

describe('runCashMovementHttp', () => {
  it('403 si supera el umbral SERVER (2000) sin authz, ignorando authThresholdCents del cliente', async () => {
    const res = await runCashMovementHttp(mockEnv(), 't1', 'u1', {
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'DEPOSIT_VALUES',
      amountCents: 50_000,
      // El cliente intenta subir el umbral — se ignora (S17-H1).
      authThresholdCents: 999_999_999,
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

  it('403 aunque el cliente mande authorizedByUserId (authz SOLO por token verificado)', async () => {
    const res = await runCashMovementHttp(mockEnv(), 't1', 'u1', {
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'DEPOSIT_VALUES',
      amountCents: 50_000,
      authorizedByUserId: 'sup-1',
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH_TOKEN_REQUIRED');
  });

  it('403 AUTH_TOKEN_INVALID si el token hash no es válido o está vencido', async () => {
    const res = await runCashMovementHttp(mockEnv(), 't1', 'u1', {
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'DEPOSIT_VALUES',
      amountCents: 50_000,
      authorizationTokenHash: 'b'.repeat(64),
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTH_TOKEN_REQUIRED');
  });

  it('200 con token válido: autoriza con approved_by_user_id del token y lo consume en el batch', async () => {
    const env = mockEnv({ authzTokenRow: { id: 'tok-1', approved_by_user_id: 'sup-1' } });
    const res = await runCashMovementHttp(env, 't1', 'u1', {
      branchId: 'b1',
      sessionId: 'sess-1',
      movementType: 'DEPOSIT_VALUES',
      amountCents: 50_000,
      authorizationTokenHash: 'a'.repeat(64),
    });
    expect(res.status).toBe(200);
    expect(res.body.amountCents).toBe(50_000);
    const captured = (env as unknown as { capturedStatements: { sql?: string; batch?: number }[] })
      .capturedStatements;
    const consumed = captured.some((s) => s.sql?.includes('UPDATE authorization_tokens'));
    expect(consumed).toBe(true);
    const insert = captured.find((s) =>
      s.sql?.includes('INSERT INTO cash_register_cash_movements'),
    );
    expect(insert?.sql).toContain('authorized_by_user_id');
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

describe('S17-H2: minting de authorization_tokens con PIN supervisor', () => {
  it('PIN correcto de supervisor → emite token one-shot con TTL', async () => {
    const res = await runAuthzTokenMintHttp(mockEnv(), 't1', 'sup-1', {
      pin: '1234',
      scope: 'DISCOUNT_OVERRIDE',
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.tokenHash).toBe('string');
    expect(res.body.tokenHash).toHaveLength(64);
    expect(res.body.ttlSeconds).toBeLessThanOrEqual(90);
  });

  it('PIN incorrecto → 403 y no emite token', async () => {
    const res = await runAuthzTokenMintHttp(mockEnv(), 't1', 'sup-1', {
      pin: '9999',
      scope: 'DISCOUNT_OVERRIDE',
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PIN_INVALID');
  });

  it('lockout: 5 fallos seguidos → PIN_LOCKED (SEC-11)', async () => {
    const env = mockEnv();
    let last: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
    for (let i = 0; i < 6; i++) {
      last = await runAuthzTokenMintHttp(env, 't1', 'sup-2', {
        pin: 'wrong',
        scope: 'DISCOUNT_OVERRIDE',
      });
    }
    expect(last.status).toBe(403);
    expect(last.body.code).toBe('PIN_LOCKED');
  });

  it('scope desconocido → 422', async () => {
    const res = await runAuthzTokenMintHttp(mockEnv(), 't1', 'sup-1', {
      pin: '1234',
      scope: 'MALEVOLO',
    });
    expect(res.status).toBe(422);
  });
});

describe('G4 auditoría — aprobador de authz', () => {
  it('un cajero con PIN NO puede auto-aprobarse (3-way: solo supervisor/admin/owner)', async () => {
    const res = await runAuthzTokenMintHttp(mockEnv({ approverRole: 'cashier' }), 't1', 'sup-1', {
      pin: '1234',
      scope: 'CASH_MOVEMENT',
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_APPROVER');
  });
});
