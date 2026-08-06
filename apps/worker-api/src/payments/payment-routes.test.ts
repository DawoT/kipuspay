import { describe, expect, it, vi } from 'vitest';
import {
  isCardAcquirerEnabled,
  isQrWalletsEnabled,
  runOwnerUncapturedPaymentsHttp,
  runPaymentChargeHttp,
  runPaymentWebhookHttp,
} from './payment-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  createPendingCaptureAtomic: vi.fn(() =>
    Promise.resolve({ id: 'cap1', status: 'PENDING', idempotent: false }),
  ),
  settleCaptureAtomic: vi.fn(() => Promise.resolve({ id: 'cap1', status: 'CAPTURED' })),
}));

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
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CAPTURED');
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
});
