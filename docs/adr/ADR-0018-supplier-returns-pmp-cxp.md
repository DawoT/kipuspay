---
doc_id: adr-0018-supplier-returns-pmp-cxp
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0018 — Devolución a proveedor: PMP outbound, CxP y 0 CPE

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Data · Staff QA |
| Consultados | Staff Frontend · Staff Fiscal · Staff Growth · Staff Security |
| Informados | Staff Mobile |
| Relaciona | Arquitectura §5.3 regla 19 · regla 9 · regla 14 · Roadmap Sprint 34 · GTM-20 · ADR-0015 · ADR-0016 |

## Contexto

Sprint 34 (`purchasing.returns`) es el espejo de compra de la regla 13: revertir
stock + PMP + CxP al devolver mercadería al proveedor. El fence histórico usaba
`qty REAL` y FK simple `supplier_return_items.return_id → supplier_returns(id)`;
eso viola ADR-0015 y DAT-12. Copiar `processReturnAtomic` (CPE `07`/`NV_RETURN`
+ cupo + CxC) inventaría un comprobante SUNAT nuestro sobre una NC **del
proveedor**.

## Decisión

1. La “NC de proveedor” es **referencia externa** (`supplier_credit_note_ref`).
   **No** inserta `sales`, **no** emite `07`/`NV_RETURN`, **no** consume cupo
   §4.1. Distinto de GTM-05.
2. `OPEN`/`CANCELLED` = 0 movimiento. Solo `CLOSED` escribe
   `inventory_movements.movement_type = 'DEVOLUCION_PROVEEDOR'` (delta negativo,
   microunits) y baja `branch_product_stock` en el mismo `db.batch`. `batch_id`
   se persiste; **seriales = Sprint 39**. Stock insuficiente → 422
   `INSUFFICIENT_STOCK`.
3. **PMP outbound (regla 9):** `refreshAvgCostOnOutboundCents` — no llamar
   inbound `refreshAvgCostCents` al sacar stock. Fórmula INTEGER:
   `newValue = prevStock * prevPmp − qty * unit_cost`; `remaining <= 0` → PMP 0;
   si no `round(newValue / remaining)`. Qty = `microunits / QUANTITY_SCALE`.
   Round-trip ≤ 1 cent. **Nunca** reescribir `sale_items.unit_cost_cents`.
4. **CxP nunca silencio:** AP OPEN/PARTIAL del `(tenant, supplier, PO)` con
   `balance_due >= returned` → descontar 1:1. Sin AP (3-way on, aún sin factura)
   → solo stock/PMP. `PAID` o saldo insuficiente → 422 `AP_ALREADY_PAID` /
   `AP_INSUFFICIENT`.
5. Ítems deben existir en `purchase_receipt_lines` y, si hay factura, en
   `supplier_invoice_lines`. Qty ≤ recibida (y ≤ facturada). Costo distinto →
   422 o override `authorizedByUserId` + `SUPPLIER_PRICE_DIFF` (patrón S29).
6. Máquina: `OPEN → CLOSED | CANCELLED`. Close/cancel solo desde `OPEN`.
   Close-once idempotente. Sin auto-close.
7. Journal: `JournalSourceType` incluye `SUPPLIER_RETURN`;
   `planSupplierReturnJournal` = Dr **2011** / Cr **6011**, `source_id` =
   `supplier_returns.id`. Flag diario on → mismo batch; UI read-only.
8. DDL: `INTEGER *_microunits` / `*_cents`, FKs compuestas DAT-12,
   `UNIQUE (tenant_id, id)`. V-14 quema
   `supplier_return_items -> supplier_returns (return_id)`.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Emitir `07`/`NV_RETURN` nuestro | Viola regla 19 / cupo §4.1; NC es del proveedor |
| Reusar inbound `refreshAvgCostCents` al sacar stock | Distorsiona PMP; no es reverso 1:1 |
| Persistir `qty REAL` del fence histórico | Viola ADR-0015 |
| Bajar CxP en silencio si AP pagado | Viola “nunca silencio”; exige 422 explícito |
| Liberar seriales ahora | Sprint 39 / regla 24 |

## Consecuencias

- **Gana:** devolución de compra auditable, PMP forward-only, CxP explícito, 0 fiscal fantasma.
- **Paga:** mig 0027 + orquestadores create/close/cancel + Admin UI + chaos 500.
- **Invariantes:** INTEGER cents/microunits; `db.batch`; DAT-12; flag default off;
  sin fork vertical.
- **Activación:** `FEATURE_PURCHASING_RETURNS` default off.

## Evidencia de cierre

- Tests/checks: dominio supplier-return + PMP outbound, mig 0027, ACID, chaos 500.
- Ledger: entrada de cierre Sprint 34.
- Firmas RACI: `R` Datos/ACID/Frontend · `A` Staff Principal · `V` QA/Security/Growth.
