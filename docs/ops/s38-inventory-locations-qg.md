---
doc_id: ops-s38-inventory-locations-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 38 — Ubicaciones y racks — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `inventory.locations`  
**Spec:** Arquitectura §5.3 regla 23 · ADR-0022 · GTM-17 · Roadmap FASE 6D

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0022: granular autoritativo + agregado compatible + DEFAULT | GREEN |
| Mig 0031 DAT-12 + INTEGER microunits + lote multi-rack + down con guard de drift | GREEN |
| Backfill exacto `branch_product_stock` → `DEFAULT`; schema up/down | GREEN |
| Dominio: FEFO+ubicación, transferencia, conteo, desactivación y reconciliación | GREEN |
| ACID intra-sucursal idempotente + `LOCATION_TRANSFER` hash-chain | GREEN |
| Dual-write en venta, retorno/NC, billing, apartado, xfer, OC, proveedor, conteo y merma | GREEN |
| Conteo Zero-Trust: cliente solo observado; expected/PMP server-side | GREEN |
| Flags default off + RBAC Admin/Owner + Admin racks/picking | GREEN |
| Reporte/CSV `inventory-by-location`; drift visible y total contra sucursal | GREEN |
| Chaos `inventory-location-conservation` 500 ciclos / 0 discrepancias | GREEN |
| GTM-17 parcial: solo ubicaciones/racks; S39–S42 permanecen congelados | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio: no existía `locations.ts`; asignación y reconciliación no compilaban.
- GREEN dominio: INTEGER microunits, FEFO estable y conservación exacta.
- RED migración: `0031_sprint38_inventory_locations.sql` ausente.
- GREEN migración: tres tablas DAT-12, transfer evidence, backfill y rollback protegido.
- RED ACID/API: no existían transferencia, mirror dual-write, flag, RBAC ni reporte.
- GREEN ACID/API/UI: batch único, todos los writers, Admin rack map y CSV.
- RED chaos: escenario `inventory-location-conservation` no registrado.
- GREEN chaos: Sprint 38 activo, 500 ciclos y 0 discrepancias.

## Cutover por tenant

1. Aplicar 0031 y crear `DEFAULT`.
2. Verificar `Σ inventory_location_stock = branch_product_stock` con drift cero.
3. Desplegar dual-write con UI apagada y observar shadow checks.
4. Activar `FEATURE_INVENTORY_LOCATIONS` solo en tenant piloto sin drift.
5. Ante rollback, down 0031 aborta si detecta diferencia; nunca descarta stock.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend Datos + Staff Frontend | OK |
| A | Staff Data + Staff Backend ACID | OK |
| V | Staff QA independiente + Staff Security | OK |
| Claim | Staff PM | OK — solo “ubicaciones/racks por sucursal” |

## Residuales

- Números de serie → Sprint 39.
- Peso/balanza → Sprint 40.
- Etiquetas → Sprint 41.
- Backup/restore → Sprint 42.
