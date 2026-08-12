---
doc_id: ops-s51-shift-handoff-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 51 — Handoff de turno + Equipo (ops.shift_handoff + ops.team_invite) — Quality Gate

**Estado software:** GREEN local  
**Estado claim:** "cambia de turno sin cerrar caja" y "atribuye la venta al vendedor con su badge" descongelados (GTM §4.1, FASE 6G); producción/piloto NO-GO  
**Capabilities:** `ops.shift_handoff`, `ops.team_invite`, default-off (`FEATURE_SHIFT_HANDOFF`, `FEATURE_TEAM_INVITE`)  
**Spec:** Arquitectura §5.3 reglas 35–36 (edges 1A/1C) · Roadmap FASE 6G

El gate automatizado demuestra el contrato en entorno local: transferencia de la
sesión OPEN en <5 s con PIN de un solo uso (hash + TTL, guard SQL dentro del
batch), reuso/expiración → 401, conteo ligero intermedio con diferencia auditada
sin bloquear, invitación única por email con badge `EMP-` + PIN de caja,
atribución <1 s por badge/PIN (fail-closed) y desglose del Z por tramo en el
Modo Dueño (edge 1C). No existe staging Cloudflare real: producción y piloto NO-GO.

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED schema | `run-red-s51-schema` | 0043 ausente (shift-handoff-schema falló) |
| RED dominio | `run-red-s51-domain` | domain-ops inexistente (tests fallaron por import) |
| GREEN schema | `run-green-s51-schema` | shift-handoff-schema 5/5 + down total 28/28 |
| GREEN dominio | `run-green-s51-domain` | domain-ops 27/27 (97% stmts, 96% branches) |
| GREEN motor | `run-green-s51-motor` | unit motor 20/20 + integración workerd 5/5 (edge handoff) |
| GREEN rutas | `run-green-s51-routes` | shift-routes + team-routes 19/19 |
| GREEN UI+E2E | `run-green-s51-ui` | pos-web 185 unit + E2E 33/33 (shift-handoff 3/3) |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain ops (nuevo) | **27 tests, 97.2% stmts / 96.5% branches / 100% funcs** (PIN hash+TTL, badge EMP-, email) |
| Domain analytics | 66 tests GREEN (briefing edge 1C: viñeta por turno; 95.8% branches) |
| Adapters D1 | **330 unit + 226 workerd** GREEN (motor handoff 20 unit + 5 integración; cobertura 71.7% branches) |
| Worker API | **713 tests GREEN** (shift-routes + team-routes 19/19) |
| POS web | **185 unit + E2E 33/33 GREEN** (handoff, invite, resolve) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-24) |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| Transferencia <5 s sin cerrar sesión | `processShiftTransferAtomic`: sesión sigue `OPEN` (test), 2 tramos en `cash_register_shifts` |
| PIN de un solo uso (reuso → 401) | `verifyTransferPin` (dominio) + guard SQL `ended_at IS NULL AND hash AND TTL` dentro del batch; reuso secuencial → `PIN_NOT_ISSUED` 401; doble uso concurrente → guard aborta → `PIN_USED` 409; expiración → `PIN_EXPIRED` 401 |
| 0 ventas huérfanas | Atribución por `sales.user_id` del JWT + `sale_items.seller_id` (carrito, override por ítem); tramos por operador |
| `interim_required` | Diferencia `expected - counted` en `SHIFT_TRANSFER.cash_diff_cents`, auditada, sin bloquear (422 solo si falta el conteo) |
| Invitación única por email | Índice `users(tenant_id, email)` + 409 `USER_ALREADY_INVITED`; audit `TEAM_INVITE` |
| Atribución <1 s (200 SKUs) | `resolveSellerIdentifier` indexado por `badge_barcode` / `pin_hash`; fail-closed 404 |
| Badge `EMP-` único (edge 1A) | `generateBadgeBarcode` (reintentos), prefijo reservado, 0 colisiones vs `products.barcode` (índice 0042) |
| Desglose Z por tramo (edge 1C) | Briefing Modo Dueño: viñeta "Por turnos" con operador y monto; `cash_register_shifts` BUSINESS en backups |

Tests de trazabilidad:

- `packages/domain-ops/src/shift-handoff.test.ts`, `src/team-invite.test.ts`.
- `packages/adapters-d1/src/process-shift-handoff-atomic.test.ts`,
  `src/process-shift-handoff-atomic.integration.test.ts`, `src/shift-handoff-schema.test.ts`.
- `apps/worker-api/src/cash/shift-routes.test.ts`, `src/team/team-routes.test.ts`.
- `packages/domain-analytics/src/insights/briefing.test.ts` (edge 1C).
- `apps/pos-web/src/lib/cash/shift-handoff.test.ts`,
  `tests/e2e/shift-handoff.spec.ts`.

## Security Review

- El PIN temporal jamás se persiste en claro (solo hash); el PIN claro se
  devuelve una sola vez; TTL 5 min; reuso y expiración fail-closed (401).
- El PIN de caja del vendedor se resuelve por hash server-side; el endpoint de
  resolución devuelve solo identidad, nunca el hash.
- Namespace `EMP-` prohibido en productos (3 capas: dominio, índice, importer).
- Tenancy: `tenant_id` del JWT en pin/transfer/invite/resolve.
- La transferencia es una sola `db.batch` con guard optimista (Arquitectura §6).

Esta revisión no equivale a pentest.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Transferencia <5 s en hardware real | PENDIENTE / NO-GO | QA humano con equipo físico |
| Staging Cloudflare real | PENDIENTE / NO-GO | Bindings, CSP y latencia real |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Flujo de turnos validado por humanos |

## RACI real

| Rol | Estado |
|---|---|
| Staff Backend ACID | Migración 0043 + motor handoff GREEN local |
| Staff Data | domain-ops + briefing edge 1C GREEN local |
| Staff Frontend/Design | Páginas handoff/equipo + atribución carrito + E2E GREEN local |
| Staff Security | Revisión PIN/credenciales: 0 hallazgos medium+ (revisión, no pentest) |
| Staff Principal V | Revisión del motor: 0 hallazgos medium+ |
| Staff Growth | Claims descongeladas (GTM §4.1) |

## Veredicto

**SOFTWARE-GREEN-CLAIM-LIVE.** El software y el gate automatizado quedan GREEN local y
los claims **"cambia de turno sin cerrar caja"** y **"atribuye la venta al vendedor
con su badge"** se descongelan conforme al gate del Sprint 51 (Roadmap FASE 6G),
con copy acotado (handoff por PIN de un solo uso, la sesión nunca se cierra en el
cambio de operador, conteo intermedio opcional) y las capabilities default-off.
Producción y piloto siguen NO-GO hasta staging real y firmas A/V independientes.
