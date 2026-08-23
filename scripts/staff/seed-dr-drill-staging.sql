-- DR drill stg-s48-dr-sim: venta minima vigente para tenant_stg_phase0_001.
-- Ventana Lima cerrada 2026-08-21 = dia que procesa runDailyRollupsCronHttp
-- cuando se dispara con scheduledTimeMs=now (Lima 22-08). Idempotente.

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
  '2026-08-21T15:30:00.000',
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
