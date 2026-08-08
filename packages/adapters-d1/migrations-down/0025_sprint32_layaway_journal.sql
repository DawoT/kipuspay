-- Sprint 32 down — revierte el up simétricamente.
DROP INDEX IF EXISTS idx_journal_lines_entry;
DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS chart_of_accounts;
DROP TABLE IF EXISTS sale_deposit_items;
DROP TABLE IF EXISTS sale_deposit_payments;
DROP TABLE IF EXISTS sale_deposits;

-- El up 0025 amplió el CHECK de cash_register_cash_movements (rename + CHECK 5→8).
-- Restauramos el contrato original de 0011 (5 types) antes de quitar las tablas del journal.
CREATE TABLE IF NOT EXISTS cash_register_cash_movements_v1 (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    counterparty_ref TEXT,
    reason TEXT,
    created_by_user_id TEXT NOT NULL,
    authorized_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (movement_type IN (
      'DEPOSIT_VALUES','CHANGE_FUND_IN','CHANGE_FUND_OUT','SUPPLIER_PAYMENT','ADJUSTMENT'
    )),
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);
INSERT INTO cash_register_cash_movements_v1
SELECT id, tenant_id, branch_id, cash_register_session_id, movement_type, amount_cents,
       counterparty_ref, reason, created_by_user_id, authorized_by_user_id, created_at
FROM cash_register_cash_movements
WHERE movement_type IN ('DEPOSIT_VALUES','CHANGE_FUND_IN','CHANGE_FUND_OUT','SUPPLIER_PAYMENT','ADJUSTMENT');
DROP TABLE cash_register_cash_movements;
ALTER TABLE cash_register_cash_movements_v1 RENAME TO cash_register_cash_movements;

DELETE FROM schema_meta WHERE key = 'sales.layaway_journal.sprint32';
