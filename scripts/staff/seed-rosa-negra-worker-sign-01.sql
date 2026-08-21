-- S1 Worker-firma: factura 01 F001-9 con r2_xml_key NULL (produceMissing).
-- No reenviar F001-8. Sin PEM, SOL ni FEATURE_*=1.

INSERT OR IGNORE INTO customers (
  id, tenant_id, document_type_code, document_number, name, is_active
) VALUES (
  'cust_stg_rn_receptor_001',
  'tenant_stg_rosa_negra_001',
  '6',
  '10715001701',
  'RECEPTOR PRUEBA SUNAT BETA',
  1
);

INSERT OR IGNORE INTO sales (
  id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
  client_document_type, client_document_number, client_name,
  document_type, series, number, currency,
  total_taxable_cents, total_igv_cents, total_icbper_cents, total_amount_cents,
  issued_at_lima, must_submit_by, void_status, sunat_status
) VALUES (
  'sale_stg_rn_worker_01_009',
  'tenant_stg_rosa_negra_001',
  'branch_stg_rn_001',
  'session_stg_rn_001',
  'user_stg_rn_owner_001',
  'cust_stg_rn_receptor_001',
  '6',
  '10715001701',
  'RECEPTOR PRUEBA SUNAT BETA',
  '01',
  'F001',
  9,
  'PEN',
  100,
  18,
  0,
  118,
  '2026-08-21T16:00:00.000',
  '2026-08-25T04:59:59.999Z',
  'NONE',
  'PENDING'
);

INSERT OR IGNORE INTO sale_items (
  id, tenant_id, sale_id, product_name, quantity, unit_price_cents,
  subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
  total_amount_cents, is_uncatalogued
) VALUES (
  'item_stg_rn_worker_01_009',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_worker_01_009',
  'Worker XAdES e-beta',
  1,
  118,
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
  'pay_stg_rn_worker_01_009',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_worker_01_009',
  'pm-cash',
  118
);

INSERT OR IGNORE INTO fiscal_outbox (
  id, tenant_id, sale_id, status, attempt_count, must_submit_by, r2_xml_key
) VALUES (
  'outbox_stg_rn_worker_01_009',
  'tenant_stg_rosa_negra_001',
  'sale_stg_rn_worker_01_009',
  'PENDING',
  0,
  '2026-08-25T04:59:59.999Z',
  NULL
);

UPDATE fiscal_outbox
SET r2_xml_key = NULL, status = 'PENDING', last_error = NULL, attempt_count = 0
WHERE id = 'outbox_stg_rn_worker_01_009' AND tenant_id = 'tenant_stg_rosa_negra_001';

UPDATE branch_document_series
SET current_number = CASE WHEN current_number < 9 THEN 9 ELSE current_number END,
    authorization_status = 'AUTHORIZED'
WHERE id = 'series_stg_rn_01' AND tenant_id = 'tenant_stg_rosa_negra_001';

INSERT OR IGNORE INTO sunat_daily_summaries (
  id, tenant_id, summary_date, status, must_submit_by, rc_type, ticket_count, sunat_ticket, cdr_code, cdr_message
) VALUES (
  'rc_stg_rn_beta_20260821_primary',
  'tenant_stg_rosa_negra_001',
  '2026-08-21',
  'ACCEPTED',
  '2026-08-28T04:59:59.999Z',
  'PRIMARY',
  1,
  'RC-20260821-002',
  '0',
  'El Resumen diario RC-20260821-002, ha sido aceptado'
);

UPDATE sunat_daily_summaries
SET sunat_ticket = 'RC-20260821-002',
    status = 'ACCEPTED'
WHERE tenant_id = 'tenant_stg_rosa_negra_001'
  AND summary_date = '2026-08-21'
  AND rc_type = 'PRIMARY'
  AND (sunat_ticket IS NULL OR sunat_ticket NOT LIKE 'RC-20260821-%');
