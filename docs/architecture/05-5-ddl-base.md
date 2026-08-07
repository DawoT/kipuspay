---
doc_id: arch-05-5-ddl-base
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.5"
---

### **5.5 DDL base v8.0 — esquema completo D1**

Esquema base sobre el que se apoyan §5.1–§5.4: tenants y sucursales, catálogo, ventas y
pagos, ledger económico, motor fiscal, caja, inventario y auditoría. Las convenciones que
todo `CREATE TABLE` de aquí respeta (dinero en `INTEGER cents`, `tenant_id NOT NULL`,
claves compuestas por tenant) están en §5.0 y §5.0.1; las extensiones por capability
viven en §5.3 y §5.4, no aquí.

```sql
-- DDL para Cloudflare D1 (SQLite) - Arquitectura Enterprise KipusPay v8.0

CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    ruc TEXT,                          -- NULL permitido en INTERNAL_CONTROL pre-RUC
    business_name TEXT NOT NULL,
    trade_name TEXT,
    address TEXT,
    ubigeo TEXT,
    logo_url TEXT,
    vertical_type TEXT NOT NULL,
    tax_regime TEXT NOT NULL DEFAULT 'UNKNOWN',
    -- 'NRUS' | 'RER' | 'RMT' | 'RG' | 'UNKNOWN' (pre-formalización)
    formalization_mode TEXT NOT NULL DEFAULT 'INTERNAL_CONTROL',
    -- 'INTERNAL_CONTROL' | 'FORMALIZING' | 'ELECTRONIC_ISSUER'
    sunat_certificate_status TEXT NOT NULL DEFAULT 'NONE',
    -- 'NONE' | 'PENDING_UPLOAD' | 'ACTIVE' | 'EXPIRED' | 'REVOKED'
    -- En FORMALIZING/ELECTRONIC: PSE KipusPay puede operar con cert de plataforma aunque tenant.cert = NONE
    pse_mode TEXT NOT NULL DEFAULT 'KIPUSPAY_PSE',
    -- 'KIPUSPAY_PSE' (default producto) | 'TENANT_CERT' (emisor con .pfx propio)
    enabled_document_types TEXT NOT NULL DEFAULT '["NV"]',
    -- JSON array: NV, 01, 03, 07, 08, 12 — filtrado por tax_regime × formalization_mode
    -- Planes de producto (GTM §4.1): arranque | crece | cadena | enterprise
    plan_id TEXT NOT NULL DEFAULT 'arranque'
        CHECK (plan_id IN ('arranque', 'crece', 'cadena', 'enterprise')),
    subscription_status TEXT NOT NULL DEFAULT 'trial'
        CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled')),  -- SEC-12
    trial_ends_at DATETIME,
    shard_id TEXT NOT NULL DEFAULT 'D1_SHARD_01',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_tenants_ruc ON tenants(ruc) WHERE ruc IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    ubigeo TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX idx_branches_tenant_code ON branches(tenant_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_branches_tenant_id ON branches(tenant_id, id);

CREATE TABLE cash_registers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    name TEXT NOT NULL,
    paper_width_mm INTEGER NOT NULL DEFAULT 80, -- 58mm (32 chars) o 80mm (48 chars)
    line_width INTEGER NOT NULL DEFAULT 48,      -- Ancho de línea dinámico para ESC/POS
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Series por SUCURSAL (establecimiento), no por caja — alineado a práctica SUNAT.
-- La caja solo selecciona una serie habilitada de su branch.
-- Correlativo offline: reserva vía Durable Object por (tenant, series) o bloque local reconciliado en servidor.
CREATE TABLE branch_document_series (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    document_type_code TEXT NOT NULL,
    -- 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12'
    series TEXT NOT NULL,             -- 'NV01', 'F001', 'B001', 'FC01'
    current_number INTEGER NOT NULL DEFAULT 0,
    authorization_status TEXT NOT NULL DEFAULT 'INTERNAL',
    -- 'INTERNAL' (solo NV) | 'PENDING_SUNAT' | 'AUTHORIZED' | 'REVOKED'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE UNIQUE INDEX idx_branch_series_type
  ON branch_document_series(tenant_id, branch_id, document_type_code, series);

CREATE TABLE cash_register_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    opening_balance_cents INTEGER NOT NULL DEFAULT 0,
    closing_balance_cents INTEGER,
    status TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    -- DAT-04: catálogo cerrado de estados de caja
    CHECK (status IN ('OPEN','CLOSED')),
    FOREIGN KEY (cash_register_id) REFERENCES cash_registers(id)
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    external_auth_id TEXT,
    email TEXT NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'cashier',
    permissions TEXT NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- SEC-12: catálogo cerrado de roles (autorización §3)
    CHECK (role IN ('owner','admin','supervisor','cashier')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX idx_users_tenant_email ON users(tenant_id, email) WHERE deleted_at IS NULL;
-- PERF-05: lookup de sesión por request (external_auth_id)
CREATE UNIQUE INDEX idx_users_external_auth ON users(tenant_id, external_auth_id) WHERE deleted_at IS NULL AND is_active = 1;
CREATE UNIQUE INDEX uq_users_tenant_id ON users(tenant_id, id);

CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    document_type_code TEXT NOT NULL, -- '1' DNI, '6' RUC, '4' CE
    document_number TEXT NOT NULL,
    name TEXT,  -- NULL después de anonimización LPDP; el documento fiscal conserva snapshot legal separado
    email TEXT,
    phone TEXT,
    address TEXT,
    credit_limit_cents INTEGER DEFAULT 0,
    profile_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- LWW: quien trae el timestamp más nuevo gana
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    pii_erased INTEGER NOT NULL DEFAULT 0,       -- SEC-07/LPDP (regla 32): 1 = PII anonimizada (nombre/email/tel = NULL); el doc fiscal SUNAT se retiene
    erased_at DATETIME,                          -- sello de cuándo se anonimizó
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- SEC-07: una fila anonimizada/borrada NO puede ser re-viva por un upsert LWW offline
    CHECK (pii_erased IN (0,1)),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX idx_customers_doc ON customers(tenant_id, document_type_code, document_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_customers_tenant_id ON customers(tenant_id, id);

-- LPDP: la solicitud de anonimización pone PII viva en NULL y marca pii_erased/erased_at.
-- En snapshots fiscales NOT NULL (sales.client_name) usa '[ANONYMIZED]'; conserva solo los
-- campos exigidos por SUNAT, hash/serie/número y la trazabilidad del comprobante.

CREATE TABLE taxes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL, -- '1000' IGV, '7152' ICBPER
    name TEXT NOT NULL,
    rate_percentage REAL NOT NULL,
    is_flat_fee BOOLEAN DEFAULT FALSE,
    flat_fee_amount_cents INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    description TEXT,
    product_type TEXT NOT NULL DEFAULT 'physical', -- 'physical', 'service', 'kit'
    unit_code TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    cost_cents INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'PEN',
    stock REAL NOT NULL DEFAULT 0.0,
    allow_negative_stock BOOLEAN DEFAULT FALSE,
    charges_icbper BOOLEAN NOT NULL DEFAULT FALSE, -- bolsas plásticas: motor suma ICBPER en servidor
    -- FIS-11: charges_icbper es SOLO flag de conveniencia derivado de product_taxes→taxes(code='7152');
    -- el importe por bolsa vive únicamente en taxes.flat_fee_amount_cents (fuente única, nunca duplicado).
    igv_affectation_code_default TEXT NOT NULL DEFAULT '10',
    -- Catálogo 07 default del producto (gravado 10, exonerado 20, inafecto 30, gratuito 31, …)
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX idx_products_tenant_sku ON products(tenant_id, sku) WHERE deleted_at IS NULL;

CREATE TABLE product_taxes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    tax_id TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (tax_id) REFERENCES taxes(id)
);
-- PERF-03: JOIN product_taxes×taxes por producto en el hot path
CREATE INDEX idx_product_taxes_product ON product_taxes(tenant_id, product_id);

CREATE TABLE product_recipes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    parent_product_id TEXT NOT NULL,
    child_product_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_product_id) REFERENCES products(id),
    FOREIGN KEY (child_product_id) REFERENCES products(id)
);

CREATE TABLE price_lists (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_prices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    price_list_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    FOREIGN KEY (price_list_id) REFERENCES price_lists(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
-- PERF-03: lookup de precio por (lista, producto) en el hot path
CREATE INDEX idx_product_prices_list_product ON product_prices(tenant_id, price_list_id, product_id);

CREATE TABLE inventory_batches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    expiration_date DATE,
    stock REAL NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE branch_product_stock (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    stock REAL NOT NULL DEFAULT 0, -- puede ser negativo solo por OFFLINE_OVERSELL y queda auditado
    pmp_unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, branch_id, product_id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX idx_branch_product_stock_product ON branch_product_stock(tenant_id, product_id, branch_id);

CREATE TABLE inventory_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    movement_type TEXT NOT NULL, -- 'VENTA', 'COMPRA', 'AJUSTE', 'DEVOLUCION_NC', 'VENTA_BOM'
    quantity_delta REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    stock_after REAL NOT NULL,
    user_id TEXT NOT NULL,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE payment_methods (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);
CREATE UNIQUE INDEX uq_payment_methods_tenant_id ON payment_methods(tenant_id, id);

CREATE TABLE exchange_rates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source_currency TEXT NOT NULL,
    target_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    effective_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- PERF-06: snapshot de tipo de cambio por (tenant, par, vigencia) — se lee FUERA de la tx (es snapshot)
CREATE INDEX idx_exchange_rates_tenant_ccy ON exchange_rates(tenant_id, source_currency, target_currency, effective_date);

CREATE TABLE sales (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    customer_id TEXT,
    offline_client_sale_id TEXT,
    client_document_type TEXT NOT NULL,
    client_document_number TEXT NOT NULL,
    client_name TEXT NOT NULL,
    document_type TEXT NOT NULL, -- 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12'
    series TEXT NOT NULL,
    number INTEGER NOT NULL,
    referenced_sale_id TEXT,
    credit_note_motive_code TEXT, -- Catálogo 09 (NC) / 10 (ND)
    currency TEXT NOT NULL DEFAULT 'PEN',
    exchange_rate REAL DEFAULT 1.0,
    total_taxable_cents INTEGER DEFAULT 0,
    total_exempt_cents INTEGER DEFAULT 0,
    total_igv_cents INTEGER DEFAULT 0,
    total_icbper_cents INTEGER DEFAULT 0,
    total_discount_cents INTEGER DEFAULT 0,
    total_cogs_cents INTEGER DEFAULT 0,
    total_amount_cents INTEGER NOT NULL,
    issued_at_lima DATETIME NOT NULL,
    must_submit_by DATETIME, -- NULL para NV; factura ~+3d; boleta/~RC ~+7d (fin día Lima)
    daily_summary_id TEXT, -- FK lógica a sunat_daily_summaries (boletas)
    void_status TEXT NOT NULL DEFAULT 'NONE',
    -- 'NONE' | 'VOID_PENDING_RC' | 'VOIDED' (baja informada en Resumen Diario)
    sunat_status TEXT NOT NULL DEFAULT 'PENDING',
    -- CPE: PENDING | PROCESSING | ACCEPTED | REJECTED | QUARANTINED (mensaje venenoso) | DEADLINE_EXCEEDED | DLQ_REQUIRES_INTERVENTION (negocio 4xx)
    -- NV: NOT_APPLICABLE
    -- Deprecated: PENDING_CERTIFICATE (reemplazado por PSE KipusPay — ADR-FISCAL-001)
    sunat_xml_hash TEXT,
    sunat_qr_payload TEXT,
    sunat_response_code TEXT,
    sunat_error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- FIS-07: catálogos cerrados como CHECK (la lógica sola no basta; el motor re-valida en INSERT)
    CHECK (document_type IN ('NV','NV_RETURN','01','03','07','08','12')),
    CHECK (sunat_status IN ('PENDING','PROCESSING','ACCEPTED','REJECTED','QUARANTINED','DEADLINE_EXCEEDED','DLQ_REQUIRES_INTERVENTION','NOT_APPLICABLE')),
    CHECK (void_status IN ('NONE','VOID_PENDING_RC','VOIDED')),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id),
    -- DAT-07: FK compuesta multi-tenant (uq_customers_tenant_id) — NULL para venta anónima (LPDP)
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);
-- SYN-03: folio único por (tenant, branch, tipo, serie) — SUNAT emite series por ESTABLECIMIENTO; nunca por tenant global
CREATE UNIQUE INDEX idx_sales_series_number ON sales(tenant_id, branch_id, document_type, series, number);
CREATE UNIQUE INDEX uq_sales_tenant_id ON sales(tenant_id, id);
CREATE INDEX idx_sales_must_submit ON sales(tenant_id, must_submit_by) WHERE must_submit_by IS NOT NULL AND sunat_status IN ('PENDING','PROCESSING');
-- PERF-02/SYN-01: idempotencia física del sync offline (reemplaza al SELECT pre-tx; ON CONFLICT → ALREADY_SYNCED)
CREATE UNIQUE INDEX idx_sales_offline_id ON sales(tenant_id, offline_client_sale_id) WHERE offline_client_sale_id IS NOT NULL AND deleted_at IS NULL;
-- PERF-13: walk FIFO de la cola fiscal por (estado, deadline) — el índice por tenant no sirve para ordenar el shard
CREATE INDEX idx_sales_fifo ON sales(sunat_status, must_submit_by) WHERE must_submit_by IS NOT NULL;
-- PERF-09: barrido del cron de rollups por día Lima (cubre 01 y NV, no solo 03/07/08)
CREATE INDEX idx_sales_issued_day ON sales(issued_at_lima) WHERE deleted_at IS NULL;
-- DAT-07: consulta de NC/ND previas por origen (residual §8) y agrupación de RC por día Lima
CREATE INDEX idx_sales_referenced ON sales(tenant_id, referenced_sale_id, document_type) WHERE referenced_sale_id IS NOT NULL;

CREATE TABLE sunat_daily_summaries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,  -- DAT-01: NULL — el RC es por EMISOR (FIS-03) y cubre varias sucursales; cada boleta línea conserva su branch
    summary_date DATE NOT NULL, -- día de emisión Lima de las boletas incluidas
    status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | PROCESSING | ACCEPTED | REJECTED | DLQ | DEADLINE_EXCEEDED
    must_submit_by DATETIME NOT NULL,
    rc_type TEXT NOT NULL DEFAULT 'PRIMARY',  -- PRIMARY | COMPLEMENTARY (SYN-11: boleta tardía del mismo summary_date)
    ticket_count INTEGER NOT NULL DEFAULT 0,
    sunat_ticket TEXT,
    cdr_code TEXT,
    cdr_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    -- DAT-04: catálogo cerrado de estados
    CHECK (status IN ('PENDING','PROCESSING','ACCEPTED','REJECTED','DLQ','DEADLINE_EXCEEDED')),
    CHECK (rc_type IN ('PRIMARY','COMPLEMENTARY'))
);
-- Un solo RC PRIMARY por día por EMISOR (SUNAT); branch_id es atributo de las líneas, no clave del RC (FIS-03);
-- una RC COMPLEMENTARY del mismo día solo si la PRIMARY ya fue enviada y la boleta sigue dentro de must_submit_by (SYN-11).
CREATE UNIQUE INDEX idx_daily_summary_day ON sunat_daily_summaries(tenant_id, summary_date, rc_type);

CREATE TABLE sale_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    product_id TEXT,                    -- COM-02: NULL solo para línea genérica is_uncatalogued=1 (regla 34b)
    product_name TEXT NOT NULL,
    product_type TEXT NOT NULL DEFAULT 'physical',
    quantity REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    discount_amount_cents INTEGER DEFAULT 0,
    subtotal_cents INTEGER NOT NULL,
    igv_affectation_code TEXT NOT NULL DEFAULT '10', -- Catálogo 07 SUNAT
    igv_amount_cents INTEGER NOT NULL,
    icbper_amount_cents INTEGER DEFAULT 0,
    total_amount_cents INTEGER NOT NULL,
    batch_id TEXT,
    seller_id TEXT,                     -- COM-07/regla 36: atribución de vendedor (comisiones)
    is_uncatalogued INTEGER NOT NULL DEFAULT 0, -- regla 34b: línea genérica sin catálogo
    -- COM-02: línea genérica NO puede tener product_id; catálogo SÍ debe tenerlo
    CHECK (is_uncatalogued = 0 OR product_id IS NULL),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, seller_id) REFERENCES users(tenant_id, id)
);
-- DAT-07: toda lectura de líneas por venta (rollup §9, recálculo impuestos §6)
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE sale_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    payment_method_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    reference_number TEXT,
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, payment_method_id) REFERENCES payment_methods(tenant_id, id)
);
-- PERF-09: Σ por método de pago en el cron de rollups
CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);
CREATE UNIQUE INDEX uq_sale_payments_tenant_id ON sale_payments(tenant_id, id);

-- ===================================================================
-- LEDGER ECONÓMICO COMPLETO (CxP, CxC, Proveedores, Egresos de Caja)
-- ===================================================================

CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    ruc TEXT,
    business_name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    payment_terms_days INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_suppliers_tenant_id ON suppliers(tenant_id, id);

CREATE TABLE purchase_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, SENT, RECEIVED, CANCELED
    total_amount_cents INTEGER NOT NULL DEFAULT 0,
    currency_code TEXT NOT NULL DEFAULT 'PEN',
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);
CREATE UNIQUE INDEX uq_purchase_orders_tenant_id ON purchase_orders(tenant_id, id);

CREATE TABLE purchase_order_items (
    id TEXT PRIMARY KEY,
    purchase_order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity_ordered REAL NOT NULL,
    quantity_received REAL NOT NULL DEFAULT 0.0,
    unit_cost_cents INTEGER NOT NULL,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);

CREATE TABLE accounts_payable (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    purchase_order_id TEXT,
    original_amount_cents INTEGER NOT NULL,
    balance_due_cents INTEGER NOT NULL,
    due_date DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, PARTIALLY_PAID, PAID, OVERDUE
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);
CREATE INDEX idx_ap_status_due ON accounts_payable(tenant_id, status, due_date);

CREATE TABLE accounts_payable_payments (
    id TEXT PRIMARY KEY,
    accounts_payable_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    cash_register_session_id TEXT,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accounts_payable_id) REFERENCES accounts_payable(id),
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

CREATE TABLE accounts_receivable (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    original_amount_cents INTEGER NOT NULL,
    balance_due_cents INTEGER NOT NULL,
    due_date DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, PARTIALLY_PAID, PAID, OVERDUE
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- DAT-04: catálogo cerrado de estados CxC
    CHECK (status IN ('OPEN','PARTIALLY_PAID','PAID','OVERDUE')),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);
CREATE INDEX idx_ar_status_due ON accounts_receivable(tenant_id, status, due_date);

CREATE TABLE accounts_receivable_payments (
    id TEXT PRIMARY KEY,
    accounts_receivable_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    payment_method TEXT NOT NULL,
    cash_register_session_id TEXT,
    collected_by_user_id TEXT NOT NULL,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accounts_receivable_id) REFERENCES accounts_receivable(id),
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

CREATE TABLE cash_register_expenses (
    id TEXT PRIMARY KEY,
    cash_register_session_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    category TEXT NOT NULL, -- 'SUPPLIES', 'TRANSPORT', 'OTHER'
    accounts_payable_id TEXT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    description TEXT NOT NULL,
    receipt_r2_key TEXT,
    authorized_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id),
    FOREIGN KEY (accounts_payable_id) REFERENCES accounts_payable(id)
);
CREATE INDEX idx_expenses_session ON cash_register_expenses(cash_register_session_id);
```

