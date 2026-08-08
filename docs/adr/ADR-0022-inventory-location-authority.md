---
doc_id: adr-0022-inventory-location-authority
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0022 — Stock por ubicación como fuente granular y agregado compatible

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend Datos · Staff Data · Staff QA |
| Consultados | Staff Frontend · Staff PM · Staff Backend ACID |
| Informados | Staff Growth · Staff Security · Staff Mobile |
| Relaciona | Arquitectura §5.3 regla 23 · Roadmap Sprint 38 · ADR-0007 · ADR-0015 · DAT-12 |

## Contexto

Sprint 38 (`inventory.locations`) debe ubicar producto y lotes en racks sin
romper los escritores de stock existentes. El fence histórico usa `qty REAL`,
carece de FKs DAT-12 y no decide autoridad, backfill, FEFO multi-rack,
concurrencia ni rollback. Una proyección best-effort permitiría deriva entre
ubicación y sucursal; retirar de golpe `branch_product_stock` rompería
compatibilidad con venta, PMP y reportes.

## Decisión

1. `inventory_location_stock.quantity_microunits` es la fuente granular y
   `branch_product_stock.stock_microunits` su agregado compatible:
   `branch = Σ ubicaciones activas`, exacto en INTEGER microunits.
2. Toda escritura de inventario actualiza granular + agregado en el mismo
   `db.batch`; el flag oculta API/UI, nunca desactiva consistencia.
3. Cada sucursal tiene una ubicación activa `DEFAULT`; migración y oversell
   offline caen ahí de forma determinista. La venta nunca se pierde.
4. `inventory_location_batch_stock` permite repartir un lote entre racks.
   Salidas: FEFO por vencimiento y luego código/ID de ubicación estable.
5. Transferencia intra-sucursal es idempotente, debita origen y acredita destino
   con guards SQL, conserva agregado/PMP y audita `LOCATION_TRANSFER`.
6. Conteo acepta solo cantidad observada; stock esperado y valorización se
   resuelven server-side. Aprobar ajusta ubicación, lote, agregado y movimiento
   en el mismo batch.
7. Ubicación con stock no se desactiva. El down colapsa y verifica las sumas
   antes de borrar detalle; cualquier drift aborta.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Sucursal autoritativa; racks como proyección | Admite deriva y picking falso |
| Solo ubicación, eliminar agregado | Cutover incompatible con hot paths/PMP |
| Un lote en un solo rack | No representa putaway y picking reales |
| Diferir lotes | Rompe FEFO y trazabilidad de devoluciones |
| Copiar `qty REAL` histórico | Viola ADR-0015 y exactitud |

## Consecuencias

- **Gana:** conservación exacta, FEFO multi-rack, conteo y picking reproducibles.
- **Paga:** mig 0031, backfill `DEFAULT` y dual-write en todos los stock writers.
- **Invariantes tocadas:** INTEGER microunits; DAT-12; `db.batch`; offline-first;
  audit hash-chain; cero forks por vertical.
- **Activación:** dual-write tras migración; UI/API por
  `FEATURE_INVENTORY_LOCATIONS` default off.

## Evidencia de cierre

- Tests/checks: dominio locations, schema up/down, reconciliación, ACID y chaos 500.
- Ledger: entrada de cierre Sprint 38.
- Firmas RACI: `R` Staff Backend Datos/Frontend · `A` Staff Data · `V` Staff QA
