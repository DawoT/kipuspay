DROP INDEX IF EXISTS idx_journal_lines_entry;
DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS chart_of_accounts;
DROP TABLE IF EXISTS sale_deposit_items;
DROP TABLE IF EXISTS sale_deposit_payments;
DROP TABLE IF EXISTS sale_deposits;
DELETE FROM schema_meta WHERE key = 'sales.layaway_journal.sprint32';
