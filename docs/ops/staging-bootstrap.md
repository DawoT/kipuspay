---
doc_id: ops-staging-bootstrap
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Staging Cloudflare — bootstrap (smoke)

**Estado:** plano staging **UP** (smoke mínimo). `go-live-staging` en
`pending-batches.yaml` está **EN_CURSO** (no CERRADO): falta evidencia externa
s41–s49 (R2 multipart, Workflow crash/replay, DR_SIMULATION real, cron/canary
A+V). Checklist implementador: `docs/ops/go-live-staging-checklist.md`.

Cuenta: `c5b18f62cb7e73fcd2ece5822936d699` (cristian.pcalderon@gmail.com).

## URLs (smoke 2026-08-17)

| Superficie | URL |
|---|---|
| API | https://kipuspay-worker-api-staging.cristian-pcalderon.workers.dev |
| Health | https://kipuspay-worker-api-staging.cristian-pcalderon.workers.dev/health → `{"status":"ok"}` |
| Fiscal | https://kipuspay-worker-fiscal-staging.cristian-pcalderon.workers.dev |
| KMS | https://kipuspay-worker-kms-staging.cristian-pcalderon.workers.dev (404 RPC-only) |
| POS Pages | https://kipuspay-app.pages.dev |
| Marketing Pages | https://kipuspay-web.pages.dev |
| Browser smoke | `apps/pos-web/scripts/staging-browser-smoke.mjs` (Playwright) |

Smoke navegador (2026-09-16 Lima): marketing 200 (sitio activo), POS shell login
visible, `fetch(/health)` desde origen POS con CORS OK.

**Canónico temporal (D0, sin dominio comprado):** esas URLs `*.pages.dev` /
`*.workers.dev` son el piloto. No configurar `kipuspay.com` / `app.` / `api.`
hasta sprint **DM** (compra + zona Cloudflare). Stripe return URLs usan
`location.origin` (POS) y `POS_APP_ORIGIN` (API). Marketing staging:
`PUBLIC_POS_ORIGIN` = POS pages.dev.

## Recursos creados

| Tipo | Nombre / ID |
|---|---|
| D1 | `kipuspay-staging` `f23d7b8b-be71-483b-9489-2c7c4ebd73df` |
| D1 DR | `kipuspay-dr-staging` `d224d651-369c-4e8a-ba5a-dcbc46440451` |
| KV | `kipuspay-tenant-kv-staging` `2810a54505764909900a242755d8c660` |
| KV | `kipuspay-fiscal-breaker-kv-staging` `03383ac3ee4646bb961bdfd4c9eb147b` |
| R2 | `kipuspay-backups-staging` |
| R2 | `kipuspay-fiscal-xml-staging` |
| Secrets Store | `kipuspay-kms-staging` `6c5d2aff785644d39ca233efe0d0ed34` (stubs) |
| Workflow | `kipuspay-data-backup-staging` (bound on API) |

Migraciones D1: `DB` y `DR_DB` en paridad **68/68** (`0000`–`0068`, revalidado
2026-09-17). Si un `wrangler d1 migrations apply` batch falla con
`incomplete input`, aplicar **one-by-one** en el orden de
`packages/adapters-d1/migrations/*.sql`. Scripts:

```bash
pnpm --filter @kipuspay/worker-api run d1:migrate:staging:list
pnpm --filter @kipuspay/worker-api run d1:migrate:staging
pnpm --filter @kipuspay/worker-api run d1:migrate:staging:dr
```

## Deploy commands

```bash
pnpm --filter @kipuspay/worker-kms run deploy:staging
pnpm --filter @kipuspay/worker-api run deploy:staging
pnpm --filter @kipuspay/worker-fiscal run deploy:staging
pnpm --filter @kipuspay/pos-web run deploy:staging
pnpm --filter @kipuspay/marketing-web run deploy:staging
```

Workers: `wrangler deploy --env staging --keep-vars` (anti-deriva, OLA C4). Fronts: `wrangler pages deploy` a
proyectos `*-staging` (Pages no admite `env.staging`; solo preview/production).

`env.staging` declara `triggers.crons` explícitos (mismas 6 expresiones que el
top-level). Tras cambiar triggers, **redeploy** API staging y verificar en
dashboard.

## CI/CD — Etapa 6 (deploy a staging)

El workflow `.github/workflows/deploy-staging.yml` (disparo **manual** vía
`workflow_dispatch`, `Proceso §5.2` Etapa 6, `Arquitectura §13.7`, check V-31):

1. **Gate** (`jobs.gate`): corre Etapas 0–5 sin saltos — gate documental
   `scripts/verify.sh` (V-00..V-31), lint/typecheck, unit con umbrales CAL-05,
   integración D1, audit de dependencias, build + bundle POS (CAL-06).
2. **Deploy** (`jobs.deploy`, `needs: gate`): despliega en orden §13.7 —
   workers `worker-kms` → `worker-api` → `worker-fiscal` y luego Pages
   `pos-web` → `marketing-web` — usando los `deploy:staging` del monorepo.
3. **Evidencia**: sube como artifact `deploy-staging-evidence` los logs de
   cada deploy, la versión de wrangler y el smoke de staging
   (`staging-browser-smoke.mjs`). Input opcional `dry_run: true` valida las
   Etapas 0–5 sin desplegar.

**Secretos requeridos** (GitHub Actions → repo): `CLOUDFLARE_API_TOKEN`
(wrangler, permisos Workers/Pages del account `c5b18f62cb7e73fcd2ece5822936d699`)
y `CLOUDFLARE_ACCOUNT_ID`. Sin ellos el job `deploy` falla; el job `gate` no los
necesita.

**Importante (Fase 0 subagente):** el secret GH no debe ser un token OAuth de
`wrangler login` (caduca en horas). Usar un **API Token** de Cloudflare de larga
duración con Workers/Pages/D1/R2/Secrets Store. El token cargado el 2026-08-20
via OAuth caducaba ~23:47Z — **reemplazar antes** del próximo `deploy` real.

**VAPID / flags runtime:** `apps/worker-*` `deploy:staging` usan `--keep-vars` (todos, incluido `worker-kms` — OLA C4 anti-deriva)
para no pisar `PUSH_VAPID_PUBLIC_KEY`/`KEK` ni `FEATURE_*` runtime con los `""`/`"0"`
del repo. Si se despliega a mano sin `--keep-vars`, re-pasar
`--var PUSH_VAPID_PUBLIC_KEY:…` (y los FEATURE de evidencia).

## Secrets / flags

| Item | Estado |
|---|---|
| `AUTH_JWT_HS_SECRET` (API staging) | Set (staging random) |
| Stripe / PSE / FCM SA | **Pendiente** (FCM stub en Secrets Store → `go-live-fcm`) |
| VAPID | **Real** (Secrets Store + runtime `PUSH_VAPID_PUBLIC_KEY`) |
| `FEATURE_*` | Repo `"0"`; staging runtime backup/DR `"1"` (keep-vars) |
| Marketing soft-launch | Repo default `0`; deploy staging fuerza `1` solo durante el build Pages |
| CORS | pages.dev POS + marketing |
| Fixture owner | `tenant_stg_phase0_001` / `user_stg_owner_001` (creds fuera de repo) |

Procedimiento de flags: `docs/ops/go-live-staging-checklist.md` § Flags runtime.

## Auditoría 2026-08-17 (Staff Auditor)

| Check | Resultado |
|---|---|
| HTTP `/health` API | 200 `{"status":"ok"}` (re-verificado) |
| POS / marketing Pages | 200 (re-verificado) |
| worker-fiscal-staging | 404 (RPC-only, esperado) |
| worker-kms-staging | 404 (RPC-only, esperado) |
| Playwright `staging-browser-smoke.mjs` | GREEN (POS+API CORS + marketing Pages canónico; sin console fatals) |
| D1 `kipuspay-staging` `d1_migrations` | 68 filas (hasta 0068) — `d1:migrate:staging:list` OK; sin pendientes (2026-09-17) |
| D1 `kipuspay-dr-staging` `d1_migrations` | 68 filas (hasta 0068) — **paridad OK**; sin pendientes (`d1:migrate:staging:dr`, 2026-09-17) |
| Bindings (wrangler staging) | R2 backups, Workflow backup, KMS service, AI, Analytics |
| Secrets Store | **Reales** KEK backup/push + VAPID (FCM SA stub; `stg-secrets-real` closed) |
| `PUSH_VAPID_PUBLIC_KEY` | set (runtime var API staging) |
| `FEATURE_*` | repo `"0"`; runtime staging conserva flags explícitas para C3/S44/S46/S49/S50–S53: backup, DR, LPDP, recurring, forecasting, insights, quick-add, shift/team, onboarding, customer-orders y hardware diagnostics |
| Crons en config | **desplegados y verificados**: API schedules muestra las 7 expresiones configuradas; coinciden con top-level y handlers de `worker.ts` |
| Deploy activo API staging | version `aeed1d31-2e75-4d98-bc95-4a85248df082` (2026-09-17, S49 intent sources + fast path + C2 fixes + flags acumuladas S44/S46/S49/S50–S53) |
| Workflow `kipuspay-data-backup-staging` | READY backups `d31ef057…`, `8afaba63…` (kek_version=v1) |
| Secrets del worker | `AUTH_JWT_HS_SECRET` (rotado Fase 0; material solo en ops local) |
| Evidencia S42 externa | Parcial GREEN (READY); chaos/dry-run A+V pendiente |
| Evidencia S48 externa | GREEN técnico — simulacro `registry-5` vigente `PASSED`; A+V externo y claim de producción pendientes |

### Evidencia C3 LPDP titular — canary staging 2026-09-17

Se habilitó `FEATURE_LPDP=1` únicamente en el Worker API de staging y se creó un
titular sintético aislado en `tenant_stg_phase0_001`. El flujo real desde
`https://kipuspay-app.pages.dev/lpdp` pasó verify **200**, consents **200**, export
**200**, erase **200** y replay del mismo token después de anonimizar **401**. La
consulta D1 confirmó `pii_erased=1`, `name IS NULL` y `phone IS NULL`. El token no
se imprimió ni se archivó; la respuesta de export se guardó solo como artefacto
temporal local para verificar el status.

Esto es evidencia técnica de canary, no aprobación de QA/PM ni firma A/V. El claim
de producción y la exposición a clientes reales permanecen bloqueados.

### Evidencia S43 — Pedido y retiro real staging 2026-09-17

Con `orders.customer_orders` habilitado solo para el tenant sintético, el Worker
staging pasó creación **201**, listado/detalle **200**, lease **201**, fulfill
**200** y replay **200**. D1 confirmó una orden `FULFILLED`, un fulfillment
`CONSUMED` y una sola venta asociada; el replay devolvió el mismo `saleId` sin
filas adicionales. El fixture incluyó cliente, producto, supervisor, terminal y
sesión de caja sintéticos; no hubo envío a WhatsApp ni a otro canal externo.

La evidencia no sustituye parciales, carreras, expiración, rollback, QA humana ni
firma A/V; GTM-24 y el piloto externo permanecen bloqueados.

### Evidencia S46 — Forecast Cadena staging 2026-09-17

El tenant Cadena sintético `tenant_stg_cadena_001` recibió 14 rollups diarios y
capability `analytics.forecasting`. El refresh autenticado devolvió `200`,
`written=1`, `insufficient=0`; el listado devolvió `200` con una salida
`holt-winters-v1` y disclaimer. Dos refresh consecutivos dejaron una sola fila en
`forecast_outputs`. El tenant `arranque` devolvió `403 PLAN_REQUIRES_CADENA` con la
misma flag/capability, sin modificar su plan ni generar outputs.

El canary no demuestra Cron diario, Workers AI, AE, latencia productiva ni QA/A+V.

### Evidencia S49 — Insights Workers AI staging 2026-09-17

El mismo tenant Cadena sintético ejecutó el chat contra Workers AI real en la
versión anterior `a974c70a-6838-428a-a911-c7fe5b47c69d`, con el
modelo `@cf/meta/llama-3.1-8b-instruct-fp8`. Con facts vacíos o todo-cero, el
endpoint devolvió **200 SSE** con respuesta determinista y sin generación. Con
facts no triviales, una salida que introdujo cifras no sustentadas fue rechazada
**422 INSIGHTS_FAILED** con razón `NLG_CONTRADICTION`; el texto contradictorio no
se devolvió al cliente. El nuevo deploy `aeed1d31-2e75-4d98-bc95-4a85248df082`
evita ahora tanto el router como la redacción Workers AI para preguntas frecuentes
y construye la respuesta desde facts validados; pasó la prueba local 15/15. Falta
repetir el canary autenticado para medir P95 real. El briefing Cron 3:30/KV, la QA
humana y las firmas A/V siguen pendientes; el canary no desbloquea producción ni
piloto.

### Evidencia S44 — Cron Trigger real staging 2026-09-17

El tail de Cloudflare observó el Cron Trigger `*/5` en la versión
`5ef66cdc-8d6e-43a6-b141-0fcb6af5c811`: `recurring_scheduler_complete` con
`tenants=1`, `processedPeriods=1`, `failures=0` y sin excepciones. Un segundo tick
también completó un periodo (`catchUpCapped=false`). D1 confirmó dos ocurrencias
`SETTLED`, dos ventas distintas y `11800` cents agregados en dos periodos
consecutivos. La capability, el plan y los datos fueron sintéticos y aislados al
tenant de staging; QA/A+V y concurrencia ampliada siguen pendientes.

### Revalidación C4 autenticada — 2026-09-16 Lima

El fixture `user_stg_owner_001` autenticó correctamente contra el Worker actual:
`GET /api/auth/session` devolvió `200` con `tenant_stg_phase0_001`; el listado de
backups también devolvió `200`. La revalidación no es liberatoria: en
`tenant_capabilities` están habilitadas `data.backup` y `platform.dr`, sin habilitar
`compliance.lpdp`; los backups READY visibles inicialmente estaban vencidos. El
simulacro `DR_SIMULATION_PASSED` anterior permanece como evidencia histórica, no como
prueba vigente de restore.

La primera revalidación con el snapshot vigente `d3a693c6-f472-49f6-85fd-9e02b4d304f8`
sí alcanzó el motor de restore y terminó en `DR_SIMULATION_FAILED` por
`FOREIGN KEY constraint failed` (04:01:33Z). Esto reabre C4: el snapshot vigente no
puede considerarse restaurable hasta aislar la tabla/lote y repetir el simulacro.
Las corridas posteriores fueron detenidas al observar un `500 INTERNAL_ERROR` sin
nuevo evento de auditoría; tras desplegar la barrera fail-closed `1af0ecd5`, el mismo
canary responde `503 DR_CONTROL_PLANE_UNAVAILABLE` y deja el step-up sin consumir.
No se relanzan automáticamente para evitar duplicar el efecto del simulacro.

Después del cambio de registry, el backup `9ccf1d32-bf33-4618-b7d6-2823b6f0cd44`
llegó `READY` con `registry-5`, `112` tablas y sin `push_deliveries`. El simulacro
controlado alcanzó `DR_DB` y aplicó `112` tablas / `4` filas nuevas en `91.073 s`,
con `rpoTxZero=true`, `replayDuplicatesBlocked=3`, pero `rpoRollupOneDay=false`
porque el fixture solo contiene rollups hasta `2026-08-21`. El resultado fue
`RPO_VIOLATION`; C4 sigue NO-GO hasta repetir con datos recientes y firma A/V.

Worker script id staging API: `1d35e1ae2ce54ff5b969dea0f5fc3624`.

### Repetición C4 vigente — 2026-09-17 Lima

El fixture de drill usa la fecha cerrada anterior en Lima y una PK diaria nueva.
El backup `651d4a97-68d7-4002-82e3-4e1780ed6620` quedó READY con `registry-5` y
12 chunks. El simulacro autenticado devolvió HTTP 200 `PASSED`: rollup vigente
`2026-09-16`, `rpoTxZero=true`, `rpoRollupOneDay=true`, `rtoMs=29629`, 112 tablas
aplicadas, 7 filas nuevas y 3 duplicados bloqueados. Esta es evidencia histórica
de restore/RPO, pero una revisión posterior detectó que el cronómetro se detenía
antes de la verificación final. La cifra RTO no es completa; repetir el simulacro
tras desplegar la corrección local de C4. La evidencia A/V y el claim de producción
siguen pendientes.

## Auditoría 2026-08-20 (Fase 0 humano + Fase 1)

| Check | Resultado |
|---|---|
| Secrets Store `6c5d2aff…` | KEK v1/v2 + push KEKs + VAPID; FCM stub; wrap/unwrap smoke `ok:true` `kekVersion:v1` |
| `worker-kms` staging | Redeploy Fase 0; bindings Secrets Store |
| Tenant fixture | `tenant_stg_phase0_001` + owner + TENANT_KV; `/api/auth/session` 200 |
| S42 create backup | `202` → `READY`; Workflow + R2 + `kek_version=v1` |
| S48 `POST /api/dr/simulation` | DONE técnico (`DR_SIMULATION_PASSED`, backup `registry-2`); A+V externo pendiente |
| CI `deploy-staging.yml` dry_run | WAIT: prettier ubl local GREEN; **GH token debe ser API Token CF (no OAuth)** |
| `go-live-staging` | EN_CURSO (no CERRADO) |

## Después del smoke (no cerrar tracker aún)

Cola canónica: `pending-batches.yaml` (`camino_produccion_fases` + `next_actions`).
Camino a producción (fases 0–4): `docs/ops/go-live-staging-checklist.md`
§Camino a producción. **Veredicto: NO-GO** a producción/piloto liberatorio.

### Handoff Fase 0 — CERRADO

Secrets + VAPID + tenant GREEN. CI run WAIT (token CF largo).

### Handoff Fase 1 — EN_CURSO

Flags + S42 READY GREEN parcial. S48 `DR_SIMULATION_PASSED` técnico con backup
`registry-2`; A+V externo pendiente. Flags cobro/fiscal S12 WAIT A+V.

### Siguientes fases

4. Fase 2: `go-live-sunat` + piloto **pages.dev** (D0). `kipuspay.com` = DM.
5. Fase 3: `go-live-fcm` / `go-live-hardware` / s43–s49 (claims GTM).
6. Fase 4: recursos production CF (pages.dev/workers.dev) + CI Etapas 7–11; A+V.
7. DM: custom domains cuando A compre el dominio.
