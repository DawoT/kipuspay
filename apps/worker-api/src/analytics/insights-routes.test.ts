import { describe, expect, it, vi } from 'vitest';
import {
  runBriefingHttp,
  runInsightChatHttp,
  persistInsightArtifacts,
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
          if (sql.includes('tenant_capabilities')) {
            return Promise.resolve({ enabled: 1, config_json: '{}', epoch: 0 });
          }
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
    batch: (statements: readonly { run: () => unknown }[]) =>
      Promise.resolve(statements.map((statement) => statement.run())),
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
        return Promise.resolve({ response: 'Ventas del día: S/ 118000 en 42 comprobantes.' });
      })
      .mockResolvedValueOnce({ response: 'Ventas del día: S/ 118000 en 42 comprobantes.' })
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
  it('persiste log y cache en paralelo para no sumar las dos latencias', async () => {
    let started = 0;
    let releaseBoth!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    const operation = async () => {
      started += 1;
      if (started === 2) releaseBoth();
      await bothStarted;
    };

    await Promise.race([
      persistInsightArtifacts({ writeLog: operation, writeCache: operation }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PERSISTENCE_SERIALIZED')), 50),
      ),
    ]);
    expect(started).toBe(2);
  });

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

  it('pregunta frecuente → SSE fact-backed sin round-trip al LLM', async () => {
    const env = envWith();
    const res = await runInsightChatHttp(env, actor, {
      question: '¿cómo van las ventas de ayer?',
      idempotencyKey: 'key-ok-full',
    });
    expect(res).toBeInstanceOf(Response);
    const text = await (res as Response).text();
    expect(text).toContain('data:');
    expect(text).toContain('Ventas del día: S/ 118000 en 42 comprobantes.');
    const serverTiming = (res as Response).headers.get('server-timing') ?? '';
    for (const stage of [
      'capability',
      'plan',
      'quota',
      'router',
      'query',
      'generate',
      'metering',
      'persist',
      'persist_d1',
      'persist_kv',
      'total',
    ]) {
      expect(serverTiming).toContain(`${stage};dur=`);
    }
    expect((env.AI as { run: ReturnType<typeof vi.fn> }).run.mock.calls).toHaveLength(0);
    expect(env.kv.map.has('insights:t1:key-ok-full')).toBe(true);
  });

  it('pregunta de ventas reconocida localmente → omite el round-trip del router LLM', async () => {
    const env = envWith();
    const res = await runInsightChatHttp(env, actor, {
      question: '¿cómo van las ventas de ayer?',
      idempotencyKey: 'key-local-route',
    });
    expect(res).toBeInstanceOf(Response);
    expect((env.AI as { run: ReturnType<typeof vi.fn> }).run.mock.calls).toHaveLength(0);
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

  it('fallo del proveedor registra etapa y motivo acotado sin filtrar secretos', async () => {
    const env = envWith();
    const ai = env.AI as { run: ReturnType<typeof vi.fn> };
    ai.run.mockReset().mockRejectedValue(new Error('provider token=secret-value'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const res = await runInsightChatHttp(env, actor, {
        question: '¿qué ocurrió recientemente?',
        idempotencyKey: 'key-provider-fail',
      });
      expect((res as { status: number }).status).toBe(422);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"insights_failed"'));
      const diagnostic = warnSpy.mock.calls[0]?.[0] as string;
      expect(diagnostic).toContain('"stage":"router"');
      expect(diagnostic).not.toContain('secret-value');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('sin hechos devuelve respuesta determinista y no pide redacción al LLM', async () => {
    const env = envWith();
    const db = env.DB as ReturnType<typeof mockDb>;
    db.withSession = () =>
      ({
        prepare: () => ({
          bind: () => ({
            all: () => Promise.resolve({ results: [{ gross_sales_cents: 0, doc_count: 0 }] }),
          }),
        }),
      }) as unknown as ReturnType<ReturnType<typeof mockDb>['withSession']>;

    const res = await runInsightChatHttp(env, actor, {
      question: '¿cómo van las ventas?',
      idempotencyKey: 'key-no-facts',
    });
    expect(res).toBeInstanceOf(Response);
    const text = await (res as Response).text();
    expect(text).toContain('No hay datos suficientes');
    expect((env.AI as { run: ReturnType<typeof vi.fn> }).run).toHaveBeenCalledTimes(0);
  });

  it('rechazo anti-alucinación registra NLG_CONTRADICTION sin exponer la respuesta', async () => {
    const env = envWith();
    const ai = env.AI as { run: ReturnType<typeof vi.fn> };
    ai.run.mockReset().mockResolvedValueOnce({ response: 'SALES_SUMMARY' }).mockResolvedValueOnce({
      response: 'Las ventas fueron 9999 soles.',
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const res = await runInsightChatHttp(env, actor, {
        question: '¿qué ocurrió recientemente?',
        idempotencyKey: 'key-nlg-fail',
      });
      expect((res as { status: number }).status).toBe(422);
      const diagnostic = warnSpy.mock.calls[0]?.[0] as string;
      expect(diagnostic).toContain('"stage":"generate"');
      expect(diagnostic).toContain('"reason":"NLG_CONTRADICTION"');
      expect(diagnostic).not.toContain('9999');
    } finally {
      warnSpy.mockRestore();
    }
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

describe('SSE P95 2s ANALYTICS_ENGINE writer (SLO 2s)', () => {
  it('CACHE_HIT emite sse:insightsChat con double1=sseDurationMs', async () => {
    const writeDataPoint = vi.fn();
    const env = envWith({
      ANALYTICS_ENGINE: { writeDataPoint } as unknown as InsightsEnv['ANALYTICS_ENGINE'],
    });
    env.kv.map.set('insights:t1:k-cache-hit-analyt', 'respuesta cacheada');
    const res = await runInsightChatHttp(env, actor, {
      question: 'pregunta repetida',
      idempotencyKey: 'k-cache-hit-analyt',
    });
    expect(res).toBeInstanceOf(Response);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0]?.[0] as {
      indexes?: string[];
      doubles?: number[];
      blobs?: string[];
    };
    expect(point.indexes?.[0]).toBe('sse:insightsChat');
    expect(typeof point.doubles?.[0]).toBe('number');
    expect(point.doubles?.[0]).toBeGreaterThanOrEqual(0);
    expect(point.blobs).toEqual(expect.arrayContaining(['t1', 'CACHE_HIT']));
  });

  it('OK emite sse:insightsChat con double1=sseDurationMs y status OK', async () => {
    const writeDataPoint = vi.fn();
    const env = envWith({
      ANALYTICS_ENGINE: { writeDataPoint } as unknown as InsightsEnv['ANALYTICS_ENGINE'],
    });
    const res = await runInsightChatHttp(env, actor, {
      question: '¿cómo van las ventas de ayer?',
      idempotencyKey: 'k-ok-analyt',
    });
    expect(res).toBeInstanceOf(Response);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0]?.[0] as {
      indexes?: string[];
      doubles?: number[];
      blobs?: string[];
    };
    expect(point.indexes?.[0]).toBe('sse:insightsChat');
    expect(point.doubles?.[0]).toBeGreaterThanOrEqual(0);
    expect(point.blobs).toEqual(expect.arrayContaining(['t1', 'OK']));
  });

  it('FAILED/TOO_WIDE emite sse:insightsChat best-effort sin bloquear respuesta', async () => {
    const writeDataPoint = vi.fn(() => {
      throw new Error('AE down');
    });
    const env = envWith({
      ANALYTICS_ENGINE: { writeDataPoint } as unknown as InsightsEnv['ANALYTICS_ENGINE'],
    });
    // Forzar TOO_WIDE via intent que mapee a rango amplio: mockeamos buildInsightSelect indirecto
    // Más simple: provocar error en generateText para ir a FAILED y verificar que writeDataPoint se intentó
    const ai = env.AI as { run: ReturnType<typeof vi.fn> };
    ai.run.mockReset();
    ai.run
      .mockResolvedValueOnce({ response: 'SALES_SUMMARY' })
      .mockResolvedValueOnce({ response: 'texto cualquiera' });
    // Forzar FAILED simulando que runInsightSelect lanza
    const db = env.DB as unknown as {
      withSession: () => { prepare: () => { bind: () => { all: () => Promise<never> } } };
    };
    const originalWithSession = (env.DB as ReturnType<typeof mockDb>).withSession;
    (env.DB as unknown as Record<string, unknown>).withSession = () =>
      ({
        prepare: () => ({
          bind: () => ({
            all: () => Promise.reject(new Error('D1 boom')),
            first: () => Promise.resolve(null),
            run: () => Promise.resolve({ meta: { changes: 1 } }),
          }),
        }),
      }) as unknown as ReturnType<ReturnType<typeof mockDb>['withSession']>;
    const res = await runInsightChatHttp(env, actor, {
      question: '¿cómo van las ventas?',
      idempotencyKey: 'k-failed-analyt',
    });
    expect((res as { status: number }).status).toBe(422);
    expect(writeDataPoint).toHaveBeenCalled();
    const point = writeDataPoint.mock.calls[0]?.[0] as {
      indexes?: string[];
      doubles?: number[];
      blobs?: string[];
    };
    expect(point.indexes?.[0]).toBe('sse:insightsChat');
    expect(typeof point.doubles?.[0]).toBe('number');
    expect(point.blobs).toEqual(expect.arrayContaining(['t1', 'FAILED']));
    // restaurar
    (env.DB as unknown as Record<string, unknown>).withSession = originalWithSession;
    void db;
  });
});
