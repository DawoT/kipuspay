---
doc_id: ops-staging-bootstrap
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Staging Cloudflare — bootstrap (smoke)

**Estado:** plano staging **UP** (smoke mínimo). `go-live-staging` en
`pending-batches.yaml` sigue **AGENDADO_AL_FINAL** hasta evidencia s41–s49
(R2 multipart, Workflow crash/replay, DR_SIMULATION real, cron/canary A+V).

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

Migraciones D1: aplicadas en `DB` (one-by-one; `wrangler d1 migrations apply` batch falló con `incomplete input`). DR_DB: aplicar espejo si aún incompleto.

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

## Secrets / flags

| Item | Estado |
|---|---|
| `AUTH_JWT_HS_SECRET` (API staging) | Set (staging random) |
| Stripe / PSE / VAPID real / FCM | **Pendiente** (stubs en Secrets Store) |
| `FEATURE_*` | Todos `"0"` en staging |
| Marketing soft-launch | `PUBLIC_FEATURE_MARKETING_SITE=0` |
| CORS | pages.dev POS + marketing |

## Después del smoke (no cerrar tracker aún)

1. Evidencia Workflow + R2 multipart + DR_SIMULATION en Cloudflare real (s42/s48).
2. `go-live-sunat` (PSE/OSE).
3. `go-live-fcm` (VAPID/FCM reales, no stubs).
4. `go-live-hardware` (Android + impresoras).
5. ADR si se alinean Queues / multi-shard del diagrama §2.
6. CI Etapas 6–11 (`workflow_dispatch` deploy).
7. Dominios canónicos `api.` / `app.` / `kipuspay.com` + `nodejs_compat` ya en Pages wrangler.
