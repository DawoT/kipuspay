-- Enterprise capability backfill (reversible, non-destructive).
-- 0064 predates the canonical fiscal/Grifos capabilities.  Only missing rows
-- are added; platform overrides (including enabled=0) remain untouched.
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'billing.usage_overage', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'cash.policy', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'fiscal.cpe_portal', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'fiscal.debit_note', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'fiscal.gre', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'fiscal.rc', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'fiscal.withholdings', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'fuel.dispatch', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';
INSERT OR IGNORE INTO tenant_capabilities (tenant_id, capability, enabled, config_json)
SELECT id, 'fuel.island_shift', 1, '{"source":"plan_default"}'
FROM tenants WHERE plan_id = 'enterprise';

INSERT INTO schema_meta(key, value)
VALUES ('enterprise.capability.backfill.0067', '1');
