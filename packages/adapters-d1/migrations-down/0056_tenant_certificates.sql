INSERT /* TENANT_CERT_DOWN_PROTECTED: no dropear si hay material criptográfico referenciado */ INTO atomic_guards(id, ok) SELECT 'fiscal.tenant_certificates.xades.down', CASE WHEN EXISTS (SELECT 1 FROM tenant_certificates) THEN 0 ELSE 1 END;
DROP TRIGGER IF EXISTS backup_epoch_tenant_certificates_delete;
DROP TRIGGER IF EXISTS backup_epoch_tenant_certificates_update;
DROP TRIGGER IF EXISTS backup_epoch_tenant_certificates_insert;
DROP INDEX IF EXISTS idx_tenant_certificates_expires;
DROP TABLE tenant_certificates;
DELETE FROM schema_meta WHERE key = 'fiscal.tenant_certificates.xades';
DELETE FROM atomic_guards WHERE id = 'fiscal.tenant_certificates.xades.down';
