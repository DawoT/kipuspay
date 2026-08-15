DROP INDEX IF EXISTS idx_platform_reclamaciones_status;
ALTER TABLE platform_reclamaciones DROP COLUMN response_text;
ALTER TABLE platform_reclamaciones DROP COLUMN responded_at;
ALTER TABLE platform_reclamaciones DROP COLUMN status;
DELETE FROM schema_meta WHERE key = 'platform.reclamaciones.status_sla';
