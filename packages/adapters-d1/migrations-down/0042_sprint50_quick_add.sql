INSERT /* QUICKADD_DOWN_PROTECTED: require READY KPBK1 backup, compatible registry, and exact tenant epoch */ INTO atomic_guards(id, ok) SELECT 'catalog.quick_add.sprint50.down', CASE WHEN EXISTS (SELECT tenant_id FROM users WHERE badge_barcode IS NOT NULL) AND EXISTS (SELECT affected.tenant_id FROM (SELECT tenant_id FROM users WHERE badge_barcode IS NOT NULL) affected JOIN tenant_data_epochs epoch ON epoch.tenant_id = affected.tenant_id WHERE NOT EXISTS (SELECT 1 FROM data_backups backup WHERE backup.tenant_id = affected.tenant_id AND backup.format_version = 'KPBK1' AND backup.registry_version = 'registry-1' AND backup.snapshot_epoch = epoch.epoch AND backup.status = 'READY' AND backup.global_hash IS NOT NULL AND backup.ready_at IS NOT NULL)) THEN 0 ELSE 1 END;
DROP INDEX IF EXISTS uq_products_barcode_tenant;
DROP INDEX IF EXISTS uq_users_badge_barcode;
ALTER TABLE users DROP COLUMN badge_barcode;
DELETE FROM schema_meta WHERE key = 'catalog.quick_add.sprint50';
DELETE FROM atomic_guards WHERE id = 'catalog.quick_add.sprint50.down';
