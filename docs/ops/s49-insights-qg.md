---
doc_id: ops-s49-insights-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 49 — Inteligencia del negocio (analytics.agentic_insights) — Quality Gate

**Estado software:** GREEN local + canary técnico Workers AI staging
**Estado claim vigente:** GTM-10 CONGELADO; “Gerente de Operaciones” no es claim público disponible. Solo roadmap Sprint 49 hasta respuesta útil con facts no triviales, SLO general, Cron/KV, QA y firmas A+V.
**Capability:** `analytics.agentic_insights`, default-off (`FEATURE_ANALYTICS_AGENTIC_INSIGHTS`)  
**Spec:** Arquitectura §5.3 regla 33 · PERF-12 · Roadmap FASE 6F

El gate automatizado demuestra el contrato en entorno local: pipeline determinista
(router whitelist → SQL estricto LIMIT 50 → D1 en sesión réplica → facts PII-free →
NLG verbatim + post-check anti-alucinación → SSE), Morning Briefing determinista
cacheador en KV con banner de antigüedad, idempotencia del chat (edge B) y edge D
(invalidación de briefing en re-materialización de rollup). El LLM se inyecta vía
port `AiGateway`; local/CI usa gateway determinista y staging usa Workers AI por
binding con `@cf/meta/llama-3.1-8b-instruct-fp8`. El canary staging verificó tanto
la respuesta determinista sin datos como el rechazo fail-closed de una respuesta
que contradice hechos. El Cron 3:30/KV, la latencia objetivo y la QA humana siguen
pendientes: producción y piloto NO-GO.

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
| Adapters D1 workerd | **220 tests GREEN** (migración 0041 + insights-repository 5 + regresión) |
| Worker API | **688 tests GREEN** (AiGateway 3, insights-routes 6, briefing 3, worker-scheduled 7 + regresión) |
| POS web unit | **168 tests GREEN** (client 3, contrato 4 + regresión) |
| POS web E2E | **28/28 GREEN** (incluye insights 2/2) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24) |
| Migración 0041 | insight_log (UNIQUE idem, CHECKs, triggers de epoch) + ai_usage_counters (cupo); registry backup: BUSINESS/EPHEMERAL; down protegido |

### Actualización de evidencia vigente — 2026-09-17

La tabla anterior conserva los conteos del cierre original del Sprint 49. La
regresión vigente posterior a los cambios de SQL e intención pasó **70/70** en
`domain-analytics`, **5/5** consultas contra D1 Workerd en
`insights-repository.integration.test.ts`, y **1,592 tests en 120 archivos** en
la suite unitaria del Worker API. El Quality Gate completo terminó `Quality Gate
OK`; estos conteos no sustituyen las condiciones externas que siguen en la tabla
de evidencia pendiente.

## Evidencia staging — Workers AI y anti-alucinación 2026-09-17

El tenant Cadena sintético `tenant_stg_cadena_001` pasó gating y ejecutó el chat
contra el modelo real configurado en staging. Con facts vacíos o todo-cero, el
endpoint devolvió **200 SSE** con `No hay datos suficientes para responder esta
pregunta todavía.` sin invocar generación. Con facts con ventas, una salida del
modelo que introdujo cifras no sustentadas fue rechazada **422
INSIGHTS_FAILED**, registrada como `NLG_CONTRADICTION`, sin exponer el texto
contradictorio. En la versión staging anterior `a974c70a-6838-428a-a911-c7fe5b47c69d`,
el fast path local para preguntas frecuentes evitaba la llamada de router, pero
el request de redacción aún observó aproximadamente **4.9 s**. Después se
desplegó `aeed1d31-2e75-4d98-bc95-4a85248df082`, cuyo fast path evita también la
redacción Workers AI y construye la respuesta desde facts ya validados (prueba
local 15/15). El canary autenticado post-deploy
`f3136f1b-3e6d-4054-91be-113c45ffc80e`, con 5 solicitudes y replay sobre
`tenant_stg_cadena_001`, observó **p50=2.117 s, p95=3.771 s, máximo=3.771 s,
replay=0.718 s y `replaySse=true`**. Esta medición quedó histórica. Tras
instrumentar las etapas del request y optimizar persistencia, el deploy
`4858f2a3-81f9-479b-96cc-e7dcbba17e32` registró 10 solicitudes autenticadas de
fast path sobre el tenant sintético: **p50=818 ms, p95=1.417 s, máximo=1.417 s,
replay=261 ms y `replaySse=true`**. P95 por etapa (ms): capability 52, plan 52,
cache 144, quota 54, router 0, query 52, generate 0, metering 224, persist
total 382 (D1 193, KV 382), total instrumentado 744. Es una medición acotada al
fast path, no una prueba del SLO de generación Workers AI. Un intento separado
con “Resume el rendimiento comercial reciente” devolvió HTTP 422; por tanto no
hay latencia generativa válida ni evidencia de respuesta útil con facts no
triviales. No atribuir el 422 a una causa concreta sin correlacionar su
`errorRef` con el log seguro de staging. Fast path bajo 2 s queda medido; el SLO
general permanece PARCIAL / NO-GO. Cron 3:30/KV, QA humana y A/V continúan NO-GO.

## Cobertura contractual (edges de la spec)

| Contrato | Evidencia local |
|---|---|
| Edge A (LIMIT 50 / 0 OOM) | `buildInsightSelect` inyecta `LIMIT 50` forzoso; acciones de detalle → `TOO_WIDE` con copy “descarga el Excel” |
| Intenciones soportadas | `SALES_SUMMARY`, `TOP_PRODUCTS`, `BREAKAGE`, `CASH_EXCEPTIONS` y `AGING` seleccionan fuentes whitelist distintas (`daily_financial_rollups`, `daily_product_rollups`, `branch_product_stock`, `accounts_receivable`); prueba de contrato 6/6 |
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
- `insights-repository.integration.test.ts` ejecuta las cinco consultas de
  intención contra D1 Workerd real y confirma que el schema responde sin error.
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

### Runner reproducible de canary

`apps/worker-api/scripts/staging-insights-canary.mjs` ejecuta requests
autenticados contra staging usando únicamente `STAGING_INSIGHTS_TOKEN` (fuera
del repositorio) y `STAGING_INSIGHTS_TENANT_ID`, mide p50/p95/máximo, valida `text/event-stream`, rechaza
`INSIGHTS_FAILED` y comprueba replay KV con la misma llave. Ejemplo:

```bash
STAGING_INSIGHTS_TOKEN='(secreto fuera de repo)' \
STAGING_INSIGHTS_TENANT_ID='(tenant del fixture)' \
  pnpm --filter @kipuspay/worker-api run canary:insights
```

El runner envía `x-tenant-id` explícito para no confundir el subdominio staging
con un tenant. Nunca imprime el token ni el texto de respuesta; sin token o
tenant termina con código 2. El resultado se considera evidencia solo si el JSON reporta
`sloP95Under2s: true` y la revisión QA/A+V conserva el artefacto.

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Workers AI real (modelo + latencia) | PARCIAL / NO-GO | Fast path: 10 muestras, P95 1.417 s y replay SSE confirmado. Ruta generativa con facts no triviales aún no validada: una pregunta devolvió HTTP 422; resolver correlación y repetir hasta respuesta válida <2 s |
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
| Staff Growth | GTM-10 CONGELADO; solo roadmap hasta completar evidencias externas y firmas A+V |

## Veredicto

**SOFTWARE-GREEN-CANARY-PARCIAL.** El software y el gate automatizado quedan GREEN
local; el canary staging cubre binding real, no-data, fast path bajo 2 s y
fail-closed NLG, pero no una respuesta generativa válida con facts no triviales. La claim
**“El único POS que viene con un Gerente de Operaciones incluido”** permanece
bloqueada para producción/piloto hasta completar P95 <2 s, briefing Cron 3:30/KV,
QA humana y firmas A/V independientes. La FASE 6F no se declara cerrada.
