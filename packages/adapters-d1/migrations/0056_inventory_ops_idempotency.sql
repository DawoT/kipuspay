-- US-03: canal de idempotencia-key para inventory-ops (reenvío exactamente-una-vez).
-- Cache de respuestas 2xx por (tenant, scope, key): el reenvío con la misma key
-- y el mismo payload devuelve la respuesta ORIGINAL sin re-ejecutar efectos;
-- la misma key con payload distinto es un 409 idempotency_mismatch (convención
-- US-02 de payment_captures.idempotency_key). request_hash = SHA-256 del body
-- canónico (stableStringify); response_body_json es la respuesta exacta del
-- primer uso. Cache derivada: NO es fuente de verdad (fuera de D1_BACKUP_TABLES).
CREATE TABLE IF NOT EXISTS inventory_ops_idempotency (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, scope, idempotency_key)
);
