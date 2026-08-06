---
doc_id: ops-s20-cadena-transfers-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Quality Gate Sprint 20 — Cadena light (transferencias + OC parcial)

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-06T01:45:00Z |
| Sprint | 20 |
| Capabilities | `stock.transfers`, `purchasing.partial_receive` |

## Evidencia

| Caso | Resultado |
|---|---|
| Conservación `received + shrink = sent` + shrink reason | GREEN (`domain-inventory`, `chaos-transfer`) |
| Ship/receive/cancel stock deltas + PMP destino | GREEN (`process-stock-transfer-atomic`) |
| Cancel IN_TRANSIT restaura origen; RECEIVED inmutable | GREEN (domain + adapter) |
| Partial receive → CxP solo qty recibida; `PARTIALLY_RECEIVED` | GREEN (`process-partial-receive-atomic`, domain-cash) |
| Migración `0014` + HTTP create/ship/receive/cancel/partial/owner | GREEN (`transfer-receive-routes`, protected-routes) |
| UI Admin `/admin/transferencias`, `/admin/oc-recepcion`; Dueño `/owner/transferencias` | GREEN |
| Claim Cadena `merma_xfer` → live | GREEN (registry post-QG) |

## Firmas RACI

| Rol | Firma |
|---|---|
| R Backend Datos / ACID | OK |
| V QA chaos conservación/cancel | OK |
| V Growth/PM claim Cadena GTM §2 | OK |
| A Staff Principal | ledger A+V |

## Residuales

- 3-way matching OC/factura → Sprint 29+ (FASE 6b; GTM-13 residual)
- Ubicaciones/racks → FASE 6D
- Soft-launch flags `FEATURE_STOCK_TRANSFERS` / `FEATURE_PURCHASING_PARTIAL_RECEIVE` default off
