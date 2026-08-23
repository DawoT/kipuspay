import type { WorkerEnv } from '../auth/control-plane.js';
import { runDailyRollupsCronHttp } from './report-routes.js';

function staffAuthorized(env: WorkerEnv, header: string | undefined): boolean {
  const expected = env.PLATFORM_STAFF_TOKEN?.trim() ?? '';
  const provided = (header ?? '').trim();
  if (!expected || !provided || expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export async function runStaffDailyRollupsHttp(
  env: WorkerEnv,
  staffToken: string | undefined,
): Promise<{ status: number; body: Record<string, unknown> | string }> {
  if (!env.PLATFORM_STAFF_TOKEN?.trim()) {
    return { status: 503, body: { error: 'Staff auth unavailable', code: 'STAFF_UNAVAILABLE' } };
  }
  if (!staffAuthorized(env, staffToken)) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  const result = await runDailyRollupsCronHttp(env, { scheduledTimeMs: Date.now() });
  return { status: result.status, body: result.body };
}
