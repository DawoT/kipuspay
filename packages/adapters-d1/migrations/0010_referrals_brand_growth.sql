-- Sprint 12 — referidos + brand QR flag + growth events (GTM §7 / §9)
-- Dinero: sin columnas monetarias; créditos = días sobre trial_ends_at.

ALTER TABLE tenants ADD COLUMN brand_qr_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE referral_codes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX idx_referral_codes_tenant ON referral_codes(tenant_id);
CREATE UNIQUE INDEX idx_referral_codes_code ON referral_codes(code);

CREATE TABLE referral_attributions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    -- referred tenant (DAT-12: tenant_id = sujeto de la fila)
    referrer_tenant_id TEXT NOT NULL,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'captured'
        CHECK (status IN ('captured', 'qualified', 'credited')),
    captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    qualified_at DATETIME,
    credited_at DATETIME,
    credit_days INTEGER NOT NULL DEFAULT 30,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (referrer_tenant_id) REFERENCES tenants(id)
);
CREATE UNIQUE INDEX idx_referral_attr_referred ON referral_attributions(tenant_id);
CREATE INDEX idx_referral_attr_referrer ON referral_attributions(referrer_tenant_id, status);

CREATE TABLE growth_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'onboarding_started',
            'first_sale',
            'formalization_upgrade',
            'trial_to_paid',
            'plan_upgrade',
            'referral_credited'
        )),
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    meta_json TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_growth_events_tenant_type ON growth_events(tenant_id, event_type, occurred_at);
