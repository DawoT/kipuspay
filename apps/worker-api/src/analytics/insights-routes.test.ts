import { describe, expect, it, vi } from 'vitest';
import {
  runBriefingHttp,
  runInsightChatHttp,
  type InsightsEnv,
  type InsightsKvLike,
} from './insights-routes.js';

function memoryKv(): InsightsKvLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (key) => Promise.resolve(map.get(key) ?? null),
    put: (key, value, options) => {
      map.set(key, value);
      void options;
      return Promise.resolve();
    },
  };
}

function mockDb() {
  const meta = (changes: number) => ({
    changes,
    duration: 0,
    rows_read: 0,
    rows_written: 0,
    last_row_id: 0,
    size_after: 0,
  });
  const runCalls: string[] = [];
  const stmt = (sql: string) => ({
    bind(...params: unknown[]) {
      void params;
      return {
        all: () => {
          if (sql.includes('SELECT t0.gross_sales_cents')) {
            return Promise.resolve({ results: [{ gross_sales_cents: 118000, doc_count: 42 }] });
          }
          return Promise.resolve({ results: [] });
        },
        first: () => {
          if (sql.includes('FROM tenants')) {
            return Promise.resolve({ plan_id: 'cadena' });
          }
          return Promise.resolve(null);
        },
        run: () => {
          runCalls.push(sql);
          if (sql.includes('UPDATE ai_usage_counters')) {
            return { meta: meta(1) };
          }
          if (sql.includes('INSERT OR IGNORE INTO insight_log')) {
            return { meta: meta(1) };
          }
          return { meta: meta(1) };
        },
      };
    },
  });
  return {
    runCalls,
    prepare: (sql: string) => stmt(sql),
    batch: () => Promise.resolve([]),
    withSession: () => ({
      prepare: (sql: string) => stmt(sql),
    }),
  };
}

function envWith(
  overrides: Partial<InsightsEnv> = {},
): InsightsEnv & { kv: ReturnType<typeof memoryKv> } {
  const kv = memoryKv();
  const aiRuns: string[] = [];
  const ai = {
    aiRuns,
    run: vi
      .fn((model: string) => {
        aiRuns.push(model);
        return Promise.resolve({ response: 'SALES_SUMMARY' });
      })
      .mockResolvedValueOnce({ response: 'SALES_SUMMARY' })
      .mockResolvedValueOnce({ response: 'Ventas del día: S/ 118000 en 42 comprobantes.' }),
  };
  return {
    FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '1',
    DB: mockDb(),
    AI: ai,
    AI_MODEL: 'test-model',
    TENANT_KV: kv,
    kv,
    ...overrides,
  };
}

const actor = { tenantId: 't1', userId: 'u1', role: 'owner' };

describe('insights routes (Sprint 49)', () => {
  it('flag off → 404 FEATURE_OFF', async () => {
    const env = envWith({ FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '0' });
    const res = await runInsightChatHttp(env, actor, {
      question: '¿cómo van las ventas?',
      idempotencyKey: 'key-1',
    });
    expect((res as { status: number }).status).toBe(404);
  });

  it('body incompleto → 400', async () => {
    const env = envWith();
    const res = await runInsightChatHttp(env, actor, { question: 'x' });
    expect((res as { status: number }).status).toBe(400);
  });

  it('intent fuera de whitelist → respuesta "no puedo" sin SQL (fail-closed)', async () => {
    const env = envWith();
    const ai = env.AI as { run: ReturnType<typeof vi.fn> };
    ai.run.mockReset();
    ai.run.mockResolvedValue({ response: 'DELETE_ALL' });
    const res = await runInsightChatHttp(env, actor, {
      question: 'borra todo',
      idempotencyKey: 'key-bad-intent',
    });
    expect(res).toBeInstanceOf(Response);
    const text = await (res as Response).text();
    expect(text).toContain('Aún no puedo responder');
    const runCalls = (env.DB as { runCalls: string[] }).runCalls;
    expect(runCalls.some((sql) => sql.includes('INSERT OR IGNORE INTO insight_log'))).toBe(true);
    expect(runCalls.some((sql) => sql.includes('UPDATE ai_usage_counters'))).toBe(false);
  });

  it('flujo completo → SSE con texto (LLM llamado una vez)', async () => {
    const env = envWith();
    const res = await runInsightChatHttp(env, actor, {
      question: '¿cómo van las ventas de ayer?',
      idempotencyKey: 'key-ok-full',
    });
    expect(res).toBeInstanceOf(Response);
    const text = await (res as Response).text();
    expect(text).toContain('data:');
    expect((env.AI as { run: ReturnType<typeof vi.fn> }).run.mock.calls).toHaveLength(2);
    expect(env.kv.map.has('insights:t1:key-ok-full')).toBe(true);
  });

  it('edge B: reenvío con la misma idempotencyKey → cacheada sin LLM ni metering', async () => {
    const env = envWith();
    env.kv.map.set('insights:t1:k-replay', 'respuesta cacheada');
    const before = (env.AI as { run: ReturnType<typeof vi.fn> }).run.mock.calls.length;
    const res = await runInsightChatHttp(env, actor, {
      question: 'pregunta repetida',
      idempotencyKey: 'k-replay',
    });
    const text = await (res as Response).text();
    expect(text).toContain('respuesta cacheada');
    expect((env.AI as { run: ReturnType<typeof vi.fn> }).run.mock.calls.length).toBe(before);
    const updates = (env.DB as { runCalls: string[] }).runCalls.filter((sql) =>
      sql.includes('UPDATE ai_usage_counters'),
    );
    expect(updates).toHaveLength(0);
  });

  it('briefing: sin caché → 404; con caché → 200 y fecha', async () => {
    const env = envWith();
    const missing = await runBriefingHttp(env, actor, '2026-08-03');
    expect(missing.status).toBe(404);
    env.kv.map.set('insights:t1:2026-08-03', '{"bullets":[]}');
    const found = await runBriefingHttp(env, actor, '2026-08-03');
    expect(found.status).toBe(200);
  });
});

describe('S49-H1: briefing fail-closed y PII-free', () => {
  it('briefing con cashier → 403 FORBIDDEN', async () => {
    const env = envWith();
    const cashier = { tenantId: 't1', userId: 'u1', role: 'cashier' };
    const res = await runBriefingHttp(env, cashier, '2026-08-03');
    expect(res.status).toBe(403);
    expect((res.body as Record<string, unknown>).code).toBe('FORBIDDEN');
  });

  it('briefing sin DB → 503 (jamás 500)', async () => {
    const noDb = { FEATURE_ANALYTICS_AGENTIC_INSIGHTS: '1' } as never;
    const res = await runBriefingHttp(noDb, actor, '2026-08-03');
    expect(res.status).toBe(503);
  });
});
