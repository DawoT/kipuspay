import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPendingCaptureAtomic, settleCaptureAtomic } from '@kipuspay/adapters-d1';
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
  // La ruta invoca isIdempotencyMismatch en su catch (US-02/US-05); el mock
  // estático no lo exportaba. Solo ese guard es código real, el resto queda
  // mockeado.
  const actual = await importOriginal<typeof AdaptersD1>();
  return {
    createPendingCaptureAtomic: vi.fn(() =>
      Promise.resolve({ id: 'cap1', status: 'PENDING', idempotent: false }),
    ),
    settleCaptureAtomic: vi.fn(() => Promise.resolve({ id: 'cap1', status: 'CAPTURED' })),
    isIdempotencyMismatch: actual.isIdempotencyMismatch,
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
