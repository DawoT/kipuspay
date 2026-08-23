import { describe, expect, it, vi } from 'vitest';
import {
  isLoyaltyPointsEnabled,
  isMessagingWhatsAppEnabled,
  notifyOwnerLoyaltyExpired,
  runExpireLoyaltyCronHttp,
  runLoyaltyBalanceHttp,
  runLoyaltyReserveHttp,
  runMessagingOptInHttp,
  trySendWhatsAppReceipt,
} from './loyalty-messaging-routes.js';
import type { WorkerEnv } from '../auth/control-plane.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  reserveLoyaltyPointsAtomic: vi.fn((_db: unknown, _t: string, input: { points: number }) => {
    if (input.points === 99) return Promise.reject(new Error('LOYALTY_INSUFFICIENT_POINTS'));
    return Promise.resolve({
      id: 'r1',
      status: 'RESERVED',
      points: input.points,
      idempotent: input.points === 7,
    });
  }),
  expireLoyaltyReservationsAtomic: vi.fn(() => Promise.resolve({ expired: 2, ids: ['a', 'b'] })),
}));

vi.mock('@kipuspay/adapters-messaging', () => ({
  createWhatsAppMessagingSender: () => ({
    sendReceipt: vi.fn(() =>
      Promise.resolve({
        accepted: true,
        providerRef: 'sandbox:s1',
        templateId: 'kipus_nv_receipt_v1',
      }),
    ),
  }),
}));

vi.mock('../owner/push-routes.js', () => ({
  runSendOwnerPushHttp: vi.fn(() => Promise.resolve({ status: 200, body: { ok: true } })),
}));

function envWith(
  flags: Partial<WorkerEnv> & { plan_id?: string; opted?: number; hasExistingOpt?: boolean },
): WorkerEnv {
  const planId = flags.plan_id ?? 'cadena';
  return {
    TENANT_KV: { get: () => Promise.resolve(null) },
    TENANT_STATE_DO: {
      idFromName: (n: string) => ({ toString: () => n }),
      get: () => ({ fetch: () => Promise.resolve(new Response('ok')) }),
    },
    FEATURE_LOYALTY_POINTS: flags.FEATURE_LOYALTY_POINTS,
    FEATURE_MESSAGING_WHATSAPP: flags.FEATURE_MESSAGING_WHATSAPP,
    FEATURE_OWNER_PUSH: '1',
    DB: {
      prepare(sql: string) {
        const stmt = {
          bind() {
            return stmt;
          },
          first: () => {
            if (sql.includes('FROM tenants')) return Promise.resolve({ plan_id: planId });
            if (sql.includes('FROM messaging_opt_ins') && sql.includes('SELECT id')) {
              return Promise.resolve(flags.hasExistingOpt ? { id: 'mo1' } : null);
            }
            if (sql.includes('FROM messaging_opt_ins')) {
              return Promise.resolve(
                flags.opted === undefined ? null : { opted_in: flags.opted, id: 'mo1' },
              );
            }
            if (sql.includes('FROM loyalty_accounts')) {
              return Promise.resolve({ points_balance: 42 });
            }
            return Promise.resolve(null);
          },
          run: () => Promise.resolve({ success: true, results: [], meta: {} }),
          all: () => Promise.resolve({ success: true, results: [], meta: {} }),
        };
        return stmt;
      },
      batch: () => Promise.resolve([]),
    } as unknown as D1Database,
  } as WorkerEnv;
}

describe('loyalty-messaging flags', () => {
  it('default off', () => {
    expect(isLoyaltyPointsEnabled(undefined)).toBe(false);
    expect(isMessagingWhatsAppEnabled(undefined)).toBe(false);
    expect(isLoyaltyPointsEnabled({ FEATURE_LOYALTY_POINTS: '1' } as WorkerEnv)).toBe(true);
    expect(isMessagingWhatsAppEnabled({ FEATURE_MESSAGING_WHATSAPP: 'true' } as WorkerEnv)).toBe(
      true,
    );
  });
});

describe('loyalty HTTP', () => {
  it('feature off → 404', async () => {
    const res = await runLoyaltyReserveHttp(envWith({}), 't1', {});
    expect(res.status).toBe(404);
  });

  it('DB unavailable', async () => {
    const res = await runLoyaltyReserveHttp(
      { FEATURE_LOYALTY_POINTS: '1' } as WorkerEnv,
      't1',
      {
        customerId: 'c1',
        saleIdempotencyKey: 's1',
        points: 5,
      },
      'admin',
    );
    expect(res.status).toBe(503);
  });

  it('bad body → 400', async () => {
    const res = await runLoyaltyReserveHttp(
      envWith({ FEATURE_LOYALTY_POINTS: '1' }),
      't1',
      {},
      'admin',
    );
    expect(res.status).toBe(400);
  });

  it('Arranque → 403 PLAN_REQUIRES_CADENA', async () => {
    const res = await runLoyaltyReserveHttp(
      envWith({ FEATURE_LOYALTY_POINTS: '1', plan_id: 'arranque' }),
      't1',
      { customerId: 'c1', saleIdempotencyKey: 's1', points: 5 },
      'admin',
    );
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('PLAN_REQUIRES_CADENA');
  });

  it('reserve Cadena → 201', async () => {
    const res = await runLoyaltyReserveHttp(
      envWith({ FEATURE_LOYALTY_POINTS: '1', plan_id: 'cadena' }),
      't1',
      { customerId: 'c1', saleIdempotencyKey: 's1', points: 10 },
      'admin',
    );
    expect(res.status).toBe(201);
  });

  it('reserve idempotent → 200', async () => {
    const res = await runLoyaltyReserveHttp(
      envWith({ FEATURE_LOYALTY_POINTS: '1' }),
      't1',
      {
        customerId: 'c1',
        saleIdempotencyKey: 's1',
        points: 7,
      },
      'admin',
    );
    expect(res.status).toBe(200);
  });

  it('reserve error → 422', async () => {
    const res = await runLoyaltyReserveHttp(
      envWith({ FEATURE_LOYALTY_POINTS: '1' }),
      't1',
      {
        customerId: 'c1',
        saleIdempotencyKey: 's1',
        points: 99,
      },
      'admin',
    );
    expect(res.status).toBe(422);
  });

  it('balance', async () => {
    const res = await runLoyaltyBalanceHttp(envWith({ FEATURE_LOYALTY_POINTS: '1' }), 't1', 'c1');
    expect(res.status).toBe(200);
    expect((res.body as { pointsBalance: number }).pointsBalance).toBe(42);
  });

  it('balance sin customerId', async () => {
    const res = await runLoyaltyBalanceHttp(envWith({ FEATURE_LOYALTY_POINTS: '1' }), 't1', '');
    expect(res.status).toBe(400);
  });

  it('expire cron', async () => {
    const res = await runExpireLoyaltyCronHttp(envWith({ FEATURE_LOYALTY_POINTS: '1' }));
    expect(res.status).toBe(200);
    expect((res.body as { expired: number }).expired).toBe(2);
  });
});

describe('messaging opt-in + send', () => {
  it('opt-in create', async () => {
    const res = await runMessagingOptInHttp(envWith({ FEATURE_MESSAGING_WHATSAPP: '1' }), 't1', {
      customerId: 'c1',
      optedIn: true,
    });
    expect(res.status).toBe(201);
  });

  it('opt-in update', async () => {
    const res = await runMessagingOptInHttp(
      envWith({ FEATURE_MESSAGING_WHATSAPP: '1', hasExistingOpt: true }),
      't1',
      { customerId: 'c1', optedIn: false },
    );
    expect(res.status).toBe(200);
  });

  it('0 WA sin opt-in', async () => {
    const res = await trySendWhatsAppReceipt(
      envWith({ FEATURE_MESSAGING_WHATSAPP: '1', opted: 0 }),
      {
        tenantId: 't1',
        customerId: 'c1',
        saleId: 's1',
        documentKind: 'NV',
        phoneE164: '+51999111222',
        representationUrl: 'https://app.example/s1',
      },
    );
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('OPT_IN_REQUIRED');
  });

  it('send con opt-in', async () => {
    const res = await trySendWhatsAppReceipt(
      envWith({ FEATURE_MESSAGING_WHATSAPP: '1', opted: 1 }),
      {
        tenantId: 't1',
        customerId: 'c1',
        saleId: 's1',
        documentKind: 'NV',
        phoneE164: '+51999111222',
        representationUrl: 'https://app.example/s1',
      },
    );
    expect(res.sent).toBe(true);
  });

  it('feature off send', async () => {
    const res = await trySendWhatsAppReceipt(envWith({}), {
      tenantId: 't1',
      customerId: 'c1',
      saleId: 's1',
      documentKind: 'NV',
      phoneE164: '+51999111222',
      representationUrl: 'https://app.example/s1',
    });
    expect(res.sent).toBe(false);
  });

  it('notify owner edge A', async () => {
    await notifyOwnerLoyaltyExpired(envWith({}), 't1', 'sale-1', 'res-1');
  });
});

describe('S24-H2 guard de rol en acreditación de puntos', () => {
  it('sin rol → 403 FORBIDDEN_ADMIN', async () => {
    const res = await runLoyaltyReserveHttp({ FEATURE_LOYALTY_POINTS: '1' } as WorkerEnv, 't1', {
      customerId: 'c1',
      saleIdempotencyKey: 'k1',
      points: 10,
    });
    expect(res.status).toBe(403);
  });

  it('rol cashier → 403 FORBIDDEN_ADMIN', async () => {
    const res = await runLoyaltyReserveHttp(
      { FEATURE_LOYALTY_POINTS: '1' } as WorkerEnv,
      't1',
      { customerId: 'c1', saleIdempotencyKey: 'k1', points: 10 },
      'cashier',
    );
    expect(res.status).toBe(403);
  });

  it('rol admin → pasa a validación (no 403)', async () => {
    const res = await runLoyaltyReserveHttp(
      { FEATURE_LOYALTY_POINTS: '1' } as WorkerEnv,
      't1',
      { customerId: 'c1', saleIdempotencyKey: 'k1', points: 10 },
      'admin',
    );
    expect(res.status).not.toBe(403);
  });
});
