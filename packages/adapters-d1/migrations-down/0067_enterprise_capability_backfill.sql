-- DOWN 0067 — remove only rows created by the enterprise plan backfill.
DELETE FROM tenant_capabilities
WHERE tenant_id IN (SELECT id FROM tenants WHERE plan_id = 'enterprise')
  AND config_json = '{"source":"plan_default"}'
  AND capability IN (
    'billing.usage_overage', 'cash.policy', 'fiscal.cpe_portal',
    'fiscal.debit_note', 'fiscal.gre', 'fiscal.rc', 'fiscal.withholdings',
    'fuel.dispatch', 'fuel.island_shift'
  );
DELETE FROM schema_meta WHERE key = 'enterprise.capability.backfill.0067';
