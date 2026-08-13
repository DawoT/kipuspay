---
doc_id: ops-p1b-remission-guide-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Backlog v10 P1b — GRE `31` (ADR-FISCAL-004, §5.2b) — Quality Gate

**Estado software:** GREEN local  
**Capability:** `FEATURE_GRE` default-off  
**Spec:** Arquitectura §5.2b · ADR-FISCAL-004 · claim Cadena/Enterprise (GTM §4.1, tras gate)

El gate automatizado demuestra el contrato en local: motivos del catálogo 18
(cerrado: 01/02/04/08/13/14/16), modalidad de transporte 01/02, fecha/hora de
inicio de traslado obligatoria, correlativo serie `T…` server-side con
guardState anti-doble, audit `REMISSION_GUIDE` con hash-chain y 0 impacto en
stock/saldos. No existe staging SUNAT real: producción y piloto NO-GO
(invariante 8).

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED schema | `run-red-p1b-schema` | 0046 ausente (schema test falló) |
| RED dominio | `run-red-p1b-domain` | remission-guide.ts ausente (tests fallaron por import) |
| GREEN schema | `run-green-p1b-schema` | remission-guide-schema 5/5 + down total 32/32 |
| GREEN dominio | `run-green-p1b-domain` | domain-fiscal-pe 75/75 (remission-guide 9/9; 95.6% branches) |
| GREEN motor | `run-green-p1b-motor` | unit 4/4 + integración D1 2/2 (cabecera+ítems, correlativo, audit, serie intacta) |
| GREEN rutas | `run-green-p1b-routes` | remission-guide-routes 4/4 + paridad de rutas protegidas 409 |
| GREEN UI+E2E | `run-green-p1b-ui` | pos-web 236 unit + E2E 50/50 (remission-guide 1/1) |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain fiscal | 75 tests GREEN (remission-guide 9/9) |
| Adapters D1 | 358 unit + 257 workerd GREEN (GRE 4 unit + 2 integración) |
| Worker API | 986 tests GREEN (GRE 4/4; matriz de rutas actualizada) |
| POS web | 236 unit + E2E 50/50 GREEN |
| `scripts/verify.sh` | SUITE GREEN (V-00..V-26) |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| Motivos catálogo 18 cerrados | `TRANSFER_REASON_CODES` + test `99` → `INVALID_TRANSFER_REASON` |
| Modalidad 01/02 | `INVALID_TRANSPORT_MODE` para `03` |
| Inicio de traslado obligatorio | `INVALID_TRANSFER_START` para fecha inválida |
| Correlativo serie T server-side | guardState + `current_number+1` (test doble emisión) |
| 0 stock / 0 saldos | `remissionStockImpact()=0` + integración: stock del producto intacto |
| Audit | `REMISSION_GUIDE` con hash-chain (payload: motivo/modalidad/ítems/inicio) |
| Gating | `FEATURE_GRE` default-off (404) |

Tests de trazabilidad:

- `packages/domain-fiscal-pe/src/remission-guide.test.ts`.
- `packages/adapters-d1/src/remission-guide-schema.test.ts`,
  `src/process-remission-guide-atomic.test.ts`,
  `src/process-remission-guide-atomic.integration.test.ts`.
- `apps/worker-api/src/inventory/remission-guide-routes.test.ts`.
- `apps/pos-web/src/lib/inventory/remission-guide.test.ts`,
  `tests/e2e/remission-guide.spec.ts`.

## Security Review

- La GRE no toca ventas/AR/impuestos: tabla propia, sin reescrituras.
- Tenancy: `tenant_id` del JWT en motor y ruta.
- El guardState aborta la doble emisión concurrente de la misma serie T.

Esta revisión no equivale a pentest.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Comunicación GRE a SUNAT real | PENDIENTE / NO-GO | Staging Cloudflare + PSE real |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Firma de ADR-FISCAL-001 v2 (ledger 0335) |
| Claim Cadena/Enterprise | NO-GO | Solo tras gate + staging |

## RACI real

| Rol | Estado |
|---|---|
| Staff Fiscal | Catálogo 18 + modalidad + spec GREEN local |
| Staff Backend ACID | Motor + integración D1 GREEN local |
| Staff Frontend/Design | Panel inventario + E2E GREEN local |
| Staff Principal V | Revisión del motor: 0 hallazgos medium+ |

## Veredicto

**SOFTWARE-GREEN.** La GRE queda implementada y verificada en local con la
capability default-off; el claim Cadena/Enterprise permanece NO-GO hasta
staging SUNAT real y firmas A/V independientes.
