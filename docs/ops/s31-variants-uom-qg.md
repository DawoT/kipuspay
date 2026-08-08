---
doc_id: ops-s31-variants-uom-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 31 — Variantes y UOM — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `catalog.variants`, `catalog.uom`  
**Spec:** Arquitectura §5.0 · §5.3 regla 16 · §6 · ADR-0015 · GTM-16 · Roadmap FASE 6B

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0015 (`QUANTITY_SCALE`, racionales, topología, pricing, snapshots) | GREEN |
| Mig 0024 variants/UOM + columnas canónicas `INTEGER *_microunits` | GREEN |
| DAT-12 `product_uoms` y parent guard tenant-scoped | GREEN |
| Dominio conversión half-up, overflow, código UOM y topología | GREEN |
| Payload legado sin UOM preservado; flag con UOM default off | GREEN |
| Precio lista variante→padre→override→catálogo; promo S30 después | GREEN |
| Venta guarda snapshot UOM/factor/cantidad base | GREEN |
| Carrito agrega por producto+UOM y cliente no envía factor | GREEN |
| BOM explícito por variante y componentes pasan por FEFO | GREEN |
| Admin/Owner + `VARIANT_CHANGE`/`UOM_CHANGE` en `db.batch` | GREEN |
| Modo Dueño muestra stock base agregado por variante | GREEN |
| Chaos `variants-uom-bom-batch` 500 ciclos, deriva 0 | GREEN |
| GTM-16 + FAQ/marketing; apartados conservados en Sprint 32 | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: `variants-uom.test.ts` falló por módulo inexistente.
- GREEN dominio: 6/6 pruebas.
- RED payload: UOM sin `quantity` falló `INVALID_QUANTITY`.
- GREEN payload: 18/18 pruebas `offline-sale`.
- RED migración: workerd falló por mig 0024 inexistente.
- GREEN migración/ACID: 56/56 integración D1.
- RED UI/flags: faltaron helpers y carrito cruzó UOM.
- GREEN UI/flags: 7/7 pruebas.
- RED chaos: runner inexistente.
- GREEN chaos: 500 ciclos, 0 discrepancias.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend Datos + ACID + Frontend + Mobile | OK |
| A | Staff Principal | OK |
| V | Staff QA + Staff PM | OK |

## Residuales

- Apartados/anticipos y diario contable → Sprint 32.
- Balanza, series, etiquetas y ubicaciones → Sprints 38–42.
