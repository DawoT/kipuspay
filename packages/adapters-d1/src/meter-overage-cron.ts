/**
 * Cron diario de sobregiro Stripe — fuera del hot path (§4.1 / Sprint 27).
 */
import {
  limaDayYmd,
  overageUnits,
  periodYmLima,
  planQuotaForPlanId,
  stripeOverageIdempotencyKey,
} from '@kipuspay/domain-billing';
import type { FetchLike, MeteredOverageResult } from '@kipuspay/adapters-stripe';
import { reportMeteredOverage } from '@kipuspay/adapters-stripe';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export interface MeterOverageCronDeps {
  readonly db: D1DatabaseLike;
  readonly stripeApiKey: string | undefined;
  readonly fetchImpl?: FetchLike;
  readonly nowMs?: number;
  /** Inyectable para tests sin red. */
  readonly reportFn?: typeof reportMeteredOverage;
}

export interface MeterOverageCronResult {
  readonly tenantsScanned: number;
  readonly reported: number;
  readonly skippedIdempotent: number;
  readonly unitsTotal: number;
  readonly errors: readonly string[];
}

interface CounterRow {
  tenant_id: string;
  period_ym: string;
  doc_count: number;
  overage_reported_thru: number;
  plan_id: string | null;
  stripe_customer_id: string | null;
}

export async function runMeterOverageCron(
  deps: MeterOverageCronDeps,
): Promise<MeterOverageCronResult> {
  const nowMs = deps.nowMs ?? Date.now();
  const periodYm = periodYmLima(nowMs);
  const dayYmd = limaDayYmd(nowMs);
  const report = deps.reportFn ?? reportMeteredOverage;

  const rows = await deps.db
    .prepare(
      `SELECT c.tenant_id, c.period_ym, c.doc_count, c.overage_reported_thru,
              t.plan_id, t.stripe_customer_id
       FROM usage_counters c
       INNER JOIN tenants t ON t.id = c.tenant_id
       WHERE c.period_ym = ?`,
    )
    .bind(periodYm)
    .all<CounterRow>();

  const list = rows.results ?? [];
  let reported = 0;
  let skippedIdempotent = 0;
  let unitsTotal = 0;
  const errors: string[] = [];

  for (const row of list) {
    const planId = row.plan_id ?? 'arranque';
    const quota = planQuotaForPlanId(planId);
    const units = overageUnits(row.doc_count, row.overage_reported_thru, quota);
    if (units <= 0) continue;

    const idemKey = stripeOverageIdempotencyKey(row.tenant_id, periodYm, dayYmd);
    const existing = await deps.db
      .prepare(
        `SELECT id FROM billing_overages
         WHERE tenant_id = ? AND stripe_idempotency_key = ? LIMIT 1`,
      )
      .bind(row.tenant_id, idemKey)
      .first<{ id: string }>();
    if (existing) {
      skippedIdempotent += 1;
      continue;
    }

    if (!row.stripe_customer_id) {
      errors.push(`${row.tenant_id}:missing_stripe_customer`);
      continue;
    }

    let stripeRes: MeteredOverageResult;
    try {
      const reportOpts: {
        apiKey: string | undefined;
        fetchImpl?: FetchLike;
      } = { apiKey: deps.stripeApiKey };
      if (deps.fetchImpl) reportOpts.fetchImpl = deps.fetchImpl;
      stripeRes = await report(
        {
          tenantId: row.tenant_id,
          stripeCustomerId: row.stripe_customer_id,
          periodYm,
          units,
          idempotencyKey: idemKey,
        },
        reportOpts,
      );
    } catch (e) {
      errors.push(`${row.tenant_id}:${e instanceof Error ? e.message : 'stripe_error'}`);
      continue;
    }
    if (!stripeRes.ok) {
      errors.push(`${row.tenant_id}:stripe_${stripeRes.status}`);
      continue;
    }

    const overageId = crypto.randomUUID();
    try {
      await runD1AtomicPlan(deps.db, (plan) => {
        plan.add(
          deps.db
            .prepare(
              `INSERT INTO billing_overages (
                   id, tenant_id, period_ym, units, stripe_idempotency_key
                 ) VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(overageId, row.tenant_id, periodYm, units, idemKey),
        );
        plan.add(
          deps.db
            .prepare(
              `UPDATE usage_counters
               SET overage_reported_thru = ?, updated_at = CURRENT_TIMESTAMP
               WHERE tenant_id = ? AND period_ym = ?`,
            )
            .bind(row.doc_count, row.tenant_id, periodYm),
        );
      });
      reported += 1;
      unitsTotal += units;
    } catch (e) {
      // UNIQUE violation = doble cron concurrente → tratar como idempotente
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE|unique|constraint/i.test(msg)) {
        skippedIdempotent += 1;
      } else {
        errors.push(`${row.tenant_id}:${msg}`);
      }
    }
  }

  return {
    tenantsScanned: list.length,
    reported,
    skippedIdempotent,
    unitsTotal,
    errors,
  };
}
