---
doc_id: ops-p1a-debit-note-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Backlog v10 P1a — Nota de Débito `08` (ADR-FISCAL-003, FIS-13) — Quality Gate

**Estado software:** GREEN local  
**Capability:** `FEATURE_SALES_DEBIT_NOTE` default-off  
**Spec:** Arquitectura §5.1 regla 5 (motivos catálogo 10, guard ACCEPTED) · §5.2 (ND factura → unitario 3d; ND boleta → RC 7d) · ADR-FISCAL-003

El gate automatizado demuestra el contrato en local: guard de emisión (origen
ACCEPTED factura/boleta; sin CDR → `FISCAL_CDR_REQUIRED`; motivos catálogo 10
cerrados; monto entero positivo), correlativo server-side con guardState
anti-doble, audit `DEBIT_NOTE` con hash-chain, 0 impacto en stock, `must_submit_by`
según el documento que ajusta, y saldo AR incrementado cuando el ledger está
activo. No existe staging SUNAT real: producción y piloto NO-GO (invariante 8).

## Evidencia RED→GREEN

| Hito | Run ID | Evidencia |
|---|---|---|
| RED dominio | `run-red-p1a-domain` | `debit-note.ts` ausente (tests fallaron por import) |
| GREEN dominio | `run-green-p1a-domain` | domain-fiscal-pe 66/66 (debit-note 8/8; 96% branches global) |
| GREEN motor | `run-green-p1a-motor` | unit motor 7/7 + integración D1 2/2 (correlativo +1, audit, must_submit_by, serie intacta en rechazo) |
| GREEN rutas | `run-green-p1a-routes` | debit-note-routes 4/4 (flag/400/201/422) |
| GREEN UI+E2E | `run-green-p1a-ui` | pos-web unit + E2E debit-note 1/1 (Modo Dueño emite ND) |

## Resultado local exacto

| Suite/check | Resultado observado |
|---|---|
| Domain fiscal | 66 tests GREEN (debit-note 8/8: guard ACCEPTED, catálogo 10, montos, 0 stock) |
| Adapters D1 | unit motor 7/7 + integración workerd 2/2 (emisión real con D1 + rechazo sin mover serie) |
| Worker API | debit-note-routes 4/4 (flag default-off → 404) |
| POS web | unit 219 GREEN + E2E 47/47 (debit-note 1/1) |
| `scripts/verify.sh` | `RESULT SUITE GREEN` (V-00..V-26) |

*Nota: la integración D1 del monorepo registra fallos ajenos a este sprint —
`inventory_counts.adjustment_reason` (migración 0045 del trabajo en curso de
otra agente) sin el backup registry regenerado; no incluido en este commit.*

## Cobertura contractual

| Contrato | Evidencia local |
|---|---|
| Motivos catálogo 10 cerrados | `DEBIT_NOTE_MOTIVE_CODES = ['01','02','03','10']` + test de rechazo `99` |
| Guard origen ACCEPTED | `FISCAL_CDR_REQUIRED` para PENDING/PROCESSING/REJECTED/QUARANTINED/DEADLINE (integración: serie intacta) |
| Solo factura/boleta | `DEBIT_NOTE_ORIGIN_UNSUPPORTED` para NV/NV_RETURN/07/08/12 |
| Correlativo server-side | `guardState` (serie + origen ACCEPTED en el batch) + `UPDATE current_number+1` (test de doble uso) |
| 0 stock | ND sin `sale_items` (integración: `COUNT=0`); `debitNoteStockImpact()=0` |
| `must_submit_by` | Factura +3d (integración: ventana 3–4 días), boleta +7d vía `computeMustSubmitByIso` |
| Audit | `DEBIT_NOTE` con hash-chain + `payload_json` (monto/motivo/descripción) |
| Ledger AR | Con `ledgerArApEnabled`: `balance_due_cents + amountCents` |
| Gating | `FEATURE_SALES_DEBIT_NOTE` default-off (404) |

Tests de trazabilidad:

- `packages/domain-fiscal-pe/src/debit-note.test.ts`.
- `packages/adapters-d1/src/process-debit-note-atomic.test.ts`,
  `src/process-debit-note-atomic.integration.test.ts`.
- `apps/worker-api/src/sales/debit-note-routes.test.ts`.
- `apps/pos-web/src/lib/sales/debit-note.test.ts`,
  `tests/e2e/debit-note.spec.ts`.

## Security Review

- La ND nunca permite editar el comprobante origen (inmutable, append-only);
  la cancelación es vía NC (E-A/E-B), nunca DELETE.
- Tenancy: `tenant_id` del JWT en el motor y la ruta.
- El guardState aborta la doble emisión concurrente de la misma serie.

Esta revisión no equivale a pentest.

## Evidencia externa pendiente

| Evidencia requerida | Estado | Condición de cierre |
|---|---|---|
| Envío XML ND a SUNAT/OSE real | PENDIENTE / NO-GO | Staging Cloudflare + PSE real (ADR-FISCAL-001 v2) |
| QA humana + A/V independiente | PENDIENTE / NO-GO | Firma de ADR-FISCAL-001 v2 y escalera de impresión (ledger 0335) |

## RACI real

| Rol | Estado |
|---|---|
| Staff Fiscal | Guard + motivos + spec GREEN local |
| Staff Backend ACID | Motor + integración D1 GREEN local |
| Staff Frontend/Design | Panel Modo Dueño + E2E GREEN local |
| Staff Principal V | Revisión del motor: 0 hallazgos medium+ |

## Veredicto

**SOFTWARE-GREEN.** La ND completa queda implementada y verificada en local con
la capability default-off; sin claim comercial nuevo. Producción y piloto NO-GO
hasta staging SUNAT real y firmas A/V independientes (misma condición que
ADR-FISCAL-001 v2).
