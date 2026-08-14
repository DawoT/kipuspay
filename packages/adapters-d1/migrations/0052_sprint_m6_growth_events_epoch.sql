-- Sprint M6 — growth_events sin triggers de epoch (fe de errata 0044).
-- La 0044 recreó growth_events (sprint 52, POST-0035) sin los triggers
-- backup_epoch_*: los cambios SOLO de growth_events no incrementaban
-- tenant_data_epochs y el backup incremental los omitía (data-backup.ts
-- salta la captura si epochStart === epochEnd). Restaura el contrato de
-- 0035: toda tabla del registry D1_BACKUP_TABLES tiene sus 3 triggers.
CREATE TRIGGER backup_epoch_growth_events_insert AFTER INSERT ON "growth_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_growth_events_update AFTER UPDATE ON "growth_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_growth_events_delete BEFORE DELETE ON "growth_events" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('sprint_m6.growth_events_epoch_triggers', '1');
