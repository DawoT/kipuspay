import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingCaptureAtomic, settleCaptureAtomic } from '@kipuspay/adapters-d1';
import type { D1Bound, D1DatabaseLike } from '@kipuspay/adapters-d1';
import {
  isCardAcquirerEnabled,
  isQrWalletsEnabled,
  runOwnerUncapturedPaymentsHttp,
  runPaymentChargeHttp,
  runPaymentWebhookHttp,
} from './payment-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

beforeEach(() => {
  vi.mocked(settleCaptureAtomic).mockClear();
});

vi.mock('@kipuspay/adapters-d1', async (importOriginal) => {
  // La ruta invoca isIdempotencyMismatch/isDbUnavailable en su catch (US-02);
  // el mock estático no los exportaba. Solo esos guards son código real, el
  // resto queda mockeado.
  const actual = await importOriginal<typeof import('@kipuspay/adapters-d1')>();
  return {
    createPendingCaptureAtomic: vi.fn(() =>
      Promise.resolve({ id: 'cap1', status: 'PENDING', idempotent: false }),
    ),
    settleCaptureAtomic: vi.fn(() => Promise.resolve({ id: 'cap1', status: 'CAPTURED' })),
    isIdempotencyMismatch: actual.isIdempotencyMismatch,
    isDbUnavailable: actual.isDbUnavailable,
  };
});

const verifyWebhook = vi.fn(
  (): Promise<{
    ok: boolean;
    chargeId: string | null;
    status: 'CAPTURED' | 'FAILED' | 'PENDING' | 'REFUNDED' | 'MANUAL_ELECTRONIC_CAPTURE' | null;
    reference: string | null;
  }> =>
    Promise.resolve({
      ok: true,
      chargeId: 'cap1',
      status: 'CAPTURED',
      reference: 'ref1',
    }),
);

vi.mock('@kipuspay/adapters-payments-pe', () => ({
  createPaymentAcquirer: () => ({
    charge: () =>
      Promise.resolve({
        chargeId: 'ch1',
        approved: true,
        reference: 'ref1',
        status: 'CAPTURED',
      }),
    getStatus: () =>
      Promise.resolve({
        chargeId: 'ch1',
        approved: true,
        reference: 'ref1',
        status: 'CAPTURED',
      }),
    verifyWebhook,
  }),
}));

function mockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  const meta = {
    duration: 0,
    size_after: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    changed_db: false,
    changes: 0,
  };
  const ok = <T>(results: T[] = []) => ({ success: true as const, meta, results });
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        first: <T>() => {
          if (sql.includes('FROM payment_methods')) {
            return Promise.resolve({ code: 'yape' } as T);
          }
          if (sql.includes('FROM payment_captures')) {
            return Promise.resolve({ id: 'cap1', tenant_id: 't1', status: 'PENDING' } as T);
          }
          return Promise.resolve(null);
        },
        all: <T>() =>
          Promise.resolve(
            ok([
              {
                id: 'cap1',
                sale_id: 's1',
                acquirer: 'yape',
                status: 'MANUAL_ELECTRONIC_CAPTURE',
                amount_cents: 100,
              },
            ] as T[]),
          ),
        run: () => Promise.resolve(ok()),
      };
      return stmt;
    },
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    withSession: () => db,
  };
  return {
    FEATURE_PAYMENTS_QR_WALLETS: '1',
    FEATURE_PAYMENTS_CARD_ACQUIRER: '1',
    DB: db as unknown as D1Database,
    YAPE_WEBHOOK_SECRET: 'sandbox-test-secret',
    ...overrides,
  } as WorkerEnv;
}

interface CaptureRow {
  id: string;
  tenant_id: string;
  sale_id: string;
  sale_payment_id: string;
  acquirer: string;
  status: string;
  amount_cents: number;
  idempotency_key: string;
}

/**
 * US-02: fake D1 con la UNIQUE (tenant_id, idempotency_key) REAL de
 * payment_captures (mismo terreno que process-payment-capture-atomic.test.ts),
 * pero con el contrato completo que la ruta exige (payment_methods, COUNT(*)):
 * el INSERT concurrente choca igual que en producción y el re-SELECT expone la
 * fila ganadora. Las filas viven en memoria: son las "filas reales" sobre las
 * que se cuenta.
 */
function concurrentCaptureDb(): { db: D1DatabaseLike; rows: () => CaptureRow[] } {
  const rowsByKey = new Map<string, CaptureRow>();
  const keyOf = (tenantId: string, idemKey: string) => `${tenantId}\u0000${idemKey}`;
  const okResult = <T>(results: T[] = []) => ({ results, success: true, meta: {} });
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      const bound = {
        _sql: sql,
        _params: [] as unknown[],
        bind(...params: unknown[]) {
          bound._params = params;
          return bound;
        },
        first: <T>() => {
          if (sql.includes('FROM payment_methods')) {
            return Promise.resolve({ code: 'yape' } as T);
          }
          if (sql.includes('COUNT(*)')) {
            const n = [...rowsByKey.values()].filter(
              (r) => r.tenant_id === bound._params[0] && r.idempotency_key === bound._params[1],
            ).length;
            return Promise.resolve({ n } as T);
          }
          if (sql.includes('FROM payment_captures')) {
            const row = rowsByKey.get(keyOf(bound._params[0] as string, bound._params[1] as string));
            return Promise.resolve(
              (row
                ? {
                    id: row.id,
                    status: row.status,
                    sale_id: row.sale_id,
                    sale_payment_id: row.sale_payment_id,
                    amount_cents: row.amount_cents,
                  }
                : null) as T | null,
            );
          }
          return Promise.resolve(null);
        },
        all: <T>() => Promise.resolve(okResult([] as T[])),
        run: () => Promise.resolve(okResult()),
      };
      return bound;
    },
    batch: (stmts: readonly D1Bound[]) => {
      for (const stmt of stmts as unknown as Array<{ _sql: string; _params: unknown[] }>) {
        if (stmt._sql.includes('INSERT INTO payment_captures')) {
          const [id, tenantId, saleId, salePaymentId, acquirer, , amountCents, idemKey] =
            stmt._params as [string, string, string, string, string, unknown, number, string];
          const k = keyOf(tenantId, idemKey);
          if (rowsByKey.has(k)) {
            return Promise.reject(
              new Error(
                'UNIQUE constraint failed: payment_captures.tenant_id, payment_captures.idempotency_key',
              ),
            );
          }
          rowsByKey.set(k, {
            id,
            tenant_id: tenantId,
            sale_id: saleId,
            sale_payment_id: salePaymentId,
            acquirer,
            status: 'PENDING',
            amount_cents: amountCents,
            idempotency_key: idemKey,
          });
        }
      }
      return Promise.resolve(stmts.map(() => okResult()));
    },
  };
  return { db, rows: () => [...rowsByKey.values()] };
}

describe('payment flags', () => {
  it('default off', () => {
    expect(isQrWalletsEnabled({} as WorkerEnv)).toBe(false);
    expect(isCardAcquirerEnabled({ FEATURE_PAYMENTS_CARD_ACQUIRER: 'true' } as WorkerEnv)).toBe(
      true,
    );
  });
});

describe('runPaymentChargeHttp', () => {
  it('feature off', async () => {
    const res = await runPaymentChargeHttp(
      { FEATURE_PAYMENTS_QR_WALLETS: '0', DB: mockEnv().DB } as WorkerEnv,
      't1',
      {
        saleId: 's1',
        salePaymentId: 'sp1',
        paymentMethodId: 'pm1',
        amountCents: 100,
        idempotencyKey: 'k1',
      },
    );
    expect(res.status).toBe(404);
  });

  it('charge ok', async () => {
    const res = await runPaymentChargeHttp(mockEnv(), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CAPTURED');
  });

  it('US-08: replay idempotente por UNIQUE → 200 con status replayed y eco de idempotencyKey', async () => {
    vi.mocked(createPendingCaptureAtomic).mockResolvedValueOnce({
      id: 'cap1',
      status: 'PENDING',
      idempotent: true,
    });
    const res = await runPaymentChargeHttp(mockEnv(), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ captureId: 'cap1', status: 'replayed', idempotencyKey: 'k1' });
  });

  it('US-02: carrera N=8 con la misma idempotency_key → COUNT(*)=1 sobre filas reales y todas las respuestas 2xx con el MISMO id', async () => {
    // El mock de módulo solo cubre el contrato estático de la ruta; para
    // evidencia runtime del invariante de la UNIQUE delegamos el create al
    // adapter REAL (vi.importActual) contra un fake D1 que materializa filas
    // con el constraint de producción (concurrentCaptureDb).
    const real = await vi.importActual<typeof import('@kipuspay/adapters-d1')>(
      '@kipuspay/adapters-d1',
    );
    const { db, rows } = concurrentCaptureDb();
    const env = mockEnv({ DB: db as unknown as D1Database });
    const prevCreate = vi.mocked(createPendingCaptureAtomic).getMockImplementation();
    const prevSettle = vi.mocked(settleCaptureAtomic).getMockImplementation();
    vi.mocked(createPendingCaptureAtomic).mockImplementation((_db, tenantId, input) =>
      real.createPendingCaptureAtomic(db, tenantId, input),
    );
    vi.mocked(settleCaptureAtomic).mockImplementation((_db, _tenantId, input) =>
      Promise.resolve({ id: input.captureId, status: 'CAPTURED' }),
    );
    try {
      const body = {
        saleId: 's1',
        salePaymentId: 'sp1',
        paymentMethodId: 'pm1',
        amountCents: 1000, // INTEGER cents (V-21): sin float en el monto.
        idempotencyKey: 'race-8',
      };
      const results = await Promise.all(
        Array.from({ length: 8 }, () => runPaymentChargeHttp(env, 't1', body)),
      );
      // Todas las respuestas 2xx: exactamente una ganadora (201) y siete
      // replays idempotentes (200).
      for (const res of results) {
        expect(res.status === 200 || res.status === 201).toBe(true);
      }
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 200)).toHaveLength(7);
      // El MISMO id en las 8: la UNIQUE devolvió la fila ganadora a todos.
      const captureIds = new Set(results.map((r) => r.body.captureId as string));
      expect(captureIds.size).toBe(1);
      const winnerId = results[0]!.body.captureId as string;
      expect(winnerId).toBeTruthy();
      // COUNT(*) == 1 sobre las filas reales del fake D1 (el invariante exacto
      // de US-02: exactly-1-fila por idempotency_key).
      const db = env.DB;
      if (!db) throw new Error('mock DB missing');
      const counted = await db.prepare(
        `SELECT COUNT(*) AS n FROM payment_captures WHERE tenant_id = ? AND idempotency_key = ?`,
      )
        .bind('t1', 'race-8')
        .first<{ n: number }>();
      expect(counted?.n).toBe(1);
      const realRows = rows();
      expect(realRows).toHaveLength(1);
      expect(realRows[0]!.id).toBe(winnerId);
      expect(realRows[0]!.amount_cents).toBe(1000);
    } finally {
      if (prevCreate) vi.mocked(createPendingCaptureAtomic).mockImplementation(prevCreate);
      if (prevSettle) vi.mocked(settleCaptureAtomic).mockImplementation(prevSettle);
    }
  });

  it('US-02 fail-closed: re-SELECT del ganador con la DB caída → 503 DB_UNAVAILABLE estable, nunca 422 con SQL interno', async () => {
    // El adapter REAL (worktree) lanza DB_UNAVAILABLE cuando el UNIQUE del
    // batch chocó y el re-SELECT del ganador falla; la ruta debe responder
    // fail-closed 503 con código estable, jamás un 422 con el SQL interno.
    vi.mocked(createPendingCaptureAtomic).mockRejectedValueOnce(new Error('DB_UNAVAILABLE'));
    const res = await runPaymentChargeHttp(mockEnv(), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DB_UNAVAILABLE');
    expect(res.body.error).toBe('Database unavailable');
    // Ningún request devuelve SQL interno (UNIQUE/constraint) en el cuerpo.
    expect(JSON.stringify(res.body)).not.toMatch(/UNIQUE|constraint/i);
  });
});

describe('runOwnerUncapturedPaymentsHttp', () => {
  it('lista MANUAL', async () => {
    const res = await runOwnerUncapturedPaymentsHttp(mockEnv(), 't1');
    expect(res.status).toBe(200);
    expect((res.body.uncaptured as unknown[]).length).toBe(1);
  });
});

describe('runPaymentWebhookHttp', () => {
  it('M3: sin secret configurado → 503 fail-closed (sin fallback sandbox-secret)', async () => {
    const env = mockEnv() as WorkerEnv & { YAPE_WEBHOOK_SECRET?: string };
    delete env.YAPE_WEBHOOK_SECRET;
    const res = await runPaymentWebhookHttp(
      env,
      'yape',
      '{}',
      'sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('WEBHOOK_SECRET_NOT_CONFIGURED');
  });

  it('M3: secret vacío → 503 fail-closed', async () => {
    const env = mockEnv({ YAPE_WEBHOOK_SECRET: '' });
    const res = await runPaymentWebhookHttp(
      env,
      'yape',
      '{}',
      'sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(503);
  });

  it('M5: settle busca por acquirer (WHERE acquirer = ?)', async () => {
    verifyWebhook.mockResolvedValueOnce({
      ok: true,
      chargeId: 'cap1',
      status: 'CAPTURED',
      reference: 'ref1',
    });
    const res = await runPaymentWebhookHttp(
      mockEnv(),
      'yape',
      '{"chargeId":"cap1","status":"CAPTURED"}',
      'sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(200);
    expect(verifyWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ acquirer: 'yape', secret: 'sandbox-test-secret' }),
    );
  });

  it('firma inválida → 401', async () => {
    verifyWebhook.mockResolvedValueOnce({
      ok: false,
      chargeId: null,
      status: null,
      reference: null,
    });
    const res = await runPaymentWebhookHttp(
      mockEnv(),
      'yape',
      '{}',
      'bad-sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(401);
  });

  it('acquirer desconocido → 404', async () => {
    const res = await runPaymentWebhookHttp(
      mockEnv(),
      'axxe',
      '{}',
      'sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(404);
  });

  it('B2: webhook antes del capture (POS aún no creó el PENDING) → 202 retryable, sin dedup', async () => {
    const env = mockEnv();
    const db = env.DB as unknown as { prepare(sql: string): { bind(): unknown } };
    const original = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const stmt = original(sql) as { bind(): unknown; first<T>(): Promise<T | null> };
      if (sql.includes('FROM payment_captures')) {
        const custom = {
          ...stmt,
          first: <T>() => Promise.resolve(null as T | null),
        };
        custom.bind = () => custom;
        return custom;
      }
      return stmt;
    };
    verifyWebhook.mockResolvedValueOnce({
      ok: true,
      chargeId: 'cap-no-existe',
      status: 'CAPTURED',
      reference: 'ref-no-existe',
    });
    const res = await runPaymentWebhookHttp(
      env,
      'yape',
      '{"chargeId":"cap-no-existe","status":"CAPTURED"}',
      'sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(202);
    expect(res.body.code).toBe('CAPTURE_NOT_MATERIALIZED');
    // Sin settle y sin marcar dedup: el proveedor debe poder reintentar.
    expect(settleCaptureAtomic).toHaveBeenCalledTimes(0);
  });

  it('B2: falla de la DB de dedup → 503 retryable, nunca 200 ok sin efecto', async () => {
    const env = mockEnv();
    const db = env.DB as unknown as { prepare(sql: string): { bind(): unknown } };
    const original = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const stmt = original(sql) as { bind(): unknown; run(): Promise<unknown> };
      if (sql.includes('INSERT INTO webhook_events')) {
        const custom = { ...stmt, run: () => Promise.reject(new Error('DB_DOWN')) };
        custom.bind = () => custom;
        return custom;
      }
      return stmt;
    };
    verifyWebhook.mockResolvedValueOnce({
      ok: true,
      chargeId: 'cap1',
      status: 'CAPTURED',
      reference: 'ref1',
    });
    const res = await runPaymentWebhookHttp(
      env,
      'yape',
      '{"chargeId":"cap1","status":"CAPTURED"}',
      'sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('WEBHOOK_DEDUP_FAILED');
  });
});
