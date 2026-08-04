/** Scripts down versionados (espejo de migrations-down/*.sql) para tests en workerd. */
/* eslint-disable no-secrets/no-secrets -- SQL DDL, no secretos */

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
