-- Libro de reclamaciones virtual (Ley 29571) — tabla de plataforma, no tenant.
CREATE TABLE IF NOT EXISTS platform_reclamaciones (
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
CREATE INDEX idx_platform_reclamaciones_created ON platform_reclamaciones(created_at);

INSERT INTO schema_meta(key, value)
VALUES ('platform.reclamaciones.ley29571', '1');
