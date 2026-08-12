-- Sprint 51 — ops.shift_handoff + ops.team_invite (Arquitectura §5.3 reglas 35-36).
-- Handoff de turno: la sesión sigue OPEN; cada operador del tramo es una fila
-- cash_register_shifts; el PIN temporal de un solo uso viaja con hash + TTL.
CREATE TABLE cash_register_shifts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    transfer_pin_hash TEXT,
    transfer_pin_expires_at DATETIME,
    interim_count_cents INTEGER,
    cash_diff_cents INTEGER,
    CHECK (transfer_pin_hash IS NULL OR transfer_pin_expires_at IS NOT NULL),
    FOREIGN KEY (tenant_id, cash_register_session_id) REFERENCES cash_register_sessions(tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id)
);
CREATE INDEX idx_shifts_session ON cash_register_shifts(tenant_id, cash_register_session_id, started_at);
CREATE UNIQUE INDEX uq_shifts_open_pin ON cash_register_shifts(cash_register_session_id)
  WHERE ended_at IS NULL AND transfer_pin_hash IS NOT NULL;

-- Equipo (regla 36): PIN de caja del operador (nunca en claro en la DB).
ALTER TABLE users ADD COLUMN pin_hash TEXT;

-- Conteo ligero intermedio opcional (regla 35): política del tenant.
ALTER TABLE tenant_discount_policies ADD COLUMN interim_required INTEGER NOT NULL DEFAULT 0;

-- Backups: la tabla es BUSINESS y cada sprint dueño trae sus triggers de epoch.
CREATE TRIGGER backup_epoch_cash_register_shifts_insert AFTER INSERT ON "cash_register_shifts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_shifts_update AFTER UPDATE ON "cash_register_shifts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW."tenant_id"; END;
CREATE TRIGGER backup_epoch_cash_register_shifts_delete BEFORE DELETE ON "cash_register_shifts" BEGIN UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD."tenant_id"; END;

INSERT INTO schema_meta(key, value)
VALUES ('ops.shift_handoff.sprint51', '1');
