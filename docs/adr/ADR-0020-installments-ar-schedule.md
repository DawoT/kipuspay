---
doc_id: adr-0020-installments-ar-schedule
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0020 — Cuotas: schedule sobre AR, principal-only CxC y COM-06

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Security · Staff QA |
| Consultados | Staff Frontend · Staff Fiscal · Staff Growth · Staff Data |
| Informados | Staff Mobile · Staff PM |
| Relaciona | Arquitectura §5.3 regla 21 · regla 3 · COM-06 · Roadmap Sprint 36 · GTM-22 · ADR-0015 · ADR-0016 · ADR-0019 |

## Contexto

Sprint 36 (`sales.installments`) cierra cuotas / pago en partes. El fence histórico
usa FKs simples `sale_installments → sales` y `sale_installment_payments →
sale_installments` (COM-04 debt); eso viola DAT-12 y el ratchet V-14. Confiar el
monto de pago al cliente viola Zero-Trust. Mezclar cuotas con apartado (2101) o
crédito de tienda (2102) inventaría pasivos donde solo hay schedule sobre CxC.
COM-06 exige separar principal (reduce AR 1:1) de interés (nunca reduce CxC 1:1).

## Decisión

1. **Modelo:** 1 venta a crédito → 1 `accounts_receivable` + N `sale_installments`.
   Las cuotas **no** sustituyen el AR; son el schedule. `Σ principal_cents` =
   total venta (o saldo AR tras abono inicial). `Σ amount_cents` puede ser
   `> total` si `interest_cents > 0` (COM-06).
2. **Abono inicial:** opcional (`downPaymentCents` en cash/card en la misma
   venta); AR se abre por el resto; cuotas cubren solo ese saldo. Sin abono:
   AR = total y Σ principal = total.
3. **Fiscal / cupo:** la venta emite doc+cupo (sale engine). Pago de cuota **no**
   emite CPE ni consume cupo. Distinto de GTM-17 (apartado) y GTM-21 (vale).
4. **Pago Zero-Trust:** cliente envía `installmentId` + `idempotencyKey` (+
   método/sesión); nunca impone `principalCents`/`interestCents`. Servidor lee
   la cuota. Retry misma key → misma txn. Key distinta sobre `PAID` → 422
   `INSTALLMENT_ALREADY_PAID`.
5. **COM-06 interés:** `appliedToAr = principal_cents` únicamente. Interés se
   asienta con `source_type = INSTALLMENT` (Cr 7011 memo interés); **nunca**
   reduce `balance_due_cents` 1:1. `amount_cents = principal_cents + interest_cents`.
6. **credit_limit (regla 3):** al crear el plan se revalida
   `assertCreditWithinLimit` sobre el saldo AR resultante.
7. **OVERDUE:** on-read (get/pay/Owner): `due_date < hoy` y `PENDING` →
   `OVERDUE`. Sin auto-cron. Atraso **nunca** corta la caja.
8. **NC:** si S28 deja AR en 0, cancelar `PENDING|OVERDUE` → `CANCELLED` en el
   mismo batch. NC parcial: no reprograma; pago con AR 0 → 422
   `INSTALLMENT_AR_CLOSED`.
9. **DDL:** `INTEGER *_cents`, FKs compuestas DAT-12, `UNIQUE (tenant_id, id)`,
   `UNIQUE (tenant_id, sale_id, installment_number)`,
   `UNIQUE (tenant_id, idempotency_key)`. V-14 quema las 2 FKs simples del fence.
10. **RBAC:** crear plan / cobrar cuota = Supervisor/Admin/Owner; Cajero no.
    Owner: lista OVERDUE.
11. **Journal:** `JournalSourceType` += `INSTALLMENT` (SQL CHECK S32 ya lo
    permite). Pago: Dr caja; Cr 1212 (principal); Cr 7011 (interés si > 0).
    Flag chart on → mismo batch; UI diario read-only.
12. **Flag:** `FEATURE_SALES_INSTALLMENTS` default off.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Cuotas como sustituto del AR | Pierde compensación NC S28 y export CxC |
| Confiar monto de pago del cliente | Viola Zero-Trust / QG Security |
| Interés reduce CxC 1:1 | Viola COM-06 |
| Reusar GL 2101/2102 | Apartado / store credit; cuotas son activo 1212 |
| Persistir FKs simples del fence | Viola DAT-12; V-14 no puede crecer |
| Cron OVERDUE obligatorio | On-read basta (precedente quotes S33) |

## Consecuencias

- **Gana:** schedule auditable, 0 doble pay, credit_limit al crear, atraso visible
  sin apagar caja.
- **Paga:** mig 0029 + plan/pay ACID + caja/Owner + chaos 500.
- **Invariantes:** INTEGER cents; `db.batch`; DAT-12; flag default off; sin fork
  vertical.
- **Activación:** `FEATURE_SALES_INSTALLMENTS` default off.

## Evidencia de cierre

- Tests/checks: dominio installments + journal INSTALLMENT, mig 0029, ACID, chaos 500.
- Ledger: entrada de cierre Sprint 36.
