-- Sprint 21 — Ecosistema Perú: catálogo importable (Arquitectura §5.4 regla 1, SEC-12/COM-02)
-- Mapa de claves externas → internas para idempotencia de import (dry-run → commit).
-- Cada (source, entity_type, external_id) mapea a exactamente un internal_id del tenant.

CREATE TABLE external_entity_map (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source TEXT NOT NULL,          -- 'bsale' | 'alegra' | 'csv'
    entity_type TEXT NOT NULL,     -- 'product' | 'customer' | 'series'
    external_id TEXT NOT NULL,
    internal_id TEXT NOT NULL,
    UNIQUE (tenant_id, source, entity_type, external_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
