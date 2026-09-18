-- DOWN 0066 — Grifos fuel catalog and dispatches.
DROP TRIGGER IF EXISTS backup_epoch_fuel_dispatches_delete;
DROP TRIGGER IF EXISTS backup_epoch_fuel_dispatches_update;
DROP TRIGGER IF EXISTS backup_epoch_fuel_dispatches_insert;
DROP TRIGGER IF EXISTS backup_epoch_fuel_catalog_delete;
DROP TRIGGER IF EXISTS backup_epoch_fuel_catalog_update;
DROP TRIGGER IF EXISTS backup_epoch_fuel_catalog_insert;
DROP TRIGGER IF EXISTS fuel_catalog_stock_nonnegative;
DROP INDEX IF EXISTS idx_fuel_dispatches_tenant_created;
DROP TABLE IF EXISTS fuel_dispatches;
DROP TABLE IF EXISTS fuel_catalog;
DELETE FROM schema_meta WHERE key = 'fuel.dispatch.sprint6h';
