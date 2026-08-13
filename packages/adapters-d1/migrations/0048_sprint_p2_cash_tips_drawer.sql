-- Backlog v10 P2 — Propinas y cajón de efectivo (Arquitectura §5.3 regla 11,
-- ADR-…). Propina fuera del valor de venta (sin IGV, línea informativa);
-- cajón con ESC p tras efectivo y wallets. Políticas del tenant.
ALTER TABLE sale_payments ADD COLUMN tip_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tenant_discount_policies ADD COLUMN tip_max_percent INTEGER NOT NULL DEFAULT 25;
ALTER TABLE tenant_discount_policies ADD COLUMN open_drawer_on_cash INTEGER NOT NULL DEFAULT 1;

INSERT INTO schema_meta(key, value)
VALUES ('cash.tips_drawer.p2', '1');
