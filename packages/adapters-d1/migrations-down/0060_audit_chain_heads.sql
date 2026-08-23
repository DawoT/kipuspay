INSERT /* AUDIT_CHAIN_HEADS_DOWN */ INTO atomic_guards(id, ok) SELECT 'audit.chain_heads.m1.down', 1;
DROP TRIGGER IF EXISTS backup_epoch_audit_chain_heads_insert;
DROP TRIGGER IF EXISTS backup_epoch_audit_chain_heads_update;
DROP TRIGGER IF EXISTS backup_epoch_audit_chain_heads_delete;
DELETE FROM schema_meta WHERE key = 'audit.chain_heads.m1';
DROP TABLE IF EXISTS audit_chain_heads;
DELETE FROM atomic_guards WHERE id = 'audit.chain_heads.m1.down';
