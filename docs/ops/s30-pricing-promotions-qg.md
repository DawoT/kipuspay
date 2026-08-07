---
doc_id: ops-s30-pricing-promotions-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 30 — Promociones y tramos — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `pricing.promotions`  
**Spec:** Arquitectura §5.3 regla 15 · ADR-0014 · GTM-15 · Roadmap FASE 6B

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0014 (orden lista→promo→descuento; schemas; DAT-12) | GREEN |
| Mig 0023 `promotions` + `product_promotions` (FK compuestas DAT-12) | GREEN |
| Dominio `assertAndApplyPromotions` / `parsePromoRule` / stack | GREEN — domain-sales promotions |
| Flag on: sale aplica IDs; flag off + IDs → FEATURE_OFF | GREEN — processOfflineSaleAtomic |
| Anti-apilamiento `PROMO_STACK_FORBIDDEN` | GREEN — unit + chaos |
| FEFO `batch_id` no mutado por promo | GREEN — chaos batchIdStable |
| Admin CRUD + `PROMOTION_CHANGE` audit | GREEN — pricing-promotions-routes |
| Flags default off (`FEATURE_PRICING_PROMOTIONS`) | GREEN |
| Chaos `promotions-anti-stack` 500 ciclos | GREEN |
| GTM-15 descongelado (gate Sprint 30) + FAQ | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Backend ACID + Frontend caja/Admin + PM | OK |
| A | Staff Principal | OK |
| V | QA + Growth | OK |

## Residuales

- Variantes/UM → Sprint 31 / GTM-16
- Apartados + diario → Sprint 32
- Margen post-descuento / aprobación Dueño (roadmap opcional) → backlog
