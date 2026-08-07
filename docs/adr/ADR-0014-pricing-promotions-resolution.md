---
doc_id: adr-0014-pricing-promotions-resolution
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0014 — Resolución de promociones (orden, stack, schemas)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-07 |
| Decisores | Staff Principal · Staff Backend ACID · Staff QA |
| Consultados | Staff Frontend · Staff PM · Staff Growth |
| Informados | Staff Security · Staff Mobile |
| Relaciona | Arquitectura §5.3 regla 15 · Roadmap Sprint 30 · GTM-15 · ADR-ARCH-002 · ADR-0012 |

## Contexto

Sprint 30 (`pricing.promotions`) exige motor 2x1 / % / umbral / tramo con precio
impuesto por el sale engine (cliente solo envía IDs). La regla 15 deja
`rule_json` y `max_stack_json` opacos; sin contrato tipado el anti-apilamiento y el
orden lista→promo→descuento manual no son verificables en QG.

## Decisión

1. **Orden servidor:** precio catálogo → lista S18 (`resolveServerUnitPriceCents`) →
   promoción(es) por ID → descuento manual S17 (`assertDiscountAuthorized`). El
   cliente nunca envía `unitPriceCents` final.
2. **Payload:** `OfflineSaleItemPayload.promotionIds?: readonly string[]`.
3. **`rule_json.kind`:** `buy_x_get_y` | `percent` | `threshold` | `tier`. JSON
   inválido → 422 `PROMO_RULE_INVALID`.
4. **`max_stack_json`:** default `{}` ≡ `{ "maxCount": 1 }`. Con
   `{ "maxCount": N, "compatibleKinds": [...] }` solo se apilan kinds listados
   hasta N. Violación → 422 `PROMO_STACK_FORBIDDEN`.
5. **DAT-12:** `promotions` / `product_promotions` con FKs compuestas
   `(tenant_id, …)` y `UNIQUE (tenant_id, id)` desde mig 0023 (fence §5.3 alineado).
6. **Fuera de S30:** margen post-descuento / aprobación Dueño (opcional en roadmap;
   AC no lo exige).

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Cliente envía precio final + ID | Viola Zero-Trust regla 1 / GTM-15 |
| Apilar libre sin `max_stack_json` | No cumple anti-apilamiento del AC |
| Diferir schemas al adapter | Dominio debe ser puro y testeable sin D1 |

## Consecuencias

- **Gana:** QG medible (matriz promo×descuento×tramo + chaos 500 ciclos).
- **Paga:** CRUD Admin debe emitir `rule_json`/`max_stack_json` válidos.
- **Invariantes:** INTEGER cents; `db.batch`; capabilities por flag; sin fork vertical.
- **Activación:** Sprint 30; `FEATURE_PRICING_PROMOTIONS` default off.

## Evidencia de cierre

- Tests / checks: domain-sales promotions + mig 0023 + chaos `promotions-anti-stack`
- Ledger: entrada Sprint 30 (cierre QG)
- Firmas RACI: `R` Backend ACID · `A` Staff Principal · `V` QA / PM
