---
doc_id: ops-s48-dr-bcp-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 48 — DR/BCP (platform.dr) — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** DR/BCP Cadena (GTM-18 / GTM §4.1) congelado/condicionado; producción/piloto NO-GO
**Capability:** `platform.dr`, default-off (`FEATURE_PLATFORM_DR`)  
**Spec:** Arquitectura §5.3 regla 32b · §5.9 regla 27 · Roadmap FASE 6F

El gate automatizado demuestra el contrato DR en entorno local: restore **aplicado** a
un shard DR aislado (`DR_DB`, binding por composición, jamás producción viva),
verificación RPO=0 tx / RPO≤1d rollups y replay de colas sin duplicados, RTO medido
contra el objetivo de 30 min, y simulacro anual automatizado
(`POST /api/dr/simulation`, owner + step-up) que registra `DR_SIMULATION_*` en el
audit con `rto_ms`. El game day chaos `dr-failover` (500 ciclos) valida el loop
completo. El simulacro técnico contra staging Cloudflare (R2/Workflow/KMS y
`DR_DB`) está cerrado; la evidencia humana/A+V mantiene producción y piloto NO-GO.

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

### Remediación C4 — métrica de filas aplicadas (2026-09-16)

`applyRestoreRowsToShard()` ahora cuenta `rowsInserted` a partir de si cada
statement reporta cambios, no sumando el valor crudo de `meta.changes`. D1 puede
incluir cambios derivados de triggers en ese campo y la métrica anterior reportaba
14 para 7 filas. El ciclo TDD fue RED con el re-run esperando 0 filas nuevas y
GREEN tras el ajuste; la suite DR dirigida pasó **7/7**. El segundo restore ahora
conserva la idempotencia y su telemetría refleja el efecto real. Esto corrige la
observabilidad local; no altera la evidencia externa ni las firmas A/V.

### Remediación C4 — deliveries push efímeros y veredicto fail-closed (2026-09-16)

`push_deliveries` referencia `push_subscriptions`, que es `SENSITIVE` y no viaja en
KPBK1. Se clasificó como `EPHEMERAL` en el generador del registry y se elevó la
versión a `registry-5`; los backups `registry-4` quedan stale-safe. Además, un
simulacro con `RPO_VIOLATION` o `RTO_EXCEEDED` ahora audita `DR_SIMULATION_FAILED` y
devuelve HTTP 422, nunca `DR_SIMULATION_PASSED`/200. Tests dirigidos: Worker 11/11;
canary staging `registry-5`: restore aplicado, `rpoTxZero=true`, RPO de rollup fallido
por fixture antiguo. La repetición vigente se documenta abajo.

La suite completa de integración de adapters volvió a GREEN tras corregir el
generador de migraciones: **48 archivos / 338 tests**, incluido `dr-restore` 9/9.
La causa era que el generador añadía triggers de `fuel_catalog`/`fuel_dispatches`
(migración 0066) dentro de `0035_sprint42_data_backup.sql`; ahora esas tablas están
marcadas como posteriores a Sprint 42 y sus triggers solo viven en 0066.

## Evidencia técnica staging — 2026-08-22 / 2026-08-29

El cierre live documentado en `pending-batches.yaml` ejecutó
`DR_SIMULATION_PASSED` contra `DR_DB` con backup `registry-2`, 111 tablas y 43
filas, venta restaurada, rollup rematerializado, RTO 88.5 s, RPO transaccional 0,
RPO de rollup OK y tres replays deduplicados. El workflow de despliegue posterior
`33234868394` terminó GREEN en gate + deploy + smoke y publicó el artifact
`deploy-staging-evidence`, que contiene los despliegues de KMS/API/fiscal y Pages.
Esto acredita el tramo técnico reproducible; no sustituye ejecución humana,
revisión A/V ni un claim de producción.

### Cierre técnico C4 — simulacro staging vigente (2026-09-17 Lima)

Se aplicó el fixture `seed-dr-drill-staging.sql` con una venta diaria de PK nueva,
se creó un backup `registry-5` READY y se repitió el simulacro autenticado contra
Cloudflare. Resultado histórico observado: **HTTP 200 / `PASSED`**, `rpoTxZero=true`,
`rpoRollupOneDay=true`, `rollupLatestDay=2026-09-16`, `rtoMs=29629` frente a
`rtoTargetMs=1800000`, 112 tablas aplicadas, 7 filas nuevas y 3 duplicados
bloqueados. La auditoría registró `DR_SIMULATION_STARTED` y
`DR_SIMULATION_PASSED`. La PK diaria evita que `INSERT OR IGNORE` del restore
confunda un simulacro nuevo con una fila histórica ya aplicada en `DR_DB`. Una
revisión del cronómetro detectó que aquella versión calculaba `rtoMs` antes de
`verifyDrReplay`; por tanto, la restauración y los checks RPO siguen siendo
evidencia observada, pero los 29.629 ms no son una medición RTO completa. No
citar esa cifra como objetivo satisfecho: repetir la simulación tras desplegar
la medición corregida.

### Remediación C4 — RTO incluye verificación final (2026-09-17)

El cronómetro ahora se detiene después de `verifyDrReplay`, incluyendo la
verificación RPO y el replay deduplicado. RED: test con latencia de verificación
mayor al objetivo devolvía HTTP 200 `PASSED` y fallaba la expectativa. GREEN: con
la duración incluida devuelve HTTP 422 `RTO_EXCEEDED` y reporta el tiempo completo.
Evidencia local: `dr-rto-measurement.test.ts` + `dr-routes.test.ts`, **13/13**;
ESLint y TypeScript del Worker API GREEN; build Worker `--dry-run` completado.

### Drill staging con Worker corregido (2026-09-19) — fail-closed verificado en vivo + gap de diseño nuevo

Deploy `fb6b570c` (perfil `s48-dr`). Drill completo: seed venta ayer Lima →
rollup 2026-09-17 → backup `f4af808e-4354-4961-9e7a-562180b34f2e` READY →
step-up one-shot → `POST /api/dr/simulation` → **HTTP 422
`DR_SIMULATION_FAILED` a los 83.7 s** (RTO ahora incluye replay; audit
`DR_SIMULATION_FAILED`, errorRef `02ffab5b…`). El fail-closed corregido funciona
en vivo y dejó de ocultar latencia/verificación.

**Hallazgo raíz (bloqueante, nuevo):** `DR_RESTORE_BATCH_FAILED` en
`recurring_plans`. Sonda directa en `DR_DB`:
`FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY (7500)` — el
backup excluye `users` (SECRET, §5.9) y 22 tablas BUSINESS declaran
`FK → users(tenant_id, id)`. Los PASSED históricos (08-22, 09-17) eran fixtures
sin filas en esas tablas. Un restore real de datos con ventas/órdenes/etiquetas
creadas por usuarios fallaría igual: **gap de diseño de DR**. Decisión:
**ADR-0043** — proyección de identidad de tablas SECRET (sin credenciales) +
sprint dedicado + nueva corrida con datos que ejerciten las 22 FKs.
Evidencia: `docs/ops/evidence/s48-dr-rto-2026-09-19/` (respuesta íntegra).

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| R2 externo + multipart real | GREEN técnico / A+V pendiente | Artifact `deploy-staging-evidence` + backup `registry-2` |
| Workflow Cloudflare real | GREEN técnico / A+V pendiente | Workflow staging desplegado y replay del simulacro |
| KMS externo y rotación | GREEN técnico / A+V pendiente | KEK v1 + unwrap versionado en cierre live |
| Simulacro de restore aislado en staging | **NO-GO honesto** (2026-09-19) | `DR_SIMULATION_FAILED` 422 con fail-closed corregido: FK→users insatisfacible con SECRET excluido. Requiere ADR-0043 implementado + nueva corrida con datos que ejerciten las 22 tablas con FK→users |
| Medición RTO corregida | **GREEN staging (2026-09-19)** | Deploy `fb6b570c`: drill midió 83.7 s incluyendo verifyDrReplay y falló cerrado con 422 — la medición ya no oculta latencia |
| Cutover y rollback de tráfico | PENDIENTE / NO-GO | Procedimiento implementado o aprobado y ensayo staging con reversión y escrituras posteriores |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Game day humano, incluyendo cutover/rollback y revisión independiente |

## RACI real

| Rol | Estado |
|---|---|
| Staff SRE (owner) | Simulacro, RTO/RPO, game day, runbook GREEN local |
| Staff Backend ACID | Restore apply + verifyDrReplay GREEN local |
| Staff Principal V | Revisión del restore/apply: 0 hallazgos medium+ |
| Staff QA independiente | PENDIENTE (cutover/rollback y operación humana) |
| Staff PM A | PENDIENTE |
| Staff Growth | Copy DR/BCP Cadena acotada (post-gate, GTM §4.1) |

## Veredicto

**SOFTWARE-GREEN-CLAIM-CONDICIONADO.** El software y la simulación de restore
aislado quedan GREEN; el simulacro de staging acredita solo la restauración y sus
métricas dentro de `DR_DB`. GTM-18 permanece congelado: no publicar RPO/RTO como
garantía comercial ni declarar failover productivo. Cutover/rollback, QA humana y
firmas A/V independientes siguen pendientes. El runbook
(`docs/runbooks/dr-bcp-recovery.md`) cubre el simulacro, pero declara explícitamente
NO-GO el failover productivo.
