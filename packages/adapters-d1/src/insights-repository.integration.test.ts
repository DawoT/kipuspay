import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  appendInsightLog,
  consumeAiUsage,
  listBriefingFacts,
  runInsightSelect,
} from './insights-repository.js';

describe('insights repository (Sprint 49 / PERF-12)', () => {
  const tenantId = 't-insights';

  async function seedInsightsTenant(): Promise<void> {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode, plan_id)
         VALUES (?, 'Insights SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL', 'cadena')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO branches (id, tenant_id, code, name, address) VALUES ('b-ins', ?, 'C01', 'Centro', 'Lima')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO users (id, tenant_id, branch_id, email, role) VALUES ('u-ins', ?, 'b-ins', 'ins@example.com', 'owner')`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO daily_financial_rollups
           (tenant_id, branch_id, report_date, gross_sales_cents, net_sales_cents, cogs_cents, doc_count)
         VALUES (?, 'b-ins', '2026-08-03', 118000, 100000, 40000, 42)`,
      ).bind(tenantId),
      env.DB.prepare(
        `INSERT OR IGNORE INTO ai_usage_counters (tenant_id, usage_date, queries, tokens_in, tokens_out, quota_queries)
         VALUES (?, '2026-08-04', 0, 0, 0, 100)`,
      ).bind(tenantId),
    ]);
  }

  it('runInsightSelect ejecuta en sesión réplica y devuelve filas', async () => {
    await seedInsightsTenant();
    const result = await runInsightSelect({
      db: env.DB,
      tenantId,
      sql: `SELECT t0.gross_sales_cents, t0.doc_count
            FROM daily_financial_rollups AS t0
            WHERE t0.tenant_id = ? AND t0.report_date = ?
            LIMIT 50`,
      params: [tenantId, '2026-08-03'],
    });
    expect(result.length).toBe(1);
    expect(result[0]?.gross_sales_cents).toBe(118000);
    expect(result[0]?.doc_count).toBe(42);
  });

  it('appendInsightLog es idempotente por (tenant, idempotency_key)', async () => {
    await seedInsightsTenant();
    const input = {
      tenantId,
      userId: 'u-ins',
      idempotencyKey: 'chat-1',
      interactionType: 'chat_query' as const,
      status: 'OK' as const,
      sqlExecuted: 'SELECT 1',
      factsJson: JSON.stringify({ gross_sales_cents: 118000 }),
      responseText: 'Ventas: S/ 118000.',
      modelVersion: 'test-1',
      tokensIn: 10,
      tokensOut: 20,
    };
    const first = await appendInsightLog(env.DB, input);
    expect(first.duplicate).toBe(false);
    const second = await appendInsightLog(env.DB, input);
    expect(second.duplicate).toBe(true);
    const rows = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM insight_log WHERE tenant_id = ? AND idempotency_key = ?`,
    )
      .bind(tenantId, 'chat-1')
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it('consumeAiUsage cuenta consultas y corta en el cupo (AI_QUOTA_EXCEEDED)', async () => {
    await seedInsightsTenant();
    await env.DB.prepare(`UPDATE ai_usage_counters SET quota_queries = 2 WHERE tenant_id = ?`)
      .bind(tenantId)
      .run();
    const ok1 = await consumeAiUsage(env.DB, tenantId, '2026-08-04', 5, 10);
    const ok2 = await consumeAiUsage(env.DB, tenantId, '2026-08-04', 5, 10);
    expect(ok1.consumed).toBe(true);
    expect(ok2.consumed).toBe(true);
    await expect(consumeAiUsage(env.DB, tenantId, '2026-08-04', 5, 10)).rejects.toThrow(
      'AI_QUOTA_EXCEEDED',
    );
    const row = await env.DB.prepare(
      `SELECT queries, tokens_in FROM ai_usage_counters WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<{ queries: number; tokens_in: number }>();
    expect(row?.queries).toBe(2);
    expect(row?.tokens_in).toBe(10);
  });

  it('listBriefingFacts devuelve ventas y rollup del día', async () => {
    await seedInsightsTenant();
    const facts = await listBriefingFacts(env.DB, tenantId, '2026-08-03');
    expect(facts.sales.grossSalesCents).toBe(118000);
    expect(facts.sales.docCount).toBe(42);
  });
});
