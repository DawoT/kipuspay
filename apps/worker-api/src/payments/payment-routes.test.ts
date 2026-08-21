import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingCaptureAtomic, settleCaptureAtomic } from '@kipuspay/adapters-d1';
import type { D1Bound, D1DatabaseLike } from '@kipuspay/adapters-d1';
import type * as AdaptersD1 from '@kipuspay/adapters-d1';
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
  // La ruta invoca isIdempotencyMismatch/isDbUnavailable en su catch (US-02/US-05);
  // el mock estático no los exportaba. Solo esos guards son código real, el
  // resto queda mockeado.
  const actual = await importOriginal<typeof AdaptersD1>();
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
            const row = rowsByKey.get(
              keyOf(bound._params[0] as string, bound._params[1] as string),
            );
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

  it('US-05 (Acceptance 2) + US-10: fuera de rango → 400 AMOUNT_OUT_OF_RANGE, jamás INVALID_AMOUNT ni 422 (motivo discriminado por la ruta)', async () => {
    // El parser discriminó 'amount_out_of_range' (|cents| > MAX_SAFE_INTEGER,
    // money-input.ts:108); la ruta debe exponerlo como AMOUNT_OUT_OF_RANGE en
    // vez de colapsarlo a INVALID_AMOUNT. US-10 añade el negativo canónico
    // (el parser acepta -1 cents y la ruta lo colapsaba a INVALID_AMOUNT):
    // un monto negativo está FUERA del rango válido de un cobro → 400
    // AMOUNT_OUT_OF_RANGE. Validación ANTES de tocar D1.
    vi.mocked(createPendingCaptureAtomic).mockClear();
    for (const amountCents of [
      Number.MAX_SAFE_INTEGER + 1,
      '9007199254740993',
      '999999999999999999',
      -1,
      -5,
      '-0.01',
    ]) {
      const res = await runPaymentChargeHttp(mockEnv(), 't1', {
        saleId: 's1',
        salePaymentId: 'sp1',
        paymentMethodId: 'pm1',
        amountCents,
        idempotencyKey: 'k1',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'AMOUNT_OUT_OF_RANGE', code: 'AMOUNT_OUT_OF_RANGE' });
      expect(createPendingCaptureAtomic).not.toHaveBeenCalled();
    }
  });

  it('US-05 (Acceptance 2) + US-10: monto inválido no-in-rango → 400 INVALID_AMOUNT (nunca 422)', async () => {
    vi.mocked(createPendingCaptureAtomic).mockClear();
    // Matriz adversarial US-10: insumos no parseables (formato, no-ASCII,
    // inyección SQL, cero) — jamás coerción ni un 422.
    for (const amountCents of [0, '007', 'abc', NaN, '1e3', '١٢', '1; DROP TABLE payments--']) {
      const res = await runPaymentChargeHttp(mockEnv(), 't1', {
        saleId: 's1',
        salePaymentId: 'sp1',
        paymentMethodId: 'pm1',
        amountCents,
        idempotencyKey: 'k1',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'INVALID_AMOUNT', code: 'INVALID_AMOUNT' });
      expect(createPendingCaptureAtomic).not.toHaveBeenCalled();
    }
  });

  it('US-10 contrato: la matriz adversarial de montos responde SIEMPRE 400 (nunca 422) con code estable por clase', async () => {
    // Test de contrato que recorre la matriz exacta de US-10 verificando el
    // status del acceptance (400 para INVALID_AMOUNT/AMOUNT_OUT_OF_RANGE) y
    // que NINGÚN caso colapsa a 422 ni toca D1 (cero coerción: rechazo puro).
    vi.mocked(createPendingCaptureAtomic).mockClear();
    const adversarial: Array<[number | string, string]> = [
      // INVALID_AMOUNT: insumos no parseables — unicode, SQLi, formato.
      ['1; DROP TABLE payments--', 'INVALID_AMOUNT'],
      ['١٢', 'INVALID_AMOUNT'],
      ['1２3', 'INVALID_AMOUNT'],
      ['007', 'INVALID_AMOUNT'],
      ['abc', 'INVALID_AMOUNT'],
      ['1e3', 'INVALID_AMOUNT'],
      [NaN, 'INVALID_AMOUNT'],
      [0, 'INVALID_AMOUNT'],
      // AMOUNT_OUT_OF_RANGE: |cents| > MAX_SAFE_INTEGER o negativo canónico.
      [-1, 'AMOUNT_OUT_OF_RANGE'],
      [-5, 'AMOUNT_OUT_OF_RANGE'],
      [Number.MAX_SAFE_INTEGER + 1, 'AMOUNT_OUT_OF_RANGE'],
      ['9007199254740993', 'AMOUNT_OUT_OF_RANGE'],
      ['999999999999999999', 'AMOUNT_OUT_OF_RANGE'],
    ];
    for (const [amountCents, code] of adversarial) {
      const res = await runPaymentChargeHttp(mockEnv(), 't1', {
        saleId: 's1',
        salePaymentId: 'sp1',
        paymentMethodId: 'pm1',
        amountCents,
        idempotencyKey: 'k1',
      });
      // Acceptance US-05/US-10: 400 para ambas clases — nunca 422.
      expect(res.status).toBe(400);
      expect(res.status).not.toBe(422);
      expect(res.body.code).toBe(code);
      expect(createPendingCaptureAtomic).not.toHaveBeenCalled();
    }
  });

  it('US-02/A2: replay idempotente → 200 con body IDÉNTICO al del ganador: mismo payment_id + reasonCode IDEMPOTENCY_REPLAY (nunca el shape degradado "replayed")', async () => {
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
    // A2: el perdedor recibe el mismo body que el ganador — mismo payment_id,
    // status REAL del capture (no 'replayed'), eco de captureId e idempotent,
    // más el reasonCode estable del contrato de idempotencia.
    expect(res.body).toEqual({
      payment_id: 'cap1',
      captureId: 'cap1',
      status: 'PENDING',
      idempotent: true,
      reasonCode: 'IDEMPOTENCY_REPLAY',
    });
  });

  it('US-02: replay de un capture ya CAPTURED → 200 con el status REAL (A3), no PENDING hardcodeado', async () => {
    vi.mocked(createPendingCaptureAtomic).mockResolvedValueOnce({
      id: 'cap1',
      status: 'CAPTURED',
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
    expect(res.body).toEqual({
      payment_id: 'cap1',
      captureId: 'cap1',
      status: 'CAPTURED',
      idempotent: true,
      reasonCode: 'IDEMPOTENCY_REPLAY',
    });
  });

  it('US-02: carrera N=8 con la misma idempotency_key → COUNT(*)=1 sobre filas reales y todas las respuestas 2xx con el MISMO id', async () => {
    // El mock de módulo solo cubre el contrato estático de la ruta; para
    // evidencia runtime del invariante de la UNIQUE delegamos el create al
    // adapter REAL (vi.importActual) contra un fake D1 que materializa filas
    // con el constraint de producción (concurrentCaptureDb).
    const real =
      await vi.importActual<typeof import('@kipuspay/adapters-d1')>('@kipuspay/adapters-d1');
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
      const counted = await db
        .prepare(
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

  it('US-05: CHECK constraint del db.batch (atomic_guards ok=0) → 500 DB_CONSTRAINT_VIOLATION, jamás 422 con SQL crudo', async () => {
    vi.mocked(createPendingCaptureAtomic).mockRejectedValueOnce(
      new Error('CHECK constraint failed: atomic_guards'),
    );
    const res = await runPaymentChargeHttp(mockEnv(), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('DB_CONSTRAINT_VIOLATION');
    expect(res.body.error).toBe('DB_CONSTRAINT_VIOLATION');
    // El motivo es estable: el SQL crudo de D1 jamás viaja como code ni error.
    expect(JSON.stringify(res.body)).not.toContain('atomic_guards');
  });

  it('US-05: UNIQUE no-idempotencia del db.batch → 500, sin db.exec ni compensating write', async () => {
    const env = mockEnv();
    const execSpy = vi.fn(() => Promise.resolve({ count: 0, duration: 0 }));
    (env.DB as unknown as { exec: typeof execSpy }).exec = execSpy;
    vi.mocked(createPendingCaptureAtomic).mockRejectedValueOnce(
      new Error(
        'UNIQUE constraint failed: payment_captures.tenant_id, payment_captures.idempotency_key',
      ),
    );
    const res = await runPaymentChargeHttp(env, 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('DB_CONSTRAINT_VIOLATION');
    // Acceptance 3: el batch ya revirtió — ni db.exec ni una escritura
    // compensatoria adicional (settle es la única otra escritura del flujo).
    expect(execSpy).not.toHaveBeenCalled();
    expect(settleCaptureAtomic).not.toHaveBeenCalled();
  });

  it('US-05: IDEMPOTENCY_MISMATCH conserva precedencia → 409 (no 500 constraint)', async () => {
    vi.mocked(createPendingCaptureAtomic).mockRejectedValueOnce(new Error('IDEMPOTENCY_MISMATCH'));
    const res = await runPaymentChargeHttp(mockEnv(), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('idempotency_mismatch');
  });

  it('US-04 (Acceptance 4): error D1 inesperado de quota con SQL embebido → 500 INTERNAL_ERROR estable, jamás 422 con el mensaje crudo', async () => {
    vi.mocked(createPendingCaptureAtomic).mockRejectedValueOnce(
      new Error(
        'D1_ERROR: D1 has exceeded its storage quota (7503). Try removing some data or ' +
          'decreasing your TTL. (SQL: INSERT INTO payment_captures ...)',
      ),
    );
    const res = await runPaymentChargeHttp(mockEnv(), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' });
    // Acceptance 4: ningún fragmento del error crudo (D1/quota/SQL) llega al cliente.
    expect(JSON.stringify(res.body)).not.toMatch(/quota|D1_ERROR|INSERT|SQL/i);
  });

  it('US-04 (Acceptance 4): serialización D1 en settle (SQLITE_BUSY) → 500 INTERNAL_ERROR, sin SQL crudo', async () => {
    vi.mocked(createPendingCaptureAtomic).mockResolvedValueOnce({
      id: 'cap1',
      status: 'PENDING',
      idempotent: false,
    });
    vi.mocked(settleCaptureAtomic).mockRejectedValueOnce(
      new Error(
        'D1_ERROR: ERROR 7503: SQLITE_ERROR: SQLITE_BUSY: database is locked (SQL: UPDATE payment_captures ...)',
      ),
    );
    const res = await runPaymentChargeHttp(mockEnv(), 't1', {
      saleId: 's1',
      salePaymentId: 'sp1',
      paymentMethodId: 'pm1',
      amountCents: 1000,
      idempotencyKey: 'k1',
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(res.body)).not.toMatch(/SQLITE|BUSY|UPDATE|locked/i);
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

  it('US-04 (Acceptance 4): webhook — settle con error D1 inesperado (SQL crudo) → 500 INTERNAL_ERROR, jamás 422 con el mensaje', async () => {
    verifyWebhook.mockResolvedValueOnce({
      ok: true,
      chargeId: 'cap1',
      status: 'CAPTURED',
      reference: 'ref1',
    });
    vi.mocked(settleCaptureAtomic).mockRejectedValueOnce(
      new Error('D1_ERROR: SQLITE_ERROR: database is locked (SQL: UPDATE payment_captures ...)'),
    );
    const res = await runPaymentWebhookHttp(
      mockEnv(),
      'yape',
      '{"chargeId":"cap1","status":"CAPTURED"}',
      'sig',
      Math.floor(Date.now() / 1000),
    );
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(res.body)).not.toMatch(/SQLITE|locked|UPDATE/i);
  });
});
