---
doc_id: ops-s48-dr-bcp-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 48 — DR/BCP (platform.dr) — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** DR/BCP Cadena (GTM §4.1) descongelado con copy acotado; producción/piloto NO-GO  
**Capability:** `platform.dr`, default-off (`FEATURE_PLATFORM_DR`)  
**Spec:** Arquitectura §5.3 regla 32b · §5.9 regla 27 · Roadmap FASE 6F

El gate automatizado demuestra el contrato DR en entorno local: restore **aplicado** a
un shard DR aislado (`DR_DB`, binding por composición, jamás producción viva),
verificación RPO=0 tx / RPO≤1d rollups y replay de colas sin duplicados, RTO medido
contra el objetivo de 30 min, y simulacro anual automatizado
(`POST /api/dr/simulation`, owner + step-up) que registra `DR_SIMULATION_*` en el
audit con `rto_ms`. El game day chaos `dr-failover` (500 ciclos) valida el loop
completo. No existe staging Cloudflare real (R2/Workflow/KMS externos): eso mantiene
producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED restaurar | `run-red-s48-dr` | `applyRestoreRowsToShard`/`verifyDrReplay` ausentes; sin ruta ni flag; el juego de pruebas de integración falló antes de implementar |
| GREEN aplicar | `run-green-s48-dr-restore` | dr-restore 5/5: topo FK padres-primero, ciclo→fail, apply idempotente (re-run 0 duplicados), RPO=0/RPO≤1d, RPO=0 falla si faltan tx |
| GREEN ruta | `run-green-s48-dr-route` | dr-routes 6/6: flag off→404, sin step-up→401, no-owner→403, backup ausente→404, sin DR_DB→503, validación falla→422 |
| GREEN game day | `run-green-s48-dr-chaos` | dr-failover 5/5 + 500 ciclos PASS; faults rpoTxLoss/rpoRollupStale/replayDuplicate → FAIL detectable |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Adapters D1 unit | 293 tests GREEN (regresión) |
| Adapters D1 workerd | **215 tests GREEN** (incluye dr-restore 5/5) |
| Worker API | **676 tests GREEN** (incluye dr-routes 6/6) |
| Chaos harness | **106 tests GREEN** (incluye dr-failover 5/5) |
| Domain sales / customers / fiscal | 241 / 14 / 13 GREEN (regresión) |
| POS web unit + E2E | 163 + 28/28 (regresión preservada) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24) |
| Chaos game day | `RESULT chaos dr-failover PASS (sprint 48)` |
| `scripts/quality.sh` | lint 23/23, typecheck 23/23, format GREEN, unit 38/38, integration 35/35, build, bundle CAL-06 |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| Restore apply a shard DR | `applyRestoreRowsToShard`: filas validadas por `verifyRestoreDryRun` (port `collectRestoreRows`, sin re-descifrar), orden topológico por FKs (Kahn, ciclo → `DR_RESTORE_FK_CYCLE`), `INSERT OR IGNORE` por PK en `db.batch` de ≤100 stmts — idempotente, sin `UPSERT INTO` |
| RPO=0 tx ACID | `verifyDrReplay.rpoTxZero`: conteo de `sales` restauradas == manifest; falla si faltan tx |
| RPO≤1d rollups | `verifyDrReplay.rpoRollupOneDay`: `MAX(report_date)` ≥ ayer Lima |
| Replay de colas sin duplicados | `INSERT OR IGNORE ... SELECT *` sobre offline sales / store-credit `source_ref` / fiscal outbox → changes=0 (`duplicatesBlocked`) |
| RTO ≤ 30 min | `rtoMs` medido (validate→apply→verify) contra `RTO_TARGET_MS`; exceso → `verdict: RTO_EXCEEDED` |
| Simulacro anual | `POST /api/dr/simulation` (owner + step-up token `PLATFORM_DR_SIMULATION`), flag default-off; audit `DR_SIMULATION_STARTED/PASSED/FAILED` con payload completo |
| Aislamiento | `DR_DB` es binding separado (nunca producción); guards de la ruta: flag, rol, token, dependencias, backup READY |
| Game day | `dr-failover` (500 ciclos): pérdida de shard → snapshot → apply → replay → verificación; fault injection rpoTxLoss/rpoRollupStale/replayDuplicate |

Tests de trazabilidad:

- `packages/adapters-d1/src/dr-restore.integration.test.ts` (apply, topo, RPO, replay).
- `apps/worker-api/src/backup/dr-routes.test.ts` (guards + fail-closed) y
  `apps/worker-api/src/backup/backup-restore-validator.test.ts` (regresión del port).
- `packages/chaos-harness/src/dr-failover.test.ts` (game day).

## Security Review

- El apply solo escribe en el shard DR inyectado por composición; el código no tiene
  un camino de escritura a producción (el port `write` del validador sigue sin call
  site de producción).
- `INSERT OR IGNORE` sobre PK validadas; cero interpolación de input del cliente
  (los nombres de tabla vienen del registry).
- Fail-closed en cada guard: flag off → 404; sin token → 401; sin `DR_DB` → 503;
  snapshot inválido → 422 sin aplicar nada.

Esta revisión no equivale a pentest.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| R2 externo + multipart real | PENDIENTE / NO-GO | Heredado del QG S42 |
| Workflow Cloudflare real | PENDIENTE / NO-GO | Crash/replay/checkpoint en staging |
| KMS externo y rotación | PENDIENTE / NO-GO | Unwrap versionado real |
| Simulacro en staging real | PENDIENTE / NO-GO | `rto_ms` medido contra `DR_DB` de staging |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Game day ejecutado por humanos |

## RACI real

| Rol | Estado |
|---|---|
| Staff SRE (owner) | Simulacro, RTO/RPO, game day, runbook GREEN local |
| Staff Backend ACID | Restore apply + verifyDrReplay GREEN local |
| Staff Principal V | Revisión del restore/apply: 0 hallazgos medium+ |
| Staff QA independiente | PENDIENTE (staging real) |
| Staff PM A | PENDIENTE |
| Staff Growth | Copy DR/BCP Cadena acotada (post-gate, GTM §4.1) |

## Veredicto

**SOFTWARE-GREEN-CLAIM-LIVE.** El software y el gate automatizado quedan GREEN local y
el claim **DR/BCP (Cadena, gate Sprint 48)** se descongela conforme al roadmap, con
copy acotado (RPO/RTO declarados y verificados localmente). Producción y piloto siguen
NO-GO hasta staging Cloudflare real (R2/Workflow/KMS), QA humana y firmas A+V
independientes. El runbook de recuperación (`docs/runbooks/dr-bcp-recovery.md`) queda
ensayado vía game day local.
