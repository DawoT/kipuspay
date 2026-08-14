-- Sprint M6 — down: retira los triggers de epoch de growth_events.
DROP TRIGGER IF EXISTS backup_epoch_growth_events_insert;
DROP TRIGGER IF EXISTS backup_epoch_growth_events_update;
DROP TRIGGER IF EXISTS backup_epoch_growth_events_delete;

DELETE FROM schema_meta WHERE key = 'sprint_m6.growth_events_epoch_triggers';
