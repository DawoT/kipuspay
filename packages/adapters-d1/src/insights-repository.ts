/**
 * Sprint 49 — insights-repository (Arquitectura §5.3 regla 33 / PERF-12).
 *
 * - runInsightSelect: ejecuta el SELECT validado del dominio sobre una sesión
 *   de réplica (`first-unconstrained`); sin réplica D1 degrada a primary.
 *   El SQL SIEMPRE viene del dominio (parametrizado, LIMIT 50) — jamás texto
 *   del LLM concatenado.
 * - appendInsightLog: append-only, idempotente por (tenant, idempotency_key)
 *   vía INSERT OR IGNORE (ON CONFLICT DO NOTHING; nunca UPSERT INTO).
 * - consumeAiUsage: contador con cupo diario — el UPDATE condicional
 *   `queries < quota_queries` corta en el cupo (fail-closed).
 */
import type { D1Bound, D1DatabaseLike } from './index.js';

export interface InsightsRepositoryDb {
  prepare(sql: string): {
    bind(...params: unknown[]): D1Bound & {
      all<T = unknown>(): Promise<{ results?: readonly T[] }>;
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
  withSession(constraint: string): {
    prepare(sql: string): {
      bind(...params: unknown[]): {
        all<T = unknown>(): Promise<{ results?: readonly T[] }>;
        run(): Promise<{ meta?: { changes?: number } }>;
        first<T = unknown>(): Promise<T | null>;
      };
    };
  };
}

/** D1 real expone withSession (réplica); D1DatabaseLike no lo declara. */
export interface InsightSessionDb extends D1DatabaseLike {
  withSession(constraint: string): D1DatabaseLike;
}

export interface RunInsightSelectInput {
  readonly db: InsightSessionDb;
  readonly tenantId: string;
  readonly sql: string;
  readonly params: readonly unknown[];
}

export async function runInsightSelect(
  input: RunInsightSelectInput,
): Promise<Readonly<Record<string, unknown>>[]> {
  const session = input.db.withSession('first-unconstrained');
  const rows = await session
    .prepare(input.sql)
    .bind(...input.params)
    .all();
  return (rows.results ?? []) as Readonly<Record<string, unknown>>[];
}

export interface AppendInsightLogInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly interactionType: 'chat_query' | 'briefing_generated' | 'briefing_viewed';
  readonly status: 'OK' | 'LIMIT_CAPPED' | 'PII_BLOCKED' | 'TOO_WIDE';
  readonly sqlExecuted: string;
  readonly factsJson: string;
  readonly responseText: string;
  readonly modelVersion: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export async function appendInsightLog(
  db: D1DatabaseLike,
  input: AppendInsightLogInput,
): Promise<{ readonly duplicate: boolean }> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO insight_log (
         id, tenant_id, user_id, idempotency_key, interaction_type, status,
         sql_executed, facts_json, response_text, model_version, tokens_in, tokens_out
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.tenantId,
      input.userId,
      input.idempotencyKey,
      input.interactionType,
      input.status,
      input.sqlExecuted,
      input.factsJson,
      input.responseText,
      input.modelVersion,
      input.tokensIn,
      input.tokensOut,
    )
    .run();
  return { duplicate: (res.meta?.changes ?? 0) === 0 };
}

export interface ConsumeAiUsageResult {
  readonly consumed: boolean;
}

/**
 * Suma 1 query + tokens. El UPDATE condicional sobre `queries < quota_queries`
 * es atómico: dos peticiones concurrentes no pueden exceder el cupo.
 */
export async function consumeAiUsage(
  db: D1DatabaseLike,
  tenantId: string,
  usageDate: string,
  tokensIn: number,
  tokensOut: number,
): Promise<ConsumeAiUsageResult> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO ai_usage_counters
         (tenant_id, usage_date, queries, tokens_in, tokens_out, quota_queries)
       VALUES (?, ?, 0, 0, 0, 100)`,
    )
    .bind(tenantId, usageDate)
    .run();
  const res = await db
    .prepare(
      `UPDATE ai_usage_counters
       SET queries = queries + 1, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?
       WHERE tenant_id = ? AND usage_date = ? AND queries < quota_queries`,
    )
    .bind(tokensIn, tokensOut, tenantId, usageDate)
    .run();
  if ((res.meta?.changes ?? 0) === 0) {
    throw new Error('AI_QUOTA_EXCEEDED');
  }
  return { consumed: true };
}

export interface BriefingFacts {
  readonly sales: { readonly grossSalesCents: number; readonly docCount: number };
  readonly breakage: readonly { readonly productName: string }[];
  readonly cashExceptions: readonly { readonly branchCode: string; readonly diffCents: number }[];
}

export async function listBriefingFacts(
  db: D1DatabaseLike,
  tenantId: string,
  reportDate: string,
): Promise<BriefingFacts> {
  const sales = await db
    .prepare(
      `SELECT COALESCE(SUM(gross_sales_cents), 0) AS gross_sales_cents,
              COALESCE(SUM(doc_count), 0) AS doc_count
       FROM daily_financial_rollups
       WHERE tenant_id = ? AND report_date = ?`,
    )
    .bind(tenantId, reportDate)
    .first<{ gross_sales_cents: number; doc_count: number }>();
  const breakage = await db
    .prepare(
      `SELECT COALESCE(SUM(predicted_qty), 0) AS p, COUNT(*) AS n
       FROM forecast_outputs WHERE tenant_id = ? AND forecast_date = ?`,
    )
    .bind(tenantId, reportDate)
    .first<{ p: number; n: number }>();
  const cash = await db
    .prepare(
      `SELECT t0.branch_id AS branch_code, t0.cash_expected_cents - t0.net_sales_cents AS diff_cents
       FROM daily_financial_rollups t0
       WHERE t0.tenant_id = ? AND t0.report_date = ? AND t0.overage_docs > 0
       LIMIT 5`,
    )
    .bind(tenantId, reportDate)
    .all<{ branch_code: string; diff_cents: number }>();
  return {
    sales: {
      grossSalesCents: sales?.gross_sales_cents ?? 0,
      docCount: sales?.doc_count ?? 0,
    },
    breakage: (breakage?.n ?? 0) > 0 ? [{ productName: `${breakage?.n} productos` }] : [],
    cashExceptions: (cash.results ?? []).map((row) => ({
      branchCode: row.branch_code,
      diffCents: row.diff_cents,
    })),
  };
}
