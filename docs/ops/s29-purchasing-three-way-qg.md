---
doc_id: ops-s29-purchasing-three-way-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 29 — Proveedores 3-way matching — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `purchasing.three_way`  
**Spec:** Arquitectura §5.3 regla 14 · GTM-13 · Roadmap FASE 6B · extiende S20

## Evidencia

| Check | Resultado |
|---|---|
| Mig 0022 `supplier_invoices` + `supplier_invoice_lines` (CHECKs, FK compuestas DAT-12) | GREEN |
| Dominio `assertThreeWayMatch` / override | GREEN — domain-cash three-way |
| Flag on: recepción sin CxP; match crea AP | GREEN — deferAccountsPayable + processSupplierInvoiceMatchAtomic |
| Mismatch sin override → 422; con override → SUPPLIER_PRICE_DIFF | GREEN |
| Sobre-facturación acumulada rechazada (yaFacturado por producto) | GREEN — F1, `supplier_invoice_lines` |
| Match sobre PO no recibido → 400 PO_NOT_RECEIVED | GREEN — F2 |
| Owner reporte excluye OCs facturadas CLOSED | GREEN — F3 |
| Flag compartido `isPurchasingThreeWayEnabled` (sin duplicación) | GREEN — F4 |
| PMP true-up factura tardía | GREEN — chaos + atomic |
| Flags default off (`FEATURE_PURCHASING_THREE_WAY`) | GREEN |
| Chaos `purchasing-three-way-late-invoice` 500 ciclos | GREEN |
| GTM-13 descongelado + FAQ | GREEN |
| Burn-down DAT-12: `supplier_invoices` sale del baseline V-14 | GREEN — F5 |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Backend Datos + Backend ACID + Frontend Admin | OK |
| A | Staff Principal | OK |
| V | QA + Security + Growth | OK |

## Residuales

- Promociones → Sprint 30 / GTM-15
- Variantes/UM → Sprint 31
- Apartados + diario → Sprint 32

## Remediación de auditoría (LEDGER 0288)

Auditoría del Sprint 29 detectó 5 hallazgos (F1..F5); cerrados en el propio sprint:

- **F1** — `supplier_invoices` sin líneas por producto dejaba pasar sobre-facturación en parciales
  (la query de acumulado se descartaba). Fix: tabla `supplier_invoice_lines` + acumulado por producto.
- **F2** — el match no validaba el estado de la OC. Fix: guard `PO_NOT_RECEIVED` (400).
- **F3** — el reporte owner listaba OCs totalmente facturadas como abiertas. Fix: `NOT EXISTS` de factura CLOSED.
- **F4** — flag 3-way duplicado en recepción y `invoiceCostTrueUpCents` sin uso. Fix: helper compartido + dead code eliminado.
- **F5** — FK simple en tabla nueva (deuda DAT-12 pre-baselineada) y sin CHECKs. Fix: FK compuestas,
  `uq_*_tenant_id`, CHECKs de dominio y burn-down del baseline V-14.
