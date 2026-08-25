-- H3 (auditoría 0031): conservación SUNAT del sobre RC firmado y del CDR.
-- La obligación de conservar CPEs, CDRs y resúmenes recae en el EMISOR
-- (Código de Comercio art. 190 / Reglamento de Comprobantes de Pago SUNAT).
-- El XML unitario ya se persiste en R2 (fiscal_outbox.r2_xml_key, mig 0019);
-- este migration extiende el mismo patrón al Resumen Diario:
--   sunat_daily_summaries.r2_rc_xml_key → sobre RC firmado (rc/<tenant>/<id>.xml)
--   sunat_daily_summaries.r2_cdr_key    → CDR recibido (rc/<tenant>/<id>-cdr.zip)
--                                         o receipt JSON (rc/<tenant>/<id>-cdr.json)
--   fiscal_outbox.r2_cdr_key            → receipt JSON del CDR unitario
--                                         (fiscal-cdr/<tenant>/<saleId>.json)
-- Referencia honesta: clave NOT NULL en D1 ⇒ objeto presente en R2. La
-- escritura es post-commit best-effort; un fallo R2 deja la clave NULL.
ALTER TABLE sunat_daily_summaries ADD COLUMN r2_rc_xml_key TEXT;
ALTER TABLE sunat_daily_summaries ADD COLUMN r2_cdr_key TEXT;
ALTER TABLE fiscal_outbox ADD COLUMN r2_cdr_key TEXT;

INSERT INTO schema_meta(key, value)
VALUES ('fiscal.rc_archive.h3', '1');
