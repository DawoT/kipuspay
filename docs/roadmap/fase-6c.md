---
doc_id: roadmap-fase-6c
alias: Roadmap
authority: normativa
owner: "@DawoT"
fase: "6C"
sprints: "33–37"
---

### FASE 6C — Cierre Comercial (KipusPay v8.1, sprints 33–37)

> Cierra el ciclo financiero completo del negocio: cotizar → vender → devolver (al cliente y al proveedor) → cobrar en partes → compensar con crédito de tienda → comisionar al vendedor. **No reabre fiscal P0** (las NC reusan ADR-FISCAL-001; gift cards y cuotas no emiten CPE propio salvo la venta subyacente). Detalle de entidades: Arquitectura §5.3 reglas 18–22. **Capabilities, no forks** (ADR-ARCH-002); cada claim GTM se descongela solo tras su Quality Gate.

#### Sprint 33 — Cotizaciones / presupuestos
**Estado:** Cerrado — GOV-APROBADO (`docs/ops/s33-quotes-qg.md`)  
**Capabilities:** `sales.quotes`  
**Referencia:** Arquitectura §5.3 regla 18 · ADR-0017 · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja/Admin), Staff PM (gating)

**Entregables:**
- `quotes`/`quote_items` con precios **congelados por servidor** (Zero-Trust, regla 1) y vencimiento.
- Estados `DRAFT → SENT → APPROVED → CONVERTED | EXPIRED | CANCELLED`; solo `CONVERTED` genera venta (sin doble descuento de stock: la cotización **no** reserva).
- Envío por WhatsApp/email al cliente (reusa Sprint 24 si aplica); `audit_events` `QUOTE_*`.

**Criterios de aceptación:** cotización vencida no se convierte (422); conversión hereda el snapshot `quote_items.unit_price_cents` y produce venta ACID; una cotización expirada exige nueva cotización/pricing; 0 reserva de stock en cotización; 0 CPE emitido por cotizar.

**Quality Gate:** Staff QA (conversión/concurrencia); Staff PM descongela claim "cotizaciones" en vertical Servicios/Retail solo tras gate.

---

#### Sprint 34 — Devolución a proveedor
**Estado:** Cerrado — GOV-APROBADO (`docs/ops/s34-supplier-returns-qg.md`)  
**Capabilities:** `purchasing.returns`  
**Referencia:** Arquitectura §5.3 regla 19 · ADR-0018 · **Agentes:** Staff Backend Datos (owner), Staff Backend ACID, Staff Frontend (Admin), Staff Security (override)

**Entregables:**
- `supplier_returns`/`supplier_return_items` ligados a `supplier_invoice_id`/`purchase_receipt_id`; estados `OPEN → CLOSED | CANCELLED`.
- **Reversión 1:1** de `inventory_movements` + PMP (reverso de `refresh_avg_cost`) + CxP por lo devuelto; serie/lote se libera (Sprint 39).
- Diferencia vs factura del proveedor = 422 o override auditado (`SUPPLIER_PRICE_DIFF`).

**Criterios de aceptación:** 0 CxP ajustado en silencio; costo y stock revierten 1:1 en 500 ciclos; devolución sin factura de proveedor referencia el receipt; 100% con `audit_events`.

**Quality Gate:** Staff QA (caos recepción→devolución); Staff Growth no vende "devoluciones a proveedor" en Cadena hasta gate.

---

#### Sprint 35 — Crédito de tienda / vales / gift cards
**Estado:** Cerrado — GOV-APROBADO (`docs/ops/s35-store-credit-qg.md`)  
**Capabilities:** `ledger.store_credit`  
**Referencia:** Arquitectura §5.3 regla 20; Sprint 28 (NC sin reembolso → crédito) · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Security, Staff PM

**Entregables:**
- `store_credit_accounts` (saldo por cliente, servidor lo modifica) + `store_credit_transactions` (ISSUE/REDEEM/EXPIRE/ADJUST).
- Venta de vale/gift card = venta registrada (doc según modo); **canje impone monto desde el servidor**; NC sin reembolso (regla 13) puede derivar a crédito con consentimiento.
- Vencimiento configurable; reporte Dueño de créditos emitidos/canjeados.

**Criterios de aceptación:** 0 canje sin saldo (saldo negativo = 422); saldo solo lo muta el servidor; gift card como método de pago nunca evita el registro de la venta subyacente; 100% auditado.

**Quality Gate:** Staff Security (anti-fraude de saldo) + Staff QA; Staff PM valida claim "gift cards / crédito de tienda" tras gate.

---

#### Sprint 36 — Cuotas / pago en partes
**Estado:** Cerrado — GOV-APROBADO (`docs/ops/s36-installments-qg.md`)  
**Capabilities:** `sales.installments`  
**Referencia:** Arquitectura §5.3 regla 21; regla 3 (credit_limit); ADR-0020 · **Agentes:** Staff Backend ACID (owner), Staff Frontend (caja), Staff Mobile (alertas Dueño)

**Entregables:**
- `sale_installments`: plan por venta a crédito (abono inicial + cuotas con vencimiento); cada pago actualiza CxC (solo principal, COM-06) y arqueo.
- Estado `OVERDUE` on-read → alerta Modo Dueño; no se corta la caja por atraso.
- Aplicación de pago de cuota idempotente (`idempotency_key`).

**Criterios de aceptación:** 0 doble aplicación de pago de cuota; límite de crédito respetado al crear el plan; cuota vencida visible en Modo Dueño; cobro de cuota descuenta **principal** 1:1 en CxC (interés aparte).

**Quality Gate:** Staff QA (pagos idempotentes) + Staff Security; Staff PM descongela claim "pago en partes" tras gate.

---

#### Sprint 37 — Comisiones de vendedor
**Estado:** Cerrado  
**Capabilities:** `sales.commissions`  
**Referencia:** Arquitectura §5.3 regla 22 · ADR-0021 · **Agentes:** Staff Backend Datos (owner), Staff Frontend (Admin), Staff Mobile (reporte Dueño)

**Entregables:**
- `commission_rates` (%, monto, por producto/categoría) + `commission_payouts` por período.
- Reporte Dueño: ventas por vendedor, comisión devengada, pagos por período; export CSV (Sprint 9).
- **Nómina fuera de alcance** (Arquitectura §5.3 regla 22): no se emite planilla ni retenciones laborales.

**Criterios de aceptación:** comisión calculada sobre ventas ACID post-NC (una devolución resta comisión); tasa resuelta en servidor; 0 pagos de comisión sin `COMMISSION` audit; export reproducible.

**Quality Gate:** Staff Data + Staff PM; Staff Growth vende "comisiones" solo tras gate. QG: `docs/ops/s37-commissions-qg.md`.

---

