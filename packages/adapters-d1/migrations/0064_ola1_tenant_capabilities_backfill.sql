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
-- D1 compat: evita UNION ALL compound (SQLITE_MAX_COMPOUND_SELECT) usando INSERT SELECT per capability.

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

-- ARRANQUE: 12 caps
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.checkout', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.document_selector', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'hardware.print_templates', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.offline_correlative_reserve', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'display.vitrina', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_receivable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_payable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.orders', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.register_expenses', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'audit.sensitive_actions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.sellable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'auth.cashier_login', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'arranque';

-- CRECE: 30 caps
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.checkout', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.document_selector', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'hardware.print_templates', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.offline_correlative_reserve', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'display.vitrina', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_receivable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_payable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.orders', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.register_expenses', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'audit.sensitive_actions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.sellable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'auth.cashier_login', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.mode', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.offline_rollup', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.push_alerts', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.daily_rollups', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.product_rollups', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.catalog', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.export', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.shard_aggregator', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.blind_z', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.discount_authz', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.credit_limit_cents', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.batches', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.bom', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pricing.lists', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pricing.promotions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.variants', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.uom', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.layaway', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'crece';

-- CADENA: 52 caps
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.checkout', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.document_selector', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'hardware.print_templates', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.offline_correlative_reserve', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'display.vitrina', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_receivable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_payable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.orders', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.register_expenses', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'audit.sensitive_actions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.sellable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'auth.cashier_login', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.mode', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.offline_rollup', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.push_alerts', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.daily_rollups', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.product_rollups', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.catalog', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.export', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.shard_aggregator', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.blind_z', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.discount_authz', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.credit_limit_cents', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.batches', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.bom', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pricing.lists', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pricing.promotions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.variants', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.uom', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.layaway', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'stock.transfers', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.partial_receive', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'integrations.catalog_import', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'payments.qr_wallets', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'payments.card_acquirer', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'integrations.accounting_export', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'integrations.api', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'messaging.whatsapp_receipt', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'loyalty.points', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.returns', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.three_way', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.chart_of_accounts', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.quotes', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.returns', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.store_credit', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.installments', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.commissions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.locations', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.serials', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.scale', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.price_labels', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'data.backup', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'cadena';

-- ENTERPRISE: 77 caps
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.checkout', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.document_selector', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'hardware.print_templates', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.offline_correlative_reserve', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'display.vitrina', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_receivable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.accounts_payable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.orders', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.register_expenses', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'audit.sensitive_actions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.sellable', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'auth.cashier_login', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.mode', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.offline_rollup', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'owner.push_alerts', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.daily_rollups', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.product_rollups', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.catalog', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.export', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'reporting.shard_aggregator', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.blind_z', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'cash.discount_authz', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.credit_limit_cents', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.batches', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.bom', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pricing.lists', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pricing.promotions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.variants', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.uom', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.layaway', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'stock.transfers', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.partial_receive', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'integrations.catalog_import', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'payments.qr_wallets', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'payments.card_acquirer', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'integrations.accounting_export', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'integrations.api', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'messaging.whatsapp_receipt', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'loyalty.points', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.returns', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.three_way', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.chart_of_accounts', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.quotes', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'purchasing.returns', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ledger.store_credit', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.installments', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.commissions', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.locations', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.serials', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'inventory.scale', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.price_labels', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'data.backup', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'orders.lifecycle', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'orders.kds', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'orders.split_bill', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'orders.customer_orders', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.recurring', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'mobile.push', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'client.mobile_pos', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'analytics.forecasting', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'compliance.lpdp', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'platform.dr', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'analytics.agentic_insights', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'catalog.quick_add', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'sales.quick_line', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ops.shift_handoff', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'ops.team_invite', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'onboarding.tour', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'hardware.diagnostics', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'marketing.site', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'marketing.vertical_landing', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'marketing.compare', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'marketing.claim_gate', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'marketing.referrals', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'marketing.content', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'pos.brand_qr', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json) SELECT id, 'analytics.growth_metrics', 1, '{"source":"plan_default"}' FROM tenants WHERE plan_id = 'enterprise';

-- Nota: tenants con plan_id fuera de los 4 (legacy) no reciben backfill; el control plane los corrige via PATCH /api/tenant/plan.
-- La marca config_json='{"source":"plan_default"}' permite a SuperAdmin distinguir defaults de overrides platform (config_json distinto) y no borrarlos.
