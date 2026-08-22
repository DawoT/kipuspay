-- US-03: canal de idempotencia-key para inventory-ops (reenvío exactamente-una-vez).
-- Cache de respuestas 2xx por (tenant, scope, key): el reenvío con la misma key
-- y el mismo payload devuelve la respuesta ORIGINAL sin re-ejecutar efectos;
-- la misma key con payload distinto es un 409 idempotency_mismatch (convención
-- US-02 de payment_captures.idempotency_key). request_hash = SHA-256 del body
-- canónico (stableStringify); response_body_json es la respuesta exacta del
-- primer uso. Clasificación EPHEMERAL en D1_BACKUP_TABLES (estado operativo;
-- no es fuente de verdad de negocio) + triggers de epoch (V-29).
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

CREATE TRIGGER backup_epoch_inventory_ops_idempotency_insert AFTER INSERT ON "inventory_ops_idempotency" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_ops_idempotency_update AFTER UPDATE ON "inventory_ops_idempotency" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_inventory_ops_idempotency_delete BEFORE DELETE ON "inventory_ops_idempotency" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;
