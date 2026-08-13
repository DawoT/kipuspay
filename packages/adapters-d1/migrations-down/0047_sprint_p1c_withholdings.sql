INSERT /* WITHHOLDINGS_DOWN_PROTECTED: RAISE(ABORT via atomic_guards CHECK) */ INTO atomic_guards(id, ok) SELECT 'fiscal.withholdings.p1c.down', CASE WHEN EXISTS (SELECT 1 FROM perceptions WHERE sunat_status <> 'REJECTED') OR EXISTS (SELECT 1 FROM retentions WHERE sunat_status <> 'REJECTED') THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS backup_epoch_retentions_delete;
DROP TRIGGER IF EXISTS backup_epoch_retentions_update;
DROP TRIGGER IF EXISTS backup_epoch_retentions_insert;
DROP TRIGGER IF EXISTS backup_epoch_perceptions_delete;
DROP TRIGGER IF EXISTS backup_epoch_perceptions_update;
DROP TRIGGER IF EXISTS backup_epoch_perceptions_insert;
DROP TABLE retentions;
DROP TABLE perceptions;
DROP TABLE withholding_parameters;
DELETE FROM schema_meta WHERE key = 'fiscal.withholdings.p1c';
DELETE FROM atomic_guards WHERE id = 'fiscal.withholdings.p1c.down';

DROP TRIGGER IF EXISTS backup_epoch_withholding_parameters_insert;
DROP TRIGGER IF EXISTS backup_epoch_withholding_parameters_update;
DROP TRIGGER IF EXISTS backup_epoch_withholding_parameters_delete;
