---
doc_id: ops-s19-orders-kds-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Quality Gate Sprint 19 — Comandas / KDS / split bill

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-06T01:00:00Z |
| Sprint | 19 |
| Capabilities | `orders.lifecycle`, `orders.kds`, `orders.split_bill` |
| ADR | ADR-0013 BranchKdsHub |

## Evidencia

| Caso | Resultado |
|---|---|
| Transiciones + stock regla 7 + planSplitBill | GREEN (`orders.test`, domain ≥95%) |
| Chaos split overlap / stock once / cancel authz | GREEN (`orders-chaos.test`) |
| `processOrderBillingAtomic` 2 sales + PAID | GREEN (unit) |
| Cancel READY con `authorization_tokens` + audit | GREEN |
| Precio servidor en create (ignora cliente) | GREEN (`order-routes`) |
| KDS SLA helper `KDS_FIRE_SLA_MS` | GREEN (`kds-hub-helpers`) |
| BranchKdsHub DO + `/api/kds/ws` | GREEN (binding wrangler v2) |
| UI `/salon`, `/kds`, `/salon/split` + Vitrina fases pedido | GREEN |
| Claim `kds_split` → live | GREEN (registry) |

## Firmas RACI

| Rol | Firma |
|---|---|
| R Frontend / ACID / Hardware | OK |
| V Design + PM claim restaurantes GTM §2 | OK |
| V QA E2E/chaos | OK |
| A Staff Principal | ledger A+V |

## Residuales

- QR mesa → post-S19 (GTM)
- Espejo stock transferencias → Sprint 20
- Print outbox → Sprint 25 (ADR-0012)
