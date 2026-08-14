DROP INDEX IF EXISTS idx_platform_reclamaciones_status;

CREATE TABLE platform_reclamaciones_0054 (
    id TEXT PRIMARY KEY,
    case_number TEXT NOT NULL UNIQUE,
    claimant_name TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('DNI', 'CE', 'RUC', 'PAS')),
    document_number TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    claim_kind TEXT NOT NULL CHECK (claim_kind IN ('reclamo', 'queja')),
    detail TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO platform_reclamaciones_0054 (
    id, case_number, claimant_name, document_type, document_number,
    email, phone, claim_kind, detail, created_at
)
SELECT id, case_number, claimant_name, document_type, document_number,
       email, phone, claim_kind, detail, created_at
  FROM platform_reclamaciones;
DROP TABLE platform_reclamaciones;
ALTER TABLE platform_reclamaciones_0054 RENAME TO platform_reclamaciones;
CREATE INDEX idx_platform_reclamaciones_created ON platform_reclamaciones(created_at);

DELETE FROM schema_meta WHERE key = 'platform.reclamaciones.status_sla';
