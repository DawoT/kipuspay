-- Libro de reclamaciones: estado de bandeja y respuesta (Ley 29571 SLA 30 días).
ALTER TABLE platform_reclamaciones ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE platform_reclamaciones ADD COLUMN responded_at TEXT;
ALTER TABLE platform_reclamaciones ADD COLUMN response_text TEXT;
CREATE INDEX IF NOT EXISTS idx_platform_reclamaciones_status ON platform_reclamaciones(status);

INSERT INTO schema_meta(key, value)
VALUES ('platform.reclamaciones.status_sla', '1');
