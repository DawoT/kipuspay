-- M1 anti-fork estructural del encadenado de audit_events.
-- audit_chain_heads: cabeza POR TENANT de la cadena de auditoría. El append
-- válido hace CAS (UPDATE ... WHERE last_hash = <prev leído>) en la MISMA
-- db.batch que el INSERT; si otro escritor ganó, el guard atomic_guards ve
-- last_hash != row_hash propio → CHECK ok=1 aborta TODO el batch → sin fork.
-- La tabla es DERIVED (rematerializable 1:1 desde audit_events): no viaja en
-- la carga del backup y el restore la reconstruye
-- (rebuildAuditChainHeadsOnDrShard).
CREATE TABLE IF NOT EXISTS audit_chain_heads (
    tenant_id TEXT PRIMARY KEY,
    last_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill determinista ANTES de los triggers de epoch (no infla épocas):
-- una cabeza por tenant con el row_hash de su última fila. El fork histórico
-- de staging queda como DAG documentado por debajo de la cabeza — la toma es
-- la fila más reciente (created_at DESC, id DESC LIMIT 1 por tenant).
INSERT INTO audit_chain_heads (tenant_id, last_hash, updated_at)
SELECT tenant_id, row_hash, CURRENT_TIMESTAMP
FROM (
    SELECT tenant_id, row_hash,
           ROW_NUMBER() OVER (
               PARTITION BY tenant_id
               ORDER BY created_at DESC, id DESC
           ) AS rn
    FROM audit_events
)
WHERE rn = 1
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TRIGGER backup_epoch_audit_chain_heads_insert AFTER INSERT ON "audit_chain_heads" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_audit_chain_heads_update AFTER UPDATE ON "audit_chain_heads" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_audit_chain_heads_delete BEFORE DELETE ON "audit_chain_heads" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('audit.chain_heads.m1', '1');
