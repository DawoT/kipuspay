---
doc_id: ops-s17-anti-fraude-caja
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Quality Gate Sprint 17 — Suite anti-fraude de caja

| Campo | Valor |
|---|---|
| Fecha UTC | 2026-08-05T22:30:00Z |
| Sprint | 17 |
| ADR | ADR-0012 |

## Evidencia

| Caso | Resultado |
|---|---|
| `planBlindClose` exige conteo estricto | GREEN (`domain-cash` blind-z.test) |
| Expected oculto hasta POST `/api/cash/sessions/blind-close` | GREEN (POS `/caja` + API) |
| Fórmula arqueo opening+ventas+ingresos−retiros−egresos | GREEN (`computeExpectedCashCents`) |
| Descuento sobre umbral sin token → 403 | GREEN (`offline-sale-route` mapError) |
| Crédito sobre límite → 422 | GREEN (`CREDIT_LIMIT_EXCEEDED`) |
| `sale_reprints` watermark COPIA | GREEN (`runSaleReprintHttp`) |
| Outbox stub pending=0 no bloquea (ADR-0012) | GREEN |
| Token authz consumido (`used_at`) | GREEN (batch `authorization_tokens`) |

## Firmas RACI

| Rol | Firma |
|---|---|
| R Backend ACID | OK (evidencia unitaria) |
| V Security / QA | OK (suite arriba) |
| C Design (UX ciego) | OK (`/caja` expected oculto) |
| A Staff Principal | pendiente ledger A+V humano |

## Residuales (no bloquean S17)

- Edge 2D outbox real → S25
- Edge 1C SHIFT_TRANSFER → S51
