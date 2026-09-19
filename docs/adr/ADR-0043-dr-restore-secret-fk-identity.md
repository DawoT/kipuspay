---
doc_id: adr-0043-dr-restore-secret-fk-identity
alias: "—"
authority: derivada
owner: "@DawoT"
---

# ADR-0043 — Restore DR y FKs hacia tablas SECRET excluidas (proyección de identidad)

| Campo | Valor |
|---|---|
| Estado | Aceptado (A: Staff Principal por delegación de @DawoT 2026-09-18; V: pendiente revisión externa) |
| Fecha | 2026-09-19 |
| Decisores | Staff Principal (agente, delegación A) · Staff Data/SRE (implementación) |
| Consultados | Staff Security (exclusiones SECRET, Arquitectura §5.9) |
| Informados | Staff SRE · Staff QA |
| Relaciona | Arquitectura §5.9 (Regla 27) · Sprint 48 (`docs/ops/s48-dr-bcp-qg.md`) · Tracker `stg-s48-dr-sim` · Ledger 0535 |

## Contexto

El simulacro DR del 2026-09-19 (primera corrida con el RTO corregido, deploy
`fb6b570c`) falló **fail-closed correctamente** con `DR_RESTORE_BATCH_FAILED` en
la tabla `recurring_plans` (HTTP 422, audit `DR_SIMULATION_FAILED`). Causa raíz
verificada con sonda directa en `DR_DB`:
`FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY (7500)`.

- La especificación (§5.9 Regla 27) excluye del backup las tablas SECRET:
  *"Solo BUSINESS entra como filas… EPHEMERAL y SECRET se manifiestan como
  exclusiones"* — por diseño, credenciales y material de autenticación no viajan.
- 22 tablas BUSINESS declaran `FOREIGN KEY … REFERENCES users(tenant_id, id)`
  (accountability: `created_by_user_id`, `requested_by_user_id`, etc.).
- D1 **no permite desactivar FKs** y `PRAGMA defer_foreign_keys` no aplica: el
  padre nunca existirá en el shard porque nunca viaja en el backup.
- Los PASSED históricos (2026-08-22, 2026-09-17) usaban fixtures sin filas en
  tablas que referencian `users`; el plan recurrente s44 canario (creado
  2026-09-17, posterior al último backup) fue la primera fila que ejercitó la FK.

**Un restore apply real de datos con cualquier orden/compra/etiqueta creada por
un usuario fallaría igual.** El gap bloquea la promesa de DR de la Regla 32b.

## Decisión

Extender KPBK1 con una **proyección de identidad por tabla SECRET** cuando sea
padre de FKs de tablas BUSINESS: el registry declara para cada tabla SECRET
`identityColumns` (columnas de identidad **sin credenciales**); el backup captura
esas filas proyectadas y el restore las inserta como padres dentro del orden
topológico existente.

Para `users`: `id, tenant_id, branch_id, email, role, is_active, deleted_at,
created_at`. **Quedan excluidos** `password_hash, pin_hash, pin_attempts,
pin_locked_until, external_auth_id, badge_barcode` (credenciales/material de
autenticación, invariante original intacto). Post-restore real, las credenciales
se re-provisionan (password reset / re-vinculación IdP / re-pareo PIN) — se
documenta en el runbook DR.

Criterio de aceptación medible: con la proyección implementada, un backup que
contenga filas en las 22 tablas con FK→`users` restaura en DR_DB con veredicto
`DR_SIMULATION_PASSED` (RTO con `verifyDrReplay` incluido) y el manifiesto
declara las tablas de identidad con sus columnas exactas; el validador dry-run
rechaza cualquier fila de identidad con columna no declarada (fail-closed).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Desactivar FKs en el shard DR (`PRAGMA foreign_keys=off`) | D1 no lo permite; además el restore real de cutover de producción tendría el mismo problema en una DB nueva |
| `PRAGMA defer_foreign_keys=true` por lote | El padre nunca se inserta: la FK sigue fallando al COMMIT de cada lote |
| Esqueletos de identidad sintetizados en restore (fabricar email/roles desde las FKs de los hijos) | Fabrica datos que no vienen del backup (R5: nunca valor plausible); Security: NO-GO |
| Reescribir el DDL de las 22 tablas para eliminar las FKs a `users` | Destruye accountability; el registry y los gates de esquema lo rechazan |
| Incluir `users` completa en el backup | Reintroduce credenciales hasheadas en R2 — rompe la exclusión SECRET de §5.9 |

## Consecuencias

- **Gana:** DR de verdad (RPO de negocio verificable con datos reales), FKs de
  accountability resueltas, credenciales siguen fuera del backup, formato
  KPBK1 compatible (sección de identidad es aditiva y validada).
- **Paga:** un sprint de implementación (registry + capture + manifest +
  validador dry-run + restore + chaos + tests RED→GREEN); bump de
  `D1_BACKUP_REGISTRY_VERSION`; email de usuarios viaja en el backup (PII ya
  presente vía `customers`; sin nueva superficie de credenciales).
- **Invariantes tocadas:** §5.9 Regla 27 (ampliación declarada: "SECRET se
  manifiesta como exclusión **o como proyección de identidad declarada**");
  invariante 5 fail-closed intacto (validador rechaza columnas no declaradas);
  Invariante 2 (todo insert en `db.batch`, sin `UPSERT INTO`).
- **Estado del gap:** `stg-s48-dr-sim` permanece abierto hasta implementación +
  nueva corrida con datos que ejerciten las 22 FKs. Veredicto producción
  **NO-GO** se mantiene.
