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

Smoke navegador (2026-08-17): marketing 200 (soft-launch copy), POS shell login
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
| Marketing soft-launch | `PUBLIC_FEATURE_MARKETING_SITE=0` (intencional) |
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
| Playwright `staging-browser-smoke.mjs` | GREEN (POS+API CORS; mkt soft-launch; CSP inline avisos en mkt) |
| D1 `kipuspay-staging` `d1_migrations` | 56 filas (0000–0055) — `d1:migrate:staging:list` OK |
| D1 `kipuspay-dr-staging` `d1_migrations` | 56 filas — **paridad OK** (`d1:migrate:staging:dr` OK, gap `stg-dr-migrate` cerrado) |
| Bindings (wrangler staging) | R2 backups, Workflow backup, KMS service, AI, Analytics |
| Secrets Store | **Reales** KEK backup/push + VAPID (FCM SA stub; `stg-secrets-real` closed) |
| `PUSH_VAPID_PUBLIC_KEY` | set (runtime var API staging) |
| `FEATURE_*` | repo `"0"`; runtime staging `FEATURE_DATA_BACKUP=1` `FEATURE_PLATFORM_DR=1` |
| Crons en config | **desplegados y verificados**: API schedules muestra las 6 expresiones (modified_on 01:08:04Z, deploy activo `9daaf9b6`); coinciden con top-level y handlers de `worker.ts` |
| Deploy activo API staging | version `691e6096-862d-4632-b5cb-871f0eddc683` (2026-08-20 Fase 1) |
| Workflow `kipuspay-data-backup-staging` | READY backups `d31ef057…`, `8afaba63…` (kek_version=v1) |
| Secrets del worker | `AUTH_JWT_HS_SECRET` (rotado Fase 0; material solo en ops local) |
| Evidencia S42 externa | Parcial GREEN (READY); chaos/dry-run A+V pendiente |
| Evidencia S48 externa | WAIT — software `registry-2` STALE; live `DR_SIMULATION_PASSED` exige backup post-0056 |

Worker script id staging API: `1d35e1ae2ce54ff5b969dea0f5fc3624`.

## Auditoría 2026-08-20 (Fase 0 humano + Fase 1)

| Check | Resultado |
|---|---|
| Secrets Store `6c5d2aff…` | KEK v1/v2 + push KEKs + VAPID; FCM stub; wrap/unwrap smoke `ok:true` `kekVersion:v1` |
| `worker-kms` staging | Redeploy Fase 0; bindings Secrets Store |
| Tenant fixture | `tenant_stg_phase0_001` + owner + TENANT_KV; `/api/auth/session` 200 |
| S42 create backup | `202` → `READY`; Workflow + R2 + `kek_version=v1` |
| S48 `POST /api/dr/simulation` | WAIT (código `BACKUP_REGISTRY_STALE` si backup es registry-1; no skip) |
| CI `deploy-staging.yml` dry_run | WAIT: prettier ubl local GREEN; **GH token debe ser API Token CF (no OAuth)** |
| `go-live-staging` | EN_CURSO (no CERRADO) |

## Después del smoke (no cerrar tracker aún)

Cola canónica: `pending-batches.yaml` (`camino_produccion_fases` + `next_actions`).
Camino a producción (fases 0–4): `docs/ops/go-live-staging-checklist.md`
§Camino a producción. **Veredicto: NO-GO** a producción/piloto liberatorio.

### Handoff Fase 0 — CERRADO

Secrets + VAPID + tenant GREEN. CI run WAIT (token CF largo).

### Handoff Fase 1 — EN_CURSO

Flags + S42 READY GREEN parcial. S48 WAIT `BACKUP_REGISTRY_STALE` (backup
nuevo `registry-2`). Flags cobro/fiscal S12 WAIT A+V.

### Siguientes fases

4. Fase 2: `go-live-sunat` + piloto **pages.dev** (D0). `kipuspay.com` = DM.
5. Fase 3: `go-live-fcm` / `go-live-hardware` / s43–s49 (claims GTM).
6. Fase 4: recursos production CF (pages.dev/workers.dev) + CI Etapas 7–11; A+V.
7. DM: custom domains cuando A compre el dominio.
