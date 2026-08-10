INSERT /* CONSENT_DOWN_PROTECTED: require READY KPBK1 backup, compatible registry, and exact tenant epoch */ INTO atomic_guards(id, ok) SELECT 'compliance.lpdp.sprint47.down', CASE WHEN EXISTS (SELECT tenant_id FROM consent_records) AND EXISTS (SELECT affected.tenant_id FROM (SELECT tenant_id FROM consent_records) affected JOIN tenant_data_epochs epoch ON epoch.tenant_id = affected.tenant_id WHERE NOT EXISTS (SELECT 1 FROM data_backups backup WHERE backup.tenant_id = affected.tenant_id AND backup.format_version = 'KPBK1' AND backup.registry_version = 'registry-1' AND backup.snapshot_epoch = epoch.epoch AND backup.status = 'READY' AND backup.global_hash IS NOT NULL AND backup.ready_at IS NOT NULL)) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS backup_epoch_consent_records_delete;
DROP TRIGGER IF EXISTS backup_epoch_consent_records_update;
DROP TRIGGER IF EXISTS backup_epoch_consent_records_insert;
DROP INDEX IF EXISTS idx_consent_records_tenant_customer;
DROP INDEX IF EXISTS idx_consent_records_tenant_purpose;
DROP TABLE consent_records;
DELETE FROM schema_meta WHERE key = 'compliance.lpdp.sprint47';
DELETE FROM atomic_guards WHERE id = 'compliance.lpdp.sprint47.down';
