---
doc_id: ops-s46-forecasting-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 46 — Analítica predictiva — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** GTM-01 descongelado (disclaimer "estimación, no garantía")  
**Estado producción/piloto:** NO-GO hasta cron/staging Cloudflare real + A+V independiente  
**Capability:** `analytics.forecasting`, default-off  
**Spec:** Arquitectura §5.3 regla 31 · ADR-0030 · DAT-12 · Principio 9 · Roadmap FASE 6F

El gate automatizado demuestra el contrato de software en entorno local: forecast
determinista sobre `daily_product_rollups` (D1, exacto), sugerencias al Dueño sin
decisión automática de precio/stock, gating Cadena 403/402 sin tocar arqueo y UI en
Modo Dueño. No existe evidencia de cron o staging/canary Cloudflare real ni QA humana
y aprobación PM con firmas A+V independientes: eso mantiene producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Commit completo | Evidencia |
|---|---|---|---|
| RED contractual | `run-red-s46-forecasting-191e2cb` | `191e2cb5c0f51a814da8de1e826218a35e737dc5` | Contrato de gobernanza: ADR-0030, regla 31, migración/down 0039, fase-6f y flag/cron declarados; dominio, adapters, rutas, cron, UI y tests productivos ausentes |
| GREEN + hardening | `run-green-s46-forecasting-399292d` | `399292d5496e99de8e6d8b8682d52d046a760bae` | Implementación completa local: dominio-analytics, adapters, cron, rutas, catálogo tier, UI Previsiones y E2E; verify SUITE GREEN y umbrales de calidad |

Ancestría verificada:
`191e2cb5c0f51a814da8de1e826218a35e737dc5` →
`399292d5496e99de8e6d8b8682d52d046a760bae` → `HEAD`.

**Expected failure RED:** faltaban migración/down 0039, dominio Holt-Winters y quiebre,
repo D1 idempotente, cron con flag default-off, gating Cadena semántico, catálogo tier,
UI Dueño y E2E offline/flag-off.

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Worker API | 641 tests en 63 archivos |
| Domain analytics | 40 tests en 3 archivos |
| Adapters D1 forecast repo | 6 tests |
| POS web (Sprint 46) | 9 tests unit + E2E forecasting 2/2 |
| Chaos sprints 4–9 | PASS en 6 sprints |
| Benchmark hot path | p95 0.0014 ms, dentro de 50 ms |
| POS bundle | 177.69 kB gzip, dentro del presupuesto CAL-06 |
| Marketing copy | RESULT MARKETING_COPY GREEN |
| Deps audit | 0 vulnerabilidades high/critical |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24) |
| `scripts/quality.sh` | lint, typecheck, integration, build, bundle GREEN; format y unit parciales por WIP ajeno |
| Security Review final | 0 hallazgos medium+ |

El `scripts/quality.sh` completo no termina `Quality Gate OK` únicamente por dos
frentes **ajenos a Sprint 46**, preservados tal cual estaban:

1. `prettier --check` falla solo en `apps/pos-web/src/app.css` (WIP ajeno de estilos
   enterprise del Dueño, sin commitear; se conserva sin formatear).
2. `test:unit` de pos-web falla en 5 tests RED de contratos ajenos
   (`recurring-sales-admin.red.test.ts` 4 y `customer-order-page.red.test.ts` 1) sobre
   páginas del WIP ajeno no implementadas.

Los conteos pertenecen al monorepo en GREEN/HEAD y pueden aumentar con suites
posteriores; no se reducen para presentar un número histórico.

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| DDL 0039 / DAT-12 | `forecast_outputs` con `tenant_id NOT NULL`, FKs compuestas a branches/products, índices tenant-first y down protegido |
| Modelo Holt-Winters | ADR-0030: α=0.5 β=0.1 γ=0.3 period=7, `MIN_SERIES_LENGTH=14`, fallback WMA, `model_version` versionado |
| Quiebre | Umbral de cobertura y lead-time por unidad de base; salida = alertas, nunca acción automática |
| Money | `predicted_gross_cents` INTEGER cents; solo ratios/cantidades en REAL (V-06) |
| Atomicidad/idempotencia | Reescritura `DELETE`+`INSERT` en un `db.batch`; rerun seguro; D1 única calculadora (Principio 9) |
| Gating Cadena | 403 `PLAN_REQUIRES_CADENA` semántico + 402 Plan Guard solo trial/past_due; no toca arqueo |
| Feature flag | `FEATURE_ANALYTICS_FORECASTING` default-off; cron `30 8 * * *` no ejecuta sin flag |
| AE | Solo dashboards muestreados (`emitDashboardSample`), nunca fuente de forecast ni facturación |
| Catálogo tier | Reporte `forecast` solo tier `cadena`; fuera de flag → 404 `USE_FORECASTING_API` |
| UI Dueño | Pestaña Previsiones con badge `model_version`, refresco y disclaimer; cliente usa flag runtime `$env/dynamic/public` |

Tests de trazabilidad que resuelven en el monorepo:

- `packages/domain-analytics/src/forecast.test.ts`, `metrics.test.ts` y `breakage.test.ts`.
- `packages/adapters-d1/src/forecast-repository.test.ts`.
- `apps/worker-api/src/analytics/forecasting-routes.test.ts`,
  `apps/worker-api/src/analytics/forecast-scheduled.test.ts` y
  `apps/worker-api/src/reports/report-routes.test.ts`.
- `apps/pos-web/src/lib/forecasting/forecasting-client.test.ts`,
  `apps/pos-web/src/lib/forecasting/forecast-page.test.ts` y
  `apps/pos-web/tests/e2e/forecasting.spec.ts`.

## E2E local

Playwright verifica 2/2:

1. El workbench Dueño muestra el card de pronóstico activo desde la pestaña Previsiones
   con datos del repositorio D1 (fixtures locales).
2. Con flag de forecast apagado, la vista degrada sin error y el cliente respeta el 404
   `USE_FORECASTING_API` (fail-closed, capability default-off).

Esto verifica navegador local con fixtures; no sustituye QA humana ni staging.

## Security Review

La revisión final del cambio reportó **0 hallazgos medium+**. Toda consulta usa
`.prepare()`+`.bind()` (sin interpolación), los montos viajan en `*_cents` INTEGER, las
tres rutas + el cron checan flag y plan con 403/402, y AE solo recibe dashboards
muestreados. Esta revisión de código no equivale a pentest ni certificación LPDP.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Cron Cloudflare real | PENDIENTE / NO-GO | Observar `30 8 * * *`, dispatch por flag y reescritura idempotente en D1 real |
| Staging/canary | PENDIENTE / NO-GO | Gating 403/402, AE dashboards y rollback en bindings reales |
| QA humana | PENDIENTE / NO-GO | Staff QA valida Previsiones, disclaimer, quiebre y POS ordinario intacto |
| Aprobación PM | PENDIENTE / NO-GO | Staff PM acepta alcance, copy acotado y residuales del WIP ajeno |
| Firma A+V independiente | PENDIENTE / NO-GO | Humanos independientes firman evidencia de staging/canary |

## RACI real

| Rol | Estado |
|---|---|
| Staff Data (owner) | Dominio, repo D1, cron y métricas GREEN local |
| Staff Backend ACID | Atomicidad `db.batch`, idempotencia y gating GREEN local |
| Staff Frontend | Previsiones + degradación flag-off GREEN local |
| Staff Security Review | 0 hallazgos medium+ |
| Staff SRE | Cron dispatch local; staging/canary Cloudflare real pendiente |
| Staff QA independiente | PENDIENTE |
| Staff PM A | PENDIENTE |
| Staff Growth | GTM-01 descongelado con disclaimer; producción/piloto NO-GO |

## Veredicto

**SOFTWARE-GREEN-CLAIM-LIVE.** El software y gate automatizado quedan GREEN local y la
claim **GTM-01 "analítica predictiva" de Cadena se descongela** conforme al gate del
Sprint 46 (Roadmap FASE 6F), siempre con disclaimer "estimación, no garantía", sin
decisión automática de precio/stock y con la capability default-off. Producción y
piloto siguen NO-GO hasta cron/staging Cloudflare real, QA humana, aprobación PM y
firmas A+V independientes. Los 5 tests RED de contratos ajenos y el format de
`app.css` son WIP no commiteado ajeno a este sprint y se preservan sin modificar.
