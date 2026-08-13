INSERT /* TIPS_DRAWER_DOWN_PROTECTED: RAISE(ABORT via atomic_guards CHECK) */ INTO atomic_guards(id, ok) SELECT 'cash.tips_drawer.p2.down', CASE WHEN EXISTS (SELECT 1 FROM sale_payments WHERE tip_cents <> 0) THEN 0 ELSE 1 END;
ALTER TABLE tenant_discount_policies DROP COLUMN open_drawer_on_cash;
ALTER TABLE tenant_discount_policies DROP COLUMN tip_max_percent;
ALTER TABLE sale_payments DROP COLUMN tip_cents;
DELETE FROM schema_meta WHERE key = 'cash.tips_drawer.p2';
DELETE FROM atomic_guards WHERE id = 'cash.tips_drawer.p2.down';
