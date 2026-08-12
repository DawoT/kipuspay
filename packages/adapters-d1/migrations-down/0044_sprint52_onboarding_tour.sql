INSERT /* ONBOARDING_DOWN_PROTECTED: RAISE(ABORT via atomic_guards CHECK) */ INTO atomic_guards(id, ok) SELECT 'onboarding.tour.sprint52.down', CASE WHEN EXISTS (SELECT 1 FROM growth_events WHERE event_type IN ('tour_started','tour_completed','tour_dismissed','setup_checklist_step_completed','setup_checklist_completed')) THEN 0 ELSE 1 END;
CREATE TABLE growth_events_v1 (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, event_type TEXT NOT NULL CHECK (event_type IN ('onboarding_started','first_sale','formalization_upgrade','trial_to_paid','plan_upgrade','referral_credited')), occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, meta_json TEXT, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO growth_events_v1 (id, tenant_id, event_type, occurred_at, meta_json) SELECT id, tenant_id, event_type, occurred_at, meta_json FROM growth_events;
DROP TABLE growth_events;
ALTER TABLE growth_events_v1 RENAME TO growth_events;
CREATE INDEX idx_growth_events_tenant_type ON growth_events(tenant_id, event_type, occurred_at);
DELETE FROM schema_meta WHERE key = 'onboarding.tour.sprint52';
DELETE FROM atomic_guards WHERE id = 'onboarding.tour.sprint52.down';
