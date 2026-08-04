-- Down 0006_fiscal_alerts_rc
DROP INDEX IF EXISTS idx_fiscal_owner_alerts_sale;
DROP INDEX IF EXISTS idx_fiscal_owner_alerts_tenant;
DROP TABLE IF EXISTS fiscal_owner_alerts;
-- SQLite cannot DROP COLUMN portably in all D1 versions; leave alert_* columns if present.
