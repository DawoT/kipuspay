-- Sprint 26 — fiscal outbox R2 pointer + quarantine reason (§8.1)
ALTER TABLE fiscal_outbox ADD COLUMN r2_xml_key TEXT;
ALTER TABLE fiscal_outbox ADD COLUMN quarantine_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_fiscal_outbox_must_submit
  ON fiscal_outbox(must_submit_by)
  WHERE status IN ('PENDING','FAILED');

INSERT INTO schema_meta(key, value) VALUES ('fiscal_breaker.sprint26', '1');
