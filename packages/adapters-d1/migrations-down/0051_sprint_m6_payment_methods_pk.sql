-- Sprint M6 — down: restaura la PK global en `id` (legacy pre-M6).
DROP TRIGGER IF EXISTS backup_epoch_payment_methods_insert;
DROP TRIGGER IF EXISTS backup_epoch_payment_methods_update;
DROP TRIGGER IF EXISTS backup_epoch_payment_methods_delete;

CREATE TABLE payment_methods_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

INSERT INTO payment_methods_new (id, tenant_id, code, name, is_active)
SELECT id, tenant_id, code, name, is_active FROM payment_methods;

DROP TABLE payment_methods;

ALTER TABLE payment_methods_new RENAME TO payment_methods;

CREATE UNIQUE INDEX uq_payment_methods_tenant_id ON payment_methods(tenant_id, id);

CREATE TRIGGER backup_epoch_payment_methods_insert AFTER INSERT ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_methods_update AFTER UPDATE ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_methods_delete BEFORE DELETE ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

DELETE FROM schema_meta WHERE key = 'sprint_m6.payment_methods_pk';
