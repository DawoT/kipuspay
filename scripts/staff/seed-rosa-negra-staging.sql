-- FIS-T0 fixture Rosa Negra (staging). No es tenant_stg_phase0_001 (NV).
-- RUC 20612913251 · ELECTRONIC_ISSUER · TENANT_CERT · series F/B staff.
-- PIN cajero staging 246810 (hash legado salt:sha256). No es la pass del CDT.

INSERT OR IGNORE INTO tenants (
  id, ruc, business_name, trade_name, address, vertical_type, tax_regime,
  formalization_mode, sunat_certificate_status, pse_mode, enabled_document_types,
  plan_id, subscription_status, is_active
) VALUES (
  'tenant_stg_rosa_negra_001',
  '20612913251',
  'ROSA NEGRA DIGITAL SOLUCIONES S.A.C.',
  'Rosa Negra',
  'Lima',
  'retail',
  'RG',
  'ELECTRONIC_ISSUER',
  'PENDING_UPLOAD',
  'TENANT_CERT',
  '["01","03","07","08"]',
  'arranque',
  'trial',
  1
);

INSERT OR IGNORE INTO branches (id, tenant_id, code, name, address, is_active)
VALUES ('branch_stg_rn_001', 'tenant_stg_rosa_negra_001', '0001', 'Local principal', 'Lima', 1);

INSERT OR IGNORE INTO cash_registers (id, tenant_id, branch_id, name, is_active)
VALUES ('register_stg_rn_001', 'tenant_stg_rosa_negra_001', 'branch_stg_rn_001', 'Caja principal', 1);

INSERT OR IGNORE INTO users (
  id, tenant_id, branch_id, email, role, pin_hash, badge_barcode, permissions, is_active
) VALUES (
  'user_stg_rn_owner_001',
  'tenant_stg_rosa_negra_001',
  'branch_stg_rn_001',
  'rosa-negra-owner@staging.kipuspay.invalid',
  'owner',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:71b48d20ff7f6db005b11df7eab97d651b6fde162ec414b2da8cbb0a34072291',
  'EMP-RN-001',
  '[]',
  1
);

INSERT OR IGNORE INTO cash_register_sessions (
  id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status
) VALUES (
  'session_stg_rn_001',
  'tenant_stg_rosa_negra_001',
  'branch_stg_rn_001',
  'register_stg_rn_001',
  'user_stg_rn_owner_001',
  0,
  'OPEN'
);

INSERT OR IGNORE INTO branch_document_series (
  id, tenant_id, branch_id, document_type_code, series, current_number, authorization_status, is_active
) VALUES
  ('series_stg_rn_01', 'tenant_stg_rosa_negra_001', 'branch_stg_rn_001', '01', 'F001', 0, 'AUTHORIZED', 1),
  ('series_stg_rn_03', 'tenant_stg_rosa_negra_001', 'branch_stg_rn_001', '03', 'B001', 0, 'AUTHORIZED', 1),
  ('series_stg_rn_07', 'tenant_stg_rosa_negra_001', 'branch_stg_rn_001', '07', 'FC01', 0, 'AUTHORIZED', 1),
  ('series_stg_rn_08', 'tenant_stg_rosa_negra_001', 'branch_stg_rn_001', '08', 'FD01', 0, 'AUTHORIZED', 1);

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

UPDATE branch_document_series
SET authorization_status = 'AUTHORIZED'
WHERE tenant_id = 'tenant_stg_rosa_negra_001'
  AND series IN ('F001', 'B001', 'FC01', 'FD01');

INSERT OR IGNORE INTO payment_methods (tenant_id, id, code, name, is_active)
VALUES ('tenant_stg_rosa_negra_001', 'pm-cash', 'cash', 'Efectivo', 1);
