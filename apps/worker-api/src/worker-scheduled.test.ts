import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- Vitest/Vite raw imports are runtime-supported in this test.
import wranglerConfig from '../wrangler.jsonc?raw';

vi.mock('cloudflare:workers', () => {
  class Entrypoint {
    protected ctx: unknown;
    protected env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  }
  return {
    WorkerEntrypoint: Entrypoint,
    DurableObject: Entrypoint,
    WorkflowEntrypoint: Entrypoint,
  };
});

const { runDailyRollupsCronHttp, runRecurringSalesScheduled, runForecastScheduled } = vi.hoisted(
  () => ({
    runDailyRollupsCronHttp: vi.fn(),
    runRecurringSalesScheduled: vi.fn(),
    runForecastScheduled: vi.fn(),
  }),
);

vi.mock('./reports/report-routes.js', () => ({
  isAdvancedReportId: vi.fn(() => false),
  runDailyRollupsCronHttp,
  runReportHttp: vi.fn(),
  runReportsCatalogHttp: vi.fn(),
}));
vi.mock('./sales/recurring-sales-scheduled.js', () => ({
  runRecurringManualRpc: vi.fn(),
  runRecurringSalesScheduled,
}));
vi.mock('./analytics/forecast-scheduled.js', () => ({
  runForecastScheduled,
}));

import type { WorkerEnv } from './auth/control-plane.js';
import worker from './worker.js';

const DAILY_ROLLUP_CRON = '0 8 * * *';
const RECURRING_CRON = '*/5 * * * *';
const FORECAST_CRON = '30 8 * * *';
const scheduledTime = Date.parse('2026-08-09T08:00:00.000Z');

function event(cron: string): ScheduledEvent {
  return { cron, scheduledTime } as ScheduledEvent;
}

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FEATURE_REPORTING_ROLLUPS: '1',
    FEATURE_SALES_RECURRING: '1',
    ...overrides,
  } as WorkerEnv;
}

describe('Worker scheduled dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runDailyRollupsCronHttp.mockResolvedValue({ status: 200, body: { processed: true } });
    runRecurringSalesScheduled.mockResolvedValue({
      status: 'COMPLETE',
      processedPeriods: 0,
      failures: 0,
      catchUpCapped: false,
      tenants: 0,
    });
    runForecastScheduled.mockResolvedValue({
      status: 'COMPLETE',
      tenants: 0,
      candidates: 0,
      written: 0,
      insufficient: 0,
      failures: 0,
    });
  });

  it('preserves all three configured cron triggers', () => {
    expect(wranglerConfig).toMatch(
      /"crons"\s*:\s*\[\s*"0 8 \* \* \*"\s*,\s*"30 8 \* \* \*"\s*,\s*"\*\/5 \* \* \* \*"\s*\]/,
    );
  });

  it('routes the daily cron exactly once with existing reporting semantics', async () => {
    await worker.scheduled(event(DAILY_ROLLUP_CRON), env(), {} as ExecutionContext);
    expect(runDailyRollupsCronHttp).toHaveBeenCalledOnce();
    expect(runDailyRollupsCronHttp).toHaveBeenCalledWith(expect.anything(), {
      scheduledTimeMs: scheduledTime,
    });
    expect(runRecurringSalesScheduled).not.toHaveBeenCalled();
    expect(runForecastScheduled).not.toHaveBeenCalled();
  });

  it('routes the forecast cron exactly once at 08:30', async () => {
    await worker.scheduled(event(FORECAST_CRON), env(), {} as ExecutionContext);
    expect(runForecastScheduled).toHaveBeenCalledOnce();
    expect(runForecastScheduled).toHaveBeenCalledWith(expect.anything(), {
      scheduledTime,
    });
    expect(runDailyRollupsCronHttp).not.toHaveBeenCalled();
    expect(runRecurringSalesScheduled).not.toHaveBeenCalled();
  });

  it('routes the recurring cron exactly once', async () => {
    await worker.scheduled(event(RECURRING_CRON), env(), {} as ExecutionContext);
    expect(runRecurringSalesScheduled).toHaveBeenCalledOnce();
    expect(runRecurringSalesScheduled).toHaveBeenCalledWith(expect.anything(), {
      scheduledTime,
      cron: RECURRING_CRON,
    });
    expect(runDailyRollupsCronHttp).not.toHaveBeenCalled();
    expect(runForecastScheduled).not.toHaveBeenCalled();
  });

  it('keeps each scheduler independent when the other features are off', async () => {
    await worker.scheduled(
      event(RECURRING_CRON),
      env({ FEATURE_REPORTING_ROLLUPS: '0' }),
      {} as ExecutionContext,
    );
    expect(runRecurringSalesScheduled).toHaveBeenCalledOnce();
    expect(runDailyRollupsCronHttp).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await worker.scheduled(
      event(DAILY_ROLLUP_CRON),
      env({ FEATURE_SALES_RECURRING: '0' }),
      {} as ExecutionContext,
    );
    expect(runDailyRollupsCronHttp).toHaveBeenCalledOnce();
    expect(runRecurringSalesScheduled).not.toHaveBeenCalled();
    expect(runForecastScheduled).not.toHaveBeenCalled();
  });

  it('does not overlap handlers when multiple cron expressions fire at 08:00 UTC', async () => {
    await worker.scheduled(event(DAILY_ROLLUP_CRON), env(), {} as ExecutionContext);
    expect(runDailyRollupsCronHttp).toHaveBeenCalledTimes(1);
    expect(runRecurringSalesScheduled).toHaveBeenCalledTimes(0);
    expect(runForecastScheduled).toHaveBeenCalledTimes(0);

    await worker.scheduled(event(FORECAST_CRON), env(), {} as ExecutionContext);
    expect(runDailyRollupsCronHttp).toHaveBeenCalledTimes(1);
    expect(runForecastScheduled).toHaveBeenCalledTimes(1);

    await worker.scheduled(event(RECURRING_CRON), env(), {} as ExecutionContext);
    expect(runDailyRollupsCronHttp).toHaveBeenCalledTimes(1);
    expect(runRecurringSalesScheduled).toHaveBeenCalledTimes(1);
    expect(runForecastScheduled).toHaveBeenCalledTimes(1);
  });

  it('fails unknown cron safe with a structured warning and no handlers', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await worker.scheduled(event('1 2 3 4 5'), env(), {} as ExecutionContext);
    expect(runDailyRollupsCronHttp).not.toHaveBeenCalled();
    expect(runRecurringSalesScheduled).not.toHaveBeenCalled();
    expect(runForecastScheduled).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'worker_scheduled_unknown_cron',
        cron: '1 2 3 4 5',
        scheduledTime,
      }),
    );
    warning.mockRestore();
  });
});
