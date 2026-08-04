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
              if (sql.includes('SELECT id, status')) {
                const eventId = String(args[0]);
                const row = rows.get(keyOf('stripe', eventId));
                return Promise.resolve(row ? ({ id: row.id, status: row.status } as T) : null);
              }
              return Promise.resolve(null);
            },
            run(): Promise<{ success: boolean }> {
              if (sql.includes('INSERT INTO webhook_events')) {
                const [id, tenantId, eventId] = args as [string, string, string];
                const k = keyOf('stripe', eventId);
                if (rows.has(k)) throw new Error('UNIQUE constraint failed');
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
                return Promise.resolve({ success: true });
              }
              if (sql.includes("status = 'PROCESSING'") && sql.includes('attempt_count')) {
                const id = String(args[0]);
                for (const row of rows.values()) {
                  if (row.id === id) {
                    row.status = 'PROCESSING';
                    row.attempt_count += 1;
                    row.last_error = null;
                  }
                }
                return Promise.resolve({ success: true });
              }
              if (sql.includes("status = 'PROCESSED'")) {
                const eventId = String(args[0]);
                const row = rows.get(keyOf('stripe', eventId));
                if (row) {
                  row.status = 'PROCESSED';
                  row.processed_at = new Date().toISOString();
                }
                return Promise.resolve({ success: true });
              }
              if (sql.includes("status = 'FAILED'")) {
                const [error, eventId] = args as [string, string];
                const row = rows.get(keyOf('stripe', eventId));
                if (row) {
                  row.status = 'FAILED';
                  row.last_error = error;
                }
                return Promise.resolve({ success: true });
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

function eventBody(type: string, tenantId: string, eventId: string): string {
  return JSON.stringify({
    id: eventId,
    type,
    data: { object: { metadata: { tenant_id: tenantId } } },
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
