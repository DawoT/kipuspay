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

**Veredicto producción:** NO-GO. Software local GREEN; staging = smoke + Fase 0/1
parcial. Claims GTM vendibles exigen evidencia externa + A+V.

## Estado auditado (2026-08-20 — Fase 0 humano + Fase 1)

- `stg-crons-verify` → **done** (previo).
- `stg-dr-migrate` / `stg-migrate-batch-fix` → **closed**.
- `stg-secrets-real` → **done** (KEK + VAPID Secrets Store; FCM SA stub queda en
  `go-live-fcm`).
- `stg-vapid-public-var` → **done** (runtime var API).
- `stg-tenant-fixture` → **done** (`tenant_stg_phase0_001`, session 200, step-up).
- `stg-ci-etapas-6` → **file-done**; `stg-ci-etapas-6-run` → **WAIT** (prettier ubl local GREEN; GH `CLOUDFLARE_API_TOKEN` debe ser API Token CF largo, no OAuth wrangler).
- `stg-flags-s42-s48` → **done** (runtime only).
- `stg-s42-r2-workflow` → **done parcial** (backup READY + kek v1 + Workflow; chaos
  matrix / restore dry-run A+V pendientes).
- `stg-s48-dr-sim` → **WAIT** (software `registry-2` STALE; live `DR_SIMULATION_PASSED` exige backup READY post-0056).
- `go-live-staging` → **EN_CURSO** (nunca CERRADO en este ciclo).

## Handoff Fase 0 — CERRADO (2026-08-20)

| id | Owner | Status | Pass |
|---|---|---|---|
| `stg-secrets-real` | Staff Security | **done** | Store real; KMS redeploy; wrap vía backup READY |
| `stg-vapid-public-var` | Staff Mobile | **done** | `PUSH_VAPID_PUBLIC_KEY` runtime + redeploy API |
| `stg-tenant-fixture` | Staff SRE | **done** | Owner JWT + KV + session/step-up |
| `stg-ci-etapas-6-run` | Staff SRE | **WAIT** | Prettier local GREEN + **reemplazar GH `CLOUDFLARE_API_TOKEN` OAuth por API Token CF** antes del deploy real |

## Handoff Fase 1 — EN_CURSO

| id | Status | Evidencia |
|---|---|---|
| `stg-flags-s42-s48` | **done** | Runtime `FEATURE_DATA_BACKUP=1` / `FEATURE_PLATFORM_DR=1` |
| `stg-s42-r2-workflow` | **done parcial** | Backups `d31ef057…`, `8afaba63…` READY |
| `stg-s48-dr-sim` | **WAIT** | Software `BACKUP_REGISTRY_STALE` (registry-2). Live: migrar 0056 + backup nuevo + simulacro `DR_DB` |

Fixes de producto desplegados en staging (no liberatorios): step-up
`meta.changes >= 1` (epoch trigger); mint step-up exige `backupId` también para DR /
restore dry-run.

Flags cobro/fiscal piloto: **deferred** (Fase 2).

## Camino a producción (fases 0–4)

No marcar `go-live-*` CERRADO ni claims GTM vendibles hasta A+V independientes.
Piloto acotado (Fase 2) puede ir antes de FCM/hardware (Fase 3).

### Fase 0 — Plataforma staging usable — **CERRADO** (CI run documentado BLOCKED)

### Fase 1 — Evidencia plataforma (A+V) — **EN_CURSO**

6. Runtime `FEATURE_DATA_BACKUP=1`, `FEATURE_PLATFORM_DR=1` — **done**.
7. Matriz externa S42 — **parcial** (READY; falta dry-run/chaos A+V).
8. `DR_SIMULATION` S48 — **WAIT** (`registry-2` + backup post-0056).
9. Flags piloto cobro/fiscal — **S12 WAIT A+V** (repo sigue `0`).

### Fase 2 — Piloto operable (mínimo producción real)

10. `go-live-sunat` — **WAIT** S11–S16 (e-beta ≠ GTM-08; PSE HTTP y e-factura WAIT A).
11. Canónico **temporal** Pages/Workers (`*.pages.dev` / `*.workers.dev`) — **D0 software**. `kipuspay.com` **WAIT-DOMINIO** (no comprado).
12. Observabilidad + canarios sintéticos contra esos hosts (Proceso §5.2 / §6) — smoke Pages ya existe; WAIT cobertura continua.
13. Rollback probado + Review Board A+V (Proceso §8.1) — **WAIT**.
14. Marketing: `PUBLIC_FEATURE_MARKETING_SITE=1` en build Pages **o** soft-launch (nunca default git). `PUBLIC_POS_ORIGIN` staging = POS pages.dev.

### Fase 3 — Claims GTM (después del piloto)

| Bloque | Pass | Gate |
|---|---|---|
| `go-live-fcm` | VAPID+FCM reales; ACK DISPLAYED p95&lt;10s ≥99% | s45 / GTM-26 |
| `go-live-hardware` | Matriz 58/80 mm + 500 ventas Android | s41 / GTM-26 |
| s43 / s44 / s46–s49 / s47 | Evidencia staging + QA humana | claims-go-live |
| s53 | Matriz caja física + offline dispositivos | claims matriz |

### Fase 4 — Cutover producción

15. Recursos **production** nuevos (Workers/Pages/D1 distintos de staging; hosts `*.pages.dev` / `*.workers.dev` hasta DM).
16. CI Etapas 7–11.
17. Cerrar `go-live-staging` + ledger liberatorio solo con A+V nuevos.
18. **DM** (después de compra de dominio): `kipuspay.com` / `app.` / `api.` + 301 + copy GTM A+V.

## Flags runtime (recordatorio)

Flip **solo** en dashboard/`wrangler deploy --var` / secrets de entorno. Nunca
commitear `FEATURE_*=1` en `wrangler.jsonc`.
