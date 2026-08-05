/** Scripts down versionados (espejo de migrations-down/*.sql) para tests en workerd. */
/* eslint-disable no-secrets/no-secrets -- SQL DDL, no secretos */

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
