---
doc_id: adr-fiscal-003
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-FISCAL-003 — Nota de Débito completa (ND `08`) — Backlog v10 P1a

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-12 |
| Decisores | Staff Fiscal, Staff Backend ACID, Staff Principal |
| Consultados | Staff Security, Staff Frontend |
| Informados | Escuadrón |
| Relaciona | Arquitectura §5.1 · §5.2 · §6 · §8 · Roadmap FASE 2 · ADR-FISCAL-001 v2 · Ledger 0164 |

## Contexto

El catálogo cerrado `sales.document_type` ya admite `'08'` (ND) y la matriz
§5.1 lista NC/ND para RER/RMT/RG, pero solo existe implementación de NC
(`process-credit-note-atomic` + `ubl/credit-note.ts`). El Backlog v10 P1 exige
la **ND completa**: emitir una nota de débito que incremente el valor de un
comprobante aceptado (factura/boleta) por motivos del catálogo 10 de SUNAT.

## Decisión

1. **Dominio** `ubl-debit-note.ts` (patrón de `credit-note.ts`): motivos
   catálogo 10 cerrados (`01` interés por mora, `02` aumento de valor,
   `03` penalidades/otros conceptos, `10` ajuste de otros conceptos),
   guard de origen `ACCEPTED` (mismos NO_CDR_STATUSES de la NC: ND sin CDR
   exige anulación total E-A/E-B), `amountCents > 0`, referencia al
   comprobante origen por serie/número.
2. **Motor** `process-debit-note-atomic.ts` (patrón del NC): idempotencia por
   `(tenant, serie, número)` + clave externa, correlativo server-side en
   `db.batch`, audit `DEBIT_NOTE`, NO toca stock (la ND no devuelve ni
   consume mercadería; solo ajusta impuestos y saldos).
3. **Fiscal:** ND de factura `01` → envío unitario XML (mismo plazo que
   factura, §5.2); ND de boleta `03` → línea del Resumen Diario (RC).
4. **Cancelación:** una ND se puede anular con una NC de la ND (E-A/E-B),
   nunca con `DELETE`.
5. **Gating:** `FEATURE_SALES_DEBIT_NOTE` default-off; sin staging SUNAT real
   → software GREEN local y producción/piloto NO-GO (invariante 8).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| ND como caso especial de la NC | La NC resta (impuestos/stock) y la ND suma solo impuestos/saldos: guard y asientos distintos; forzar signo `CREDIT`/`DEBIT` en un proceso duplicaría ramas |
| Reabrir el comprobante origen | Prohibido: el CPE aceptado es inmutable; todo ajuste es un documento nuevo encadenado |
| DELETE de la ND | Violaría el patrón append-only del audit (ledger 0164 / FIS-08) |

## Consecuencias

- **Gana:** parity fiscal con facturadores (ajuste al alza sin re-facturar),
  cero re-numeración.
- **Paga:** migración del CHECK no requerida (`08` ya admitido); solo se
  extiende el catálogo de `document_type` de comprobantes emitibles en el
  dominio y la UI.
- **Activación:** `FEATURE_SALES_DEBIT_NOTE` (default `0`); package
  `@kipuspay/domain-fiscal-pe` + `@kipuspay/adapters-d1`.

## Checklist Quality Gate P1a

| # | Criterio | Evidencia | Fiscal | Backend ACID | Principal |
|---|---|---|---|---|---|
| 1 | Motivos catálogo 10 cerrados + guard ACCEPTED | `ubl-debit-note` tests | Pendiente V | — | — |
| 2 | Correlativo server-side + idempotencia | `process-debit-note-atomic` + integración D1 | — | Pendiente V | — |
| 3 | 0 DELETE / 0 stock en ND | motor + integración | Pendiente V | — | — |
| 4 | ND factura → outbox unitario; ND boleta → RC | integración | Pendiente V | — | — |
| 5 | verify + quality GREEN | scripts | — | — | Pendiente V |

**Veredicto QG:** `EN REVISION` hasta firma `A` + `V` humana independiente
(Proceso §8.1) — misma condición pendiente que ADR-FISCAL-001 v2 (ledger 0335).
