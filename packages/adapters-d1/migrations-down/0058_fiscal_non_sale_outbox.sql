INSERT /* NON_SALE_OUTBOX_DOWN */ INTO atomic_guards(id, ok) SELECT 'fiscal.non_sale_outbox.fl5.down', 1;
DROP TRIGGER IF EXISTS backup_epoch_fiscal_non_sale_outbox_insert;
DROP TRIGGER IF EXISTS backup_epoch_fiscal_non_sale_outbox_update;
DROP TRIGGER IF EXISTS backup_epoch_fiscal_non_sale_outbox_delete;
DROP INDEX IF EXISTS idx_fiscal_non_sale_outbox_poll;
DROP TABLE IF EXISTS fiscal_non_sale_outbox;
DELETE FROM schema_meta WHERE key = 'fiscal.non_sale_outbox.fl5';
DELETE FROM atomic_guards WHERE id = 'fiscal.non_sale_outbox.fl5.down';
