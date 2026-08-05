---
doc_id: ops-s18-inventory-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Quality Gate Sprint 18 — Inventario real (FEFO / BOM / PMP / conteo)

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-05T23:40:00Z |
| Sprint | 18 |
| Capabilities | `inventory.batches`, `inventory.bom`, `pricing.lists` |

## Evidencia

| Caso | Resultado |
|---|---|
| `allocateFefo` / chaos lote concurrente | GREEN (`chaos-stock.test`) |
| BOM explosión + componente corto | GREEN |
| Conteo APPROVED inmutable + authz umbral | GREEN (`domain-inventory`) |
| Merma APPROVED exige evidencia R2 | GREEN |
| PMP snapshot como COGS / split FEFO líneas | GREEN (`offline-sale` + adapter) |
| API conteo/merma/alertas Dueño | GREEN (`inventory-ops-routes`) |
| UI Owner `/owner/stock` + Admin `/admin/inventario` | GREEN |
| Claim farmacia `fefo_lots` → live | GREEN (registry) |

## Firmas RACI

| Rol | Firma |
|---|---|
| R Backend Datos / ACID | OK |
| V QA chaos | OK |
| V PM claim farmacia GTM §2 | OK |
| A Staff Principal | pendiente ledger A+V humano si aplica |

## Residuales

- KDS WS → Sprint 19
- Espejo stock transferencias → Sprint 20
