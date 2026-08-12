DROP INDEX IF EXISTS idx_payment_captures_sale;
DROP INDEX IF EXISTS idx_payment_captures_tenant_status;
DROP TABLE IF EXISTS payment_captures;
DELETE FROM schema_meta WHERE key = 'payment_captures.sprint22';
