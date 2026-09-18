-- SQLite no soporta DROP COLUMN de forma portable: recreamos el esquema previo
-- preservando todas las filas y restaurando los triggers de epoch ya existentes.
DROP TRIGGER IF EXISTS backup_epoch_growth_events_insert;
DROP TRIGGER IF EXISTS backup_epoch_growth_events_update;
DROP TRIGGER IF EXISTS backup_epoch_growth_events_delete;
CREATE TABLE growth_events_v1 (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
      'onboarding_started', 'first_sale', 'formalization_upgrade',
      'trial_to_paid', 'plan_upgrade', 'referral_credited', 'tour_started',
      'tour_completed', 'tour_dismissed', 'setup_checklist_step_completed',
      'setup_checklist_completed'
    )),
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    meta_json TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
INSERT INTO growth_events_v1 (id, tenant_id, event_type, occurred_at, meta_json)
SELECT id, tenant_id, event_type, occurred_at, meta_json FROM growth_events;
DROP TABLE growth_events;
ALTER TABLE growth_events_v1 RENAME TO growth_events;
CREATE INDEX idx_growth_events_tenant_type ON growth_events(tenant_id, event_type, occurred_at);
CREATE TRIGGER backup_epoch_growth_events_insert AFTER INSERT ON "growth_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_growth_events_update AFTER UPDATE ON "growth_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_growth_events_delete BEFORE DELETE ON "growth_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
DELETE FROM schema_meta WHERE key = 'onboarding.tour.sprint52.idempotency';
