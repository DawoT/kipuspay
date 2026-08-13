---
doc_id: ops-p1c-withholdings-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Backlog v10 P1c — Percepciones / Retenciones / Detracciones (ADR-FISCAL-005, §5.2c) — Quality Gate

**Estado software:** GREEN local  
**Capability:** `FEATURE_FISCAL_WITHHOLDINGS` default-off  
**Spec:** Arquitectura §5.2c · ADR-FISCAL-005 · claims Cadena/Enterprise (GTM §4.1, tras gate)

El gate automatizado demuestra el contrato en local: tasas cerradas por
catálogo (percepción 2%/0.5%; retención 3%/6%/12%; detracción 4–12% basis
points), redondeo en cents server-side (invariante 1/7), documentos `02`/`20`
con serie/número propios (`branch_document_series`), correlativo server-side
con guardState anti-doble, audit `PERCEPTION`/`RETENTION` con hash-chain y
`sunat_status PENDING`. La detracción queda registrada con sus tasas y
`PENDING_DEPOSIT` documentado (sin staging bancario: NO-GO).

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED schema | `run-red-p1c-schema` | 0047 ausente (schema test falló) |
| RED dominio | `run-red-p1c-domain` | withholdings.ts ausente (tests fallaron por import) |
| GREEN schema | `run-green-p1c-schema` | withholdings-schema 5/5 + down total 34/34 |
| GREEN dominio | `run-green-p1c-domain` | domain-fiscal-pe 81/81 (withholdings 6/6; 95.5% branches) |
| GREEN motor | `run-green-p1c-motor` | unit 7/7 + integración D1 3/3 (percepción 2%, retención 6%, serie intacta) |
| GREEN rutas | `run-green-p1c-routes` | withholding-routes 5/5 + paridad de rutas 413 |
| GREEN UI+E2E | `run-green-p1c-ui` | pos-web 239 unit + E2E withholdings 1/1 |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain fiscal | 81 tests GREEN (withholdings 6/6) |
| Adapters D1 | 373 unit + 269 workerd GREEN (withholdings 7 unit + 3 integración) |
| Worker API | 1001 tests GREEN (rutas 5/5; matriz de rutas) |
| POS web | 239 unit + E2E GREEN (withholdings 1/1) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-26) |

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| Tasas cerradas | `PERCEPTION_RATES`/`RETENTION_RATES`/`DETRACTION_RATES` + rechazo de categorías ajenas |
| Redondeo cents server-side | `Math.round((base * bps) / 10000)` con tests (10001 → 200, 3333 → 67) |
| Documento `02`/`20` propio | tablas `perceptions`/`retentions` (patrón GRE, sin recrear `sales`) |
| Correlativo server-side | guardState + `current_number+1` (test doble emisión) |
| Audit | `PERCEPTION`/`RETENTION` con hash-chain (payload: origen/base/tasa/monto) |
| Guard de origen | `ORIGIN_SALE_NOT_FOUND` / `ORIGIN_SUPPLIER_INVOICE_NOT_FOUND` (integración: serie intacta) |
| Detracción | Tasas 4–12% + `PENDING_DEPOSIT` documentado (NO-GO sin staging bancario) |
| Gating | `FEATURE_FISCAL_WITHHOLDINGS` default-off (404) |

Tests de trazabilidad:

- `packages/domain-fiscal-pe/src/withholdings.test.ts`.
- `packages/adapters-d1/src/withholdings-schema.test.ts`,
  `src/process-withholding-atomic.test.ts`,
  `src/process-withholding-atomic.integration.test.ts`.
- `apps/worker-api/src/fiscal/withholding-routes.test.ts`.
- `apps/pos-web/src/lib/fiscal/withholdings.test.ts`,
  `tests/e2e/withholdings.spec.ts`.

## Security Review

- El monto percibido/retenido jamás se calcula en el cliente (invariante 1/7):
  la UI envía solo base + categoría.
- Tenancy: `tenant_id` del JWT en motores y rutas.
- El guardState aborta la doble emisión concurrente de la misma serie.

Esta revisión no equivale a pentest.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Envío de `02`/`20` a SUNAT real | PENDIENTE / NO-GO | Staging Cloudflare + PSE real |
| Depósito de detracción | NO-GO | Staging bancario + firmas A/V |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Firma de ADR-FISCAL-001 v2 (ledger 0335) |

## RACI real

| Rol | Estado |
|---|---|
| Staff Fiscal | Tasas + catálogos + spec GREEN local |
| Staff Backend ACID | Motores + integración D1 GREEN local |
| Staff Frontend/Design | Panel Modo Dueño + E2E GREEN local |
| Staff Principal V | Revisión de motores: 0 hallazgos medium+ |

## Veredicto

**SOFTWARE-GREEN.** Percepciones/retenciones/detracciones quedan implementadas y
verificadas en local con la capability default-off; claims Cadena/Enterprise
NO-GO hasta staging SUNAT/bancario real y firmas A/V independientes.
