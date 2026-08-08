---
doc_id: adr-0017-quotes-com05-snapshot
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0017 — Cotizaciones COM-05, microunidades y conversión a venta

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend ACID · Staff Data · Staff QA |
| Consultados | Staff Frontend · Staff Fiscal · Staff Growth |
| Informados | Staff Mobile · Staff Security |
| Relaciona | Arquitectura §5.3 regla 18 · COM-05 · Roadmap Sprint 33 · GTM-19 · ADR-0014 · ADR-0015 · ADR-0016 |

## Contexto

Sprint 33 (`sales.quotes`) congela precios server-side con vencimiento y convierte a
venta sin emitir CPE al cotizar. El fence histórico usaba `qty REAL` y FK simple
`quote_items.quote_id → quotes(id)`; eso viola ADR-0015 y DAT-12. A diferencia del
apartado (ADR-0016), la cotización **no reserva** stock ni registra abonos.

## Decisión

1. La cotización **no emite** NV/CPE ni consume cupo. Solo `CONVERTED` llama a
   `processOfflineSaleAtomic`. Cancelar/expirar **no** genera `07`.
2. **0 reserva** en DRAFT/SENT/APPROVED/EXPIRED/CANCELLED. Convert descuenta
   stock 1:1 en el mismo `db.batch` que la venta (**sin** `skipStockDeduction`).
3. **COM-05:** al crear, el servidor resuelve lista (regla 1 / ADR-0014) y
   persiste `unit_price_cents` + microunits/UOM. Convert usa
   `serverUnitPriceCents` del snapshot; no re-resuelve listas ni re-aplica promos.
   `EXPIRED` → 422; nueva cotización con pricing vigente.
4. Máquina: `DRAFT → SENT → APPROVED → CONVERTED | EXPIRED | CANCELLED`. Convert
   solo desde `APPROVED`. DRAFT puede pasar a APPROVED en persona. `valid_until`
   pasado → `EXPIRED` + alerta Dueño; no auto-convierte ni auto-cancela.
5. Audit: `QUOTE_CREATE` / `QUOTE_SEND` / `QUOTE_APPROVE` / `QUOTE_CANCEL` /
   `QUOTE_CONVERT` / `QUOTE_EXPIRE` con hash encadenado.
6. WhatsApp: reusa opt-in S24; `MessagingSenderPort.sendQuote` + template
   `kipus_quote_v1` (nunca `documentKind: 'NV'`). Send best-effort post-commit.
7. DDL: `INTEGER *_microunits` / `*_cents`, FKs compuestas DAT-12,
   `UNIQUE (tenant_id, id)`. Cero `REAL` físico nuevo. V-14 quema
   `quote_items -> quotes (quote_id)`.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Emitir NV al cotizar | Viola regla 18 / cupo §4.1 |
| Reservar stock como apartado | Distinto de regla 17; cotización no es reserva |
| Persistir `qty REAL` del fence histórico | Viola ADR-0015 |
| Falsificar `sendReceipt` con `documentKind: NV` | Cotización no es comprobante |

## Consecuencias

- **Gana:** precio congelado COM-05, 0 fiscal prematuro, 0 reserva fantasma.
- **Paga:** mig 0026 + orquestadores convert vía sale engine + WA `sendQuote`.
- **Invariantes:** INTEGER cents/microunits; `db.batch`; DAT-12; flag default off;
  sin fork vertical.
- **Activación:** `FEATURE_SALES_QUOTES` default off.

## Evidencia de cierre

- Tests/checks: dominio quotes, mig 0026, ACID convert, chaos 500 ciclos.
- Ledger: entrada de cierre Sprint 33.
- Firmas RACI: `R` ACID/Frontend/Data · `A` Staff Principal · `V` QA/PM/Growth.
