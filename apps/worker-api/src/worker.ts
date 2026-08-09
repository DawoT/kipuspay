import { WorkerEntrypoint } from 'cloudflare:workers';
import { createAuthDepsFromEnv, type WorkerEnv } from './auth/control-plane.js';
import { createApp } from './index.js';
import { runDailyRollupsCronHttp } from './reports/report-routes.js';
import {
  runRecurringManualRpc,
  runRecurringSalesScheduled,
  type RecurringManualRpcInput,
  type RecurringManualRpcResult,
} from './sales/recurring-sales-scheduled.js';

export { TenantState } from './auth/tenant-state.js';
export { BranchKdsHub } from './orders/branch-kds-hub.js';
export { BackupWorkflow } from './backup/backup-workflow-entrypoint.js';

const DAILY_ROLLUP_CRON = '0 8 * * *';
const RECURRING_SALES_CRON = '*/5 * * * *';

/** Private service-binding entrypoint; intentionally has no fetch method. */
export class RecurringManualControl extends WorkerEntrypoint<WorkerEnv> {
  run(input: RecurringManualRpcInput): Promise<RecurringManualRpcResult> {
    return runRecurringManualRpc(this.env, input);
  }
}

/**
 * Composition root Workers: bindings reales → deps de auth → Hono.
 * Scheduled events are dispatched only by their configured cron expression.
 */
export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Response | Promise<Response> {
    return createApp(createAuthDepsFromEnv(env)).fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: WorkerEnv, _ctx: ExecutionContext): Promise<void> {
    if (event.cron === DAILY_ROLLUP_CRON) {
      await runDailyRollupsCronHttp(env, { scheduledTimeMs: event.scheduledTime });
      return;
    }
    if (event.cron === RECURRING_SALES_CRON) {
      await runRecurringSalesScheduled(env, {
        scheduledTime: event.scheduledTime,
        cron: event.cron,
      });
      return;
    }
    console.warn(
      JSON.stringify({
        event: 'worker_scheduled_unknown_cron',
        cron: event.cron,
        scheduledTime: event.scheduledTime,
      }),
    );
  },
};
