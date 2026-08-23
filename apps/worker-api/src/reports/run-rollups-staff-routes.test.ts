import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { WorkerEnv } from '../auth/control-plane.js';

const runDailyRollupsCronHttp = vi.fn();

vi.mock('./report-routes.js', () => ({
  runDailyRollupsCronHttp: (...args: unknown[]) => runDailyRollupsCronHttp(...args),
}));

import { runStaffDailyRollupsHttp } from './run-rollups-staff-routes.js';

describe('runStaffDailyRollupsHttp', () => {
  beforeEach(() => {
    runDailyRollupsCronHttp.mockReset();
    runDailyRollupsCronHttp.mockResolvedValue({
      status: 200,
      body: { reportDate: '2026-08-21', shards: [], elapsedMs: 1 },
    });
  });

  it('fail-closed sin secret (503) y sin invocar el cron', async () => {
    const res = await runStaffDailyRollupsHttp({} as WorkerEnv, 'x');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'STAFF_UNAVAILABLE' });
    expect(runDailyRollupsCronHttp).not.toHaveBeenCalled();
  });

  it('token ausente → 401; token incorrecto → 401; cron no invocado', async () => {
    const env = { PLATFORM_STAFF_TOKEN: 'staff-secret' } as WorkerEnv;
    const missing = await runStaffDailyRollupsHttp(env, undefined);
    expect(missing.status).toBe(401);
    const wrong = await runStaffDailyRollupsHttp(env, 'nope');
    expect(wrong.status).toBe(401);
    expect(runDailyRollupsCronHttp).not.toHaveBeenCalled();
  });

  it('token válido → 200 y delega con scheduledTimeMs=now', async () => {
    const env = { PLATFORM_STAFF_TOKEN: 'staff-secret' } as WorkerEnv;
    const before = Date.now();
    const res = await runStaffDailyRollupsHttp(env, 'staff-secret');
    expect(res.status).toBe(200);
    expect(runDailyRollupsCronHttp).toHaveBeenCalledTimes(1);
    const [envArg, bodyArg] = runDailyRollupsCronHttp.mock.calls[0] as [
      WorkerEnv,
      { scheduledTimeMs?: number },
    ];
    expect(envArg).toBe(env);
    expect(bodyArg.scheduledTimeMs).toBeGreaterThanOrEqual(before);
    expect(bodyArg.scheduledTimeMs).toBeLessThanOrEqual(Date.now());
  });

  it('propaga el fallo del flag off (404 FEATURE_OFF)', async () => {
    runDailyRollupsCronHttp.mockResolvedValueOnce({
      status: 404,
      body: { error: 'FEATURE_REPORTING_ROLLUPS off', code: 'FEATURE_OFF' },
    });
    const env = { PLATFORM_STAFF_TOKEN: 'staff-secret' } as WorkerEnv;
    const res = await runStaffDailyRollupsHttp(env, 'staff-secret');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'FEATURE_OFF' });
  });
});
