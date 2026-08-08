---
doc_id: adr-0015-variants-uom-quantity-model
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0015 — Variantes, UOM y cantidades exactas

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-07 |
| Decisores | Staff Principal · Staff Backend Datos · Staff Backend ACID · Staff QA |
| Consultados | Staff Frontend · Staff Mobile · Staff PM |
| Informados | Staff Growth · Staff Security |
| Relaciona | Arquitectura §5.0 · §5.3 regla 16 · §6 · Roadmap Sprint 31 · GTM-16 · ADR-0014 · ADR-ARCH-002 |

## Contexto

Sprint 31 (`catalog.variants`, `catalog.uom`) exige conversión UOM exacta, stock
aislado por variante y compatibilidad con PMP, conteo, BOM, FEFO, listas y
promociones. El DDL previo usaba `REAL factor` y cantidades físicas `REAL`, lo
que no permite garantizar deriva cero ni reconstruir una venta después de
editar una UOM.

## Decisión

1. `QUANTITY_SCALE = 1_000_000`: toda cantidad física canónica se persiste como
   `INTEGER *_microunits`. `REAL` deja de ser fuente de verdad para stock,
   venta, lote, BOM, conteo, transferencia, recepción, devolución y rollup.
2. Cada UOM usa factor racional positivo `factor_numerator/factor_denominator`.
   El servidor convierte half-up a la microunidad, rechaza overflow y nunca usa
   `toFixed`. El cliente envía `uomId` + `enteredQuantityMicrounits`; payload
   legado sin UOM se interpreta como UOM base para no romper la cola offline.
3. Cada producto tiene exactamente una UOM base (`1/1`). Los códigos UOM se
   normalizan uppercase y toda FK tenant-owned es compuesta (DAT-12).
4. Las variantes son `products` de un nivel. Un padre con variantes es
   agrupador no vendible/sin stock; no se permiten auto-parent, ciclos ni
   variantes anidadas. SKU, stock, lote, conteo y BOM pertenecen a la variante.
5. Precio: `variant_price_override_cents` → lista padre → lista variante →
   catálogo padre (spec regla 16, "precio derivado del padre con override";
   `resolveVariantUnitPriceCents`); luego ADR-0014 (promo → descuento manual).
   El costo canónico es por unidad base (`products.cost_cents` / PMP branch),
   no se duplica en UOM.
6. BOM es explícito por variante; no hereda silenciosamente del padre.
   Componentes y FEFO se debitan en microunidades dentro del mismo plan ACID.
7. `sale_items` guarda UOM vendida, cantidad ingresada, factor racional y
   cantidad base. Cambiar una UOM no altera ticket, devolución ni COGS pasado.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| `REAL factor` normalizado a seis decimales | Conserva deriva y doble semántica |
| Microunidades solo en el payload | D1 seguiría siendo una fuente flotante |
| Factores/costos duplicados por UOM | Rompe PMP como costo base canónico |
| Variantes anidadas o BOM heredado | Ambigüedad de stock y explosión |

## Consecuencias

- **Gana:** aritmética determinista, histórico reproducible y deriva exacta cero.
- **Paga:** migración 0024 reconstruye/backfillea las tablas físicas y actualiza
  todos los adapters que consumen cantidades.
- **Invariantes:** INTEGER cents/microunits; `db.batch`; DAT-12; flags default off;
  venta offline legado permanece aceptable.
- **Activación:** Sprint 31 con `FEATURE_CATALOG_VARIANTS` y
  `FEATURE_CATALOG_UOM`, ambos default off.

## Evidencia de cierre

- Tests/checks: dominio variants-uom, mig 0024, integración ACID y chaos
  `variants-uom-bom-batch` 500 ciclos.
- Ledger: entrada de cierre Sprint 31.
- Firmas RACI: `R` Datos/ACID/Frontend · `A` Staff Principal · `V` QA/PM.
