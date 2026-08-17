-- Sprint M6 — payment_methods multitenant real (M6A/C).
-- La PK global en `id` impedía que cada tenant tuviera su método canónico
-- 'pm-cash': el segundo bootstrap fallaba con UNIQUE constraint.
-- IMPORTANTE: no se usa RENAME sobre `payment_methods` (reescribe las FKs
-- externas, p.ej. sale_payments.payment_method_id, a un nombre fantasma).
-- Secuencia create → copy → drop → rename con nombre temporal.
DROP TRIGGER IF EXISTS backup_epoch_payment_methods_insert;
DROP TRIGGER IF EXISTS backup_epoch_payment_methods_update;
DROP TRIGGER IF EXISTS backup_epoch_payment_methods_delete;

CREATE TABLE payment_methods_new (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (tenant_id, id)
);

INSERT INTO payment_methods_new (tenant_id, id, code, name, is_active)
SELECT tenant_id, id, code, name, is_active FROM payment_methods;

DROP TABLE payment_methods;

ALTER TABLE payment_methods_new RENAME TO payment_methods;

CREATE UNIQUE INDEX uq_payment_methods_tenant_id ON payment_methods(tenant_id, id);

CREATE TRIGGER backup_epoch_payment_methods_insert AFTER INSERT ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_methods_update AFTER UPDATE ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_payment_methods_delete BEFORE DELETE ON "payment_methods" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('sprint_m6.payment_methods_pk', '1');
