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
| POS Pages | https://kipuspay-pos-web-staging.pages.dev |
| Marketing Pages | https://kipuspay-marketing-web-staging.pages.dev |
| Browser smoke | `apps/pos-web/scripts/staging-browser-smoke.mjs` (Playwright) |

Smoke navegador (2026-08-17): marketing 200 (soft-launch copy), POS shell login
visible, `fetch(/health)` desde origen POS con CORS OK.

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

Migraciones D1: `DB` y `DR_DB` en paridad **56/56** (`0000`–`0055`, auditoría
2026-08-17). Si un `wrangler d1 migrations apply` batch falla con
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

Workers: `wrangler deploy --env staging`. Fronts: `wrangler pages deploy` a
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

## Secrets / flags

| Item | Estado |
|---|---|
| `AUTH_JWT_HS_SECRET` (API staging) | Set (staging random) |
| Stripe / PSE / VAPID real / FCM | **Pendiente** (stubs en Secrets Store) |
| `FEATURE_*` | Todos `"0"` en staging (repo); flip **solo runtime** con A+V |
| Marketing soft-launch | `PUBLIC_FEATURE_MARKETING_SITE=0` (intencional) |
| CORS | pages.dev POS + marketing |

Procedimiento de flags: `docs/ops/go-live-staging-checklist.md` § Flags runtime.

## Auditoría 2026-08-17 (Staff Auditor)

| Check | Resultado |
|---|---|
| HTTP `/health` API | 200 `{"status":"ok"}` (re-verificado) |
| POS / marketing Pages | 200 (re-verificado) |
| worker-fiscal-staging | 404 (RPC-only, esperado) |
| worker-kms-staging | 404 (RPC-only, esperado) |
| Playwright `staging-browser-smoke.mjs` | GREEN (POS+API CORS; mkt soft-launch; CSP inline avisos en mkt) |
| D1 `kipuspay-staging` `d1_migrations` | 56 filas (0000–0055) — `d1:migrate:staging:list` OK |
| D1 `kipuspay-dr-staging` `d1_migrations` | 56 filas — **paridad OK** (`d1:migrate:staging:dr` OK, gap `stg-dr-migrate` cerrado) |
| Bindings (wrangler staging) | R2 backups, Workflow backup, KMS service, AI, Analytics |
| Secrets Store | Aún **stubs** (`stg-secrets-real` open) |
| `PUSH_VAPID_PUBLIC_KEY` | vacío |
| `FEATURE_*` | todos `"0"` |
| Crons en config | **desplegados y verificados**: API schedules muestra las 6 expresiones (modified_on 01:08:04Z, deploy activo `9daaf9b6`); coinciden con top-level y handlers de `worker.ts` |
| Deploy activo API staging | version `9daaf9b6-5214-4a66-b973-e53daa132956` (2026-08-17T01:08Z) |
| Workflow `kipuspay-data-backup-staging` | presente (account workflows) |
| Secrets del worker | solo `AUTH_JWT_HS_SECRET` (secret_text) |
| Evidencia S42/S48 externa | PENDIENTE |

Worker script id staging API: `1d35e1ae2ce54ff5b969dea0f5fc3624`
(última versión observada ~2026-08-17T01:08Z).

## Después del smoke (no cerrar tracker aún)

Cola canónica en `pending-batches.yaml` `next_actions`. Resumen:

1. `stg-secrets-real` → tenant fixture → flags A+V → S42 R2/Workflow → S48 DR_SIM.
2. `stg-crons-verify` **done** (6 crons desplegados y verificados vía API schedules); `stg-ci-etapas-6` (auto) sigue ready.
3. Gates s43–s49 / LPDP según flags y owners.
4. `go-live-sunat` / `go-live-fcm` / `go-live-hardware` siguen AGENDADO_AL_FINAL.
5. Dominios canónicos + ADR Queues/multi-shard si aplica.
6. Cierre tracker solo con A+V (`stg-close-tracker`).
