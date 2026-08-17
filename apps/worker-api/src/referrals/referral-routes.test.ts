import { describe, expect, it } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import {
  getReferralStore,
  runCaptureReferralHttp,
  runEnsureReferralCodeHttp,
  runFirstSaleReferralHttp,
} from './referral-routes.js';

const dummyEnv = {} as WorkerEnv;

describe('referral-routes HTTP handlers unit tests', () => {
  it('handles runEnsureReferralCodeHttp validation and generation', async () => {
    expect(await runEnsureReferralCodeHttp(dummyEnv, null)).toEqual({
      status: 400,
      body: { error: 'Invalid JSON', code: 'BAD_REQUEST' },
    });
    expect(await runEnsureReferralCodeHttp(dummyEnv, {})).toEqual({
      status: 422,
      body: { error: 'tenantId requerido', code: 'INVALID' },
    });
    const res = await runEnsureReferralCodeHttp(dummyEnv, { tenantId: 'tenant-test' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('code');
    expect(res.body).toHaveProperty('inviteUrl');
  });

  it('handles runCaptureReferralHttp validation and capture', async () => {
    expect(await runCaptureReferralHttp(dummyEnv, 'invalid')).toEqual({
      status: 400,
      body: { error: 'Invalid JSON', code: 'BAD_REQUEST' },
    });
    expect(await runCaptureReferralHttp(dummyEnv, { referredTenantId: 't1' })).toEqual({
      status: 422,
      body: { error: 'referredTenantId y ref requeridos', code: 'INVALID' },
    });

    const store = getReferralStore();
    store.codes.set('REF123', {
      tenantId: 'referrer-tenant',
      code: 'REF123',
    });

    const res = await runCaptureReferralHttp(dummyEnv, {
      referredTenantId: 'referred-tenant',
      ref: 'REF123',
    });
    expect(res.status).toBe(201);
  });

  it('handles runFirstSaleReferralHttp validation and credit', async () => {
    expect(await runFirstSaleReferralHttp(dummyEnv, null)).toEqual({
      status: 400,
      body: { error: 'Invalid JSON', code: 'BAD_REQUEST' },
    });
    expect(await runFirstSaleReferralHttp(dummyEnv, {})).toEqual({
      status: 422,
      body: { error: 'tenantId requerido', code: 'INVALID' },
    });
    const res = await runFirstSaleReferralHttp(dummyEnv, { tenantId: 'referred-tenant' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('credited');
  });

  it(
    'S11-B4: la primera venta del referido extiende el trial +30d a ambos',
    { timeout: 20_000 },
    async () => {
      const kv = new Map<string, string>();
      const nowIso = '2026-08-14T12:00:00.000Z';
      kv.set(
        'tenant:referred-tenant',
        JSON.stringify({ subscriptionStatus: 'trial', trialEndsAt: '2026-09-01T00:00:00.000Z' }),
      );
      kv.set(
        'tenant:referrer-tenant',
        JSON.stringify({ subscriptionStatus: 'trial', trialEndsAt: '2026-08-20T00:00:00.000Z' }),
      );
      const env = {
        DB: {
          prepare: (sql: string) => {
            const stmt = {
              bind: () => stmt,
              first: () => {
                if (sql.includes('FROM referral_attributions')) {
                  return Promise.resolve({
                    id: 'attr-1',
                    tenant_id: 'referred-tenant',
                    referrer_tenant_id: 'referrer-tenant',
                    referral_code: 'REF123',
                    status: 'pending',
                    credit_days: 30,
                  });
                }
                return Promise.resolve(null);
              },
              all: () => Promise.resolve({ results: [] }),
              run: () => Promise.resolve({ success: true }),
            };
            return stmt;
          },
          batch: () => Promise.resolve([{ meta: { changes: 1 } }]),
        },
        TENANT_KV: {
          get: (k: string) => Promise.resolve(kv.get(k) ?? null),
          put: (k: string, v: string) => {
            kv.set(k, v);
            return Promise.resolve();
          },
        },
      } as unknown as WorkerEnv;

      const res = await runFirstSaleReferralHttp(env, {
        tenantId: 'referred-tenant',
        nowIso,
      });
      expect(res.status).toBe(200);
      expect(res.body.credited).toBe(true);
      const referred = JSON.parse(kv.get('tenant:referred-tenant') ?? '{}') as {
        trialEndsAt: string;
      };
      const referrer = JSON.parse(kv.get('tenant:referrer-tenant') ?? '{}') as {
        trialEndsAt: string;
      };
      // Referido: +30d sobre su trial vigente (01-09 → 01-10).
      expect(referred.trialEndsAt).toBe('2026-10-01T00:00:00.000Z');
      // Referidor: +30d sobre el suyo (20-08 → 19-09).
      expect(referrer.trialEndsAt).toBe('2026-09-19T00:00:00.000Z');
      expect(res.body.trialEndsAt).toBe('2026-10-01T00:00:00.000Z');
    },
  );
});
