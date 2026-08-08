---
doc_id: adr-0021-commissions-accrual-payout
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0021 — Comisiones: accrual COM-07, payout Zero-Trust y nómina OOS

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend Datos · Staff Data · Staff PM · Staff Security |
| Consultados | Staff Frontend · Staff Mobile · Staff Growth · Staff Backend ACID |
| Informados | Staff Fiscal · Staff QA |
| Relaciona | Arquitectura §5.3 regla 22 · COM-07 · Roadmap Sprint 37 · GTM-23 · ADR-0019 · ADR-0020 |

## Contexto

Sprint 37 (`sales.commissions`) cierra comisiones de vendedor. El fence histórico
usa FKs simples hacia `users`/`sales`/`products` (deuda DAT-12 / V-14). Confiar
el monto de payout o de comisión al cliente viola Zero-Trust. Emitir planilla o
retenciones laborales inventaría nómina fuera de alcance (regla 22). Reusar
2101/2102/1212 mezclaría pasivos/activos ajenos.

## Decisión

1. **Modelo:** rates Admin → accrual en venta (1 fila por `(sale_id, seller_id)`)
   → payout por período. `category_id` TEXT nullable **sin FK**.
2. **Atribución:** `OfflineSalePayload.sellerId` → `sale_items.seller_id`. Sin
   seller → 0 accrual. Badge/PIN EMP- fuera (S51).
3. **Tasa servidor:** match `(seller,product)` → `(seller,category)` →
   `(seller,null,null)`. `rate_amount_cents` gana sobre `%`; half-up INTEGER.
   Cliente nunca envía monto de comisión.
4. **COM-07:** NC/return del origen setea `reversed_at` (nunca DELETE). S37 =
   reverse full de accruals de esa venta.
5. **Payout Zero-Trust:** Admin/Owner envía seller + período; servidor calcula
   `gross_cents`. `OPEN → PAID` exige audit `COMMISSION`. `VOID` solo desde OPEN.
6. **GL:** semilla **6311** EXPENSE + **2111** LIABILITY. Accrue Dr 6311 / Cr
   2111; reverse inverso; pay Dr 2111 / Cr 1011. `JournalSourceType` +=
   `COMMISSION` (SQL CHECK S32 ya lo permite).
7. **DDL:** INTEGER `*_cents`; `rate_percent` REAL (ratio); FKs compuestas
   DAT-12; `UNIQUE (tenant_id, id)`. V-14 quema 5 FKs simples.
8. **RBAC:** rates/payouts = Admin/Owner; accrue automático si flag on.
9. **Nómina:** fuera — 0 planilla, 0 retenciones laborales.
10. **Flag:** `FEATURE_SALES_COMMISSIONS` default off.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Confiar `grossCents` del cliente | Viola Zero-Trust |
| Emitir planilla / retenciones | Viola regla 22 (nómina OOS) |
| Reusar GL 2101/2102/1212 | Pasivos/activos ajenos |
| FKs simples del fence | Viola DAT-12; V-14 no puede crecer |
| Badge EMP- en S37 | Roadmap S50–51 |

## Consecuencias

- **Gana:** accrual auditable, reverse COM-07, payout server-imposed, reporte Dueño.
- **Paga:** mig 0030 + sale-engine seller_id + Admin/Owner + chaos 500.
- **Invariantes:** INTEGER cents; `db.batch`; DAT-12; flag default off; sin fork
  vertical.
- **Activación:** `FEATURE_SALES_COMMISSIONS` default off.

## Evidencia de cierre

- Tests/checks: dominio commissions + journal COMMISSION, mig 0030, ACID, chaos 500.
- Ledger: entrada de cierre Sprint 37.
