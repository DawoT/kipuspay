-- Sprint 52 hardening — growth event replay safety and bounded metadata.
-- The nullable key preserves historical events; new onboarding clients send it
-- on every event so a retry is a no-op under D1's unique constraint.
ALTER TABLE growth_events ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX uq_growth_events_tenant_idem
  ON growth_events(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT INTO schema_meta(key, value)
VALUES ('onboarding.tour.sprint52.idempotency', '1');
