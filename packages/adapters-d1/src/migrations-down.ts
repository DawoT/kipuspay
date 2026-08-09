/** Scripts down versionados (espejo de migrations-down/*.sql) para tests en workerd. */
/* eslint-disable no-secrets/no-secrets -- SQL DDL, no secretos */
import down0037 from '../migrations-down/0037_sprint44_recurring_sales.sql?raw';
import down0038 from '../migrations-down/0038_sprint45_mobile_push.sql?raw';
import down0036 from '../migrations-down/0036_sprint43_customer_orders.sql?raw';
import down0035 from '../migrations-down/0035_sprint42_data_backup.sql?raw';

export const DOWN_0038_SPRINT45_MOBILE_PUSH = down0038;
export const DOWN_0037_SPRINT44_RECURRING_SALES = down0037;
export const DOWN_0036_SPRINT43_CUSTOMER_ORDERS = down0036;
export const DOWN_0035_SPRINT42_DATA_BACKUP = down0035;

export const DOWN_0034_SPRINT41_PRICE_LABELS = `
INSERT /* RAISE(ABORT via atomic_guards CHECK) */ INTO atomic_guards(id, ok) SELECT 'catalog.price_labels.sprint41.down', CASE WHEN EXISTS (SELECT 1 FROM price_label_items) OR EXISTS (SELECT 1 FROM price_label_batches) OR EXISTS (SELECT 1 FROM price_label_templates) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS price_label_items_snapshot_no_update;
DROP TRIGGER IF EXISTS price_label_batches_snapshot_no_update;
DROP INDEX IF EXISTS idx_price_label_items_pending;
DROP INDEX IF EXISTS idx_price_label_batches_status;
DROP TABLE IF EXISTS price_label_items;
DROP TABLE IF EXISTS price_label_batches;
DROP TABLE IF EXISTS price_label_templates;
DELETE FROM schema_meta WHERE key = 'catalog.price_labels.sprint41';
DELETE FROM atomic_guards WHERE id = 'catalog.price_labels.sprint41.down';
`;

export const DOWN_0033_SPRINT40_INVENTORY_SCALE = `
INSERT /* RAISE(ABORT via atomic_guards CHECK) */ INTO atomic_guards(id, ok) SELECT 'inventory.scale.sprint40.down', CASE WHEN EXISTS (SELECT 1 FROM weight_measurements) OR EXISTS (SELECT 1 FROM scale_devices) OR EXISTS (SELECT 1 FROM pos_terminal_sessions) OR EXISTS (SELECT 1 FROM tenant_weight_policies) OR EXISTS (SELECT 1 FROM products WHERE product_type = 'WEIGH') OR EXISTS (SELECT 1 FROM authorization_tokens WHERE action IS NOT NULL OR actor_user_id IS NOT NULL OR terminal_id IS NOT NULL OR sale_id IS NOT NULL OR offline_sale_id IS NOT NULL OR sale_item_id IS NOT NULL OR measurement_id IS NOT NULL) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS sale_items_weigh_quantity_guard_update;
DROP TRIGGER IF EXISTS sale_items_weigh_quantity_guard_insert;
DROP TRIGGER IF EXISTS weight_measurements_no_delete;
DROP TRIGGER IF EXISTS weight_measurements_no_update;
DROP TRIGGER IF EXISTS products_product_type_guard_update;
DROP TRIGGER IF EXISTS products_product_type_guard_insert;
DROP INDEX IF EXISTS idx_weight_measurements_audit;
DROP INDEX IF EXISTS idx_sale_return_items_weight_measurement;
DROP INDEX IF EXISTS idx_weight_measurements_operation;
DROP INDEX IF EXISTS idx_weight_measurements_product;
DROP INDEX IF EXISTS idx_scale_devices_terminal;
DROP INDEX IF EXISTS idx_pos_terminal_sessions_actor;
DROP INDEX IF EXISTS uq_pos_terminal_sessions_active_cash_session;
DROP INDEX IF EXISTS uq_pos_terminal_sessions_active_terminal;
DROP INDEX IF EXISTS idx_authorization_tokens_weight_scope;
DROP TABLE IF EXISTS weight_measurements;
DROP TABLE IF EXISTS scale_devices;
DROP TABLE IF EXISTS pos_terminal_sessions;
DROP TABLE IF EXISTS tenant_weight_policies;
ALTER TABLE sale_return_items DROP COLUMN original_weight_measurement_id;
ALTER TABLE authorization_tokens DROP COLUMN measurement_id;
ALTER TABLE authorization_tokens DROP COLUMN sale_item_id;
ALTER TABLE authorization_tokens DROP COLUMN offline_sale_id;
ALTER TABLE authorization_tokens DROP COLUMN sale_id;
ALTER TABLE authorization_tokens DROP COLUMN terminal_id;
ALTER TABLE authorization_tokens DROP COLUMN actor_user_id;
ALTER TABLE authorization_tokens DROP COLUMN action;
DELETE FROM schema_meta WHERE key = 'inventory.scale.sprint40';
DELETE FROM atomic_guards WHERE id = 'inventory.scale.sprint40.down';
`;

export const DOWN_0032_SPRINT39_INVENTORY_SERIALS = `
INSERT INTO atomic_guards(id, ok) SELECT 'inventory.serials.sprint39.down', CASE WHEN EXISTS (SELECT 1 FROM serial_terminal_leases WHERE status = 'ACTIVE') OR EXISTS (SELECT 1 FROM serial_numbers WHERE status <> 'AVAILABLE' OR current_sale_item_id IS NOT NULL) OR EXISTS (SELECT 1 FROM inventory_location_stock stock JOIN products product ON product.tenant_id = stock.tenant_id AND product.id = stock.product_id AND product.serial_tracking_mode = 'REQUIRED' LEFT JOIN serial_numbers serial ON serial.tenant_id = stock.tenant_id AND serial.branch_id = stock.branch_id AND serial.location_id = stock.location_id AND serial.product_id = stock.product_id GROUP BY stock.tenant_id, stock.branch_id, stock.location_id, stock.product_id, stock.quantity_microunits HAVING stock.quantity_microunits <> COUNT(serial.id) * 1000000) OR EXISTS (SELECT 1 FROM serial_numbers serial LEFT JOIN inventory_location_stock stock ON stock.tenant_id = serial.tenant_id AND stock.branch_id = serial.branch_id AND stock.location_id = serial.location_id AND stock.product_id = serial.product_id WHERE stock.product_id IS NULL) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS serial_number_events_no_delete;
DROP TRIGGER IF EXISTS serial_number_events_no_update;
DROP INDEX IF EXISTS idx_serial_manifest_items_serial;
DROP INDEX IF EXISTS idx_serial_manifest_operation;
DROP INDEX IF EXISTS idx_serial_leases_terminal;
DROP INDEX IF EXISTS idx_serial_events_history;
DROP INDEX IF EXISTS idx_serial_numbers_stock;
DROP INDEX IF EXISTS idx_serial_numbers_lookup;
DROP TABLE IF EXISTS serial_manifest_items;
DROP TABLE IF EXISTS serial_manifests;
DROP TABLE IF EXISTS serial_terminal_leases;
DROP TABLE IF EXISTS serial_number_events;
DROP TABLE IF EXISTS serial_numbers;
DROP INDEX IF EXISTS uq_pos_terminals_tenant_id;
DROP INDEX IF EXISTS uq_purchase_receipt_lines_tenant_id;
DROP INDEX IF EXISTS uq_sale_items_tenant_id;
ALTER TABLE products DROP COLUMN serial_tracking_mode;
DELETE FROM schema_meta WHERE key = 'inventory.serials.sprint39';
DELETE FROM atomic_guards WHERE id = 'inventory.serials.sprint39.down';
`;

export const DOWN_0031_SPRINT38_INVENTORY_LOCATIONS = `
DROP INDEX IF EXISTS idx_inventory_count_lines_location;
DROP INDEX IF EXISTS idx_inventory_location_transfers_branch;
DROP INDEX IF EXISTS idx_inventory_location_batch_fefo;
DROP INDEX IF EXISTS idx_inventory_location_stock_product;
DROP INDEX IF EXISTS idx_inventory_locations_branch;
DROP TABLE IF EXISTS inventory_location_transfers;
DROP TABLE IF EXISTS inventory_location_batch_stock;
DROP TABLE IF EXISTS inventory_location_stock;
DROP TABLE IF EXISTS inventory_locations;
DROP INDEX IF EXISTS uq_inventory_counts_tenant_branch_id;
DROP INDEX IF EXISTS uq_inventory_counts_tenant_id;
DROP INDEX IF EXISTS uq_inventory_batches_tenant_branch_product_id;
DROP INDEX IF EXISTS uq_inventory_batches_tenant_id;
DELETE FROM schema_meta WHERE key = 'inventory.locations.sprint38';
`;

export const DOWN_0030_SPRINT37_COMMISSIONS = `
DROP INDEX IF EXISTS idx_commission_payouts_seller;
DROP INDEX IF EXISTS idx_commission_accruals_seller;
DROP INDEX IF EXISTS idx_commission_accruals_sale;
DROP INDEX IF EXISTS idx_commission_rates_seller;
DROP TABLE IF EXISTS commission_accruals;
DROP TABLE IF EXISTS commission_payouts;
DROP TABLE IF EXISTS commission_rates;
DELETE FROM schema_meta WHERE key = 'sales.commissions.sprint37';
`;

export const DOWN_0029_SPRINT36_INSTALLMENTS = `
DROP INDEX IF EXISTS idx_sale_installment_payments_inst;
DROP INDEX IF EXISTS idx_sale_installments_status;
DROP INDEX IF EXISTS idx_sale_installments_sale;
DROP TABLE IF EXISTS sale_installment_payments;
DROP TABLE IF EXISTS sale_installments;
DELETE FROM schema_meta WHERE key = 'sales.installments.sprint36';
`;

export const DOWN_0028_SPRINT35_STORE_CREDIT = `
DROP INDEX IF EXISTS idx_store_credit_tx_account;
DROP INDEX IF EXISTS idx_store_credit_accounts_tenant;
DROP TABLE IF EXISTS store_credit_transactions;
DROP TABLE IF EXISTS store_credit_accounts;
DELETE FROM schema_meta WHERE key = 'ledger.store_credit.sprint35';
`;

export const DOWN_0027_SPRINT34_SUPPLIER_RETURNS = `
DROP INDEX IF EXISTS idx_supplier_return_items_return;
DROP INDEX IF EXISTS idx_supplier_returns_tenant_status;
DROP TABLE IF EXISTS supplier_return_items;
DROP TABLE IF EXISTS supplier_returns;
DROP INDEX IF EXISTS uq_purchase_receipts_tenant_id;
DELETE FROM schema_meta WHERE key = 'purchasing.returns.sprint34';
`;

export const DOWN_0026_SPRINT33_QUOTES = `
DROP INDEX IF EXISTS idx_quote_items_quote;
DROP INDEX IF EXISTS idx_quotes_tenant_status;
DROP TABLE IF EXISTS quote_items;
DROP TABLE IF EXISTS quotes;
DELETE FROM schema_meta WHERE key = 'sales.quotes.sprint33';
`;

export const DOWN_0025_SPRINT32_LAYAWAY_JOURNAL = `
DROP INDEX IF EXISTS idx_journal_lines_entry;
DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS chart_of_accounts;
DROP TABLE IF EXISTS sale_deposit_items;
DROP TABLE IF EXISTS sale_deposit_payments;
DROP TABLE IF EXISTS sale_deposits;
DELETE FROM schema_meta WHERE key = 'sales.layaway_journal.sprint32';
`;

export const DOWN_0024_SPRINT31_VARIANTS_UOM = `
DROP TRIGGER IF EXISTS products_variant_parent_guard_update;
DROP TRIGGER IF EXISTS products_variant_parent_guard_insert;
DROP INDEX IF EXISTS idx_product_uoms_lookup;
DROP INDEX IF EXISTS uq_product_uoms_base;
DROP TABLE IF EXISTS product_uoms;
DROP INDEX IF EXISTS idx_products_parent;
ALTER TABLE daily_product_rollups DROP COLUMN qty_microunits;
ALTER TABLE supplier_invoice_lines DROP COLUMN invoiced_qty_microunits;
ALTER TABLE supplier_invoices DROP COLUMN matched_qty_microunits;
ALTER TABLE sale_return_items DROP COLUMN qty_microunits;
ALTER TABLE purchase_order_items DROP COLUMN quantity_received_microunits;
ALTER TABLE purchase_order_items DROP COLUMN quantity_ordered_microunits;
ALTER TABLE purchase_receipt_lines DROP COLUMN quantity_microunits;
ALTER TABLE order_items DROP COLUMN quantity_microunits;
ALTER TABLE stock_losses DROP COLUMN quantity_microunits;
ALTER TABLE inventory_count_lines DROP COLUMN difference_qty_microunits;
ALTER TABLE inventory_count_lines DROP COLUMN system_qty_microunits;
ALTER TABLE inventory_count_lines DROP COLUMN counted_qty_microunits;
ALTER TABLE branch_stock_policies DROP COLUMN reorder_qty_microunits;
ALTER TABLE branch_stock_policies DROP COLUMN reorder_point_microunits;
ALTER TABLE branch_stock_policies DROP COLUMN min_stock_microunits;
ALTER TABLE inventory_movements DROP COLUMN stock_after_microunits;
ALTER TABLE inventory_movements DROP COLUMN quantity_delta_microunits;
ALTER TABLE branch_product_stock DROP COLUMN stock_microunits;
ALTER TABLE inventory_batches DROP COLUMN stock_microunits;
ALTER TABLE product_recipes DROP COLUMN quantity_microunits;
ALTER TABLE sale_items DROP COLUMN base_quantity_microunits;
ALTER TABLE sale_items DROP COLUMN factor_denominator;
ALTER TABLE sale_items DROP COLUMN factor_numerator;
ALTER TABLE sale_items DROP COLUMN entered_quantity_microunits;
ALTER TABLE sale_items DROP COLUMN sold_uom_code;
ALTER TABLE sale_items DROP COLUMN sold_uom_id;
ALTER TABLE products DROP COLUMN stock_microunits;
ALTER TABLE products DROP COLUMN is_sellable;
ALTER TABLE products DROP COLUMN variant_price_override_cents;
ALTER TABLE products DROP COLUMN parent_product_id;
DELETE FROM schema_meta WHERE key = 'catalog.variants_uom.sprint31';
`;

export const DOWN_0023_SPRINT30_PROMOTIONS = `
DROP INDEX IF EXISTS idx_product_promotions_promo;
DROP TABLE IF EXISTS product_promotions;
DROP INDEX IF EXISTS idx_promotions_tenant_active;
DROP INDEX IF EXISTS uq_promotions_tenant_id;
DROP TABLE IF EXISTS promotions;
DROP INDEX IF EXISTS uq_price_lists_tenant_id;
DROP INDEX IF EXISTS uq_products_tenant_id;
DELETE FROM schema_meta WHERE key = 'pricing.promotions.sprint30';
`;

export const DOWN_0022_SPRINT29_SUPPLIER_INVOICES = `
DROP INDEX IF EXISTS idx_supplier_invoices_po;
DROP TABLE IF EXISTS supplier_invoice_lines;
DROP TABLE IF EXISTS supplier_invoices;
DROP INDEX IF EXISTS uq_suppliers_tenant_id;
DROP INDEX IF EXISTS uq_purchase_orders_tenant_id;
DROP INDEX IF EXISTS uq_branches_tenant_id;
DELETE FROM schema_meta WHERE key = 'purchasing.three_way.sprint29';
`;

export const DOWN_0021_SPRINT28_SALES_RETURNS = `
DROP TABLE IF EXISTS sale_return_items;
DROP INDEX IF EXISTS idx_sales_returns_sale;
DROP TABLE IF EXISTS sales_returns;
DROP TABLE IF EXISTS return_policies;
DELETE FROM schema_meta WHERE key = 'sales.returns.sprint28';
`;

export const DOWN_0020_SPRINT27_USAGE_BILLING = `
DROP INDEX IF EXISTS idx_billing_overages_tenant_period;
DROP INDEX IF EXISTS idx_usage_events_tenant_period;
DROP TABLE IF EXISTS billing_overages;
DROP TABLE IF EXISTS usage_events;
DROP TABLE IF EXISTS usage_counters;
DELETE FROM schema_meta WHERE key = 'billing.usage_overage.sprint27';
`;

export const DOWN_0019_SPRINT26_FISCAL_OUTBOX_R2 = `
DROP INDEX IF EXISTS idx_fiscal_outbox_must_submit;
DELETE FROM schema_meta WHERE key = 'fiscal_breaker.sprint26';
`;

export const DOWN_0018_SPRINT25_POS_TERMINALS = `
DROP INDEX IF EXISTS idx_pos_terminals_branch;
DROP TABLE IF EXISTS pos_terminals;
DELETE FROM schema_meta WHERE key = 'pos_terminals.sprint25';
`;

export const DOWN_0017_SPRINT24_LOYALTY_MESSAGING = `
DROP INDEX IF EXISTS idx_messaging_opt_ins_tenant;
DROP TABLE IF EXISTS messaging_opt_ins;
DROP INDEX IF EXISTS idx_loyalty_res_customer;
DROP INDEX IF EXISTS idx_loyalty_res_expiry;
DROP TABLE IF EXISTS loyalty_reservations;
DROP TABLE IF EXISTS loyalty_accounts;
DELETE FROM schema_meta WHERE key = 'loyalty_messaging.sprint24';
`;

export const DOWN_0016_SPRINT23_API_WEBHOOKS = `
DROP INDEX IF EXISTS idx_webhook_deliveries_poll;
DROP TABLE IF EXISTS webhook_deliveries;
DROP INDEX IF EXISTS idx_webhook_endpoints_tenant_status;
DROP INDEX IF EXISTS uq_webhook_endpoints_tenant_id;
DROP TABLE IF EXISTS webhook_endpoints;
DROP INDEX IF EXISTS idx_api_keys_tenant_status;
DROP TABLE IF EXISTS api_keys;
DELETE FROM schema_meta WHERE key = 'api_webhooks.sprint23';
`;

export const DOWN_0015_SPRINT22_PAYMENT_CAPTURES = `
DROP INDEX IF EXISTS idx_payment_captures_sale;
DROP INDEX IF EXISTS idx_payment_captures_tenant_status;
DROP TABLE IF EXISTS payment_captures;
DELETE FROM schema_meta WHERE key = 'payment_captures.sprint22';
`;

export const DOWN_0014_SPRINT20_PO_PARTIAL = `
DELETE FROM schema_meta WHERE key = 'purchase_orders.status.partially_received';
`;

export const DOWN_0013_CATALOG_IMPORT = `
DROP TABLE IF EXISTS external_entity_map;
`;

export const DOWN_0011_FASE6_COMMERCIAL_OPS = `
DROP TABLE IF EXISTS purchase_receipt_lines;
DROP TABLE IF EXISTS purchase_receipts;
DROP TABLE IF EXISTS stock_transfer_lines;
DROP TABLE IF EXISTS stock_transfers;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS stock_losses;
DROP TABLE IF EXISTS inventory_count_lines;
DROP TABLE IF EXISTS inventory_counts;
DROP TABLE IF EXISTS branch_stock_policies;
DROP TABLE IF EXISTS sale_reprints;
DROP TABLE IF EXISTS cash_register_cash_movements;
DROP TABLE IF EXISTS tenant_discount_policies;
DROP TABLE IF EXISTS cash_count_lines;
DROP TABLE IF EXISTS authorization_tokens;
DROP TABLE IF EXISTS tenant_capabilities;
`;

export const DOWN_0010_REFERRALS_BRAND_GROWTH = `
DROP INDEX IF EXISTS idx_growth_events_tenant_type;
DROP TABLE IF EXISTS growth_events;
DROP INDEX IF EXISTS idx_referral_attr_referrer;
DROP INDEX IF EXISTS idx_referral_attr_referred;
DROP TABLE IF EXISTS referral_attributions;
DROP INDEX IF EXISTS idx_referral_codes_code;
DROP INDEX IF EXISTS idx_referral_codes_tenant;
DROP TABLE IF EXISTS referral_codes;
`;

export const DOWN_0009_DAILY_PRODUCT_ROLLUPS = `
DROP INDEX IF EXISTS idx_daily_product_rollups_tenant_date;
DROP TABLE IF EXISTS daily_product_rollups;
`;

export const DOWN_0008_PUSH_SUBSCRIPTIONS = `
DROP INDEX IF EXISTS idx_push_subscriptions_tenant_user;
DROP INDEX IF EXISTS uq_push_subscriptions_endpoint;
DROP TABLE IF EXISTS push_subscriptions;
`;

export const DOWN_0007_DAILY_ROLLUPS = `
DROP INDEX IF EXISTS idx_daily_financial_rollups_tenant_date;
DROP TABLE IF EXISTS daily_financial_rollups;
`;

export const DOWN_0006_FISCAL_ALERTS = `
DROP INDEX IF EXISTS idx_fiscal_owner_alerts_sale;
DROP INDEX IF EXISTS idx_fiscal_owner_alerts_tenant;
DROP TABLE IF EXISTS fiscal_owner_alerts;
`;

export const DOWN_0005_FISCAL_OUTBOX = `
DROP INDEX IF EXISTS idx_fiscal_outbox_poll;
DROP TABLE IF EXISTS fiscal_outbox;
`;

export const DOWN_0004_AUDIT_EVENTS = `
DROP TRIGGER IF EXISTS audit_events_no_delete;
DROP TRIGGER IF EXISTS audit_events_no_update;
DROP INDEX IF EXISTS idx_audit_tenant_time;
DROP TABLE IF EXISTS audit_events;
`;

export const DOWN_0003_ATOMIC_GUARDS = `DROP TABLE IF EXISTS atomic_guards;`;

export const DOWN_0002_WEBHOOK_EVENTS = `DROP TABLE IF EXISTS webhook_events;`;

export const DOWN_0001_DDL_BASE = `
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS cash_register_expenses;
DROP TABLE IF EXISTS accounts_receivable_payments;
DROP TABLE IF EXISTS accounts_receivable;
DROP TABLE IF EXISTS accounts_payable_payments;
DROP TABLE IF EXISTS accounts_payable;
DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS sale_payments;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sunat_daily_summaries;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS branch_product_stock;
DROP TABLE IF EXISTS inventory_batches;
DROP TABLE IF EXISTS product_prices;
DROP TABLE IF EXISTS price_lists;
DROP TABLE IF EXISTS product_recipes;
DROP TABLE IF EXISTS product_taxes;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS taxes;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS cash_register_sessions;
DROP TABLE IF EXISTS branch_document_series;
DROP TABLE IF EXISTS cash_registers;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS tenants;
PRAGMA foreign_keys = ON;
`;

export const DOWN_0000_SCHEMA_META = `DROP TABLE IF EXISTS schema_meta;`;
