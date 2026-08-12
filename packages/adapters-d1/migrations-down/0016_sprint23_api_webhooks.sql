DROP INDEX IF EXISTS idx_webhook_deliveries_poll;
DROP TABLE IF EXISTS webhook_deliveries;
DROP INDEX IF EXISTS idx_webhook_endpoints_tenant_status;
DROP INDEX IF EXISTS uq_webhook_endpoints_tenant_id;
DROP TABLE IF EXISTS webhook_endpoints;
DROP INDEX IF EXISTS idx_api_keys_tenant_status;
DROP TABLE IF EXISTS api_keys;
DELETE FROM schema_meta WHERE key = 'api_webhooks.sprint23';
