---
doc_id: adr-0023-serial-identity-offline-lease
alias: "—"
authority: normativa
owner: "@DawoT"
---

# ADR-0023 — Identidad serial y lease offline exclusivo

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-08-08 |
| Decisores | Staff Principal · Staff Backend Datos · Staff Backend ACID · Staff Security |
| Consultados | Staff Frontend Caja · Staff QA · Staff Data · Staff PM |
| Informados | Staff Growth · Staff Mobile · Staff SRE |
| Relaciona | Arquitectura §5.6 regla 24 · Roadmap Sprint 39 · ADR-0015 · ADR-0022 · DAT-12 |

## Contexto

Sprint 39 debe identificar cada unidad serializada sin romper stock por ubicación,
venta offline ni los escritores existentes. El bosquejo previo no definía tracking
de producto, historial, ubicación, procedencia, reservas, disposición ni la carrera
entre terminales desconectadas. Una fila mutable o un lease con expiración y
reasignación automática permitirían doble venta y borrarían evidencia de garantía.

## Decisión

1. `products.serial_tracking_mode` es `NONE | REQUIRED`. Una serie representa
   exactamente `1_000_000` microunidades; UOM fraccionaria y `WEIGH` son inválidos.
2. La serie normalizada es única por tenant. `serial_numbers` proyecta el estado
   actual y `serial_number_events` conserva el historial append-only.
3. Estados: `AVAILABLE`, `RESERVED`, `SOLD`, `IN_TRANSIT`,
   `RETURNED_INSPECTION`, `LOST`, `DAMAGED`, `RETURNED_SUPPLIER`. El evento
   `RETURNED` libera la venta original; solo una disposición server-side devuelve
   la unidad a `AVAILABLE`.
4. Branch, ubicación y procedencia de `purchase_receipt_line` son tenant-safe.
   Manifiestos fijan la identidad en venta, apartado, traslado, devolución, conteo,
   merma y devolución a proveedor.
5. Una terminal adquiere online un lease exclusivo y opaco. No expira ni se
   reasigna automáticamente: se consume al sincronizar o se libera explícitamente.
   Revocarlo exige reconciliación administrativa, nunca un timeout silencioso.
6. Toda transición usa guard de estado+versión y escribe proyección, evento,
   manifiesto, stock granular/agregado y auditoría en el mismo `db.batch`.
7. El flag oculta API/UI, pero jamás permite omitir consistencia serial en un
   escritor de stock. El oversell no fabrica identidades.

## Alternativas consideradas

| Opción | Por qué se descartó |
|---|---|
| Unicidad por producto | Búsqueda de garantía ambigua y posible doble identidad |
| Solo fila mutable | No reconstruye recepción, reventa, traslado ni devolución |
| Lease con TTL y reasignación | Una caja offline puede vender después del timeout |
| Aceptar conflicto y sustituir luego | Viola cero doble asignación y evidencia fiscal |
| Producto serializado solo online | Viola offline-first y fragmenta el POS |

## Consecuencias

- **Gana:** identidad única, garantía reproducible y venta offline sin doble dueño.
- **Paga:** migración 0032, manifiestos, leases y cutover de todos los stock writers.
- **Invariantes tocadas:** INTEGER microunits, DAT-12, `db.batch`, offline-first,
  revocación fail-closed, audit hash-chain y cero forks por vertical.
- **Activación:** consistencia tras migración; UI/API por
  `FEATURE_INVENTORY_SERIALS` default off.

## Evidencia de cierre

- Tests/checks: dominio serial, schema up/down, concurrencia D1, replay/security y
  chaos 500.
- Ledger: entrada de cierre Sprint 39.
- Firmas RACI: `R` Staff Backend Datos/Frontend Caja · `A` Staff Principal/Backend
  ACID · `V` Staff QA independiente/Staff Security.
