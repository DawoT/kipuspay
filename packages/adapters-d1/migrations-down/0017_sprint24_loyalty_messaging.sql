DROP INDEX IF EXISTS idx_messaging_opt_ins_tenant;
DROP TABLE IF EXISTS messaging_opt_ins;
DROP INDEX IF EXISTS idx_loyalty_res_customer;
DROP INDEX IF EXISTS idx_loyalty_res_expiry;
DROP TABLE IF EXISTS loyalty_reservations;
DROP TABLE IF EXISTS loyalty_accounts;
DELETE FROM schema_meta WHERE key = 'loyalty_messaging.sprint24';
