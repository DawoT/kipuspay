-- Sprint 44 — sales.recurring (Arquitectura §5.11 / COM-10 / DAT-12).
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_receivable_tenant_id
    ON accounts_receivable(tenant_id, id);

ALTER TABLE authorization_tokens
    ADD COLUMN recurring_idempotency_key_hash TEXT;
ALTER TABLE authorization_tokens
    ADD COLUMN recurring_run_result_json TEXT;
CREATE INDEX idx_authorization_tokens_recurring_manual
    ON authorization_tokens(
      tenant_id, recurring_idempotency_key_hash, token_hash, expires_at
    );

CREATE TABLE recurring_plans (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    plan_key TEXT NOT NULL,
    plan_version INTEGER NOT NULL CHECK (plan_version >= 1),
    supersedes_plan_id TEXT,
    customer_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('NV','03','01')),
    pricing_policy TEXT NOT NULL DEFAULT 'FIXED'
      CHECK (pricing_policy IN ('FIXED','CURRENT')),
    frequency TEXT NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY')),
    timezone TEXT NOT NULL DEFAULT 'America/Lima'
      CHECK (timezone = 'America/Lima'),
    anchor_day INTEGER NOT NULL CHECK (anchor_day BETWEEN 1 AND 31),
    anchor_is_last_day INTEGER NOT NULL DEFAULT 0
      CHECK (anchor_is_last_day IN (0,1)),
    anchor_time TEXT NOT NULL
      CHECK (anchor_time GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE','PAUSED','GRACE','CANCEL_AT_PERIOD_END','CANCELLED')),
    after_grace_policy TEXT NOT NULL DEFAULT 'CONTINUE'
      CHECK (after_grace_policy IN ('CONTINUE','PAUSE_FUTURE_EXECUTION')),
    grace_days INTEGER NOT NULL DEFAULT 3 CHECK (grace_days >= 0),
    catch_up_limit INTEGER NOT NULL DEFAULT 3
      CHECK (catch_up_limit BETWEEN 1 AND 31),
    next_run_at DATETIME NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    next_retry_at DATETIME,
    last_error_code TEXT,
    lease_owner_hash TEXT,
    lease_expires_at DATETIME,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    effective_from DATETIME NOT NULL,
    effective_until DATETIME,
    cancelled_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, plan_key, plan_version),
    FOREIGN KEY (tenant_id, supersedes_plan_id)
      REFERENCES recurring_plans(tenant_id, id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id),
    CHECK (effective_until IS NULL OR effective_until > effective_from),
    CHECK (
      (lease_owner_hash IS NULL AND lease_expires_at IS NULL) OR
      (lease_owner_hash IS NOT NULL AND lease_expires_at IS NOT NULL)
    )
);

CREATE TABLE recurring_plan_items (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    product_id TEXT NOT NULL,
    product_uom_id TEXT NOT NULL,
    entered_quantity_microunits INTEGER NOT NULL
      CHECK (entered_quantity_microunits > 0),
    factor_numerator INTEGER NOT NULL CHECK (factor_numerator > 0),
    factor_denominator INTEGER NOT NULL CHECK (factor_denominator > 0),
    base_quantity_microunits INTEGER NOT NULL
      CHECK (base_quantity_microunits > 0),
    fixed_unit_price_cents INTEGER,
    price_list_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, plan_id, line_number),
    FOREIGN KEY (tenant_id, plan_id) REFERENCES recurring_plans(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, product_uom_id) REFERENCES product_uoms(tenant_id, id),
    FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_lists(tenant_id, id),
    CHECK (
      entered_quantity_microunits * factor_numerator =
      base_quantity_microunits * factor_denominator
    ),
    CHECK (fixed_unit_price_cents IS NULL OR fixed_unit_price_cents >= 0)
);

CREATE TABLE recurring_occurrences (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    plan_version INTEGER NOT NULL CHECK (plan_version >= 1),
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'SETTLED'
      CHECK (status IN ('SETTLED','RETURNED')),
    sale_id TEXT NOT NULL,
    accounts_receivable_id TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('NV','03','01')),
    total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0),
    idempotency_key TEXT NOT NULL,
    settled_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, plan_id, period_start),
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (tenant_id, sale_id),
    UNIQUE (tenant_id, accounts_receivable_id),
    FOREIGN KEY (tenant_id, plan_id) REFERENCES recurring_plans(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, accounts_receivable_id)
      REFERENCES accounts_receivable(tenant_id, id),
    CHECK (period_end > period_start)
);

CREATE TABLE recurring_occurrence_items (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    plan_item_id TEXT NOT NULL,
    sale_item_id TEXT NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    product_id TEXT NOT NULL,
    product_uom_id TEXT NOT NULL,
    applied_quantity_microunits INTEGER NOT NULL
      CHECK (applied_quantity_microunits > 0),
    applied_unit_price_cents INTEGER NOT NULL
      CHECK (applied_unit_price_cents >= 0),
    applied_subtotal_cents INTEGER NOT NULL
      CHECK (applied_subtotal_cents >= 0),
    applied_tax_cents INTEGER NOT NULL CHECK (applied_tax_cents >= 0),
    applied_total_cents INTEGER NOT NULL CHECK (applied_total_cents >= 0),
    price_source TEXT NOT NULL CHECK (price_source IN ('FIXED','CURRENT')),
    price_resolved_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, occurrence_id, line_number),
    UNIQUE (tenant_id, sale_item_id),
    FOREIGN KEY (tenant_id, occurrence_id)
      REFERENCES recurring_occurrences(tenant_id, id),
    FOREIGN KEY (tenant_id, plan_item_id)
      REFERENCES recurring_plan_items(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_item_id) REFERENCES sale_items(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, product_uom_id) REFERENCES product_uoms(tenant_id, id),
    CHECK (applied_total_cents = applied_subtotal_cents + applied_tax_cents)
);

CREATE TABLE recurring_proration_adjustments (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    occurrence_id TEXT NOT NULL,
    original_sale_id TEXT NOT NULL,
    adjustment_sale_id TEXT NOT NULL,
    adjustment_document_type TEXT NOT NULL
      CHECK (adjustment_document_type IN ('07','NV_RETURN')),
    cancellation_mode TEXT NOT NULL CHECK (cancellation_mode = 'IMMEDIATE'),
    service_days INTEGER NOT NULL CHECK (service_days > 0),
    unused_service_days INTEGER NOT NULL CHECK (
      unused_service_days >= 0 AND unused_service_days <= service_days
    ),
    rational_numerator INTEGER NOT NULL CHECK (rational_numerator >= 0),
    rational_denominator INTEGER NOT NULL CHECK (rational_denominator > 0),
    credit_amount_cents INTEGER NOT NULL CHECK (credit_amount_cents >= 0),
    idempotency_key TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, occurrence_id),
    UNIQUE (tenant_id, adjustment_sale_id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, plan_id) REFERENCES recurring_plans(tenant_id, id),
    FOREIGN KEY (tenant_id, occurrence_id)
      REFERENCES recurring_occurrences(tenant_id, id),
    FOREIGN KEY (tenant_id, original_sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, adjustment_sale_id) REFERENCES sales(tenant_id, id),
    CHECK (rational_denominator = service_days)
);

CREATE TRIGGER recurring_plans_version_immutable
BEFORE UPDATE OF plan_key, plan_version, supersedes_plan_id, customer_id, branch_id,
  created_by_user_id, document_type, pricing_policy, frequency, timezone,
  anchor_day, anchor_is_last_day, anchor_time, after_grace_policy, grace_days,
  catch_up_limit, effective_from
ON recurring_plans
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_PLAN_VERSION_IMMUTABLE');
END;
CREATE TRIGGER recurring_plan_items_immutable
BEFORE UPDATE ON recurring_plan_items
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_PLAN_ITEM_VERSION_IMMUTABLE');
END;
CREATE TRIGGER recurring_plan_items_no_delete
BEFORE DELETE ON recurring_plan_items
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_PLAN_ITEM_VERSION_IMMUTABLE');
END;
CREATE TRIGGER recurring_occurrences_snapshot_immutable
BEFORE UPDATE OF tenant_id, plan_id, plan_version, period_start, period_end,
  sale_id, accounts_receivable_id, document_type, total_amount_cents,
  idempotency_key, settled_at
ON recurring_occurrences
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_OCCURRENCE_SNAPSHOT_IMMUTABLE');
END;
CREATE TRIGGER recurring_occurrence_items_immutable
BEFORE UPDATE ON recurring_occurrence_items
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_OCCURRENCE_ITEM_IMMUTABLE');
END;
CREATE TRIGGER recurring_occurrence_items_no_delete
BEFORE DELETE ON recurring_occurrence_items
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_OCCURRENCE_ITEM_IMMUTABLE');
END;
CREATE TRIGGER recurring_proration_adjustments_immutable
BEFORE UPDATE ON recurring_proration_adjustments
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_PRORATION_IMMUTABLE');
END;
CREATE TRIGGER recurring_proration_adjustments_no_delete
BEFORE DELETE ON recurring_proration_adjustments
BEGIN
  SELECT RAISE(ABORT, 'RECURRING_PRORATION_IMMUTABLE');
END;

CREATE INDEX idx_recurring_plans_due
    ON recurring_plans(status, next_retry_at, next_run_at, tenant_id);
CREATE INDEX idx_recurring_plans_lease
    ON recurring_plans(lease_expires_at, tenant_id);
CREATE INDEX idx_recurring_plans_customer
    ON recurring_plans(tenant_id, customer_id, status);
CREATE INDEX idx_recurring_plan_items_plan
    ON recurring_plan_items(tenant_id, plan_id, line_number);
CREATE INDEX idx_recurring_occurrences_plan_period
    ON recurring_occurrences(tenant_id, plan_id, period_start, period_end);
CREATE INDEX idx_recurring_proration_original
    ON recurring_proration_adjustments(tenant_id, original_sale_id);

CREATE TRIGGER epoch_recurring_plans_insert AFTER INSERT ON recurring_plans BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_plans_update AFTER UPDATE ON recurring_plans BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_plans_delete BEFORE DELETE ON recurring_plans BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_recurring_plan_items_insert AFTER INSERT ON recurring_plan_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_plan_items_update AFTER UPDATE ON recurring_plan_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_plan_items_delete BEFORE DELETE ON recurring_plan_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_recurring_occurrences_insert AFTER INSERT ON recurring_occurrences BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_occurrences_update AFTER UPDATE ON recurring_occurrences BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_occurrences_delete BEFORE DELETE ON recurring_occurrences BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_recurring_occurrence_items_insert AFTER INSERT ON recurring_occurrence_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_occurrence_items_update AFTER UPDATE ON recurring_occurrence_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_occurrence_items_delete BEFORE DELETE ON recurring_occurrence_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_recurring_proration_adjustments_insert AFTER INSERT ON recurring_proration_adjustments BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_proration_adjustments_update AFTER UPDATE ON recurring_proration_adjustments BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_recurring_proration_adjustments_delete BEFORE DELETE ON recurring_proration_adjustments BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;

INSERT INTO schema_meta(key, value)
VALUES ('sales.recurring.sprint44', '1');
