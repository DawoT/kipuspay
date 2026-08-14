DROP INDEX IF EXISTS idx_platform_reclamaciones_created;
DROP TABLE IF EXISTS platform_reclamaciones;
DELETE FROM schema_meta WHERE key = 'platform.reclamaciones.ley29571';
