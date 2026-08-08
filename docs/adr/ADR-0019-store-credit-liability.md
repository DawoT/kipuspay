---
doc_id: adr-0019-store-credit-liability
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0019 — Crédito de tienda: pasivo 2102, saldo servidor y 0 fraude

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Security · Staff QA |
| Consultados | Staff Frontend · Staff Fiscal · Staff Growth · Staff Data |
| Informados | Staff Mobile · Staff PM |
| Relaciona | Arquitectura §5.3 regla 20 · regla 13 · Roadmap Sprint 35 · GTM-21 · ADR-0015 · ADR-0016 · ADR-0018 |

## Contexto

Sprint 35 (`ledger.store_credit`) cierra vales / gift cards / crédito de tienda.
El fence histórico usaba FKs simples `store_credit_transactions → store_credit_accounts`
y `→ sales`; eso viola DAT-12 y el ratchet V-14. Reusar `2101` (anticipos/apartados)
mezclaría pasivos distintos. Confiar el monto de canje al cliente viola Zero-Trust.
Copiar la NC de cliente (GTM-05) o la NC de proveedor (GTM-20) inventaría fiscal
o inventario donde solo hay un pasivo.

## Decisión

1. **Fiscal / cupo:** venta de vale = venta vía sale engine (doc según modo, **sí
   consume cupo** §4.1). Canje = tender de **otra** venta (esa emite CPE/NV de
   mercadería). Distinto de GTM-05 y GTM-20. Sin canal fiscal nuevo.
2. **Saldo anti-fraude:** solo el servidor muta `balance_cents`. Cliente envía
   `customerId` + `useStoreCredit: true` (nunca el monto de canje). Servidor aplica
   `applied = min(balance, remainingDue)`. Monto cliente en tender `store_credit`
   se ignora. Saldo negativo = 422 `STORE_CREDIT_INSUFFICIENT`. `CHECK
   (balance_cents >= 0)` + `atomic_guards`.
3. **GL 2102 (no reusar 2101):** semilla `2102 Créditos de tienda` LIABILITY.
   `2101` sigue siendo solo anticipos/apartados. `JournalSourceType` incluye
   `STORE_CREDIT` (SQL CHECK S32 ya lo permite).
   - Venta vale: Dr caja/tarjeta **Cr 2102** (+ 4011 si hay IGV); **no** Cr 7011
     por el face del vale.
   - Canje: methodCode `store_credit` → Dr **2102** (no 1011). Resto 7011+4011.
   - NC→crédito: `planSalesReturnJournal` Cr **2102**; 0 `SALE_REFUND`; 0 AR.
   - EXPIRE: Dr 2102 / Cr 7011. ADJUST: 2102 vs 6591. Flag diario on → mismo
     batch; UI read-only.
4. **NC sin reembolso (regla 13 → 20):** hook en `processReturnAtomic` solo si
   `consentStoreCredit === true` **y** `!arCompensate` **y** `!cashRefund`. CxC
   abierto → se compensa AR y **no** se emite crédito. Sin consentimiento → S28
   actual. Audit `STORE_CREDIT_ISSUE` + `source_ref = nc:{returnId}`.
5. **Máquina:** `ISSUE | REDEEM | EXPIRE | ADJUST`. `amount_cents > 0`. ADJUST
   lleva `adjust_sign` `CREDIT|DEBIT` + `authorizedByUserId` (patrón S29, no PIN).
   EXPIRE on-read + endpoint Admin. Sin auto-cron.
6. **Idempotencia:** `UNIQUE (tenant_id, source_ref)` not null
   (`gift_card_sale:{saleId}` / `nc:{returnId}` / `redeem:{saleId}`). Retry
   devuelve la misma txn.
7. **Offline:** venta de vale puede encolar; ISSUE viaja en el `db.batch` al
   sync. **Canje prohibido offline** → 422 `STORE_CREDIT_OFFLINE`.
8. **Una cuenta por cliente** (`UNIQUE (tenant_id, customer_id)`). Vale sin
   cliente → 422 `STORE_CREDIT_CUSTOMER_REQUIRED`. Gift card anónima = fuera.
9. **DDL:** `INTEGER *_cents`, FKs compuestas DAT-12, `UNIQUE (tenant_id, id)`.
   V-14 quema las 2 FKs simples de `store_credit_transactions`.
10. **RBAC:** canje = Admin/Owner; venta de vale e ISSUE-NC = Cajero/Supervisor;
    ADJUST/EXPIRE = Admin/Owner.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Reusar GL 2101 anticipos | Mezcla apartado (ADR-0016) con crédito de tienda |
| Confiar `amountCents` del cliente en canje | Viola Zero-Trust / QG Security |
| Gift card anónima (sin `customer_id`) | Fuera de alcance; una cuenta por cliente |
| Emitir `07` al canjear o al vender vale extra | Vale ya es venta; canje es tender de otra venta |
| Persistir FKs simples del fence histórico | Viola DAT-12; V-14 no puede crecer |
| Canje offline | Fraude de saldo; análogo loyalty origin disabled |

## Consecuencias

- **Gana:** pasivo auditable, 0 saldo negativo, gift card nunca salta el registro
  de la venta, NC→crédito explícito con consentimiento.
- **Paga:** mig 0028 + orquestadores issue/redeem/expire/adjust + caja/Admin/Owner
  + chaos 500.
- **Invariantes:** INTEGER cents; `db.batch`; DAT-12; flag default off; sin fork
  vertical.
- **Activación:** `FEATURE_LEDGER_STORE_CREDIT` default off.

## Evidencia de cierre

- Tests/checks: dominio store-credit + journal 2102, mig 0028, ACID, chaos 500.
- Ledger: entrada de cierre Sprint 35.
