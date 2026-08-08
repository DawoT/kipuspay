---
doc_id: ops-s39-inventory-serials-qg
alias: "—"
authority: normativa
owner: "@DawoT"
---

# Sprint 39 — Números de serie — Quality Gate

**Estado:** GOV-APROBADO (firma A+V)  
**Capabilities:** `inventory.serials`  
**Spec:** Arquitectura §5.6 regla 24 · ADR-0023 · GTM-17 · Roadmap FASE 6D

## Evidencia

| Check | Resultado |
|---|---|
| ADR-0023: identidad tenant-global, historial append-only y lease exclusivo | GREEN |
| Mig 0032 DAT-12 + INTEGER microunits + down fail-closed ante drift/leases | GREEN |
| Dominio: normalización NFKC, cardinalidad exacta y máquina de estados | GREEN |
| ACID: proyección + evento + manifiesto + audit hash-chain en un `db.batch` | GREEN |
| Cutover en recepción, venta, retorno/NC, apartado, transferencias, conteo y merma | GREEN |
| Lease opaco SHA-256, terminal activo de la misma sucursal y release explícito | GREEN |
| Venta offline: serial ID + token; terminal confiable del request; servidor autoritativo | GREEN |
| Flags default off + RBAC + API/errores 422 accionables sin detalles D1 | GREEN |
| POS/Admin accesible y reporte `inventory-serial-warranty` con historial reproducible | GREEN |
| Concurrencia D1: un ganador de lease; replay stale y cross-branch rechazados | GREEN |
| Security Review: 0 critical/high; hallazgo medium de branch binding corregido | GREEN |
| Chaos `inventory-serial-assignment` 500 ciclos / 0 drift / 0 doble asignación | GREEN |
| `scripts/verify.sh` | SUITE GREEN |
| `scripts/quality.sh` | Quality Gate OK |

## Evidencia RED→GREEN

- RED dominio/API/chaos: módulos de serie, rutas, flags y escenario no existían.
- GREEN dominio: normalización, cardinalidad, estados y leases exclusivos.
- RED migración: `0032_sprint39_inventory_serials.sql` ausente.
- GREEN migración: proyección, eventos, leases y manifiestos DAT-12 con rollback protegido.
- RED seguridad: un terminal podía adquirir una serie de otra sucursal.
- GREEN seguridad: acquire/release/consume validan tenant, terminal activo y sucursal de la serie.
- RED checkout: la cola conservaba token, pero sync no construía asignaciones confiables.
- GREEN checkout: HTTP/sync derivan asignaciones desde payload y terminal de cabecera validado en D1.
- RED auditoría: existía historial serial, pero faltaba `audit_events` hash-chain.
- GREEN auditoría: `SERIAL_ASSIGN` y `SERIAL_TRANSITION` encadenan SHA-256 con guard anti-fork.
- GREEN chaos: 500 ciclos deterministas, cero discrepancias, fantasmas, doble ownership o drift.

## Cutover por tenant

1. Aplicar 0032 con flags apagados y verificar unicidad/rollback.
2. Observar reconciliación shadow: una serie física equivale a `1_000_000` microunidades.
3. Desplegar todos los writers y auditar drift cero antes de exponer UI.
4. Registrar terminales del piloto y precargar leases online sin reasignación por timeout.
5. Activar backend y UI por tenant; ante drift, apagar UI y conservar el motor fail-closed.
6. El down 0032 aborta con lease activo, estado no colapsable o drift; nunca descarta identidad.

## RACI

| Rol | Quién | Firma |
|---|---|---|
| R | Staff Backend Datos + Staff Frontend caja | OK |
| A | Staff Principal + Staff Backend ACID | OK |
| V | Staff QA independiente + Staff Security | OK |
| Claim | Staff PM | OK — solo “trazabilidad por número de serie para electrónica/activos” |

## Residuales

- Peso/balanza → Sprint 40.
- Etiquetas → Sprint 41.
- Backup/restore → Sprint 42.
