-- Ola 1 — Backfill tenant_capabilities por plan (ADR-ARCH-003 / GTM §4 / Arquitectura §1.1:115-237)
-- SoT: tenant_capabilities (D1 tenant_id, capability, enabled, config_json PK) + tenants.plan_id.
-- Idempotente y no destructivo: INSERT OR IGNORE, marca source plan_default, no borra overrides platform.
-- V-05: tenant_id NOT NULL (0035 ya tiene NOT NULL, esta migración solo inserta, no altera DDL)
-- V-14: sin FK nuevas, respeta DAT-12 (FK compuesta ya en 0011: FK tenant_id -> tenants(id))
-- V-25: espejo en migrations-down/0064_ola1_tenant_capabilities_backfill.sql
-- V-29: tenant_capabilities ya tiene 3 triggers en 0035:362-364 (backup_epoch_tenant_capabilities_*), no duplicar.
-- V-06: sin columnas monetarias, config_json es TEXT, enabled INTEGER 0/1.
-- Versión DDL: v8.1+ (DAT-03) — migración de datos, no DDL estructural.
-- Audit: staff-data + staff-principal, CAL-05, 0 FKs huérfanas, unicidad por tenant verificada via PK.

-- --------------------------------------------------------------------------
-- Defaults por plan — mapeo derivado de GTM §4 (cuotas y empaquetado) y
-- Arquitectura §1.1 capability table 115-237.
--   arranque (S/49): 1 sucursal, 1 caja, sin Modo Dueño ni reportes avanzados.
--   crece   (S/129): hasta 3 sucursales, cajas ilimitadas, Modo Dueño + reportes,
--                    promos/variantes/apartados/serie/balanza/BOM/listas (GTM-15..17, Sprint 18/30/31/32/39/40)
--   cadena  (S/349): sucursales ilimitadas, stock.transfers, integraciones, fidelización,
--                    3-way, diario contable, ubicaciones, forecasting/DR (Sprints 20/23/24/28-32/38/46/48/49)
--   enterprise: todo lo anterior + operaciones especializadas (órdenes KDS, recurrencia, push móvil, shift, etc.)
-- Cada plan hereda las caps del anterior (superset monotónico).
-- --------------------------------------------------------------------------

-- ARRANQUE: 11 caps base — cobro offline-first + caja/ledger mínimo + audit + catálogo vendible.
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT t.id, c.capability, 1, '{"source":"plan_default"}'
FROM tenants t
CROSS JOIN (
  SELECT 'pos.checkout' AS capability UNION ALL
  SELECT 'pos.document_selector' UNION ALL
  SELECT 'hardware.print_templates' UNION ALL
  SELECT 'pos.offline_correlative_reserve' UNION ALL
  SELECT 'display.vitrina' UNION ALL
  SELECT 'ledger.accounts_receivable' UNION ALL
  SELECT 'ledger.accounts_payable' UNION ALL
  SELECT 'purchasing.orders' UNION ALL
  SELECT 'cash.register_expenses' UNION ALL
  SELECT 'audit.sensitive_actions' UNION ALL
  SELECT 'catalog.sellable' UNION ALL
  SELECT 'auth.cashier_login'
) c
WHERE t.plan_id = 'arranque';

-- CRECE: arranque + 18 caps (owner/reporting + blind Z + FEFO/BOM + pricing + variantes/layaway/serie/escala)
-- Total 29 caps para plan crece (11 base + 18)
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT t.id, c.capability, 1, '{"source":"plan_default"}'
FROM tenants t
CROSS JOIN (
  -- base arranque
  SELECT 'pos.checkout' AS capability UNION ALL SELECT 'pos.document_selector' UNION ALL SELECT 'hardware.print_templates' UNION ALL
  SELECT 'pos.offline_correlative_reserve' UNION ALL SELECT 'display.vitrina' UNION ALL
  SELECT 'ledger.accounts_receivable' UNION ALL SELECT 'ledger.accounts_payable' UNION ALL
  SELECT 'purchasing.orders' UNION ALL SELECT 'cash.register_expenses' UNION ALL
  SELECT 'audit.sensitive_actions' UNION ALL SELECT 'catalog.sellable' UNION ALL SELECT 'auth.cashier_login' UNION ALL
  -- + crece
  SELECT 'owner.mode' UNION ALL SELECT 'owner.offline_rollup' UNION ALL SELECT 'owner.push_alerts' UNION ALL
  SELECT 'reporting.daily_rollups' UNION ALL SELECT 'reporting.product_rollups' UNION ALL
  SELECT 'reporting.catalog' UNION ALL SELECT 'reporting.export' UNION ALL SELECT 'reporting.shard_aggregator' UNION ALL
  SELECT 'cash.blind_z' UNION ALL SELECT 'cash.discount_authz' UNION ALL SELECT 'ledger.credit_limit_cents' UNION ALL
  SELECT 'inventory.batches' UNION ALL SELECT 'inventory.bom' UNION ALL SELECT 'pricing.lists' UNION ALL
  SELECT 'pricing.promotions' UNION ALL SELECT 'catalog.variants' UNION ALL SELECT 'catalog.uom' UNION ALL
  SELECT 'sales.layaway'
) c
WHERE t.plan_id = 'crece';

-- CADENA: crece + 22 caps (transfers, integraciones, fidelización, commerce profundo, locaciones, backup, forecasting/DR)
-- Total 51 caps para plan cadena
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT t.id, c.capability, 1, '{"source":"plan_default"}'
FROM tenants t
CROSS JOIN (
  -- base crece (29)
  SELECT 'pos.checkout' AS capability UNION ALL SELECT 'pos.document_selector' UNION ALL SELECT 'hardware.print_templates' UNION ALL
  SELECT 'pos.offline_correlative_reserve' UNION ALL SELECT 'display.vitrina' UNION ALL
  SELECT 'ledger.accounts_receivable' UNION ALL SELECT 'ledger.accounts_payable' UNION ALL
  SELECT 'purchasing.orders' UNION ALL SELECT 'cash.register_expenses' UNION ALL
  SELECT 'audit.sensitive_actions' UNION ALL SELECT 'catalog.sellable' UNION ALL SELECT 'auth.cashier_login' UNION ALL
  SELECT 'owner.mode' UNION ALL SELECT 'owner.offline_rollup' UNION ALL SELECT 'owner.push_alerts' UNION ALL
  SELECT 'reporting.daily_rollups' UNION ALL SELECT 'reporting.product_rollups' UNION ALL
  SELECT 'reporting.catalog' UNION ALL SELECT 'reporting.export' UNION ALL SELECT 'reporting.shard_aggregator' UNION ALL
  SELECT 'cash.blind_z' UNION ALL SELECT 'cash.discount_authz' UNION ALL SELECT 'ledger.credit_limit_cents' UNION ALL
  SELECT 'inventory.batches' UNION ALL SELECT 'inventory.bom' UNION ALL SELECT 'pricing.lists' UNION ALL
  SELECT 'pricing.promotions' UNION ALL SELECT 'catalog.variants' UNION ALL SELECT 'catalog.uom' UNION ALL SELECT 'sales.layaway' UNION ALL
  -- + cadena
  SELECT 'stock.transfers' UNION ALL SELECT 'purchasing.partial_receive' UNION ALL
  SELECT 'integrations.catalog_import' UNION ALL SELECT 'payments.qr_wallets' UNION ALL SELECT 'payments.card_acquirer' UNION ALL
  SELECT 'integrations.accounting_export' UNION ALL SELECT 'integrations.api' UNION ALL
  SELECT 'messaging.whatsapp_receipt' UNION ALL SELECT 'loyalty.points' UNION ALL
  SELECT 'sales.returns' UNION ALL SELECT 'purchasing.three_way' UNION ALL SELECT 'ledger.chart_of_accounts' UNION ALL
  SELECT 'sales.quotes' UNION ALL SELECT 'purchasing.returns' UNION ALL SELECT 'ledger.store_credit' UNION ALL
  SELECT 'sales.installments' UNION ALL SELECT 'sales.commissions' UNION ALL
  SELECT 'inventory.locations' UNION ALL SELECT 'inventory.serials' UNION ALL SELECT 'inventory.scale' UNION ALL
  SELECT 'catalog.price_labels' UNION ALL SELECT 'data.backup'
) c
WHERE t.plan_id = 'cadena';

-- ENTERPRISE: cadena + 26 caps restantes (órdenes KDS, customer_orders, recurring, push móvil, forecasting/insights, ops, marketing)
-- Total 77 caps para enterprise (superset completo)
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT t.id, c.capability, 1, '{"source":"plan_default"}'
FROM tenants t
CROSS JOIN (
  -- base cadena 51
  SELECT 'pos.checkout' AS capability UNION ALL SELECT 'pos.document_selector' UNION ALL SELECT 'hardware.print_templates' UNION ALL
  SELECT 'pos.offline_correlative_reserve' UNION ALL SELECT 'display.vitrina' UNION ALL
  SELECT 'ledger.accounts_receivable' UNION ALL SELECT 'ledger.accounts_payable' UNION ALL
  SELECT 'purchasing.orders' UNION ALL SELECT 'cash.register_expenses' UNION ALL
  SELECT 'audit.sensitive_actions' UNION ALL SELECT 'catalog.sellable' UNION ALL SELECT 'auth.cashier_login' UNION ALL
  SELECT 'owner.mode' UNION ALL SELECT 'owner.offline_rollup' UNION ALL SELECT 'owner.push_alerts' UNION ALL
  SELECT 'reporting.daily_rollups' UNION ALL SELECT 'reporting.product_rollups' UNION ALL
  SELECT 'reporting.catalog' UNION ALL SELECT 'reporting.export' UNION ALL SELECT 'reporting.shard_aggregator' UNION ALL
  SELECT 'cash.blind_z' UNION ALL SELECT 'cash.discount_authz' UNION ALL SELECT 'ledger.credit_limit_cents' UNION ALL
  SELECT 'inventory.batches' UNION ALL SELECT 'inventory.bom' UNION ALL SELECT 'pricing.lists' UNION ALL
  SELECT 'pricing.promotions' UNION ALL SELECT 'catalog.variants' UNION ALL SELECT 'catalog.uom' UNION ALL SELECT 'sales.layaway' UNION ALL
  SELECT 'stock.transfers' UNION ALL SELECT 'purchasing.partial_receive' UNION ALL
  SELECT 'integrations.catalog_import' UNION ALL SELECT 'payments.qr_wallets' UNION ALL SELECT 'payments.card_acquirer' UNION ALL
  SELECT 'integrations.accounting_export' UNION ALL SELECT 'integrations.api' UNION ALL
  SELECT 'messaging.whatsapp_receipt' UNION ALL SELECT 'loyalty.points' UNION ALL
  SELECT 'sales.returns' UNION ALL SELECT 'purchasing.three_way' UNION ALL SELECT 'ledger.chart_of_accounts' UNION ALL
  SELECT 'sales.quotes' UNION ALL SELECT 'purchasing.returns' UNION ALL SELECT 'ledger.store_credit' UNION ALL
  SELECT 'sales.installments' UNION ALL SELECT 'sales.commissions' UNION ALL
  SELECT 'inventory.locations' UNION ALL SELECT 'inventory.serials' UNION ALL SELECT 'inventory.scale' UNION ALL
  SELECT 'catalog.price_labels' UNION ALL SELECT 'data.backup' UNION ALL
  -- + enterprise
  SELECT 'orders.lifecycle' UNION ALL SELECT 'orders.kds' UNION ALL SELECT 'orders.split_bill' UNION ALL
  SELECT 'orders.customer_orders' UNION ALL SELECT 'sales.recurring' UNION ALL SELECT 'mobile.push' UNION ALL SELECT 'client.mobile_pos' UNION ALL
  SELECT 'analytics.forecasting' UNION ALL SELECT 'compliance.lpdp' UNION ALL SELECT 'platform.dr' UNION ALL SELECT 'analytics.agentic_insights' UNION ALL
  SELECT 'catalog.quick_add' UNION ALL SELECT 'sales.quick_line' UNION ALL SELECT 'ops.shift_handoff' UNION ALL SELECT 'ops.team_invite' UNION ALL
  SELECT 'onboarding.tour' UNION ALL SELECT 'hardware.diagnostics' UNION ALL
  SELECT 'marketing.site' UNION ALL SELECT 'marketing.vertical_landing' UNION ALL SELECT 'marketing.compare' UNION ALL SELECT 'marketing.claim_gate' UNION ALL
  SELECT 'marketing.referrals' UNION ALL SELECT 'marketing.content' UNION ALL SELECT 'pos.brand_qr' UNION ALL SELECT 'analytics.growth_metrics'
) c
WHERE t.plan_id = 'enterprise';

-- Nota: tenants con plan_id fuera de los 4 (legacy) no reciben backfill; el control plane los corrige via PATCH /api/tenant/plan.
-- La marca config_json='{"source":"plan_default"}' permite a SuperAdmin distinguir defaults de overrides platform (config_json distinto) y no borrarlos.
