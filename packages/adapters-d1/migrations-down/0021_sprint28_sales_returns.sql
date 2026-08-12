DROP TABLE IF EXISTS sale_return_items;
DROP INDEX IF EXISTS idx_sales_returns_sale;
DROP TABLE IF EXISTS sales_returns;
DROP TABLE IF EXISTS return_policies;
DELETE FROM schema_meta WHERE key = 'sales.returns.sprint28';
