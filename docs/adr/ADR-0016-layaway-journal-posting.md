---
doc_id: adr-0016-layaway-journal-posting
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0016 — Apartados, anticipos y diario contable

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-07 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Data · Staff QA |
| Consultados | Staff Frontend · Staff Fiscal · Staff Growth |
| Informados | Staff Mobile · Staff Security |
| Relaciona | Arquitectura §5.3 regla 17 · §5.4 regla 3 · Roadmap Sprint 32 · GTM-14 · GTM-17 · ADR-0015 · ADR-FISCAL-001 |

## Contexto

Sprint 32 (`sales.layaway`, `ledger.chart_of_accounts`) exige reserva + abonos
sin CPE hasta convertir, cancelación reutilizando la política de devolución
(regla 13) y un diario automático bit-consistente con el export Cadena S23.
El fence histórico usaba `qty REAL` y FKs simples; eso viola ADR-0015 y DAT-12.
`computeExpectedCashCents` (S17) no conoce `SALE_REFUND`, así que un Z con
devolución cash ya rompe.

## Decisión

1. El apartado **no emite** NV/CPE. Solo la conversión llama a
   `processOfflineSaleAtomic` y ahí nace el documento fiscal. Cancelar un
   `OPEN`/`OVERDUE` **no** genera `07`/`NV_RETURN`; reembolsa Σ
   `sale_deposit_payments` según ventana/método de regla 13, libera reserva y
   audita `LAYAWAY_CANCEL`. Si ya estaba `CONVERTED`, la reversión fiscal reusa
   `processReturnAtomic` sobre ese `sale_id`.
2. Reserva física atómica (`RESERVA_APARTADO` / `LIBERA_APARTADO`) en
   microunidades de la variante/lote FEFO. No es `VENTA`. Convertir consume la
   reserva en el mismo `db.batch` que la venta.
3. COM-08: todo abono es fila de `sale_deposit_payments` (sin
   `initial_deposit_cents` duplicado). Precio snapshot server-side. Saldo =
   total snapshot − Σ abonos.
4. `chart_of_accounts` sembrado por tenant: `1011` caja, `1212` CxC, `7011`
   ventas, `4011` IGV, `2101` anticipos cliente, `2011` CxP. Cada fuente
   (`SALE|PAYMENT|SUPPLIER_INVOICE|AR_AP|CASH_COUNT|LAYAWAY|SALES_RETURN`)
   postea en el mismo `db.batch`. Idempotencia =
   `UNIQUE (tenant_id, source_type, source_id)`. `balanced_cents` debe ser 0.
5. Flag diario off: el export S23 sigue derivado de ventas/CxC. Flag on: el
   export lee `journal_lines` y debe coincidir bit a bit con
   `buildAccountingEntries()` para `NV/01/03`. Anticipos usan `2101` (extensión
   documentada; no rompe golden de ventas). UI/export nunca mutan `journal_*`.
6. `due_date` pasado → `OVERDUE` + alerta Modo Dueño; no auto-cancela ni emite.
7. Arqueo: `SALE_REFUND` y `LAYAWAY_REFUND` son outflows; abonos de apartado
   (`LAYAWAY_DEPOSIT`) son inflows de la sesión abierta.
8. DDL: `INTEGER *_microunits` / `*_cents`, FKs compuestas DAT-12,
   `UNIQUE (tenant_id, id)`. Cero `REAL` físico nuevo.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Emitir NV al crear el apartado | Viola regla 17 / GTM-17 (CPE solo al convertir) |
| Cancelar con `processReturnAtomic` sobre el depósito | No hay `sale`; inventaría un `07` |
| Persistir `qty REAL` del fence histórico | Viola ADR-0015 / deriva |
| Dejar el export siempre derivado y el diario solo UI | GTM-14 exige bit-consistencia Cadena |

## Consecuencias

- **Gana:** anticipo sin fiscal prematuro, reserva exacta y diario auditable.
- **Paga:** mig 0025 + hooks de posting en venta/AR-AP/3-way/Z/return + arqueo.
- **Invariantes:** INTEGER cents/microunits; `db.batch`; DAT-12; flags default off;
  sin fork vertical.
- **Activación:** `FEATURE_SALES_LAYAWAY` y
  `FEATURE_LEDGER_CHART_OF_ACCOUNTS`, ambos default off.

## Evidencia de cierre

- Tests/checks: dominio layaway/journal, mig 0025, ACID, chaos 500 ciclos,
  export golden C4.
- Ledger: entrada de cierre Sprint 32.
- Firmas RACI: `R` ACID/Frontend/Data · `A` Staff Principal · `V` QA/PM/Growth.
