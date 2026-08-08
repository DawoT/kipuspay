DROP INDEX IF EXISTS idx_quote_items_quote;
DROP INDEX IF EXISTS idx_quotes_tenant_status;
DROP TABLE IF EXISTS quote_items;
DROP TABLE IF EXISTS quotes;
DELETE FROM schema_meta WHERE key = 'sales.quotes.sprint33';
