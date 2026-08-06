---
doc_id: roadmap-fase-6
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6"
sprints: "17–20"
---

### FASE 6 — Motor de Operación Comercial (KipusPay v8.1)

> Cierra la distancia entre lo que GTM vende por vertical y el motor de negocio. **No reabre el diseño fiscal P0.** Dependencia: Fases 1–5 cerradas (o al menos núcleo ACID + formalización + pipeline fiscal). Detalle de entidades: Arquitectura §5.3. **Contrato de modularidad:** cada sprint **entrega capabilities** (ADR-ARCH-002), no ramas `if (vertical)`. Backend no mergea lógica “farmacia/resto/cadena” como enum; Growth solo vende el claim de GTM §2 tras el Quality Gate del sprint.

#### Sprint 17 — Caja dura: arqueo Z ciego, authz descuentos, crédito y auditoría
**Capabilities:** `cash.blind_z`, `cash.discount_authz`, `ledger.credit_limit`, `audit.sensitive_actions`  
**Referencia:** Arquitectura §5.3 / §1.1; GTM §1.1 (“Cada sol cuadra”) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (colaborador), Staff Security (colaborador), Staff Mobile (alertas Dueño)

**Entregables:**
- Cierre de caja **ciego**: cajero ingresa denominaciones (`cash_count_lines`) sin ver el esperado; sistema calcula diferencia; justificación obligatoria si |diff| > umbral; reporte Z imprimible.
- **Movimientos de caja no-venta (`cash_register_cash_movements`):** envío de valores, fondo para cambio, pago a proveedor, ajuste — con authz si supera umbral. **Fórmula de arqueo:** `expected = opening + ventas efectivo + ingresos − retiros − egresos` (Arquitectura §5.3 regla 11).
- **Authz descuentos:** umbral %/monto configurables → PIN supervisor o push/aprobación Modo Dueño; rechazo 403 sin override.
- **Enforce `credit_limit`:** pago crédito rechaza si saldo CxC + venta > límite (override autorizado + audit).
- Tabla **`audit_events`** append-only: void, NC, descuento, override crédito, apertura/cierre caja, cambio `formalization_mode`, `PRICE_CHANGE`, `PRODUCT_EDIT`, `PERMISSION_CHANGE`, `REPRINT`, `CASH_MOVEMENT`, `CONFIG_CHANGE`.
- **Reimpresión con sello "COPIA" (`sale_reprints`):** reimprimir un comprobante deja rastro inmutable; el ticket reimpreso lleva marca COPIA.

**Criterios de aceptación:** 0 cierres Z sin conteo de denominaciones en modo estricto; cajero no puede leer expected_cash antes de confirmar conteo; **arqueo concilia opening + ventas + ingresos − retiros − egresos (0 diferencia no explicada)**; descuento sobre umbral sin authz = 403; crédito sobre límite = 422; 100% acciones sensibles generan `audit_events`; **toda reimpresión genera `sale_reprints` con sello COPIA**; **gate de print outbox (edge 2D):** diferido a Sprint 25 vía stub documentado en **ADR-0012** (modal contra `printOutboxPendingCount()`; no-op mientras stub retorna 0); **desglose por operador (edge 1C):** diferido a Sprint 51 (**ADR-0012**); el Z S17 atribuye diferencia a la sesión de caja.

**Quality Gate:** Staff Security + Staff QA firman suite anti-fraude de caja; Staff Design valida UX de cierre ciego; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 18 — Inventario real: FEFO/lotes, kits BOM, listas de precio
**Capabilities:** `inventory.batches`, `inventory.bom`, `pricing.lists`  
**Referencia:** Arquitectura §5.3 / §1.1; GTM vertical Farmacias (bundle) · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID (colaborador), Staff Mobile (alertas), Staff Frontend (caja)

**Entregables:**
- Venta con **FEFO**: descuento de `inventory_batches` por vencimiento ASC; bloqueo de lote vencido; asignación de `batch_id` en `sale_items`.
- Alertas Modo Dueño: quiebre de stock + lotes por vencer en N días (configurable).
- **Kits/BOM:** venta de `product_type = kit` explota `product_recipes` dentro del mismo `db.batch([...])` con guard de stock; stock insuficiente de cualquier componente = rollback total (`VENTA_BOM`).
- **Listas de precio:** resolución Zero-Trust (sucursal → cliente → lista default); cliente no impone `unit_price`.
- **PMP (costo promedio ponderado):** `refresh_avg_cost(product_id, branch_id)` recomputa el costo en la misma tx de recepción/transferencia/ajuste; la venta persiste el PMP como snapshot `unit_cost_cents`; NC/devolución revierte el efecto de costo.
- **`branch_stock_policies`:** min_stock / reorder_point / reorder_qty por (product, branch) → alerta por punto de reposición (no solo quiebre) y **sugerencia de OC**.
- **Conteo físico (`inventory_counts`):** hoja ciega → `DIFFERENCE_REVIEW` → `AJUSTE` con motivo + authz si `|diff|` valorizado > umbral; conteo aprobado inmodificable.
- **Merma (`stock_losses`):** DAÑADO/CADUCADO/HURTO con foto (R2) + aprobación; aprobar genera `AJUSTE` negativo + audit; append-only.

**Criterios de aceptación:** 0 ventas de lote vencido; kit con componente sin stock no deja venta parcial; precio cobrado = precio servidor según lista; **COGS de una venta = PMP del branch al momento de la venta (snapshot), 0 cajas con costo manual desalineado**; alertas de vencimiento y punto de reposición visibles en Modo Dueño staging; **conteo aprobado no editable; 0 ajustes sin motivo + authz sobre umbral; 0 mermas sin evidencia y aprobación**.

**Quality Gate:** Staff QA chaos de stock concurrente en mismo lote/kit; Staff PM valida claim farmacia (GTM §2) solo tras este sprint; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 19 — Food service: comandas, KDS y split bill
**Capabilities:** `orders.lifecycle`, `orders.kds`, `orders.split_bill`  
**Referencia:** Arquitectura §5.3 / §1.1; GTM vertical Restaurantes (bundle) · **Agentes:** Staff Frontend (owner), Staff Hardware (KDS/Vitrina), Staff Backend ACID (colaborador), Staff Design

**Entregables:**
- Entidades `orders` / `order_items` con estados `OPEN → FIRED → READY → PAID | CANCELLED`.
- Flujo salón → **KDS** (WebSocket) → cobro; anulación de ítem con authz (Sprint 17).
- **Split bill:** una comanda genera 1..N `sales` (cada una con su documento fiscal/NV según modo).
- Integración Modo Vitrina con estado de pedido (no solo confirmación de pago).

**Criterios de aceptación:** ítem FIRED aparece en KDS <1s en LAN; split de 2 pagos produce 2 sales ACID sin doble descuento de stock; cancelación de ítem READY requiere authz; 0 cobros sin orden en estado cobrable.

**Quality Gate:** Staff Design + Staff PM validan claim restaurantes (GTM §2); Staff QA E2E salón-cocina-caja; Staff Principal aprueba el cierre según RACI.

---

#### Sprint 20 — Cadena light: transferencias entre sucursales y recepción OC parcial
**Capabilities:** `stock.transfers`, `purchasing.partial_receive`  
**Estado:** Cerrado (QG `docs/ops/s20-cadena-transfers-qg.md`)  
**Referencia:** Arquitectura §5.3 / §1.1; GTM vertical Cadenas (bundle) · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID (colaborador), Staff Mobile (Dueño), Staff Frontend (Admin)

**Entregables:**
- **`stock_transfers`:** documento interno entre branches; movimientos espejo (salida origen + entrada destino); estados DRAFT → IN_TRANSIT → RECEIVED | CANCELLED; merma en tránsito con justificación + audit.
- **Recepción parcial de OC:** `purchase_orders` → receiving lines → lotes/costo → CxP; OC puede quedar PARTIALLY_RECEIVED.
- Ranking/alerta Dueño: transferencias pendientes y discrepancias de recepción.

**Criterios de aceptación:** transferencia no duplica ni pierde unidades (suma origen+destino+merma = cantidad enviada); recepción parcial actualiza CxP solo por lo recibido; cancelación IN_TRANSIT revierte stock origen.

**Quality Gate:** Staff Principal + Staff QA; claim Cadena `merma_xfer` live tras firma A+V.

---

