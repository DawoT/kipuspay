INSERT /* TENANT_SOL_DOWN_PROTECTED: no dropear si hay credenciales SOL referenciadas */ INTO atomic_guards(id, ok) SELECT 'fiscal.tenant_sol_credentials.down', CASE WHEN EXISTS (SELECT 1 FROM tenant_sol_credentials) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS backup_epoch_tenant_sol_credentials_delete;
DROP TRIGGER IF EXISTS backup_epoch_tenant_sol_credentials_update;
DROP TRIGGER IF EXISTS backup_epoch_tenant_sol_credentials_insert;
DROP TABLE tenant_sol_credentials;
DELETE FROM schema_meta WHERE key = 'fiscal.tenant_sol_credentials.direct';
DELETE FROM atomic_guards WHERE id = 'fiscal.tenant_sol_credentials.down';
