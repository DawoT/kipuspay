DELETE FROM schema_meta WHERE key = 'data.backup.manifest_hash.sprint65';
DROP TRIGGER IF EXISTS backup_manifest_hash_length_insert;
DROP TRIGGER IF EXISTS backup_manifest_hash_length_check;
ALTER TABLE data_backups DROP COLUMN ciphertext_hash_manifest;
