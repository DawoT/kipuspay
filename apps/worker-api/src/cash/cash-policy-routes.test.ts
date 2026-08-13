import { describe, expect, it } from 'vitest';
import {
  runGetCashPolicyHttp,
  runPatchCashPolicyHttp,
  type CashPolicyEnv,
} from './cash-policy-routes.js';

function mockDb(overrides: Partial<Record<string, unknown>> = {}): unknown {
  const first = (sql: string) => {
    if (sql.includes('FROM tenant_discount_policies'))
      return overrides.policy ?? { tip_max_percent: 25, open_drawer_on_cash: 1 };
    return null;
  };
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            first: () => Promise.resolve(first(sql)),
            run: () => Promise.resolve({ meta: { changes: 1 } }),
          };
        },
      };
    },
  };
}

function envWith(overrides: Partial<CashPolicyEnv> = {}): CashPolicyEnv {
  return { FEATURE_SALE_TIP: '1', FEATURE_CASH_DRAWER: '1', DB: mockDb(), ...overrides };
}

const owner = { tenantId: 't1', userId: 'u1', role: 'owner' };
const cashier = { tenantId: 't1', userId: 'u2', role: 'cashier' };

describe('cash policy routes (P2)', () => {
  it('flag off → 404', async () => {
    const env = envWith({ FEATURE_SALE_TIP: '0', FEATURE_CASH_DRAWER: '0' });
    expect((await runGetCashPolicyHttp(env, owner)).status).toBe(404);
    expect((await runPatchCashPolicyHttp(env, owner, {})).status).toBe(404);
  });

  it('GET: devuelve política con defaults', async () => {
    const res = await runGetCashPolicyHttp(envWith(), owner);
    expect(res.status).toBe(200);
    expect(res.body.tipMaxPercent).toBe(25);
    expect(res.body.openDrawerOnCash).toBe(true);
  });

  it('PATCH: solo owner/admin (403)', async () => {
    const res = await runPatchCashPolicyHttp(envWith(), cashier, { tipMaxPercent: 20 });
    expect(res.status).toBe(403);
  });

  it('PATCH: valida rangos', async () => {
    expect((await runPatchCashPolicyHttp(envWith(), owner, { tipMaxPercent: 0 })).status).toBe(422);
    expect((await runPatchCashPolicyHttp(envWith(), owner, { tipMaxPercent: 101 })).status).toBe(
      422,
    );
    expect(
      (await runPatchCashPolicyHttp(envWith(), owner, { openDrawerOnCash: 'si' })).status,
    ).toBe(422);
    expect((await runPatchCashPolicyHttp(envWith(), owner, {})).status).toBe(422);
  });

  it('PATCH: actualiza y devuelve la política', async () => {
    const res = await runPatchCashPolicyHttp(envWith(), owner, {
      tipMaxPercent: 20,
      openDrawerOnCash: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.tipMaxPercent).toBe(25);
    expect(res.body.openDrawerOnCash).toBe(true);
  });
});
