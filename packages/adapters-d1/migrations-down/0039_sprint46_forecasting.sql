INSERT /* FORECASTING_DOWN_PROTECTED: require READY KPBK1 backup, compatible registry, and exact tenant epoch */ INTO atomic_guards(id, ok) SELECT 'analytics.forecasting.sprint46.down', CASE WHEN EXISTS (SELECT tenant_id FROM forecast_outputs) AND EXISTS (SELECT affected.tenant_id FROM (SELECT tenant_id FROM forecast_outputs) affected JOIN tenant_data_epochs epoch ON epoch.tenant_id = affected.tenant_id WHERE NOT EXISTS (SELECT 1 FROM data_backups backup WHERE backup.tenant_id = affected.tenant_id AND backup.format_version = 'KPBK1' AND backup.registry_version = 'registry-1' AND backup.snapshot_epoch = epoch.epoch AND backup.status = 'READY' AND backup.global_hash IS NOT NULL AND backup.ready_at IS NOT NULL)) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS backup_epoch_forecast_outputs_delete;
DROP TRIGGER IF EXISTS backup_epoch_forecast_outputs_update;
DROP TRIGGER IF EXISTS backup_epoch_forecast_outputs_insert;
DROP INDEX IF EXISTS idx_forecast_outputs_tenant_branch_product;
DROP INDEX IF EXISTS idx_forecast_outputs_tenant_date;
DROP TABLE forecast_outputs;
DELETE FROM schema_meta WHERE key = 'analytics.forecasting.sprint46';
DELETE FROM atomic_guards WHERE id = 'analytics.forecasting.sprint46.down';
