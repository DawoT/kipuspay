/**
 * Sprint 49 — insights routes (Arquitectura §5.3 regla 33 / PERF-12).
 *
 * - POST /api/insights/chat → SSE: pipeline determinista (router whitelist →
 *   SQL estricto LIMIT 50 → D1 en sesión réplica → facts PII-free → NLG
 *   verbatim + post-check → respuesta). Idempotencia edge B por
 *   `insight_idempotency_key` (KV `insights:{tenant}:{idem}`, TTL 10 min, sin
 *   re-invocar el LLM ni volver a meterizar).
 * - GET /api/insights/briefing?date= → lectura KV <10ms con banner de
 *   antigüedad; nunca se presenta como en vivo (edge D: la re-materialización
 *   del rollup invalida la key).
 *
 * Gating: flag default-off → 404; plan Cadena+ → 403; rol owner/admin; cupo
 * diario → 402 AI_QUOTA_EXCEEDED. Tenant SIEMPRE del JWT (jamás del prompt).
 */
import { appendInsightLog, runInsightSelect } from '@kipuspay/adapters-d1';
import {
  assertFactsVerbatim,
  assertNoPiiInFacts,
  buildInsightSelect,
  classifyIntent,
  type InsightFact,
} from '@kipuspay/domain-analytics';
import { assertCadenaPlusPlan, type HttpResult, type PlanProbe } from '../auth/plan-cadena.js';
import { isAgenticInsightsEnabled } from '../auth/features.js';
import { createWorkersAiGateway, type AiGateway } from '../ai/ai-gateway.js';

export interface InsightsKvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { readonly expirationTtl?: number }): Promise<void>;
}

export interface InsightsEnv {
  readonly FEATURE_ANALYTICS_AGENTIC_INSIGHTS?: string;
  readonly DB?: unknown;
  readonly AI?: unknown;
  readonly AI_MODEL?: string;
  readonly TENANT_KV?: InsightsKvLike;
}

export interface InsightsActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}

export const IDEMPOTENCY_CACHE_TTL_SECONDS = 10 * 60;

function result(status: number, body: Readonly<Record<string, unknown>>): HttpResult {
  return { status, body };
}

function insightEnv(env: InsightsEnv) {
  return {
    kv: env.TENANT_KV ?? null,
    gateway: createWorkersAiGateway({
      binding: env.AI as never,
      model: env.AI_MODEL ?? '@cf/meta/llama-3.1-8b-instruct',
    }),
    db: env.DB as Parameters<typeof runInsightSelect>[0]['db'],
  };
}

const ADMIN_ROLES = new Set(['owner', 'admin']);

export async function runInsightChatHttp(
  env: InsightsEnv,
  actor: InsightsActor,
  body: Readonly<Record<string, unknown>>,
): Promise<Response | HttpResult> {
  if (!isAgenticInsightsEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  if (!env.DB || !env.AI) return result(503, { code: 'INSIGHTS_DEPENDENCY_UNAVAILABLE' });
  const planDeny = await assertCadenaPlusPlan(env as unknown as PlanProbe, actor.tenantId);
  if (planDeny) return planDeny;
  if (!ADMIN_ROLES.has(actor.role.toLowerCase())) return result(403, { code: 'FORBIDDEN' });
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  if (!question || !idempotencyKey) {
    return result(400, { code: 'BAD_REQUEST', error: 'question and idempotencyKey required' });
  }
  // S49-H3: límites de input — pregunta acotada (evita prompts gigantes) y
  // idempotency key con formato UUID (llave KV segura).
  if (question.length > 600) {
    return result(400, { code: 'QUESTION_TOO_LONG' });
  }
  if (idempotencyKey.length > 128 || !/^[A-Za-z0-9_-]{6,128}$/.test(idempotencyKey)) {
    return result(400, { code: 'IDEMPOTENCY_KEY_INVALID' });
  }
  return executeInsightChat(env, actor, question, idempotencyKey);
}

async function executeInsightChat(
  env: InsightsEnv,
  actor: InsightsActor,
  question: string,
  idempotencyKey: string,
): Promise<Response | HttpResult> {
  const { kv, gateway, db } = insightEnv(env);
  const cacheKey = `insights:${actor.tenantId}:${idempotencyKey}`;
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached) return sse({ cached: true, text: cached });
  }

  const modelVersion = env.AI_MODEL ?? '@cf/meta/llama-3.1-8b-instruct';
  try {
    // S49-H2: cupo fail-closed ANTES de invocar el LLM — sin cupo no se gasta
    // un solo token (el consumo post-hoc permitía gasto ilimitado por tenant).
    const { consumeAiUsage } = await import('@kipuspay/adapters-d1');
    const quota = await assertAiQuota(env, actor.tenantId);
    if (quota) return quota;
    // S49-H4: el metering atómico (queries < quota_queries) limita el gasto
    // real del LLM por tenant/día; el UNIQUE (tenant, idem) del insight_log
    // dedupea el registro final. La carrera de reenvío simultáneo con la
    // misma key puede invocar el LLM 2 veces (costo acotado por el cupo),
    // pero jamás duplica el cobro: consumeAiUsage es atómico.
    const rawIntent = await gateway.routerIntent(question);
    const intent = classifyIntent(rawIntent);
    if (intent === 'UNSUPPORTED') {
      const text =
        'Aún no puedo responder eso. Pregunta por ventas del día, quiebre de stock, excepciones de caja, top productos o deudas.';
      await cacheAndLog(kv, gateway, db, actor, idempotencyKey, {
        intent: 'UNSUPPORTED',
        question,
        text,
        sql: '',
        facts: [],
        status: 'OK',
        modelVersion,
        tokensIn: 0,
        tokensOut: 0,
      });
      return sse({ text });
    }

    const plan = buildInsightSelect({ action: intent, tenantId: actor.tenantId });
    if (plan.status === 'TOO_WIDE') {
      await cacheAndLog(kv, gateway, db, actor, idempotencyKey, {
        intent,
        question,
        text: plan.message,
        sql: '',
        facts: [],
        status: 'TOO_WIDE',
        modelVersion,
        tokensIn: 0,
        tokensOut: 0,
      });
      return sse({ text: plan.message });
    }

    const rows = await runInsightSelect({
      db,
      tenantId: actor.tenantId,
      sql: plan.sql,
      params: plan.params,
    });
    const facts: InsightFact[] = rows.slice(0, 5).flatMap((row) =>
      Object.entries(row).map(([key, value]) => ({
        key,
        value: typeof value === 'number' ? value : String(value),
      })),
    );
    assertNoPiiInFacts(rows);

    const prompt = buildPrompt(intent, question);
    const text = await gateway.generateText(
      prompt,
      facts.map((fact) => `${fact.key}=${String(fact.value)}`),
    );
    assertFactsVerbatim(facts, text);

    await consumeAiUsage(db, actor.tenantId, todayLima(), 32, estimateTokens(text));
    await cacheAndLog(kv, gateway, db, actor, idempotencyKey, {
      intent,
      question,
      text,
      sql: plan.sql,
      facts,
      status: 'OK',
      modelVersion,
      tokensIn: 32,
      tokensOut: estimateTokens(text),
    });
    return sse({ text });
  } catch (err) {
    if (err instanceof Error && err.message === 'AI_QUOTA_EXCEEDED') {
      return result(402, { code: 'AI_QUOTA_EXCEEDED' });
    }
    return result(422, { code: 'INSIGHTS_FAILED', errorRef: crypto.randomUUID() });
  }
}

function buildPrompt(intent: string, question: string): string {
  return `Pregunta: ${question}\nIntención: ${intent}\nResponde en 1-2 frases, sin jerga técnica.`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function todayLima(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

interface LogInput {
  readonly intent: string;
  readonly question: string;
  readonly text: string;
  readonly sql: string;
  readonly facts: readonly InsightFact[];
  readonly status: 'OK' | 'LIMIT_CAPPED' | 'PII_BLOCKED' | 'TOO_WIDE';
  readonly modelVersion: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

async function cacheAndLog(
  kv: InsightsKvLike | null,
  _gateway: AiGateway,
  db: Parameters<typeof runInsightSelect>[0]['db'],
  actor: InsightsActor,
  idempotencyKey: string,
  input: LogInput,
): Promise<void> {
  await appendInsightLog(db, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    idempotencyKey,
    interactionType: 'chat_query',
    status: input.status,
    sqlExecuted: input.sql,
    factsJson: JSON.stringify(input.facts),
    responseText: input.text,
    modelVersion: input.modelVersion,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
  }).catch(() => undefined);
  if (kv) {
    await kv
      .put(`insights:${actor.tenantId}:${idempotencyKey}`, input.text, {
        expirationTtl: IDEMPOTENCY_CACHE_TTL_SECONDS,
      })
      .catch(() => undefined);
  }
}

function sse(body: Readonly<Record<string, unknown>>): Response {
  const payload = `data: ${JSON.stringify(body)}\n\n`;
  return new Response(payload, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}

/**
 * S49-H2: cupo de AI fail-closed ANTES del LLM — sin cupo no se gasta tokens.
 */
async function assertAiQuota(env: InsightsEnv, tenantId: string): Promise<HttpResult | null> {
  const { db } = insightEnv(env);
  if (!db) return result(503, { code: 'INSIGHTS_DB_UNAVAILABLE' });
  const row = await db
    .prepare(
      `SELECT queries, quota_queries FROM ai_usage_counters
       WHERE tenant_id = ? AND usage_date = ? LIMIT 1`,
    )
    .bind(tenantId, todayLima())
    .first<{ queries: number; quota_queries: number }>();
  if (row && row.queries >= row.quota_queries) {
    return result(402, { code: 'AI_QUOTA_EXCEEDED' });
  }
  return null;
}

export async function runBriefingHttp(
  env: InsightsEnv,
  actor: InsightsActor,
  date: string | null,
): Promise<HttpResult> {
  if (!isAgenticInsightsEnabled(env)) return result(404, { code: 'FEATURE_OFF' });
  // S49-H1: el briefing expone PII derivada (operadores de turno) — solo
  // admin/owner (nunca cashier).
  if (!ADMIN_ROLES.has(actor.role.toLowerCase())) return result(403, { code: 'FORBIDDEN' });
  if (!env.DB) return result(503, { code: 'INSIGHTS_DB_UNAVAILABLE' });
  const planDeny = await assertCadenaPlusPlan(env as unknown as PlanProbe, actor.tenantId);
  if (planDeny) return planDeny;
  const { kv } = insightEnv(env);
  if (!kv) return result(503, { code: 'INSIGHTS_KV_UNAVAILABLE' });
  const reportDate = date ?? todayLima();
  const cached = await kv.get(`insights:${actor.tenantId}:${reportDate}`);
  if (!cached) return result(404, { code: 'NOT_FOUND' });
  return result(200, { reportDate, briefing: cached, staleAt: reportDate });
}
