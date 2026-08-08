import { createAuthDepsFromEnv, type WorkerEnv } from './auth/control-plane.js';
import { createApp } from './index.js';
import { runDailyRollupsCronHttp } from './reports/report-routes.js';

export { TenantState } from './auth/tenant-state.js';
export { BranchKdsHub } from './orders/branch-kds-hub.js';
export { BackupWorkflow } from './backup/backup-workflow-entrypoint.js';

/**
 * Composition root Workers: bindings reales → deps de auth → Hono.
 * Cron rollups: 3:00 AM Lima (triggers) — no-op si FEATURE_REPORTING_ROLLUPS off.
 */
export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    return createApp(createAuthDepsFromEnv(env)).fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: WorkerEnv, _ctx: ExecutionContext): Promise<void> {
    await runDailyRollupsCronHttp(env, { scheduledTimeMs: event.scheduledTime });
  },
};
