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
import { runMobilePushDispatcher } from './push/mobile-push-dispatcher.js';
import { runForecastScheduled } from './analytics/forecast-scheduled.js';
import { runBriefingScheduled } from './analytics/briefing-scheduled.js';
import { runFiscalCronHttp } from './fiscal/fiscal-rc-routes.js';

export { TenantState } from './auth/tenant-state.js';
export { BranchKdsHub } from './orders/branch-kds-hub.js';
export { BackupWorkflow } from './backup/backup-workflow-entrypoint.js';

const DAILY_ROLLUP_CRON = '0 8 * * *';
const RECURRING_SALES_CRON = '*/5 * * * *';
const FORECAST_CRON = '30 8 * * *';
const BRIEFING_CRON = '30 3 * * *';
// F5b-1: plazos fiscales cada 6h (T-24h/T-6h/DEADLINE) y RC diario a las
// 08:00 Lima (13:00 UTC) del día previo. Gated por FEATURE_FISCAL_RC.
const FISCAL_DEADLINES_CRON = '0 */6 * * *';
const FISCAL_RC_CRON = '0 13 * * *';

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
    if (event.cron === FORECAST_CRON) {
      await runForecastScheduled(env, { scheduledTime: event.scheduledTime });
      return;
    }
    if (event.cron === BRIEFING_CRON) {
      const briefingKv = env.TENANT_KV
        ? {
            get: (key: string) => env.TENANT_KV.get(key),
            put: (key: string, value: string) =>
              env.TENANT_KV.put ? env.TENANT_KV.put(key, value) : Promise.resolve(),
            delete: (key: string) =>
              env.TENANT_KV.delete ? env.TENANT_KV.delete(key) : Promise.resolve(),
          }
        : null;
      await runBriefingScheduled(
        {
          ...(env.FEATURE_ANALYTICS_AGENTIC_INSIGHTS
            ? { FEATURE_ANALYTICS_AGENTIC_INSIGHTS: env.FEATURE_ANALYTICS_AGENTIC_INSIGHTS }
            : {}),
          ...(env.DB ? { DB: env.DB } : {}),
          ...(briefingKv ? { TENANT_KV: briefingKv } : {}),
        },
        { scheduledTime: event.scheduledTime },
      );
      return;
    }
    if (event.cron === RECURRING_SALES_CRON) {
      await runRecurringSalesScheduled(env, {
        scheduledTime: event.scheduledTime,
        cron: event.cron,
      });
      try {
        await runMobilePushDispatcher(env, { scheduledTime: event.scheduledTime });
      } catch {
        console.warn(
          JSON.stringify({
            event: 'mobile_push_dispatch_failed',
            reason: 'DISPATCH_UNAVAILABLE',
          }),
        );
      }
      return;
    }
    if (event.cron === FISCAL_DEADLINES_CRON) {
      // F5b-1: barrido de plazos — alertas T-24h/T-6h y DEADLINE_EXCEEDED.
      await runFiscalCronHttp(env, { action: 'deadlines', nowMs: event.scheduledTime });
      return;
    }
    if (event.cron === FISCAL_RC_CRON) {
      // F5b-1: RC diario — día Lima previo (08:00 Lima = 13:00 UTC).
      const limaPrev = new Date(event.scheduledTime - 5 * 3600 * 1000 - 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      await runFiscalCronHttp(env, {
        action: 'daily-summary-sweep',
        summaryDate: limaPrev,
        nowMs: event.scheduledTime,
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
