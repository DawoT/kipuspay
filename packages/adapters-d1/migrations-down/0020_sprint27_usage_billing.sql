DROP INDEX IF EXISTS idx_billing_overages_tenant_period;
DROP INDEX IF EXISTS idx_usage_events_tenant_period;
DROP TABLE IF EXISTS billing_overages;
DROP TABLE IF EXISTS usage_events;
DROP TABLE IF EXISTS usage_counters;
DELETE FROM schema_meta WHERE key = 'billing.usage_overage.sprint27';
