-- Sprint 0 smoke: metadata de migraciones aplicadas (no es dominio de negocio).
CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
