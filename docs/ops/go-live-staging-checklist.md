---
doc_id: ops-go-live-staging-checklist
alias: "—"
authority: derivada
owner: "@DawoT"
---

# Go-live staging — checklist implementador

Tracker: `docs/ops/pending-batches.yaml` (`go-live-staging`, estado **EN_CURSO**).
Bootstrap: `docs/ops/staging-bootstrap.md`. Matriz claims: `docs/ops/claims-go-live.md`.

**No cerrar** el ítem ni QGs externos sin firmas A+V. Prohibido commit `FEATURE_*=1`
en `wrangler.jsonc` (test nogate).

## Estado auditado (2026-08-17)

- `stg-crons-verify` → **done**: 6 crons desplegados y verificados vía API
  `schedules` (modified_on 01:08:04Z, deploy activo `9daaf9b6`); coinciden con
  `env.staging.triggers` del repo, el top-level y los handlers `scheduled` de
  `worker.ts`. Evidencia en `staging-bootstrap.md` §Auditoría y en el yaml.
- `stg-dr-migrate` / `stg-migrate-batch-fix` → **closed** (D1 DB+DR 56/56).
- `stg-secrets-real`, `stg-vapid-public-var`, `stg-tenant-fixture`,
  `stg-flags-s42-s48`, `stg-s42-r2-workflow`, `stg-s48-dr-sim` → **bloqueados**
  (necesitan humanos/secrets/A+V).
- `stg-ci-etapas-6` → **ready** (workflow_dispatch, auto).

## Próximos `next_actions`

| id | Owner | Pass |
|---|---|---|
| `stg-secrets-real` | Staff Security | Secrets Store real (KEK backup/push, VAPID, FCM SA); redeploy KMS |
| `stg-ci-etapas-6` | Staff SRE | `workflow_dispatch` deploy staging + artifacts |

Siguiente bloqueado hasta secrets + tenant + A+V flags: `stg-s42-r2-workflow` →
`stg-s48-dr-sim`.

## Comandos útiles

```bash
# Paridad migraciones DB vs DR_DB
pnpm --filter @kipuspay/worker-api run d1:migrate:staging:list
pnpm --filter @kipuspay/worker-api run d1:migrate:staging
pnpm --filter @kipuspay/worker-api run d1:migrate:staging:dr

# Si batch apply falla con "incomplete input": aplicar one-by-one
# (mismo orden que packages/adapters-d1/migrations/*.sql)

pnpm --filter @kipuspay/worker-api run deploy:staging
pnpm --filter @kipuspay/worker-kms run deploy:staging
node apps/pos-web/scripts/staging-browser-smoke.mjs
```

## Flags runtime (solo con A+V)

No editar el repo. Tras aprobación, flip en dashboard / `wrangler secret` /
vars de deploy para evidencia:

- `FEATURE_DATA_BACKUP=1`, `FEATURE_PLATFORM_DR=1` (S42/S48)
- Luego, por gate: `FEATURE_ORDERS_CUSTOMER_ORDERS`, `FEATURE_SALES_RECURRING`,
  `FEATURE_ANALYTICS_*`, `FEATURE_LPDP`, `FEATURE_CATALOG_PRICE_LABELS`, etc.
- POS: rebuild Pages con `PUBLIC_FEATURE_*` alineados si la UI debe probarse.

Rollback: redeploy con vars `"0"` (estado default del repo).

## Pass S42 (externo — no afirmar GREEN aquí)

Ver `docs/ops/s42-data-backup-qg.md` § evidencia externa: R2 multipart
timeout/partial/resume/abort; Workflow crash/replay/idempotencia; Secrets Store
sin material en D1/R2/logs; KMS unwrap versionado; dry-run cero writes indebidos.

## Pass S48 (externo)

Ver `docs/ops/s48-dr-bcp-qg.md`: `DR_SIMULATION` contra `DR_DB` staging;
`rto_ms` ≤ 30 min; RPO; never write live `DB`; A+V.

## Soft-launch marketing

`PUBLIC_FEATURE_MARKETING_SITE=0` es intencional. No es gap de staging smoke.
