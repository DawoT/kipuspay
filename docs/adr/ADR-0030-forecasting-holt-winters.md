---
doc_id: adr-0030-forecasting-holt-winters
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0030 — Forecasting determinista con Holt-Winters sobre D1 y gating Cadena

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-09 |
| Decisores | Staff Principal · Staff Data · Staff Backend ACID · Staff PM |
| Consultados | Staff Security · Staff Frontend · Staff SRE · Staff QA |
| Informados | Staff Growth · Staff Support |
| Relaciona | Arquitectura §5.3 regla 31 · Roadmap FASE 6F Sprint 46 · PERF-11 · DAT-12 · GTM-01 |

## Contexto

La regla 31 definía el qué (forecast sobre `daily_product_rollups`, sugerencias,
nunca decisiones automáticas, gated a Cadena) pero no el cómo: no fijaba el algoritmo,
dejaba ambiguo el rol de Analytics Engine frente al Principio 9 (D1 es la única
calculadora), y pedía "plan inferior = 402", código que contradice el patrón ya
corregido en Sprint 23 (las capabilities tier-Cadena responden 403
`PLAN_REQUIRES_CADENA` semántico, no 402). Ese 402 solo corresponde al Plan Guard por
trial/past_due en features premium. Sin algoritmo ni métricas de precisión
deterministas, el descongelado del claim GTM-01 no tendría evidencia reproducible.

## Decisión

1. **Algoritmo:** triple exponential smoothing (**Holt-Winters**) en TS puro, sin
   dependencias npm runtime (invariante 10), determinista y reproducible. Parámetros
   α (nivel), β (tendencia), γ (estacionalidad) y período estacional de 7 días con
   valores por defecto calibrados; series con historial insuficiente usan fallback a
   media móvil ponderada y se marcan con `model_version` distinto. La salida son
   sugerencias (reposición, alerta de quiebre) — **jamás** acciones automáticas de
   precio/stock.
2. **D1 es la única calculadora (Principio 9).** El entrenamiento y el forecast se
   computan sobre `daily_product_rollups` (D1, exacto). **Analytics Engine queda como
   features de dashboards** (`writeDataPoint` con `analytics_engine` binding en el
   Worker API), muestreado y nunca fuente de forecast ni de facturación — coherente
   con §4.1 y §9.
3. **Persistencia versionada:** `forecast_outputs` (migración 0039) con `model_version`,
   UNIQUE `(tenant_id, branch_id, product_id, forecast_date)` e idempotencia por
   `DELETE`+`INSERT` dentro de un `db.batch([...])` (D1, invariante 2). El cron de
   rollups (`0 8 * * *`) no re-materializa `forecast_outputs` en el edge D tardío
   (PERF-11 los excluye explícitamente); el forecast se regenera en su propio ciclo
   sin mutar `daily_product_rollups`, `sale_items`, `inventory_movements` ni PMP.
4. **Métricas:** MAPE de holdout publicado por `(branch, product, model_version)` en
   la API y en el QG. Modelo sin datos suficientes reporta `insufficient_data` en vez
   de inventar series.
5. **Gating:** la ruta `/api/forecasting/` se registra en `PREMIUM_PREFIXES` (Plan
   Guard → **402** solo por trial vencido/past_due) **y** exige plan Cadena/Enterprise
   con **403 `PLAN_REQUIRES_CADENA`** (helper `assertCadenaPlusPlan` extraído de
   integrations a `auth/plan-cadena.ts` para no duplicarlo). El arqueo y el cobro
   nunca se tocan. La phase 6f se corrige de "402" a "403 + 402".
6. **UI Dueño:** vista de pronóstico con tarjetas por producto/sucursal, alertas de
   quiebre, badge `model_version`, MAPE y **disclaimer "Estimación, no garantía"**.
   La capability es default-off (`FEATURE_ANALYTICS_FORECASTING`).
7. Sprint 46 inicia con gobernanza y contrato RED; migración, dominio, adapters, cron,
   rutas, UI, chaos y cierre se implementan en un ciclo GREEN posterior.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Naive estacional + tendencia lineal | Determinista y simple pero MAPE peor en series con doble estacionalidad; el claim "analítica predictiva" quedaría débil |
| Naive simple + estacional | Mínimo viable, MAPE pobre; insuficiente para descongelar GTM-01 con evidencia |
| Modelo sobre Analytics Engine | AE es muestreado y violaría Principio 9: la calculadora autoritativa es D1 |
| 402 literal para plan inferior | Contradice el patrón tier-Cadena corregido en S23 (403 `PLAN_REQUIRES_CADENA`) |
| Sin binding AE | Correcto para la fuente, pero la fase pedía features AE; se integra solo para dashboards, sin coste en hot path |

## Consecuencias

- **Gana:** claim GTM-01 descongelable tras el gate con MAPE reproducible; modelo
  determinista y auditable (`model_version`), sin deps externas; gating coherente con
  integrations/loyalty; AE nunca compromete el forecast ni la facturación.
- **Paga:** Holt-Winters necesita historial suficiente (~4 períodos estacionales); las
  series cortas quedan en fallback explícito. El cron añade cómputo periódico que debe
  mantenerse dentro del presupuesto P95 (fuera del hot path de cobro).
- **Invariantes tocadas:** dinero en `INTEGER cents` (`predicted_gross_cents`);
  atomicidad `db.batch`; capability por flag sin fork vertical; D1 calculadora única.
