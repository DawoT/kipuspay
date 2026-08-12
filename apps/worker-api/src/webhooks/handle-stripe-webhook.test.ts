import { afterEach, describe, expect, it } from 'vitest';
import {
  clearIsolateAuthCache,
  isTenantRevokedCached,
  type ControlPlaneEnv,
} from '../auth/control-plane.js';
import { handleStripeWebhook, type StripeWebhookEnv } from './handle-stripe-webhook.js';
import { signStripeWebhookForTests } from './verify-stripe-signature.js';

afterEach(() => {
  clearIsolateAuthCache();
});

interface Row {
  id: string;
  tenant_id: string;
  source: string;
  event_id: string;
  status: 'PROCESSING' | 'PROCESSED' | 'FAILED';
  attempt_count: number;
  last_error: string | null;
  processed_at: string | null;
}

interface TenantKvPayload {
  id: string;
  status: string;
  subscriptionStatus: string;
}

function createMemDb() {
  const rows = new Map<string, Row>();
  const keyOf = (source: string, eventId: string) => `${source}:${eventId}`;

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            first<T>(): Promise<T | null> {
              if (sql.includes('SELECT status')) {
                const eventId = String(args[0]);
                const row = rows.get(keyOf('stripe', eventId));
                return Promise.resolve(row ? ({ status: row.status } as T) : null);
              }
              return Promise.resolve(null);
            },
            run(): Promise<{ success: boolean; meta: { changes: number } }> {
              if (sql.includes('INSERT INTO webhook_events')) {
                const [id, tenantId, eventId] = args as [string, string, string];
                const k = keyOf('stripe', eventId);
                if (rows.has(k)) {
                  if (sql.includes('ON CONFLICT')) {
                    return Promise.resolve({ success: true, meta: { changes: 0 } });
                  }
                  throw new Error('UNIQUE constraint failed');
                }
                rows.set(k, {
                  id,
                  tenant_id: tenantId,
                  source: 'stripe',
                  event_id: eventId,
                  status: 'PROCESSING',
                  attempt_count: 1,
                  last_error: null,
                  processed_at: null,
                });
                return Promise.resolve({ success: true, meta: { changes: 1 } });
              }
              if (sql.includes("status = 'PROCESSING'") && sql.includes('attempt_count')) {
                const eventId = String(args[0]);
                const row = rows.get(keyOf('stripe', eventId));
                if (row) {
                  row.status = 'PROCESSING';
                  row.attempt_count += 1;
                  row.last_error = null;
                }
                return Promise.resolve({ success: true, meta: { changes: 1 } });
              }
              if (sql.includes("status = 'PROCESSED'")) {
                const eventId = String(args[0]);
                const row = rows.get(keyOf('stripe', eventId));
                if (row) {
                  row.status = 'PROCESSED';
                  row.processed_at = new Date().toISOString();
                }
                return Promise.resolve({ success: true, meta: { changes: 1 } });
              }
              if (sql.includes("status = 'FAILED'")) {
                const [error, eventId] = args as [string, string];
                const row = rows.get(keyOf('stripe', eventId));
                if (row) {
                  row.status = 'FAILED';
                  row.last_error = error;
                }
                return Promise.resolve({ success: true, meta: { changes: 1 } });
              }
              throw new Error(`unsupported SQL: ${sql}`);
            },
          };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, rows };
}

function createEnv(opts: { secret?: string; doFail?: boolean; doRevoked?: boolean }): {
  env: StripeWebhookEnv;
  kv: Map<string, string>;
  doCalls: string[];
  mem: ReturnType<typeof createMemDb>;
} {
  const mem = createMemDb();
  const kv = new Map<string, string>();
  const doCalls: string[] = [];
  let doRevoked = opts.doRevoked === true;

  const env: StripeWebhookEnv = {
    WEBHOOK_EVENTS_DB: mem.db,
    STRIPE_WEBHOOK_SECRET: opts.secret ?? 'whsec_test_secret',
    FQDN: 'https://example.test',
    TENANT_KV: {
      get: (key) => Promise.resolve(kv.get(key) ?? null),
      put: (key, value) => {
        kv.set(key, value);
        return Promise.resolve();
      },
      delete: (key) => {
        kv.delete(key);
        return Promise.resolve();
      },
    },
    TENANT_STATE_DO: {
      idFromName: (name) => ({ toString: () => name }),
      get: () => ({
        fetch: (input) => {
          if (opts.doFail) return Promise.resolve(new Response('down', { status: 503 }));
          const url =
            typeof input === 'string'
              ? input
              : input instanceof Request
                ? input.url
                : String(input);
          const path = new URL(url).pathname;
          doCalls.push(path);
          if (path === '/revoke') doRevoked = true;
          if (path === '/unrevoke' || path === '/reinstate') doRevoked = false;
          if (path === '/status') return Promise.resolve(Response.json({ revoked: doRevoked }));
          return Promise.resolve(Response.json({ ok: true }));
        },
      }),
    },
  };

  return { env, kv, doCalls, mem };
}

function eventBody(type: string, tenantId: string, eventId: string, objectStatus?: string): string {
  const object: { metadata: { tenant_id: string }; status?: string } = {
    metadata: { tenant_id: tenantId },
  };
  if (objectStatus !== undefined) object.status = objectStatus;
  return JSON.stringify({
    id: eventId,
    type,
    data: { object },
  });
}

function readTenant(kv: Map<string, string>, tenantId: string): TenantKvPayload {
  return JSON.parse(kv.get(`tenant:${tenantId}`)!) as TenantKvPayload;
}

describe('handleStripeWebhook', () => {
  const secret = 'whsec_test_secret';
  const nowMs = 1_700_000_000_000;
  const ts = Math.floor(nowMs / 1000);

  it('firma inválida → 401', async () => {
    const { env } = createEnv({});
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_bad');
    const res = await handleStripeWebhook(env, body, 't=1,v1=00', nowMs);
    expect(res.status).toBe(401);
  });

  it('replay PROCESSED → 200 deduplicated', async () => {
    const { env, mem } = createEnv({});
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_dup');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const first = await handleStripeWebhook(env, body, sig, nowMs);
    expect(first).toEqual({ status: 200, body: { received: true } });
    expect(mem.rows.get('stripe:evt_dup')?.status).toBe('PROCESSED');

    const second = await handleStripeWebhook(env, body, sig, nowMs);
    expect(second).toEqual({ status: 200, body: { received: true, deduplicated: true } });
  });

  it('ataque replay con RE-FIRMA (mismo event_id, timestamp nuevo) → dedup sin doble efecto', async () => {
    const { env, kv, doCalls } = createEnv({});
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'active' }),
    );
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_refirm');
    // Entrega legítima con timestamp T
    const sigT = await signStripeWebhookForTests(body, secret, ts);
    const first = await handleStripeWebhook(env, body, sigT, nowMs);
    expect(first).toEqual({ status: 200, body: { received: true } });
    expect(doCalls).toEqual(['/revoke']);

    // Ataque: re-firma dentro de la ventana (mismo body, timestamp distinto).
    // La firma es criptográficamente válida, pero el event_id ya fue PROCESSED.
    const sigRe = await signStripeWebhookForTests(body, secret, ts - 120);
    const replay = await handleStripeWebhook(env, body, sigRe, nowMs);
    expect(replay).toEqual({ status: 200, body: { received: true, deduplicated: true } });
    expect(doCalls).toEqual(['/revoke']); // sin efecto duplicado
    expect(kv.get('revocation:t1')).toBe('1');
  });

  it('ataque replay FUERA de ventana (timestamp viejo re-firmado) → 401', async () => {
    const { env } = createEnv({});
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_old');
    const sigOld = await signStripeWebhookForTests(body, secret, ts - 360); // > 300 s
    const res = await handleStripeWebhook(env, body, sigOld, nowMs);
    expect(res.status).toBe(401);
  });

  it('redelivery mientras PROCESSING → re-claim sin 500', async () => {
    const { env, mem } = createEnv({});
    mem.rows.set('stripe:evt_inflight', {
      id: 'we-inflight',
      tenant_id: 't1',
      source: 'stripe',
      event_id: 'evt_inflight',
      status: 'PROCESSING',
      attempt_count: 1,
      last_error: null,
      processed_at: null,
    });
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_inflight');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);

    expect(res.status).toBe(200);
    expect(mem.rows.get('stripe:evt_inflight')?.attempt_count).toBe(2);
    expect(mem.rows.get('stripe:evt_inflight')?.status).toBe('PROCESSED');
  });

  it('evento no-suscripción usa la partición external', async () => {
    const { env, mem } = createEnv({});
    const body = JSON.stringify({
      id: 'evt_charge',
      type: 'charge.succeeded',
      data: { object: {} },
    });
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);

    expect(res.status).toBe(200);
    expect(mem.rows.get('stripe:evt_charge')?.tenant_id).toBe('external');
  });

  it('subscription.deleted → DO revoke + KV revocation; lookup revoked', async () => {
    const { env, kv, doCalls } = createEnv({});
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'active' }),
    );
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_del');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);
    expect(res.status).toBe(200);
    expect(doCalls).toContain('/revoke');
    expect(kv.get('revocation:t1')).toBe('1');
    expect(readTenant(kv, 't1').subscriptionStatus).toBe('canceled');

    const control: ControlPlaneEnv = {
      TENANT_KV: { get: (k) => Promise.resolve(kv.get(k) ?? null) },
      TENANT_STATE_DO: env.TENANT_STATE_DO,
    };
    await expect(isTenantRevokedCached(control, 't1')).resolves.toBe(true);
  });

  it('invoice.payment_failed → past_due sin revoke DO', async () => {
    const { env, kv, doCalls } = createEnv({});
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'active' }),
    );
    const body = eventBody('invoice.payment_failed', 't1', 'evt_fail');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);
    expect(res.status).toBe(200);
    expect(doCalls).toEqual([]);
    expect(kv.get('revocation:t1')).toBeUndefined();
    expect(readTenant(kv, 't1').subscriptionStatus).toBe('past_due');
  });

  it('invoice.paid → /unrevoke + borra revocation', async () => {
    const { env, kv, doCalls } = createEnv({ doRevoked: true });
    kv.set('revocation:t1', '1');
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'canceled' }),
    );
    const body = eventBody('invoice.paid', 't1', 'evt_paid');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);
    expect(res.status).toBe(200);
    expect(doCalls).toContain('/unrevoke');
    expect(kv.get('revocation:t1')).toBeUndefined();
    expect(readTenant(kv, 't1').subscriptionStatus).toBe('active');
  });

  it('subscription.updated active no des-revoca tenant cancelado', async () => {
    const { env, kv, doCalls } = createEnv({ doRevoked: true });
    kv.set('revocation:t1', '1');
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'canceled' }),
    );
    const body = eventBody('customer.subscription.updated', 't1', 'evt_updated_active', 'active');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);

    expect(res.status).toBe(200);
    expect(doCalls).toEqual([]);
    expect(kv.get('revocation:t1')).toBe('1');
    expect(readTenant(kv, 't1').subscriptionStatus).toBe('canceled');
  });

  it('subscription.updated active no promociona past_due', async () => {
    const { env, kv, doCalls } = createEnv({});
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'past_due' }),
    );
    const body = eventBody('customer.subscription.updated', 't1', 'evt_updated_past_due', 'active');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);

    expect(res.status).toBe(200);
    expect(doCalls).toEqual([]);
    expect(readTenant(kv, 't1').subscriptionStatus).toBe('past_due');
  });

  it('subscription.updated canceled → revoca fail-closed', async () => {
    const { env, kv, doCalls } = createEnv({});
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'active' }),
    );
    const body = eventBody(
      'customer.subscription.updated',
      't1',
      'evt_updated_canceled',
      'canceled',
    );
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);

    expect(res.status).toBe(200);
    expect(doCalls).toContain('/revoke');
    expect(kv.get('revocation:t1')).toBe('1');
    expect(readTenant(kv, 't1').subscriptionStatus).toBe('canceled');
  });

  it('fallo de efecto → FAILED + 503 WEBHOOK_RETRYABLE', async () => {
    const { env, mem } = createEnv({ doFail: true });
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_503');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const res = await handleStripeWebhook(env, body, sig, nowMs);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('WEBHOOK_RETRYABLE');
    expect(mem.rows.get('stripe:evt_503')?.status).toBe('FAILED');
  });

  it('latencia invalidación: webhook → isTenantRevokedCached true (E2E timed)', async () => {
    const { env, kv } = createEnv({});
    kv.set(
      'tenant:t1',
      JSON.stringify({ id: 't1', status: 'active', subscriptionStatus: 'active' }),
    );
    const body = eventBody('customer.subscription.deleted', 't1', 'evt_timing');
    const sig = await signStripeWebhookForTests(body, secret, ts);

    const t0 = performance.now();
    const res = await handleStripeWebhook(env, body, sig, nowMs);
    const control: ControlPlaneEnv = {
      TENANT_KV: { get: (k) => Promise.resolve(kv.get(k) ?? null) },
      TENANT_STATE_DO: env.TENANT_STATE_DO,
    };
    await expect(isTenantRevokedCached(control, 't1')).resolves.toBe(true);
    const elapsedMs = performance.now() - t0;

    expect(res.status).toBe(200);
    // Presupuesto unitario (mem KV/DO): p95 << 100 ms. Staging E2E documentado en runbook.
    expect(elapsedMs).toBeLessThan(100);
  });
});
