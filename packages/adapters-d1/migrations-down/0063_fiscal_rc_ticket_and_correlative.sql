DELETE FROM schema_meta WHERE key = 'fiscal.rc_correlative_unique.v1';
DROP INDEX IF EXISTS idx_sunat_daily_summaries_processing;
DROP INDEX IF EXISTS idx_sunat_daily_summaries_correlative;
ALTER TABLE sunat_daily_summaries DROP COLUMN correlative;
ALTER TABLE sunat_daily_summaries DROP COLUMN sunat_reception_ticket;
