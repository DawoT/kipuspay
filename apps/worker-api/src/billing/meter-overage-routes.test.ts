import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import type { D1Database } from '@cloudflare/workers-types';
import { isBillingUsageOverageEnabled, runMeterOverageCronHttp } from './meter-overage-routes.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  appendAuditEvent: vi.fn(async () => undefined),
  readAuditChainHead: vi.fn(async () => null),
  auditChainClaimStatements: vi.fn(() => []),
  runMeterOverageCron: vi.fn().mockResolvedValue({
    tenantsScanned: 1,
    reported: 1,
    skippedIdempotent: 0,
    unitsTotal: 3,
    errors: [],
  }),
}));

function capabilityDb(): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        all: async () => ({ results: [{ tenant_id: 't1' }] }),
        first: async () =>
          sql.includes('tenant_capabilities') ? { enabled: 1, config_json: '{}', epoch: 0 } : null,
      }),
    }),
  } as unknown as D1Database;
}

describe('meter-overage routes', () => {
  it('flag default off', () => {
    expect(isBillingUsageOverageEnabled({} as WorkerEnv)).toBe(false);
    expect(isBillingUsageOverageEnabled({ FEATURE_BILLING_USAGE_OVERAGE: '0' } as WorkerEnv)).toBe(
      false,
    );
    expect(isBillingUsageOverageEnabled({ FEATURE_BILLING_USAGE_OVERAGE: '1' } as WorkerEnv)).toBe(
      true,
    );
  });

  it('sin rol → 403; sin DB → 503; ok → 200', async () => {
    expect(await runMeterOverageCronHttp({} as WorkerEnv)).toMatchObject({ status: 403 });
    expect(
      await runMeterOverageCronHttp(
        { FEATURE_BILLING_USAGE_OVERAGE: '1' } as WorkerEnv,
        undefined,
        'owner',
      ),
    ).toMatchObject({ status: 503 });
    const ok = await runMeterOverageCronHttp(
      {
        FEATURE_BILLING_USAGE_OVERAGE: '1',
        DB: capabilityDb(),
        STRIPE_SECRET_KEY: 'sk_test',
      } as WorkerEnv,
      undefined,
      'owner',
    );
    expect(ok.status).toBe(200);
    expect(ok.body.reported).toBe(1);
  });
});

describe('S27-H2 guard del cron de cobro', () => {
  it('sin rol → 403 FORBIDDEN_ADMIN (cobra dinero: no cualquier rol)', async () => {
    const res = await runMeterOverageCronHttp(
      { FEATURE_BILLING_USAGE_OVERAGE: '1', DB: capabilityDb() } as WorkerEnv,
      undefined,
      undefined,
    );
    expect(res.status).toBe(403);
  });

  it('rol cashier → 403 FORBIDDEN_ADMIN', async () => {
    const res = await runMeterOverageCronHttp(
      { FEATURE_BILLING_USAGE_OVERAGE: '1', DB: capabilityDb() } as WorkerEnv,
      undefined,
      'cashier',
    );
    expect(res.status).toBe(403);
  });

  it('rol owner → ejecuta (no 403)', async () => {
    const res = await runMeterOverageCronHttp(
      {
        FEATURE_BILLING_USAGE_OVERAGE: '1',
        DB: capabilityDb(),
        STRIPE_SECRET_KEY: 'sk_test',
      } as WorkerEnv,
      undefined,
      'owner',
    );
    expect(res.status).not.toBe(403);
  });
});
