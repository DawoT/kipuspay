-- DR drill stg-s48-dr-sim: venta minima vigente para tenant_stg_phase0_001.
-- La fecha se calcula como ayer en Lima en cada aplicacion, para que el
-- snapshot nuevo siempre pueda reconstruir el rollup dentro de RPO<=1 dia.
-- Solo se usa en staging; la venta es sintetica y el UPDATE es acotado a su id.

UPDATE sales
SET issued_at_lima = strftime('%Y-%m-%dT15:30:00.000', 'now', '-5 hours', '-1 day')
WHERE id = 'dr-drill-sale-001'
  AND tenant_id = 'tenant_stg_phase0_001';

UPDATE sales
SET issued_at_lima = strftime('%Y-%m-%dT15:30:00.000', 'now', '-5 hours', '-1 day')
WHERE id = 'dr-drill-sale-current-001'
  AND tenant_id = 'tenant_stg_phase0_001';

INSERT OR IGNORE INTO cash_register_sessions (
  id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status
) VALUES (
  'dr-drill-session-001',
  'tenant_stg_phase0_001',
  'branch_stg_phase0_001',
  'register_stg_phase0_001',
  'user_stg_owner_001',
  0,
  'OPEN'
);

INSERT OR IGNORE INTO payment_methods (id, tenant_id, code, name, is_active)
VALUES ('pm-cash', 'tenant_stg_phase0_001', 'cash', 'Efectivo', 1);

INSERT OR IGNORE INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, currency,
  total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status
) VALUES (
  'dr-drill-sale-001',
  'tenant_stg_phase0_001',
  'branch_stg_phase0_001',
  'dr-drill-session-001',
  'user_stg_owner_001',
  NULL,
  '1',
  '00000000',
  'CONSUMIDOR FINAL',
  'NV',
  'NV01',
  1,
  'PEN',
  100,
  18,
  0,
  118,
  strftime('%Y-%m-%dT15:30:00.000', 'now', '-5 hours', '-1 day'),
  NULL,
  'NONE',
  'NOT_APPLICABLE'
);

INSERT OR IGNORE INTO sale_items (
  id, tenant_id, sale_id, product_id, product_name,
  quantity, base_quantity_microunits, unit_price_cents, unit_cost_cents,
  subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
  total_amount_cents, is_uncatalogued
) VALUES (
  'dr-drill-sale-item-001',
  'tenant_stg_phase0_001',
  'dr-drill-sale-001',
  NULL,
  'ITEM DR DRILL',
  1,
  1000000,
  118,
  0,
  100,
  '10',
  18,
  0,
  118,
  1
);

INSERT OR IGNORE INTO sale_payments (
  id, tenant_id, sale_id, payment_method_id, amount_cents
) VALUES (
  'dr-drill-payment-001',
  'tenant_stg_phase0_001',
  'dr-drill-sale-001',
  'pm-cash',
  118
);

-- Venta sintetica con PK diaria nueva: permite distinguir una captura fresca
-- y evita colisionar con el restore idempotente de un drill anterior.
INSERT OR IGNORE INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, currency,
  total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status
) VALUES (
  'dr-drill-sale-' || strftime('%Y%m%d', 'now', '-5 hours', '-1 day'),
  'tenant_stg_phase0_001',
  'branch_stg_phase0_001',
  'dr-drill-session-001',
  'user_stg_owner_001',
  NULL,
  '1',
  '00000000',
  'CONSUMIDOR FINAL',
  'NV',
  'NV01',
  CAST(strftime('%Y%m%d', 'now', '-5 hours', '-1 day') AS INTEGER),
  'PEN',
  100,
  18,
  0,
  118,
  strftime('%Y-%m-%dT15:30:00.000', 'now', '-5 hours', '-1 day'),
  NULL,
  'NONE',
  'NOT_APPLICABLE'
);

INSERT OR IGNORE INTO sale_items (
  id, tenant_id, sale_id, product_id, product_name,
  quantity, base_quantity_microunits, unit_price_cents, unit_cost_cents,
  subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
  total_amount_cents, is_uncatalogued
) VALUES (
  'dr-drill-sale-item-' || strftime('%Y%m%d', 'now', '-5 hours', '-1 day'),
  'tenant_stg_phase0_001',
  'dr-drill-sale-' || strftime('%Y%m%d', 'now', '-5 hours', '-1 day'),
  NULL,
  'ITEM DR DRILL ACTUAL',
  1,
  1000000,
  118,
  0,
  100,
  '10',
  18,
  0,
  118,
  1
);

INSERT OR IGNORE INTO sale_payments (
  id, tenant_id, sale_id, payment_method_id, amount_cents
) VALUES (
  'dr-drill-payment-' || strftime('%Y%m%d', 'now', '-5 hours', '-1 day'),
  'tenant_stg_phase0_001',
  'dr-drill-sale-' || strftime('%Y%m%d', 'now', '-5 hours', '-1 day'),
  'pm-cash',
  118
);
