---
doc_id: roadmap-fase-6b
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6B"
sprints: "28–32"
---

### FASE 6B — Profundidad Retail (KipusPay v8.1, sprints 28–32)

> Extiende la capa comercial de FASE 6 (v8.1) con la profundidad retail que quedó fuera del Tier 1: devoluciones, 3-way de proveedores, promociones, variantes/UM y apartados/diario contable. **No reabre fiscal P0** (las NC reusan ADR-FISCAL-001; percepciones/retenciones siguen en backlog v10). **Numeración deliberada:** sprints 28–32 después de 27 para no renumerar FASE 7–8 (GTM cita "Sprint 23+/24+") ni romper referencias; comparten la minor **v8.1** porque son la misma capa comercial de FASE 6 entregada en profundidad. Detalle de entidades: Arquitectura §5.3 reglas 13–17. **Capabilities, no forks** (ADR-ARCH-002); cada claim GTM se descongela solo tras su Quality Gate.

#### Sprint 28 — Devoluciones con política N días
**Capabilities:** `sales.returns`  
**Referencia:** Arquitectura §5.3 regla 13; ADR-FISCAL-001 (NC/NV_RETURN); GTM objeción devoluciones · **Agentes:** Staff Backend ACID (owner), Staff Fiscal, Staff Frontend (caja), Staff Mobile (Modo Dueño)

**Entregables:**
- Política de devolución por tenant (`return_policies`): ventana N días, por método de pago/categoría.
- Flujo en caja/Admin: genera **NC fiscal (07)** en `ELECTRONIC_ISSUER` o **NV_RETURN** en control interno; unidad mínima = `sale_item` con su `batch_id`.
- **Reversión de costo:** revierte el efecto PMP del `unit_cost_cents` snapshot del item original (reusa `refresh_avg_cost` de Sprint 18); si hubo lote, revierte contra ese `batch_id`.
- Vuelto por el mismo método si aplica, asentado en `cash_register_cash_movements` (regla 11); devolución de turno cerrado o sobre umbral requiere authz (Sprint 17).
- `audit_events` `RETURN` con motivo obligatorio.

**Criterios de aceptación:** devolución fuera de ventana = 422 con copy claro; stock y costo revierten 1:1 (0 diferencia en 500 ciclos); la NC no reembolsa el cupo del doc original (§4.1); 0 devoluciones sin `audit_events`; **devolución de línea genérica (edge 1B): un `sale_item` con `is_uncatalogued` devuelto genera NC/NV_RETURN + vuelto pero NO restaura stock ni `refresh_avg_cost` (0 inventario fantasma en 500 ciclos, antes y después de catalogar el producto)**; **devolución sobre venta a crédito (edge E-D): la NC/NV_RETURN reduce `accounts_receivable.balance_due_cents` en la misma tx — 0 saldo fantasma en 500 ciclos (total y parcial), vuelto del abono por método o crédito de tienda (regla 20), 0 ajustes de CxC silenciosos**.

**Quality Gate:** Staff Fiscal + Staff QA (reversión de costo); Staff PM descongela claim "devoluciones" en GTM solo tras gate.

---

#### Sprint 29 — Proveedores 3-way matching (OC → recepción → compra)
**Capabilities:** `purchasing.three_way`  
**Referencia:** Arquitectura §5.3 regla 14; extiende `purchasing.partial_receive` (Sprint 20); GTM Cadena · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID, Staff Frontend (Admin), Staff Security (override + audit)

**Entregables:**
- Compra ligada a OC (`supplier_invoices`): matching **3-way** cantidad OC = recepción = factura, precio/costo coherentes.
- Diferencia: `422` o `override` autorizado + audit (`SUPPLIER_PRICE_DIFF`); jamás CxP ajustado en silencio.
- Al cerrar: `inventory_movements` (costo real) + `refresh_avg_cost` + CxP por lo facturado.
- Reporte Dueño: OC abiertas, recepciones sin facturar, discrepancias 3-way.

**Criterios de aceptación:** 0 CxP sin matching 3-way cerrado; diferencia no autorizada = 422; costo correcto tras factura tardía (caos de recepción parcial); 0 escrituras fuera de tx ACID.

**Quality Gate:** Staff QA (recepción parcial + factura tardía); Staff Growth no vende "control de compras" en Cadena hasta gate.

---

#### Sprint 30 — Promociones y tramos de precio
**Capabilities:** `pricing.promotions`  
**Referencia:** Arquitectura §5.3 regla 15; Sprint 17 (authz descuento); Sprint 18 (listas Zero-Trust) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff PM (gating), Staff Mobile (alertas)

**Entregables:**
- Motor de promociones: 2x1, % fijo, % por umbral de monto/cantidad, precio por tramo, por lista/categoría.
- Resolución en servidor: **el precio final lo impone el sale engine**; el cliente envía solo IDs de promoción; anti-apilamiento configurable.
- Descuento manual sobre umbral → authz (Sprint 17); promoción sobre producto con lote respeta `batch_id` (FEFO).
- Margen post-descuento < umbral → alerta/requiere aprobación Dueño (opcional); `audit_events` `PROMOTION_CHANGE` al crear/editar.

**Criterios de aceptación:** 0 cobros con precio no derivado de regla servidor; anti-apilamiento en 100% de combos probados; 0 rompimientos de `batch_id` en venta promocional.

**Quality Gate:** Staff QA (matriz promoción+descuento+tramo); Staff PM valida claim promociones en vertical retail.

---

#### Sprint 31 — Variantes/combinaciones y unidades de medida
**Estado:** Cerrado — GOV-APROBADO (`docs/ops/s31-variants-uom-qg.md`)  
**Capabilities:** `catalog.variants`, `catalog.uom`  
**Referencia:** Arquitectura §5.0/§5.3 regla 16/§6; ADR-0015; Sprint 18 (PMP, conteo, listas) · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin/caja), Staff Mobile (Modo Dueño)

**Entregables:**
- **Variantes:** padre agrupador + variantes de un nivel como filas `products`; SKU/stock/lotes/conteo/BOM propios; lista padre/variante y override server-side.
- **UM:** factores racionales; `INTEGER *_microunits` como cantidad física canónica; snapshots de venta inmutables; PMP/costo por unidad base.
- Kits BOM (Sprint 18) explícitos por variante y componentes FEFO dentro del plan ACID.
- Flags independientes default off, Admin/audit, caja UOM-aware y Modo Dueño.
- Chaos `variants-uom-bom-batch` 500 ciclos y GTM-16 descongelado.

**Criterios de aceptación:** 0 stock cruzado entre variantes; conversión UM exacta (redondeo servidor, nunca `toFixed`); conteo de variante impacta solo su stock; venta por UM distinta descuenta la cantidad base correcta.

**Quality Gate:** Staff QA (matriz variante×UM×BOM×lote); Staff PM valida claim catálogo multi-variante.

---

#### Sprint 32 — Apartados/anticipos y diario contable
**Estado:** Cerrado — GOV-APROBADO (`docs/ops/s32-layaway-journal-qg.md`)  
**Capabilities:** `sales.layaway`, `ledger.chart_of_accounts`  
**Referencia:** Arquitectura §5.3 regla 17; GTM Cadena (diario contable); conecta Sprint 23 (export) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Data (export), Staff Growth (gating)

**Entregables:**
- **Apartados:** reserva de ítems + `sale_deposits` (abonos), saldo por vencer/vencido; conversión a venta emite el CPE (el apartado **no** emite doc fiscal); cancelación devuelve según política (reusa Sprint 28); `audit_events` `LAYAWAY_CANCEL`.
- **Diario contable:** `chart_of_accounts` + `journal_entries`/`journal_lines` automáticos desde ventas, cobros, pagos, CxP/CxC y arqueo; **ledger solo lectura** para la UI (export Cadena, Sprint 23); `JOURNAL_POST` auditado.

**Criterios de aceptación:** apartado no genera CPE hasta conversión; saldo vencido alerta Modo Dueño; asiento de venta = débito efectivo/CxC, crédito venta+IGV (bit-consistente con export); 0 mutación del ledger desde UI cliente.

**Quality Gate:** Staff Principal (ledger) + Staff Data (export bit-a-bit); Staff Growth descongela claim "diario contable" en Cadena solo tras gate.

---

