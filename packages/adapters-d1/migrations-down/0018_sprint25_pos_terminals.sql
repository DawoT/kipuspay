DROP INDEX IF EXISTS idx_pos_terminals_branch;
DROP TABLE IF EXISTS pos_terminals;
DELETE FROM schema_meta WHERE key = 'pos_terminals.sprint25';
