-- P0 L2: manifest ciphertext_hash verification parity with chunk (KMS tamper gap)
-- Adds ciphertext_hash_manifest to data_backups for manifest sealed bytes (AES-GCM ciphertext+tag)
-- Parity: chunk/object already verify ciphertext_hash via readSealed; manifest now same.
ALTER TABLE data_backups ADD COLUMN ciphertext_hash_manifest TEXT;
-- Fail-closed: when READY, hash must be present and length 64 hex if not NULL (legacy NULL allowed for old backups)
-- SQLite CHECK with length constraint
-- Use trigger-like check via partial? Instead add CHECK via recreate not possible with ALTER, so enforce via app and add index check in code.
-- Add check via new table constraint using workaround: create trigger to enforce length
CREATE TRIGGER backup_manifest_hash_length_check BEFORE UPDATE ON data_backups
WHEN NEW.ciphertext_hash_manifest IS NOT NULL AND length(NEW.ciphertext_hash_manifest) != 64
BEGIN SELECT RAISE(ABORT, 'BACKUP_MANIFEST_HASH_INVALID'); END;
CREATE TRIGGER backup_manifest_hash_length_insert BEFORE INSERT ON data_backups
WHEN NEW.ciphertext_hash_manifest IS NOT NULL AND length(NEW.ciphertext_hash_manifest) != 64
BEGIN SELECT RAISE(ABORT, 'BACKUP_MANIFEST_HASH_INVALID'); END;
INSERT INTO schema_meta(key, value) VALUES ('data.backup.manifest_hash.sprint65', '1');
