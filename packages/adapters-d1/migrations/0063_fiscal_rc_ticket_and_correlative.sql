ALTER TABLE sunat_daily_summaries ADD COLUMN sunat_reception_ticket TEXT;
ALTER TABLE sunat_daily_summaries ADD COLUMN correlative INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX idx_sunat_daily_summaries_correlative ON sunat_daily_summaries(tenant_id, summary_date, correlative);
CREATE INDEX idx_sunat_daily_summaries_processing ON sunat_daily_summaries(tenant_id, status) WHERE status = 'PROCESSING';
INSERT INTO schema_meta(key, value) VALUES ('fiscal.rc_correlative_unique.v1', '1');
