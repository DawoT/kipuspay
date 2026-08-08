DROP INDEX IF EXISTS idx_store_credit_tx_account;
DROP INDEX IF EXISTS idx_store_credit_accounts_tenant;
DROP TABLE IF EXISTS store_credit_transactions;
DROP TABLE IF EXISTS store_credit_accounts;
DELETE FROM schema_meta WHERE key = 'ledger.store_credit.sprint35';
