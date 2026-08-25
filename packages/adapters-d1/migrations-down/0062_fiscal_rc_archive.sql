DELETE FROM schema_meta WHERE key = 'fiscal.rc_archive.h3';
ALTER TABLE fiscal_outbox DROP COLUMN r2_cdr_key;
ALTER TABLE sunat_daily_summaries DROP COLUMN r2_cdr_key;
ALTER TABLE sunat_daily_summaries DROP COLUMN r2_rc_xml_key;
