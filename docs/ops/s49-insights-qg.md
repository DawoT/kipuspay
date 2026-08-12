---
doc_id: ops-s49-insights-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 49 — Inteligencia del negocio (analytics.agentic_insights) — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** “Gerente de Operaciones” (Cadena/Enterprise) descongelada (GTM §4.1); producción/piloto NO-GO  
**Capability:** `analytics.agentic_insights`, default-off (`FEATURE_ANALYTICS_AGENTIC_INSIGHTS`)  
**Spec:** Arquitectura §5.3 regla 33 · PERF-12 · Roadmap FASE 6F

El gate automatizado demuestra el contrato en entorno local: pipeline determinista
(router whitelist → SQL estricto LIMIT 50 → D1 en sesión réplica → facts PII-free →
NLG verbatim + post-check anti-alucinación → SSE), Morning Briefing determinista
cacheador en KV con banner de antigüedad, idempotencia del chat (edge B) y edge D
(invalidación de briefing en re-materialización de rollup). El LLM se inyecta vía
port `AiGateway` (Workers AI real por binding; determinista en tests — el LLM jamás
se llama en local/CI). No existe staging Cloudflare real (Workers AI, cron 3:30,
KV): producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED dominio | `run-red-s49-domain` | 5 módulos de dominio ausentes (tests fallaron por import inexistente) |
| RED repositorio | `run-red-s49-repo` | insights-repository ausente (integración falló por import) |
| GREEN dominio | `run-green-s49-domain` | intent-router/sql-schema/pii-filter/nlp-guard/briefing: **20/20** |
| GREEN repositorio | `run-green-s49-repo` | runInsightSelect (réplica), appendInsightLog idempotente, consumeAiUsage con cupo, listBriefingFacts: **4/4** |
| GREEN rutas+cron | `run-green-s49-routes` | AiGateway 3/3, insights-routes 6/6 (flag/400/fallback SSE/edge B/briefing), briefing-scheduled 3/3, worker-scheduled 7/7 |
| GREEN UI+E2E | `run-green-s49-ui` | client 3/3, contrato de página 4/4, E2E insights 2/2, suite E2E completa GREEN |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain analytics | **60 tests GREEN** (insights 20 + regresión 40) |
| Adapters D1 workerd | **219 tests GREEN** (migración 0041 + insights-repository 4 + regresión) |
| Worker API | **688 tests GREEN** (AiGateway 3, insights-routes 6, briefing 3, worker-scheduled 7 + regresión) |
| POS web unit | **168 tests GREEN** (client 3, contrato 4 + regresión) |
| POS web E2E | **28/28 GREEN** (incluye insights 2/2) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24) |
| Migración 0041 | insight_log (UNIQUE idem, CHECKs, triggers de epoch) + ai_usage_counters (cupo); registry backup: BUSINESS/EPHEMERAL; down protegido |

## Cobertura contractual (edges de la spec)

| Contrato | Evidencia local |
|---|---|
| Edge A (LIMIT 50 / 0 OOM) | `buildInsightSelect` inyecta `LIMIT 50` forzoso; acciones de detalle → `TOO_WIDE` con copy “descarga el Excel” |
| Edge B (idempotencia chat) | KV `insights:{tenant}:{idem}` TTL 10 min; reenvío → respuesta cacheada sin LLM ni metering (test explícito) |
| Edge C (PII-free) | Whitelist sin `email/phone/address/document_number`; `assertNoPiiInFacts` recursivo → `PII_BLOCKED`; `customer_id` como seudónimo |
| Anti-alucinación | `assertFactsVerbatim`: hecho numérico ausente o cifra ajena → `NLG_CONTRADICTION` (fail-closed, 0 discrepancias) |
| PERF-12 (réplica) | `runInsightSelect` abre `withSession('first-unconstrained')`; sin réplica degrada a primary |
| Briefing determinista | 3 viñetas (ventas/quiebre/excepciones) SIN LLM, con disclaimer “Datos del día X, calculados por el servidor” |
| Edge D (briefing inválido) | `rollup-rematerialize` borra `insights:{tenant}:{fecha}` (pre-cableado) + UI muestra “Datos del …, no en vivo” |
| Metering/cupo | `consumeAiUsage`: UPDATE condicional `queries < quota_queries` → `AI_QUOTA_EXCEEDED` (402) |
| Gating | flag default-off (404) + plan Cadena+ (403 `PLAN_REQUIRES_CADENA`) + rol owner/admin |
| Tenancy | `tenant_id` del JWT, forzado en el `WHERE` del SQL (parametrizado, jamás del prompt) |

Tests de trazabilidad:

- `packages/domain-analytics/src/insights/*.test.ts` (5 archivos).
- `packages/adapters-d1/src/insights-repository.integration.test.ts`,
  `packages/adapters-d1/src/insights-schema.test.ts`.
- `apps/worker-api/src/ai/ai-gateway.test.ts`, `src/analytics/insights-routes.test.ts`,
  `src/analytics/briefing-scheduled.test.ts`, `src/worker-scheduled.test.ts`.
- `apps/pos-web/src/lib/insights/*.test.ts`,
  `apps/pos-web/tests/e2e/insights.spec.ts`.

## Security Review

- El LLM jamás emite SQL ni acciones: traduce intención whitelist; el SQL lo
  construye el dominio (parametrizado, sin texto del LLM concatenado).
- PII doble barrera (whitelist + post-check recursivo); tenant del JWT.
- Fail-closed: flag/plan/rol/cupo → 404/403/403/402; respuesta que contradice
  hechos → rechazo; KV ausente → briefing 404.

Esta revisión no equivale a pentest; el modelo Workers AI real queda fuera de CI.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Workers AI real (modelo + latencia) | PENDIENTE / NO-GO | P95 <2s SSE medido en staging con modelo real |
| Cron 3:30 Cloudflare real | PENDIENTE / NO-GO | Briefing en KV real post-rollup |
| R-02 gama baja (1 GB) | HEREDADA | Suite mobile-low-end E2E ya en CI |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Chat/briefing validados por humanos |

## RACI real

| Rol | Estado |
|---|---|
| Staff Data (owner) | Dominio insights, briefing, QG GREEN local |
| Staff Backend ACID | Migración 0041 + insights-repository GREEN local |
| Staff Security | PII-free + tenancy + fail-closed GREEN local |
| Staff SRE | Rutas SSE + cron briefing GREEN local |
| Staff Frontend | Asistente + card briefing + E2E GREEN local |
| Staff QA independiente | PENDIENTE (staging real + R-02 humano) |
| Staff Growth | Claim descongelada con proof points (GTM §4.1) |

## Veredicto

**SOFTWARE-GREEN-CLAIM-LIVE.** El software y el gate automatizado quedan GREEN local y
la claim **“El único POS que viene con un Gerente de Operaciones incluido”** se
descongela conforme al gate del Sprint 49 (Roadmap FASE 6F), con los 3 proof points
de GTM §4.1, el disclaimer “datos del servidor, no en vivo” y la capability
default-off. Producción y piloto siguen NO-GO hasta staging Cloudflare real (Workers
AI, cron 3:30, KV) y firmas A/V independientes. **Con esto cierra la FASE 6F.**
