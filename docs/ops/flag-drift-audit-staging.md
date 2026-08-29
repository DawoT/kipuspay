---
doc_id: ops-flag-drift-audit-staging
alias: "—"
authority: derivada
owner: "@DawoT"
---

# Auditoría de deriva de flags/vars — staging (2026-08-22)

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-22 |
| Ejecutada por | Kipus SRE (supervisado por Staff Principal) |
| Disparador | Incidente 2026-08-22: deploys a staging pisaban vars runtime (`FEATURE_DATA_BACKUP` / `FEATURE_PLATFORM_DR` / `FEATURE_REPORTING_ROLLUPS` en `"0"` en config mientras runtime tenía `"1"`) |
| Alcance | `apps/worker-api/wrangler.jsonc` (top-level y `env.staging`), `apps/marketing-web/wrangler.jsonc`, `apps/pos-web/wrangler.jsonc` |
| Fuentes de intención runtime | `docs/ops/staging-bootstrap.md`, `docs/ops/go-live-staging-checklist.md`, `docs/ops/pending-batches.yaml` |

## Contexto

El deploy de `worker-api` reseteaba las vars runtime con los literales del repo
(`"0"`/`""`) sobre valores reales de staging (`"1"`/key pública). Dos defensas
quedaron establecidas hoy:

1. `deploy:staging` usa `wrangler deploy --env staging --keep-vars`
   (`apps/worker-api/package.json`, ledger 0453) para no pisar vars runtime.
2. El cierre del gap `stg-s48-dr-sim` del tracker (commit `13c7e0b`) fijó en
   `env.staging` los tres flags cuya intención runtime estaba documentada:
   `FEATURE_DATA_BACKUP=1`, `FEATURE_PLATFORM_DR=1`,
   `FEATURE_REPORTING_ROLLUPS=1`. Así, un deploy sin `--keep-vars` ya no
   apaga la evidencia S42/S48.

Esta auditoría inventaría TODAS las vars de los tres configs, cruza contra la
intención documentada y deja trazabilidad del estado resultante.

## Método

Categorías por var (scope staging salvo indicación):

| Categoría | Definición |
| --- | --- |
| ALIGNED | Config == intención documentada; nada que hacer. |
| FIXED | Era DRIFT-RISK y se corrigió en config el 2026-08-22 (commit `13c7e0b`, cierre `stg-s48-dr-sim`). Esta auditoría valida el fix; no introduce cambios adicionales. |
| DRIFT-RISK | Config pisa intención runtime documentada y NO se corrige en config (el valor real no puede vivir en git); mitigación procedimental vigente. |
| INTENTIONAL-OFF | `"0"`/placeholder deliberado en repo (soft-launch o fail-closed); flip solo runtime con A+V. |

Nota doctrinal: `docs/ops/go-live-staging-checklist.md` en su sección Flags
runtime aún dice «Nunca commitear `FEATURE_*=1` en wrangler.jsonc». Esa regla
quedó matizada hoy por el cierre `stg-s48-dr-sim` para los tres flags de
backup/DR/rollups en `env.staging`; el enforcement mecánico es
`apps/worker-api/test/feature-flags-staging-nogate.test.ts`, cuya lista
`liveSensitive` NO incluye esos tres flags (verificado: el test exige `"0"`
para fiscal/LPDP/analytics/KDS/offline/billing y pasa con el estado actual).
Pendiente del supervisor: actualizar la redacción del checklist o ratificarla
como aplicable solo a flags de claims live (fuera del alcance de esta
auditoría).

## worker-api — env.staging (75 vars)

Resumen: 5 ALIGNED + 4 FIXED + 66 INTENTIONAL-OFF = 75 vars. DRIFT-RISK: 0.
Addendum 2026-08-23 (d83b5aa): PUSH_VAPID_PUBLIC_KEY migra de DRIFT-RISK→FIXED (v4).

### Filas con estado no trivial

| Var | top-level | env.staging | Estado | Fuente de intención / justificación |
| --- | --- | --- | --- | --- |
| `FEATURE_DATA_BACKUP` | `"0"` | `"1"` | FIXED | Runtime `=1` documentado en bootstrap (auditorías 2026-08-17 y 2026-08-20; gap `stg-flags-s42-s48`). Corregido hoy en commit `13c7e0b`. Top-level permanece `"0"` (dev local). |
| `FEATURE_PLATFORM_DR` | `"0"` | `"1"` | FIXED | Ídem: gap `stg-flags-s42-s48` + bootstrap. Corregido hoy en commit `13c7e0b`. |
| `FEATURE_REPORTING_ROLLUPS` | `"0"` | `"1"` | FIXED | Intención documentada en el tracker (`stg-s48-dr-sim`: rollups necesarios para el RPO de rollups en DR) + staff trigger break-glass (ledger 0460). Corregido hoy en commit `13c7e0b`. |
| `PUSH_VAPID_PUBLIC_KEY` | `""` | `"BKIPWeAjjzcKM9C_dl2-EqC-5vVPt93xyB06pkn7GfbLcDzfpZNsj6sLakEyDl8bGaVjC_kZdC8a2BUnNd4uabs"` (87c, B*) | FIXED (2026-08-23) | VAPID v4 rotación ciega (d83b5aa). Config staging ahora porta la pública idéntica al binding push-vapid-public-v4 (Secrets Store 6c5d2aff…). Supera invariante 9 (una sola fuente criptográfica, panel Firebase vacío Flujo B §5.12.3). Deploys ya no la pisan; --keep-vars queda como defensa secundaria. Rollback: v3 intacta en store. |
| `FQDN` | URL dev local | URL workers.dev staging | ALIGNED | Bootstrap sección URLs (canónico temporal D0). |
| `POS_APP_ORIGIN` | (no existe) | POS pages.dev | ALIGNED | Bootstrap sección URLs + nogate test D0 (exige pages.dev; prohíbe app.kipuspay.com sin dominio comprado). |
| `ALLOWED_ORIGINS` | localhost dev (puertos 4173/5173/5174) | pages.dev POS + marketing | ALIGNED | Bootstrap sección CORS. |
| `KDS_BROADCAST_TOKEN` | literal dev | literal staging | ALIGNED | Placeholder de repo para broadcast KDS; DESCONOCIDO si existe override runtime. Revisar antes de producción. |
| `AI_MODEL` | llama-3.1-8b-instruct | igual | ALIGNED | Sin intención distinta documentada. |
| `FISCAL_PSE_ENDPOINT_URL` | (no existe) | pse.kipuspay.staging.invalid | INTENTIONAL-OFF | Fail-closed deliberado (tracker gap `sunat-pse-ose`: isAccreditedPseEndpoint rechaza .invalid) hasta URL PSE real de A. |
| `RECURRING_MANUAL_RUN_ENABLED` | `"0"` | `"0"` | INTENTIONAL-OFF | Sin intención runtime documentada; s44 sigue blocked en tracker. |
| Resto de `FEATURE_*` en `"0"` (64 vars) | `"0"` | `"0"` | INTENTIONAL-OFF | Doctrina repo-0: flips solo runtime con A+V (checklist Flags runtime; nogate test). Listado completo abajo. |

### Inventario completo de INTENTIONAL-OFF (66)

64 flags `FEATURE_*` en `"0"`: ACID_OFFLINE_SALE, FISCAL_CPE, FISCAL_RC,
FISCAL_CIRCUIT_BREAKER, FISCAL_TRANSPORT_PLUGINS, BILLING_USAGE_OVERAGE,
CPE_PORTAL, OFFLINE_SYNC, POS_CHECKOUT, PRINT_TEMPLATES, VITRINA,
LEDGER_AR_AP, PURCHASING_ORDERS, CASH_EXPENSES, CASH_BLIND_Z, ORDERS_KDS,
STOCK_TRANSFERS, PURCHASING_PARTIAL_RECEIVE, INVENTORY_BATCHES,
INVENTORY_BOM, PRICING_LISTS, OWNER_MODE, OWNER_PUSH, REPORTING_CATALOG,
REPORTING_EXPORT, SALES_RETURNS, PURCHASING_THREE_WAY, PRICING_PROMOTIONS,
CATALOG_VARIANTS, CATALOG_UOM, SALES_LAYAWAY, LEDGER_CHART_OF_ACCOUNTS,
INTEGRATIONS_API, ACCOUNTING_EXPORT, CATALOG_IMPORT, SALES_QUOTES,
PURCHASING_RETURNS, LEDGER_STORE_CREDIT, SALES_INSTALLMENTS,
SALES_COMMISSIONS, INVENTORY_LOCATIONS, INVENTORY_SERIALS, INVENTORY_SCALE,
CATALOG_PRICE_LABELS, CATALOG_SELLABLE, ANALYTICS_AGENTIC_INSIGHTS,
ANALYTICS_FORECASTING, CATALOG_QUICK_ADD, SHIFT_HANDOFF, TEAM_INVITE,
ONBOARDING_TOUR, SALES_DEBIT_NOTE, GRE, FISCAL_WITHHOLDINGS, SALE_TIP,
CASH_DRAWER, HARDWARE_DIAGNOSTICS, ORDERS_CUSTOMER_ORDERS, SALES_RECURRING,
MOBILE_PUSH, CLIENT_MOBILE_POS, PAYMENTS_CARD_ACQUIRER, PAYMENTS_QR_WALLETS,
LPDP. Más `RECURRING_MANUAL_RUN_ENABLED="0"` y `FISCAL_PSE_ENDPOINT_URL`
(.invalid, fail-closed).

### Cambios aplicados en esta auditoría

Ninguno adicional. Los tres únicos DRIFT-RISK corregibles ya habían sido
corregidos hoy dentro del propio ciclo `stg-s48-dr-sim` (commit `13c7e0b`,
antes de esta auditoría): esta matriz los valida como FIXED con su
justificación.

## Addendum 2026-08-23 — post-d83b5aa VAPID v4 (Flujo B §5.12.3)

**Autor:** Kipus SRE (supervisado Staff Principal) — **Ref:** `d83b5aa` `ops(push): VAPID v4 rotación ciega + Flujo B` + `staff-ledger 0012` + `Secrets Store 6c5d2aff` `5ea02dc3/c7d5ef90` v4 + `apps/worker-api/wrangler.jsonc` L360 + `apps/worker-kms/wrangler.jsonc` L112-121.

Verificado: `PUSH_VAPID_PUBLIC_KEY` staging `BKIPWeAjjzcKM9C_dl2-EqC-5vVPt93xyB06pkn7GfbLcDzfpZNsj6sLakEyDl8bGaVjC_kZdC8a2BUnNd4uabs` (87c, B*) idéntica a `push-vapid-public-v4` store + material `tmp-staff/vapid-v4.json` JWK (triple-string 0012). `FEATURE_OWNER_PUSH/MOBILE_PUSH` staging `1` (Flujo B) coherentes. `--keep-vars` (V-31) ya no es única defensa para VAPID; es defensa en profundidad anti-deriva genérica (OLA C4). Rollback: v3 intacta en store; para revertir, `secret_name` → `v3` + `PUSH_VAPID_PUBLIC_KEY=""` + redeploy kms→api. Resumen actualizado: `5 ALIGNED +4 FIXED +66 INTENTIONAL-OFF =75` (DRIFT-RISK 0). Observación ①: `OWNER_PUSH/MOBILE_PUSH=1` en staging no rompe conteo 66 (top-level sigue `0`, staging coherente por Flujo B).

## marketing-web (Pages) — 2 vars

| Var | Valor | Estado | Justificación |
| --- | --- | --- | --- |
| `PUBLIC_FEATURE_MARKETING_SITE` | `"0"` | INTENTIONAL-OFF | Soft-launch explícito (bootstrap Secrets/flags: «intencional»; checklist Fase 2 ítem 14: activar solo en build Pages al abrir piloto). |
| `PUBLIC_POS_ORIGIN` | POS pages.dev | ALIGNED | Bootstrap canónico temporal D0. |

Sin cambios.

## pos-web (Pages) — 5 vars

| Var | Valor | Estado | Justificación |
| --- | --- | --- | --- |
| `PUBLIC_API_BASE` | API workers.dev staging | ALIGNED | Bootstrap URLs; override en build vía deploy staging (comentario del propio archivo). |
| `PUBLIC_FEATURE_POS_CHECKOUT` | `"1"` | ALIGNED | Piloto Pages declarado en el comentario del propio config («git-declared for staging project only; Workers FEATURE_* stay 0»). Sin puntero en docs externas. |
| `PUBLIC_FEATURE_CATALOG_SELLABLE` | `"1"` | ALIGNED | Ídem. |
| `PUBLIC_FEATURE_OWNER_MODE` | `"1"` | ALIGNED | Ídem. |
| `PUBLIC_FEATURE_FISCAL_RC` | `"1"` | ALIGNED | Ídem. Coherente con e-beta ACCEPTED del piloto Rosa Negra (ledger 0459–0460); el flag Workers homónimo sigue `"0"` y lo vigila el nogate test. |

Hallazgo menor: los cuatro flags PUBLIC del piloto POS no están referenciados
desde docs operativas; su única declaración es el comentario del
`wrangler.jsonc`. Si el supervisor quiere paridad documental, añadirlos al
checklist (fuera de alcance aquí).

## Auditoría de cierre — entradas de ledger 0452–0460

Preparación del cierre: verificación mecánica por entrada. NO se escribió nada
en `docs/LEDGER.md`; el cierre y las firmas A+V son acto del supervisor.

Verificaciones por entrada: (a) cada `test_id` que no sea token de gate
(`SUITE`, `V-NN`) resuelve a un archivo de test existente en el monorepo
(verificado con `ls` el 2026-08-22); (b) `red_run_id` y `green_run_id`
presentes; (c) evidencia coherente con `docs/ops/pending-batches.yaml`.

| Entrada | test_ids resuelven | red/green run_id | Coherente con tracker | Veredicto propuesto |
| --- | --- | --- | --- | --- |
| 0452 | Sí: `apps/worker-api/src/backup/dr-routes.test.ts` (1/1 archivo; resto tokens gate) | Sí (`run-red/green-phase0-phase1-staging`) | Sí: fase-0 CERRADO + handoff_fase_0 nota coincide (secrets/VAPID/tenant GREEN, CI RED prettier ubl); flags runtime «sin commit» era cierto al timestamp | CERRAR-TAL-CUAL |
| 0453 | Sin archivos declarados (solo SUITE, V-13, V-18) | Sí (`run-red/green-phase0-followup-keepvars`) | Sí: `stg-ci-etapas-6-run` registra el bloqueo OAuth; `--keep-vars` verificable hoy en `apps/worker-api/package.json` | CERRAR-TAL-CUAL |
| 0454 | Sí: pkcs12, pkcs12-fail, tenant-cert-upload-routes, select-transport, tenant-certificates-schema, pos-checkout (6/6) | Sí (`run-red/green-staff-fiscal-s6-s10`) | Sí: gaps `sunat-xades-pfx` (UI p12 lista), `sunat-pse-ose` (S8 WAIT), `sunat-t6-efactura` (S9 WAIT); ADR-FISCAL-007 y runbook CDT existen | CERRAR-TAL-CUAL |
| 0455 | Sin archivos declarados (SUITE, V-08, V-13, V-15) | Sí (`run-red/green-v08-adr-fiscal-006-007`) | N/A coherente: el registry no se trackea en el yaml; ADR-FISCAL-006/007 existen | CERRAR-TAL-CUAL |
| 0456 | Sí: backup-restore-validator, dr-routes, select-transport, worker-fiscal index, feature-flags-staging-nogate, tenant-certificates-schema (6/6) | Sí (`run-red/green-staff-golive-f1-f4`) | Sí: gap `stg-s48-dr-sim` cita textual registry-2 / BACKUP_REGISTRY_STALE / migrar 0056 | CERRAR-TAL-CUAL |
| 0457 | Sí: app-origin, checkout-routes, configuracion-api, features, feature-flags-staging-nogate (5/5) | Sí (`run-red/green-d0-pages-canonical`) | Sí: gap `stg-domains-canary` D0 pages.dev/workers.dev; config actual contiene POS_APP_ORIGIN pages.dev | CERRAR-TAL-CUAL |
| 0458 | Sí: select-transport, fiscal-drain, fiscal-non-sale-drain, fiscal-error, ubl-despatch, fiscal-non-sale-outbox-schema, sunat-status-label, nogate (8/8) | Sí (`run-red/green-fl-failclosed`) | Sí: gap `sunat-pse-ose` cita ADR-FISCAL-008 MISCONFIGURED 503; ADR y QG fl-fiscal-live existen; migración 0058 aplicada según progress del tracker | CERRAR-TAL-CUAL |
| 0459 | Sí: ubl-invoice, ubl-credit-note, ubl-debit-note, staff-cdr-report (4/4) | Sí (`run-red/green-piloto-ebeta-f001-12`) | Sí: gap `sunat-e-beta-loop` registra F001-12 ACCEPTED y prohibición de reenvío; `scripts/staff/send-beta-cpe.mjs` existe | CERRAR-TAL-CUAL |
| 0460 | Sí: ubl-credit-note, ubl-debit-note, ubl-invoice, fiscal-xml-producer (4/4) | Sí (`run-red-nc-07-ebeta-ubl` / `run-green-nc-07-ebeta-fc01-11-13`) | Sí: gap `sunat-e-beta-loop` registra FC01-11 (anula F001-9) y FC01-13 (anula F001-12), sin reuso de FC01-3..10 ni FC01-12; `scripts/staff/sign-only-cpe.mjs` y seed SQL existen | CERRAR-TAL-CUAL |

### Observaciones para el supervisor

- Las nueve entradas están `estado_gov: EN REVISION` con firmas A/V
  pendientes: el «cierre» propuesto es mecánicamente limpio, pero las firmas
  A+V son el acto habilitante (Proceso §8.1).
- Todas declaran `red_commit_sha`/`green_commit_sha` como N/A: V-20 las
  clasifica como no-código (solo exige contrato TDD completo cuando hay SHA
  real) y por eso la suite pasa. Si el supervisor quiere trazabilidad CAL-07
  estricta para 0454–0460 (entradas con código y tests asociados), el camino
  canónico sería una entrada CORRIGE con los SHAs — decisión del supervisor,
  no de este runbook.
- Coherencia temporal: 0452 (2026-08-20) dice CI dry_run RED por prettier
  ubl; el cierre de `stg-ci-etapas-6-run` (2026-08-22, run 32599644683 GREEN)
  lo cierra después. Sin contradicción (append-only).
