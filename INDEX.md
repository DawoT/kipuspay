---
doc_id: index
alias: "—"
authority: generada
owner: "@DawoT"
---

# KipusPay — Índice de implementación (GENERADO)

> **No editar a mano.** Se regenera con `scripts/index.sh` y el gate V-15 falla si
> queda desincronizado. Contiene solo punteros: la regla vive una vez en la
> especificación (invariante 9 de `AGENTS.md`).

Ruta de trabajo de un agente: capability → sprint → **archivo de fase** → reglas y DDL
en el **capítulo** que corresponda → package destino (§1.1) → gate (`Proceso §8.1`).
Abre solo los archivos que esta tabla te señale.

## Capabilities → sprint

| Capability | Sprint | Empaquetado GTM | Definida en | Línea |
|---|---|---|---|---|
| `cash.blind_z` | 17 | Retail / “cada sol cuadra” | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 117 |
| `cash.discount_authz` | 17 | Retail | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 118 |
| `ledger.credit_limit_cents` | 17 | Retail / CxC | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 119 |
| `audit.sensitive_actions` | 17 | Todos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 120 |
| `inventory.batches` | 18 | Farmacias | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 121 |
| `inventory.bom` | 18 | Retail / food | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 122 |
| `pricing.lists` | 18 | Multi-lista | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 123 |
| `orders.lifecycle` | 19 | Restaurantes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 124 |
| `orders.kds` | 19 | Restaurantes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 125 |
| `orders.split_bill` | 19 | Restaurantes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 126 |
| `stock.transfers` | 20 | Cadenas | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 127 |
| `purchasing.partial_receive` | 20 | Cadenas / retail | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 128 |
| `integrations.catalog_import` | 21 | Migración / objeción #1 | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 134 |
| `payments.qr_wallets` | 22 | Cobro PE (Yape/Plin/MP) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 135 |
| `payments.card_acquirer` | 22 | Retail / Culqi-Niubiz | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 136 |
| `integrations.accounting_export` | 23 | Crece+ / contador | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 137 |
| `integrations.api` | 23 | Cadena (API + webhooks) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 138 |
| `messaging.whatsapp_receipt` | 24 | Post-venta / activación | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 139 |
| `loyalty.points` | 24 | Cadena (fidelización light) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 140 |
| `sales.returns` | 28–32 | Devoluciones con política N días | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 146 |
| `purchasing.three_way` | 28–32 | Control de proveedor / OC | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 147 |
| `pricing.promotions` | 28–32 | Promos y tramos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 148 |
| `catalog.variants` | 28–32 | Multi-variante / unidades | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 149 |
| `sales.layaway` | 28–32 | Apartados | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 150 |
| `ledger.chart_of_accounts` | 28–32 | Diario contable (retail) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 151 |
| `sales.quotes` | 33–37 | Cotizaciones/presupuestos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 157 |
| `purchasing.returns` | 33–37 | Devolución a proveedor | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 158 |
| `ledger.store_credit` | 33–37 | Crédito de tienda / gift cards | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 159 |
| `sales.installments` | 33–37 | Cuotas / pago en partes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 160 |
| `sales.commissions` | 33–37 | Comisiones de vendedor | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 161 |
| `inventory.locations` | 38–42 | Ubicaciones de inventario | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 167 |
| `inventory.serials` | 38–42 | Números de serie | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 168 |
| `inventory.scale` | 38–42 | Venta por peso / balanza | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 169 |
| `catalog.price_labels` | 38–42 | Etiquetas de precio | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 170 |
| `data.backup` | 38–42 | Export / restore del negocio | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 171 |
| `orders.customer_orders` | 43–45 | Preventa / pedido a cliente | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 177 |
| `sales.recurring` | 43–45 | Recurrentes / membresías | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 178 |
| `mobile.push` | 43–45 | Push + caja móvil | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 179 |
| `analytics.forecasting` | 46 | Predictiva (Cadena, freeze 46) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 185 |
| `compliance.lpdp` | 47–48 | LPDP / DR-BCP (Cadena) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 186 |
| `analytics.agentic_insights` | 49 | Insight / briefing (Cadena/Enterprise, freeze 49) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 187 |
| `catalog.quick_add` | 50 | Escáner con cámara + venta rápida (gate 50) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 193 |
| `ops.shift_handoff` | 51 | Handoff de turno sin cerrar caja (gate 51) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 194 |
| `ops.team_invite` | 51 | Equipo: invitación + PIN/badge | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 195 |
| `onboarding.tour` | 52 | Product Tour + checklist "segundo día" | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 196 |
| `hardware.diagnostics` | 53 | Troubleshooter de impresora/balanza | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 197 |

## Sprints → fase, archivo y estado

| Sprint | FASE | Archivo | Línea | Especificación | Entrega |
|---|---|---|---|---|---|
| 0 | 0 | [`docs/roadmap/fase-0.md`](docs/roadmap/fase-0.md) | 12 | Actualizada (ADR-0001, CAL-01..08, monorepo, D1 humo) | Cerrado |
| 1 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 12 | Actualizada (M1 dinero cents, §5.0 / §5.5 migraciones) | Cerrado |
| 2 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 23 | Actualizada (auth fail-closed, plan guard, IdP — §3) | Cerrado |
| 3 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 34 | Actualizada (webhooks pasarela + invalidación — §4) | Cerrado |
| 4 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 45 | Actualizada (motor ACID + reconciliación — §6) | En progreso |
| 5 | 2 | [`docs/roadmap/fase-2.md`](docs/roadmap/fase-2.md) | 12 | Base | Planificado |
| 5b | 2 | [`docs/roadmap/fase-2.md`](docs/roadmap/fase-2.md) | 33 | Actualizada (Resumen Diario, plazos, baja y alertas) | Planificado |
| 6 | 2 | [`docs/roadmap/fase-2.md`](docs/roadmap/fase-2.md) | 51 | Actualizada (P4 CRM LWW + dedup SYN-11 enmendada + edge D rollup) | Planificado |
| 7–8 | 2–3 | — | — | Base | Planificado |
| 9 | 3 | [`docs/roadmap/fase-3.md`](docs/roadmap/fase-3.md) | 34 | Actualizada (M3 rollups §9) | Planificado |
| 10–16 | 3–5 | — | — | Base | Planificado |
| 17 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 14 | Actualizada (M6/M7 caja dura + audit) | Planificado |
| 18 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 32 | Actualizada (M2/M4/M5 PMP + stock) | Planificado |
| 19–20 | 6 | — | — | Base | Planificado |
| 21–24 | 7 | — | — | Base | Planificado |
| 25 | 8 | [`docs/roadmap/fase-8.md`](docs/roadmap/fase-8.md) | 14 | Actualizada (P3 print outbox §7.5 + pos_terminals config 58/80mm) | Planificado |
| 26 | 8 | [`docs/roadmap/fase-8.md`](docs/roadmap/fase-8.md) | 30 | Actualizada (P1 breaker §8.1) | Planificado |
| 27 | 8 | [`docs/roadmap/fase-8.md`](docs/roadmap/fase-8.md) | 49 | Actualizada (P2 cupo §4.1) | Planificado |
| 28–32 | 6B | — | — | Actualizada (FASE 6B reglas 13–17 + COM pricing) | Planificado |
| 33–37 | 6C | — | — | Actualizada (FASE 6C reglas 18–22 + COM-05 pricing congelado) | Planificado |
| 38–42 | 6D | — | — | Actualizada (FASE 6D reglas 23–27) | Planificado |
| 43–45 | 6E | — | — | Actualizada (FASE 6E reglas 28–30 + COM-05 reserva/pricing) | Planificado |
| 46–48 | 6F | — | — | Actualizada (FASE 6F reglas 31–32) | Planificado |
| 49 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 59 | Actualizada (Sprint 49 regla 33 — agentic insights + PERF-12 réplica) | Planificado |
| 50–53 | 6G | — | — | Actualizada (FASE 6G reglas 34–37 — flujo del cliente) | Planificado |
| 7 | 3 | [`docs/roadmap/fase-3.md`](docs/roadmap/fase-3.md) | 12 | sin fila de estado | — |
| 8 | 3 | [`docs/roadmap/fase-3.md`](docs/roadmap/fase-3.md) | 23 | sin fila de estado | — |
| 10 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 12 | sin fila de estado | — |
| 11 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 23 | sin fila de estado | — |
| 12 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 39 | sin fila de estado | — |
| 13 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 50 | sin fila de estado | — |
| 14 | 5 | [`docs/roadmap/fase-5.md`](docs/roadmap/fase-5.md) | 12 | sin fila de estado | — |
| 15 | 5 | [`docs/roadmap/fase-5.md`](docs/roadmap/fase-5.md) | 23 | sin fila de estado | — |
| 19 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 52 | sin fila de estado | — |
| 20 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 68 | sin fila de estado | — |
| 28 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 14 | sin fila de estado | — |
| 29 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 31 | sin fila de estado | — |
| 30 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 47 | sin fila de estado | — |
| 31 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 63 | sin fila de estado | — |
| 32 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 78 | sin fila de estado | — |
| 33 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 14 | sin fila de estado | — |
| 34 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 29 | sin fila de estado | — |
| 35 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 44 | sin fila de estado | — |
| 36 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 59 | sin fila de estado | — |
| 37 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 74 | sin fila de estado | — |
| 38 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 14 | sin fila de estado | — |
| 39 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 29 | sin fila de estado | — |
| 40 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 44 | sin fila de estado | — |
| 41 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 59 | sin fila de estado | — |
| 42 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 74 | sin fila de estado | — |
| 43 | 6E | [`docs/roadmap/fase-6e.md`](docs/roadmap/fase-6e.md) | 14 | sin fila de estado | — |
| 44 | 6E | [`docs/roadmap/fase-6e.md`](docs/roadmap/fase-6e.md) | 28 | sin fila de estado | — |
| 45 | 6E | [`docs/roadmap/fase-6e.md`](docs/roadmap/fase-6e.md) | 43 | sin fila de estado | — |
| 46 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 14 | sin fila de estado | — |
| 47 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 29 | sin fila de estado | — |
| 48 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 44 | sin fila de estado | — |
| 50 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 14 | sin fila de estado | — |
| 51 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 29 | sin fila de estado | — |
| 52 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 45 | sin fila de estado | — |
| 53 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 60 | sin fila de estado | — |
| 21 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 14 | sin fila de estado | — |
| 22 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 29 | sin fila de estado | — |
| 23 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 44 | sin fila de estado | — |
| 24 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 59 | sin fila de estado | — |

## Tablas DDL → capítulo y línea

| Tabla | Sección | Archivo | Línea |
|---|---|---|---|
| `usage_counters` | §4.1 | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) | 203 |
| `usage_events` | §4.1 | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) | 212 |
| `billing_overages` | §4.1 | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) | 223 |
| `tenant_capabilities` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 59 |
| `audit_events` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 69 |
| `authorization_tokens` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 92 |
| `fiscal_outbox` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 107 |
| `cash_count_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 123 |
| `tenant_discount_policies` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 137 |
| `orders` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 144 |
| `order_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 159 |
| `stock_transfers` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 174 |
| `stock_transfer_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 189 |
| `purchase_receipts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 204 |
| `purchase_receipt_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 214 |
| `branch_stock_policies` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 231 |
| `inventory_counts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 243 |
| `inventory_count_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 257 |
| `stock_losses` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 272 |
| `cash_register_cash_movements` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 293 |
| `sale_reprints` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 312 |
| `return_policies` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 340 |
| `sales_returns` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 349 |
| `sale_return_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 367 |
| `supplier_invoices` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 384 |
| `promotions` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 403 |
| `product_promotions` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 415 |
| `product_uoms` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 430 |
| `sale_deposits` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 443 |
| `sale_deposit_payments` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 458 |
| `sale_deposit_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 469 |
| `chart_of_accounts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 481 |
| `journal_entries` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 489 |
| `journal_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 503 |
| `quotes` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 522 |
| `quote_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 534 |
| `supplier_returns` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 547 |
| `supplier_return_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 560 |
| `store_credit_accounts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 576 |
| `store_credit_transactions` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 585 |
| `sale_installments` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 602 |
| `sale_installment_payments` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 618 |
| `commission_rates` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 630 |
| `commission_payouts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 641 |
| `commission_accruals` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 653 |
| `inventory_locations` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 670 |
| `inventory_location_stock` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 679 |
| `serial_numbers` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 689 |
| `weight_measurements` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 703 |
| `price_label_templates` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 714 |
| `pos_terminals` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 727 |
| `data_backups` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 744 |
| `customer_orders` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 760 |
| `customer_order_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 773 |
| `recurring_plans` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 789 |
| `push_subscriptions` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 804 |
| `recurring_occurrences` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 814 |
| `forecast_outputs` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 834 |
| `consent_records` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 849 |
| `insight_log` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 867 |
| `ai_usage_counters` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 885 |
| `cash_register_shifts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 900 |
| `external_entity_map` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 27 |
| `payment_captures` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 37 |
| `api_keys` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 55 |
| `webhook_endpoints` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 69 |
| `webhook_deliveries` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 83 |
| `tenant_certificates` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 100 |
| `webhook_events` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 114 |
| `loyalty_accounts` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 128 |
| `loyalty_reservations` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 140 |
| `tenants` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 20 |
| `branches` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 53 |
| `cash_registers` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 67 |
| `branch_document_series` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 83 |
| `cash_register_sessions` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 99 |
| `users` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 115 |
| `customers` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 136 |
| `taxes` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 163 |
| `products` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 175 |
| `product_taxes` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 202 |
| `product_recipes` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 213 |
| `price_lists` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 225 |
| `product_prices` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 235 |
| `inventory_batches` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 247 |
| `branch_product_stock` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 262 |
| `inventory_movements` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 276 |
| `payment_methods` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 293 |
| `exchange_rates` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 302 |
| `sales` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 314 |
| `sunat_daily_summaries` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 377 |
| `sale_items` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 400 |
| `sale_payments` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 427 |
| `suppliers` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 445 |
| `purchase_orders` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 460 |
| `purchase_order_items` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 474 |
| `accounts_payable` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 484 |
| `accounts_payable_payments` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 499 |
| `accounts_receivable` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 510 |
| `accounts_receivable_payments` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 527 |
| `cash_register_expenses` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 539 |
| `atomic_guards` | §6 | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) | 33 |
| `daily_financial_rollups` | §9 | [`docs/architecture/09-reporting.md`](docs/architecture/09-reporting.md) | 15 |
| `daily_product_rollups` | §9 | [`docs/architecture/09-reporting.md`](docs/architecture/09-reporting.md) | 35 |

## Reglas → sección canónica (Registry §0.4)

| ID | Definición | Tema | Archivo |
|---|---|---|---|
| SEC-01 | §3 | Identidad SOLO desde JWT verificado | [`docs/architecture/03-auth-plan-enforcement.md`](docs/architecture/03-auth-plan-enforcement.md) |
| SEC-02 | §6 | Re-validación server-side por ítem; descuentos/sobreprecios y umbrales | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SEC-03 | §3 | Gestión de secretos; PIN argon2id server-side | [`docs/architecture/03-auth-plan-enforcement.md`](docs/architecture/03-auth-plan-enforcement.md) |
| SEC-04 | §4.0 | Política de seguridad transversal | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) |
| SEC-05 | §6 | Correlativo emitido por el servidor | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SEC-06 | §6 | Ventana de skew única ±6h | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SEC-07 | §6 | Filas PII anonimizadas/borradas (`pii_erased`/`deleted_at`) | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SEC-08 | §4 | Dedup, anti-replay ≤5 min, comparación constante en tiempo | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) |
| SEC-09 | §5.3 | Zero-Trust de caja | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| SEC-10 | §5.3 | DDL zero-trust (lockout PIN) | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| SEC-11 | §4.0 | PIN de caja: lockout 5 fallos/15 min | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) |
| SEC-12 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| FIS-01 | §5.2/§5.3 (def. Ledger 0164) | `issued_date_lima` +3 días | [`docs/architecture/05-2-fiscal-pipeline.md`](docs/architecture/05-2-fiscal-pipeline.md) |
| FIS-02 | §6 | Estado SUNAT + deadline por tipo de documento | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| FIS-03 | §5.2 | RC por emisor (`tenant_id`+`summary_date`); corrección de RC boleta | [`docs/architecture/05-2-fiscal-pipeline.md`](docs/architecture/05-2-fiscal-pipeline.md) |
| FIS-07 | §5.4 | CHECKs DDL ecosistema | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| FIS-08 | §6 | Reglas de negocio del motor | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| FIS-10 | §6 | Reglas de negocio del motor | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| FIS-11 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| FIS-12 | §6 | Reglas de negocio del motor | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| COM-01 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-02 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| COM-03 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-04 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-05 | §5.3 | Precio congelado en cotizaciones/preventas (snapshot) | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-06 | §5.3 (6C) | DDL cierre comercial | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-07 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-08 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-09 | §5.3 (6E) | DDL servicios y fuerza de venta | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-12 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| DAT-01 | §5.4 | `branch_id TEXT NULL` en `sunat_daily_summaries` | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| DAT-02 | §6 | Estado SUNAT + deadline (compartida con FIS-02) | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| DAT-03 | §5.3 (def. Ledger 0165) | Versión v8.1 en comentario DDL | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| DAT-04 | §5.4 | CHECKs en `payment_captures`/`cash_register_sessions`/CxC/`sunat_daily_summaries` | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| DAT-05 | §6 | Pago a crédito → CxC en la misma tx | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| DAT-07 | §5.3 (6B) | Índices de venta/journal | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| DAT-09 | §5.0/§6 (def. Ledger 0165) | Redondeo server-side `Math.round(centavos)`, jamás `toFixed` | [`docs/architecture/05-ddl-conventions.md`](docs/architecture/05-ddl-conventions.md) |
| DAT-10 | §5.3 (def. Ledger 0165) | Ediciones acumulativas como "NOTA IMPORTANTE" | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| DAT-11 | §6 | Reuso de `sale_payments.id` (sin UUID huérfano) | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| PERF-01 | §6 | Hot path sin lecturas por ítem dentro del batch | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| PERF-02 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| PERF-03 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| PERF-04 | §3 | Caché de 2 niveles en auth path | [`docs/architecture/03-auth-plan-enforcement.md`](docs/architecture/03-auth-plan-enforcement.md) |
| PERF-05 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| PERF-06 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| PERF-07 | §6 | Upsert con `RETURNING id` | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| PERF-08 | §6 | Cupo por documento emitido, idempotente | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| PERF-09 | §5.4 | Pre-agregación de fuentes 1:N | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| PERF-10 | §6 | Cupo por documento emitido (compartida con PERF-08) | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| PERF-11 | §5.3 | Zero-Trust de caja | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| PERF-12 | §5.3 (6F) | Insights: réplica de lectura, `LIMIT 50`, NLG post-check | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| PERF-13 | §5.5 | Walk FIFO de la cola fiscal por (estado, deadline) | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) |
| SYN-01 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| SYN-02 | §6 | Correlativo emitido por servidor (compartida con SEC-05) | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SYN-03 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| SYN-04 | §6 | Ventana de skew única ±6h (compartida con SEC-06) | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SYN-05 | §6 | FEFO/lotes re-validadas en la tx | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SYN-06 | §6 | Política de oversell offline: venta aceptada jamás se pierde | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SYN-07 | §7 | Chunked Sync Dispatcher (Service Worker) | [`docs/architecture/07-sync-offloading.md`](docs/architecture/07-sync-offloading.md) |
| SYN-08 | §6 | LWW en reloj de servidor | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| SYN-11 | §1 (Principio 10)/§5.2 | Consolidación de cliente single-writer + RC complementaria | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) |
| SYN-12 | §6 | Contrato de atomicidad D1 | [`docs/architecture/06-acid-engine.md`](docs/architecture/06-acid-engine.md) |
| ADR-ARCH-002 | §1.1 | Capability model vs `vertical_type` | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) |
| DAT-12 | §5.0.1 | Aislamiento tenant: `tenant_id NOT NULL` + FK compuesta `(tenant_id, parent_id)` | [`docs/architecture/05-ddl-conventions.md`](docs/architecture/05-ddl-conventions.md) |
| ADR-FISCAL-001 | §5.1 | Decisiones fiscales cerradas | [`docs/architecture/05-1-formalization-matrix.md`](docs/architecture/05-1-formalization-matrix.md) |
| ADR-FISCAL-002 | §5.1 | Decisiones fiscales (v2) | [`docs/architecture/05-1-formalization-matrix.md`](docs/architecture/05-1-formalization-matrix.md) |
| LPDP-* | §5.3 (6F) | Privacidad (prefijo reservado; sin IDs emitidos aún) | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| CAL-01 | §13.3/§13.1 | Lint de invariantes: `db.transaction`, `toFixed`, `switch(vertical)`, `parseFloat` sobre dinero prohibidos (ESLint + Semgrep) | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |
| CAL-02 | §13.2 | TypeScript `strict` obligatorio en todo package/app del monorepo | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |
| CAL-03 | §13.4 | Cobertura mínima por capa: dominio/ACID ≥ 95%, adapters ≥ 70% | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |
| CAL-04 | §13.5 | Chaos adversarial por capa (red, cuota, memoria, shard/DO, concurrencia) antes del release | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |
| CAL-05 | §13.6 | SAST + secretos + dependencias: gitleaks, Semgrep, CodeQL, osv/pnpm audit | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |
| CAL-06 | §13.8 | Presupuesto de bundle en CI + cero dependencia npm runtime nueva sin ADR | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |
| CAL-07 | §13.9 | Evidencia TDD RED→GREEN con `red_commit_sha`/`red_run_id`/`green_*` en el ledger | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |
| CAL-08 | §13.3 | Complejidad ciclomática: hot path ≤ 12, resto ≤ 15 | [`docs/architecture/13-implementation-quality.md`](docs/architecture/13-implementation-quality.md) |

## Puertos → adapters

| Puerto | Responsabilidad | Adapters | Archivo | Línea |
|---|---|---|---|---|
| `PaymentAcquirer` | Captura/autorización de pago en caja (no billing SaaS) | Yape, Plin, Mercado Pago QR, Culqi, Niubiz | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 70 |
| `CatalogImporter` | Import idempotente catálogo/clientes/series | Bsale, Alegra, CSV | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 71 |
| `AccountingExporter` | Asientos / libros para el contador | Contasis, Concar | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 72 |
| `MessagingSender` | Envío post-venta de representación (PDF/QR) | WhatsApp Business | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 73 |
| `PublicApiWebhook` | Eventos salientes firmados a integradores | HMAC + reintentos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 74 |
| `FiscalTransport` | Envío/consulta CPE (ADR-FISCAL-002) | `KIPUSPAY_PSE_DIRECT` (default), `ose_*`, `pse_third_party` | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 75 |
| `PrinterTransport` | Entrega de ticket ESC/POS o sistema | WebUSB → WSS LAN → Web Bluetooth → `window.print()` / SystemPrint | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 76 |

## Packages destino (monorepo objetivo §1.1)

| Package | Contenido | Archivo | Línea |
|---|---|---|---|
| `domain-sales` | pipeline + policies de cobro | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 84 |
| `domain-inventory` | FEFO, BOM, transfers | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 85 |
| `domain-fiscal-pe` | UBL, RC, formalization guards (Anti-Corruption Layer Perú) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 86 |
| `domain-cash` | sesiones, Z ciego, authz descuentos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 87 |
| `domain-integrations` | importers, exporters, messaging contracts | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 88 |
| `contracts-sync` | idempotency envelopes / outbox | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 89 |
| `adapters-payments-pe` | Yape, Plin, MP, Culqi, Niubiz | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 92 |
| `adapters-importers` | Bsale, Alegra, CSV | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 93 |
| `adapters-accounting` | Contasis, Concar | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 94 |
| `adapters-messaging` | WhatsApp Business | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 95 |
| `pos-web` | SvelteKit | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 97 |
| `worker-api` | Hono composition root | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 98 |

<!-- generado desde: 20 archivo(s) de especificación + 17 de proceso/roadmap -->
