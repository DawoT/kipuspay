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
| `pos.checkout` | 7 | Caja por modo / cobro offline-first | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 119 |
| `pos.document_selector` | 7 | NV/01/03 según modo+régimen | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 120 |
| `hardware.print_templates` | 7 | Tickets CPE/NV 58/80 (no ladder S25) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 121 |
| `display.vitrina` | 7 | Customer display en cobro | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 122 |
| `pos.offline_correlative_reserve` | 7 | Reserva tentativa local; server autoritativo | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 123 |
| `ledger.accounts_receivable` | 8 | CxC + DAT-05 + compensación NC (E-D) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 124 |
| `ledger.accounts_payable` | 8 | CxP + pagos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 125 |
| `purchasing.orders` | 8 | Órdenes de compra (status mínimo; sin 3-way) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 126 |
| `cash.register_expenses` | 8 | Egresos de caja chica | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 127 |
| `owner.mode` | 8 | PWA Modo Dueño Hoy/Finanzas/Yo | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 128 |
| `owner.offline_rollup` | 8 | Cache IDB rollup + banner antigüedad | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 129 |
| `owner.push_alerts` | 8 | Push accionable Dueño (no `mobile.push` completo) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 130 |
| `reporting.daily_rollups` | 9 | SoT financial rollups + cron shard | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 131 |
| `reporting.product_rollups` | 9 | `daily_product_rollups` top/margen | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 132 |
| `reporting.catalog` | 9 | Catálogo reportes retail plan+rol | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 133 |
| `reporting.export` | 9 | Export CSV UTF-8 BOM | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 134 |
| `reporting.shard_aggregator` | 9 | `Promise.all` sobre active_shards | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 135 |
| `marketing.site` | 10 | Home + shell header/footer pre-venta | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 141 |
| `marketing.vertical_landing` | 10 | Landings `/para/[vertical]` (content slug) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 142 |
| `marketing.compare` | 10 | `/comparar/[competidor]` SEO intención | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 143 |
| `marketing.claim_gate` | 10 | Feature destacada live vs roadmap+sprint | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 144 |
| `marketing.referrals` | 12 | Códigos + atribución 1+1 mes (GTM §7.1) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 145 |
| `marketing.content` | 12 | `/casos-de-exito` + `/blog` (GTM §7.3) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 146 |
| `pos.brand_qr` | 12 | Pie “Emitido con KipusPay” + QR (GTM §7.2) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 147 |
| `analytics.growth_metrics` | 12 | TTFS / upgrade / activation / NRR / K-factor (GTM §9) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 148 |
| `cash.blind_z` | 17 | Retail / “cada sol cuadra” | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 154 |
| `cash.discount_authz` | 17 | Retail | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 155 |
| `ledger.credit_limit_cents` | 17 | Retail / CxC | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 156 |
| `audit.sensitive_actions` | 17 | Todos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 157 |
| `inventory.batches` | 18 | Farmacias | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 158 |
| `inventory.bom` | 18 | Retail / food | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 159 |
| `pricing.lists` | 18 | Multi-lista | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 160 |
| `orders.lifecycle` | 19 | Restaurantes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 161 |
| `orders.kds` | 19 | Restaurantes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 162 |
| `orders.split_bill` | 19 | Restaurantes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 163 |
| `stock.transfers` | 20 | Cadenas | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 164 |
| `purchasing.partial_receive` | 20 | Cadenas / retail | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 165 |
| `integrations.catalog_import` | 21 | Migración / objeción #1 | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 171 |
| `payments.qr_wallets` | 22 | Cobro PE (Yape/Plin/MP) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 172 |
| `payments.card_acquirer` | 22 | Retail / Culqi-Niubiz | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 173 |
| `integrations.accounting_export` | 23 | Crece+ / contador | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 174 |
| `integrations.api` | 23 | Cadena (API + webhooks) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 175 |
| `messaging.whatsapp_receipt` | 24 | Post-venta / activación | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 176 |
| `loyalty.points` | 24 | Cadena (fidelización light) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 177 |
| `sales.returns` | 28–32 | Devoluciones con política N días | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 183 |
| `purchasing.three_way` | 28–32 | Control de proveedor / OC | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 184 |
| `pricing.promotions` | 28–32 | Promos y tramos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 185 |
| `catalog.variants` | 28–32 | Multi-variante / unidades | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 186 |
| `sales.layaway` | 28–32 | Apartados | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 187 |
| `ledger.chart_of_accounts` | 28–32 | Diario contable (retail) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 188 |
| `sales.quotes` | 33–37 | Cotizaciones/presupuestos | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 194 |
| `purchasing.returns` | 33–37 | Devolución a proveedor | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 195 |
| `ledger.store_credit` | 33–37 | Crédito de tienda / gift cards | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 196 |
| `sales.installments` | 33–37 | Cuotas / pago en partes | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 197 |
| `sales.commissions` | 33–37 | Comisiones de vendedor | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 198 |
| `inventory.locations` | 38–42 | Ubicaciones de inventario | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 204 |
| `inventory.serials` | 38–42 | Números de serie | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 205 |
| `inventory.scale` | 38–42 | Venta por peso / balanza | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 206 |
| `catalog.price_labels` | 38–42 | Etiquetas de precio | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 207 |
| `data.backup` | 38–42 | Export / restore del negocio | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 208 |
| `orders.customer_orders` | 43–45 | Preventa / pedido a cliente | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 214 |
| `sales.recurring` | 43–45 | Recurrentes / membresías | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 215 |
| `mobile.push` | 43–45 | Motor push operacional (owner.push_alerts = alias legado) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 216 |
| `client.mobile_pos` | 43–45 | Caja móvil PWA sobre el POS único | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 217 |
| `analytics.forecasting` | 46 | Predictiva (Cadena, freeze 46) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 223 |
| `compliance.lpdp` | 47–48 | LPDP / DR-BCP (Cadena) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 224 |
| `analytics.agentic_insights` | 49 | Insight / briefing (Cadena/Enterprise, freeze 49) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 225 |
| `catalog.quick_add` | 50 | Escáner con cámara + venta rápida (gate 50) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 231 |
| `ops.shift_handoff` | 51 | Handoff de turno sin cerrar caja (gate 51) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 232 |
| `ops.team_invite` | 51 | Equipo: invitación + PIN/badge | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 233 |
| `onboarding.tour` | 52 | Product Tour + checklist "segundo día" | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 234 |
| `hardware.diagnostics` | 53 | Troubleshooter de impresora/balanza | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 235 |

## Sprints → fase, archivo y estado

| Sprint | FASE | Archivo | Línea | Especificación | Entrega |
|---|---|---|---|---|---|
| 0 | 0 | [`docs/roadmap/fase-0.md`](docs/roadmap/fase-0.md) | 12 | sin fila de estado | — |
| 1 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 12 | sin fila de estado | — |
| 2 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 23 | sin fila de estado | — |
| 3 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 34 | sin fila de estado | — |
| 4 | 1 | [`docs/roadmap/fase-1.md`](docs/roadmap/fase-1.md) | 45 | sin fila de estado | — |
| 5 | 2 | [`docs/roadmap/fase-2.md`](docs/roadmap/fase-2.md) | 12 | sin fila de estado | — |
| 5b | 2 | [`docs/roadmap/fase-2.md`](docs/roadmap/fase-2.md) | 34 | sin fila de estado | — |
| 6 | 2 | [`docs/roadmap/fase-2.md`](docs/roadmap/fase-2.md) | 53 | sin fila de estado | — |
| 7 | 3 | [`docs/roadmap/fase-3.md`](docs/roadmap/fase-3.md) | 12 | sin fila de estado | — |
| 8 | 3 | [`docs/roadmap/fase-3.md`](docs/roadmap/fase-3.md) | 25 | sin fila de estado | — |
| 9 | 3 | [`docs/roadmap/fase-3.md`](docs/roadmap/fase-3.md) | 40 | sin fila de estado | — |
| 10 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 12 | sin fila de estado | — |
| 11 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 27 | sin fila de estado | — |
| 12 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 43 | sin fila de estado | — |
| 13 | 4 | [`docs/roadmap/fase-4.md`](docs/roadmap/fase-4.md) | 54 | sin fila de estado | — |
| 14 | 5 | [`docs/roadmap/fase-5.md`](docs/roadmap/fase-5.md) | 12 | sin fila de estado | — |
| 15 | 5 | [`docs/roadmap/fase-5.md`](docs/roadmap/fase-5.md) | 23 | sin fila de estado | — |
| 17 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 14 | sin fila de estado | — |
| 18 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 32 | sin fila de estado | — |
| 19 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 52 | sin fila de estado | — |
| 20 | 6 | [`docs/roadmap/fase-6.md`](docs/roadmap/fase-6.md) | 68 | sin fila de estado | — |
| 28 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 14 | sin fila de estado | — |
| 29 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 31 | sin fila de estado | — |
| 30 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 47 | sin fila de estado | — |
| 31 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 63 | sin fila de estado | — |
| 32 | 6B | [`docs/roadmap/fase-6b.md`](docs/roadmap/fase-6b.md) | 81 | sin fila de estado | — |
| 33 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 14 | sin fila de estado | — |
| 34 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 30 | sin fila de estado | — |
| 35 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 46 | sin fila de estado | — |
| 36 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 62 | sin fila de estado | — |
| 37 | 6C | [`docs/roadmap/fase-6c.md`](docs/roadmap/fase-6c.md) | 78 | sin fila de estado | — |
| 38 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 14 | sin fila de estado | — |
| 39 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 30 | sin fila de estado | — |
| 40 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 46 | sin fila de estado | — |
| 41 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 62 | sin fila de estado | — |
| 42 | 6D | [`docs/roadmap/fase-6d.md`](docs/roadmap/fase-6d.md) | 80 | sin fila de estado | — |
| 43 | 6E | [`docs/roadmap/fase-6e.md`](docs/roadmap/fase-6e.md) | 14 | sin fila de estado | — |
| 44 | 6E | [`docs/roadmap/fase-6e.md`](docs/roadmap/fase-6e.md) | 31 | sin fila de estado | — |
| 45 | 6E | [`docs/roadmap/fase-6e.md`](docs/roadmap/fase-6e.md) | 48 | sin fila de estado | — |
| 46 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 14 | sin fila de estado | — |
| 47 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 29 | sin fila de estado | — |
| 48 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 44 | sin fila de estado | — |
| 49 | 6F | [`docs/roadmap/fase-6f.md`](docs/roadmap/fase-6f.md) | 59 | sin fila de estado | — |
| 50 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 14 | sin fila de estado | — |
| 51 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 29 | sin fila de estado | — |
| 52 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 45 | sin fila de estado | — |
| 53 | 6G | [`docs/roadmap/fase-6g.md`](docs/roadmap/fase-6g.md) | 60 | sin fila de estado | — |
| 21 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 14 | sin fila de estado | — |
| 22 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 29 | sin fila de estado | — |
| 23 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 45 | sin fila de estado | — |
| 24 | 7 | [`docs/roadmap/fase-7.md`](docs/roadmap/fase-7.md) | 61 | sin fila de estado | — |
| 25 | 8 | [`docs/roadmap/fase-8.md`](docs/roadmap/fase-8.md) | 14 | sin fila de estado | — |
| 26 | 8 | [`docs/roadmap/fase-8.md`](docs/roadmap/fase-8.md) | 30 | sin fila de estado | — |
| 27 | 8 | [`docs/roadmap/fase-8.md`](docs/roadmap/fase-8.md) | 49 | sin fila de estado | — |

## Tablas DDL → capítulo y línea

| Tabla | Sección | Archivo | Línea |
|---|---|---|---|
| `push_consents` | §5.12.5 | [`docs/architecture/05-12-mobile-push-pos.md`](docs/architecture/05-12-mobile-push-pos.md) | 96 |
| `push_subscriptions` | §5.12.5 | [`docs/architecture/05-12-mobile-push-pos.md`](docs/architecture/05-12-mobile-push-pos.md) | 121 |
| `push_events` | §5.12.5 | [`docs/architecture/05-12-mobile-push-pos.md`](docs/architecture/05-12-mobile-push-pos.md) | 154 |
| `push_deliveries` | §5.12.5 | [`docs/architecture/05-12-mobile-push-pos.md`](docs/architecture/05-12-mobile-push-pos.md) | 184 |
| `usage_counters` | §4.1 | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) | 203 |
| `usage_events` | §4.1 | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) | 212 |
| `billing_overages` | §4.1 | [`docs/architecture/04-webhooks-metering.md`](docs/architecture/04-webhooks-metering.md) | 223 |
| `tenant_capabilities` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 63 |
| `audit_events` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 73 |
| `authorization_tokens` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 96 |
| `fiscal_outbox` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 111 |
| `cash_count_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 127 |
| `tenant_discount_policies` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 141 |
| `orders` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 148 |
| `order_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 163 |
| `stock_transfers` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 178 |
| `stock_transfer_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 193 |
| `purchase_receipts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 208 |
| `purchase_receipt_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 218 |
| `branch_stock_policies` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 235 |
| `inventory_counts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 247 |
| `inventory_count_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 261 |
| `stock_losses` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 276 |
| `cash_register_cash_movements` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 297 |
| `sale_reprints` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 316 |
| `return_policies` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 344 |
| `sales_returns` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 353 |
| `sale_return_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 371 |
| `supplier_invoices` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 390 |
| `supplier_invoice_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 418 |
| `promotions` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 430 |
| `product_promotions` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 444 |
| `product_uoms` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 461 |
| `sale_deposits` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 486 |
| `sale_deposit_payments` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 504 |
| `sale_deposit_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 517 |
| `chart_of_accounts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 540 |
| `journal_entries` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 550 |
| `journal_lines` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 571 |
| `quotes` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 594 |
| `quote_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 604 |
| `supplier_returns` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 620 |
| `supplier_return_items` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 634 |
| `store_credit_accounts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 651 |
| `store_credit_transactions` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 658 |
| `sale_installments` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 671 |
| `sale_installment_payments` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 683 |
| `commission_rates` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 693 |
| `commission_payouts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 702 |
| `commission_accruals` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 711 |
| `inventory_locations` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 726 |
| `inventory_location_stock` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 737 |
| `inventory_location_batch_stock` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 748 |
| `pos_terminals` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 772 |
| `forecast_outputs` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 815 |
| `consent_records` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 830 |
| `insight_log` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 848 |
| `ai_usage_counters` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 866 |
| `cash_register_shifts` | §5.3 | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) | 881 |
| `external_entity_map` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 27 |
| `payment_captures` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 41 |
| `api_keys` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 59 |
| `webhook_endpoints` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 73 |
| `webhook_deliveries` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 87 |
| `tenant_certificates` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 104 |
| `webhook_events` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 118 |
| `loyalty_accounts` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 132 |
| `loyalty_reservations` | §5.4 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) | 144 |
| `tenants` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 20 |
| `branches` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 53 |
| `cash_registers` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 68 |
| `branch_document_series` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 84 |
| `cash_register_sessions` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 100 |
| `users` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 116 |
| `customers` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 137 |
| `taxes` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 164 |
| `products` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 176 |
| `product_taxes` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 203 |
| `product_recipes` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 214 |
| `price_lists` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 226 |
| `product_prices` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 236 |
| `inventory_batches` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 248 |
| `branch_product_stock` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 263 |
| `inventory_movements` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 277 |
| `payment_methods` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 294 |
| `exchange_rates` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 303 |
| `sales` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 315 |
| `sunat_daily_summaries` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 378 |
| `sale_items` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 401 |
| `sale_payments` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 428 |
| `suppliers` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 446 |
| `purchase_orders` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 462 |
| `purchase_order_items` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 477 |
| `accounts_payable` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 487 |
| `accounts_payable_payments` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 502 |
| `accounts_receivable` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 513 |
| `accounts_receivable_payments` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 530 |
| `cash_register_expenses` | §5.5 | [`docs/architecture/05-5-ddl-base.md`](docs/architecture/05-5-ddl-base.md) | 542 |
| `serial_numbers` | §5.6 | [`docs/architecture/05-6-inventory-serials.md`](docs/architecture/05-6-inventory-serials.md) | 39 |
| `serial_number_events` | §5.6 | [`docs/architecture/05-6-inventory-serials.md`](docs/architecture/05-6-inventory-serials.md) | 67 |
| `serial_terminal_leases` | §5.6 | [`docs/architecture/05-6-inventory-serials.md`](docs/architecture/05-6-inventory-serials.md) | 89 |
| `serial_manifests` | §5.6 | [`docs/architecture/05-6-inventory-serials.md`](docs/architecture/05-6-inventory-serials.md) | 108 |
| `tenant_weight_policies` | §5.7 | [`docs/architecture/05-7-inventory-scale.md`](docs/architecture/05-7-inventory-scale.md) | 78 |
| `pos_terminal_sessions` | §5.7 | [`docs/architecture/05-7-inventory-scale.md`](docs/architecture/05-7-inventory-scale.md) | 90 |
| `scale_devices` | §5.7 | [`docs/architecture/05-7-inventory-scale.md`](docs/architecture/05-7-inventory-scale.md) | 115 |
| `weight_measurements` | §5.7 | [`docs/architecture/05-7-inventory-scale.md`](docs/architecture/05-7-inventory-scale.md) | 146 |
| `price_label_templates` | §5.8 | [`docs/architecture/05-8-catalog-price-labels.md`](docs/architecture/05-8-catalog-price-labels.md) | 79 |
| `price_label_batches` | §5.8 | [`docs/architecture/05-8-catalog-price-labels.md`](docs/architecture/05-8-catalog-price-labels.md) | 96 |
| `price_label_items` | §5.8 | [`docs/architecture/05-8-catalog-price-labels.md`](docs/architecture/05-8-catalog-price-labels.md) | 119 |
| `data_backups` | §5.9 | [`docs/architecture/05-9-data-backup.md`](docs/architecture/05-9-data-backup.md) | 154 |
| `data_backup_chunks` | §5.9 | [`docs/architecture/05-9-data-backup.md`](docs/architecture/05-9-data-backup.md) | 194 |
| `data_backup_objects` | §5.9 | [`docs/architecture/05-9-data-backup.md`](docs/architecture/05-9-data-backup.md) | 221 |
| `data_backup_table_manifests` | §5.9 | [`docs/architecture/05-9-data-backup.md`](docs/architecture/05-9-data-backup.md) | 246 |
| `restore_dry_runs` | §5.9 | [`docs/architecture/05-9-data-backup.md`](docs/architecture/05-9-data-backup.md) | 267 |
| `tenant_data_epochs` | §5.9 | [`docs/architecture/05-9-data-backup.md`](docs/architecture/05-9-data-backup.md) | 296 |
| `customer_orders` | §5.10 | [`docs/architecture/05-10-customer-orders.md`](docs/architecture/05-10-customer-orders.md) | 130 |
| `customer_order_items` | §5.10 | [`docs/architecture/05-10-customer-orders.md`](docs/architecture/05-10-customer-orders.md) | 160 |
| `customer_order_fulfillments` | §5.10 | [`docs/architecture/05-10-customer-orders.md`](docs/architecture/05-10-customer-orders.md) | 209 |
| `customer_order_notifications` | §5.10 | [`docs/architecture/05-10-customer-orders.md`](docs/architecture/05-10-customer-orders.md) | 248 |
| `recurring_plans` | §5.11 | [`docs/architecture/05-11-recurring-sales.md`](docs/architecture/05-11-recurring-sales.md) | 129 |
| `recurring_plan_items` | §5.11 | [`docs/architecture/05-11-recurring-sales.md`](docs/architecture/05-11-recurring-sales.md) | 177 |
| `recurring_occurrences` | §5.11 | [`docs/architecture/05-11-recurring-sales.md`](docs/architecture/05-11-recurring-sales.md) | 201 |
| `recurring_occurrence_items` | §5.11 | [`docs/architecture/05-11-recurring-sales.md`](docs/architecture/05-11-recurring-sales.md) | 229 |
| `recurring_proration_adjustments` | §5.11 | [`docs/architecture/05-11-recurring-sales.md`](docs/architecture/05-11-recurring-sales.md) | 260 |
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
| FIS-13 | §5.1/§5.2 (P1a) | ND `08`: motivos catálogo 10, guard ACCEPTED, sin stock, append-only (ADR-FISCAL-003) | [`docs/architecture/05-1-formalization-matrix.md`](docs/architecture/05-1-formalization-matrix.md) |
| COM-01 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-02 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| COM-03 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-04 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-05 | §5.10 | Precio congelado en pedidos de cliente (snapshot) | [`docs/architecture/05-10-customer-orders.md`](docs/architecture/05-10-customer-orders.md) |
| COM-06 | §5.3 (6C) | DDL cierre comercial | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-07 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-08 | §5.3 (6B) | DDL profundidad retail | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| COM-09 | §5.10 | Pedido de cliente: reserva, aviso, fulfillment y DDL 0036 | [`docs/architecture/05-10-customer-orders.md`](docs/architecture/05-10-customer-orders.md) |
| COM-10 | §5.11 | Membresía: pricing versionado, calendario, settlement, gracia y prorrateo | [`docs/architecture/05-11-recurring-sales.md`](docs/architecture/05-11-recurring-sales.md) |
| COM-11 | §5.12 | Push: consentimiento, privacidad, entrega/ACK, DDL 0038 y caja móvil | [`docs/architecture/05-12-mobile-push-pos.md`](docs/architecture/05-12-mobile-push-pos.md) |
| COM-12 | §5.4 | DDL ecosistema v9 | [`docs/architecture/05-4-ecosystem-ports.md`](docs/architecture/05-4-ecosystem-ports.md) |
| COM-13 | §5.3 (6G) | Capabilities flujo del cliente: tour/checklist (S52) + diagnóstico de hardware `HARDWARE_DIAG` (S53) | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
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
| SYN-13 | §5.7 | Peso entero, heartbeat fail-closed y reconciliación autoritativa | [`docs/architecture/05-7-inventory-scale.md`](docs/architecture/05-7-inventory-scale.md) |
| ADR-ARCH-002 | §1.1 | Capability model vs `vertical_type` | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) |
| DAT-12 | §5.0.1 | Aislamiento tenant: `tenant_id NOT NULL` + FK compuesta `(tenant_id, parent_id)` | [`docs/architecture/05-ddl-conventions.md`](docs/architecture/05-ddl-conventions.md) |
| ADR-FISCAL-001 | §5.1 | Decisiones fiscales cerradas | [`docs/architecture/05-1-formalization-matrix.md`](docs/architecture/05-1-formalization-matrix.md) |
| ADR-FISCAL-002 | §8.1 | Canal FiscalTransport + circuit breaker | [`docs/architecture/08-credit-notes-dlq.md`](docs/architecture/08-credit-notes-dlq.md) |
| ADR-FISCAL-003 | §5.1/§5.2 | Nota de Débito `08` completa (Backlog v10 P1a) | [`docs/architecture/05-1-formalization-matrix.md`](docs/architecture/05-1-formalization-matrix.md) |
| LPDP-01 | §5.3 (6F) | Consentimiento explícito por propósito (`consent_records`) | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| LPDP-02 | §5.3 (6F) | Derecho de acceso/export de PII del cliente | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| LPDP-03 | §5.3 (6F) | Derecho de borrado/anonimización (`pii_erased`); retención fiscal SUNAT | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
| LPDP-04 | §5.3 (6F) | Aislamiento PII multi-tenant (`tenant_id` del JWT forzado) | [`docs/architecture/05-3-commercial-ops.md`](docs/architecture/05-3-commercial-ops.md) |
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
| `adapters-d1` | D1 batch, processOfflineSaleAtomic, atomic_guards, audit_events | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 90 |
| `adapters-sunat` | transporte fiscal SUNAT / PSE | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 91 |
| `adapters-payments-pe` | Yape, Plin, MP, Culqi, Niubiz | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 92 |
| `adapters-importers` | Bsale, Alegra, CSV | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 93 |
| `adapters-accounting` | Contasis, Concar | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 94 |
| `adapters-messaging` | WhatsApp Business | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 95 |
| `chaos-harness` | §13.5 escenarios chaos (jueces + fail-closed deps) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 96 |
| `print-templates` | ESC/POS + HTML ticket CPE/NV (zero-dep; §10) | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 97 |
| `pos-web` | SvelteKit | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 99 |
| `worker-api` | Hono composition root | [`docs/architecture/01-principles.md`](docs/architecture/01-principles.md) | 100 |

<!-- generado desde: 27 archivo(s) de especificación + 17 de proceso/roadmap -->
