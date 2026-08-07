import { describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isBillingUsageOverageEnabled, runMeterOverageCronHttp } from './meter-overage-routes.js';

vi.mock('@kipuspay/adapters-d1', () => ({
  runMeterOverageCron: vi.fn().mockResolvedValue({
    tenantsScanned: 1,
    reported: 1,
    skippedIdempotent: 0,
    unitsTotal: 3,
    errors: [],
  }),
}));

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

  it('flag off → 404; sin DB → 503; ok → 200', async () => {
    expect(await runMeterOverageCronHttp({} as WorkerEnv)).toMatchObject({ status: 404 });
    expect(
      await runMeterOverageCronHttp({ FEATURE_BILLING_USAGE_OVERAGE: '1' } as WorkerEnv),
    ).toMatchObject({ status: 503 });
    const ok = await runMeterOverageCronHttp({
      FEATURE_BILLING_USAGE_OVERAGE: '1',
      DB: {} as D1Database,
      STRIPE_SECRET_KEY: 'sk_test',
    } as WorkerEnv);
    expect(ok.status).toBe(200);
    expect(ok.body.reported).toBe(1);
  });
});
