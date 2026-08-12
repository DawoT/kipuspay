-- Sprint 52 — onboarding.tour (Arquitectura §5.3 regla 37a, GTM §6.2).
-- La métrica del Product Tour y del Setup Checklist "segundo día" se
-- instrumenta en growth_events; SQLite no permite ALTER de CHECK, así que se
-- recrea la tabla con el catálogo extendido (append-only sobre los 6 eventos
-- históricos; DAT-04: catálogo cerrado en DB). EPHEMERAL: sin triggers epoch.
CREATE TABLE growth_events_v2 (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'onboarding_started',
            'first_sale',
            'formalization_upgrade',
            'trial_to_paid',
            'plan_upgrade',
            'referral_credited',
            'tour_started',
            'tour_completed',
            'tour_dismissed',
            'setup_checklist_step_completed',
            'setup_checklist_completed'
        )),
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    meta_json TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
INSERT INTO growth_events_v2 (id, tenant_id, event_type, occurred_at, meta_json)
SELECT id, tenant_id, event_type, occurred_at, meta_json FROM growth_events;
DROP TABLE growth_events;
ALTER TABLE growth_events_v2 RENAME TO growth_events;
CREATE INDEX idx_growth_events_tenant_type ON growth_events(tenant_id, event_type, occurred_at);

INSERT INTO schema_meta(key, value)
VALUES ('onboarding.tour.sprint52', '1');
