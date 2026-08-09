-- Sprint 45 — mobile.push (Arquitectura §5.12 / COM-11 / DAT-12).
-- The Sprint 8 owner-alert table stored provider credentials in plaintext.
-- It was never a durable contract and cannot be transformed safely in SQL.
DROP INDEX IF EXISTS idx_push_subscriptions_tenant_user;
DROP INDEX IF EXISTS uq_push_subscriptions_endpoint;
DROP TABLE push_subscriptions;

CREATE TABLE push_privacy_settings (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    amounts_enabled INTEGER NOT NULL DEFAULT 0,
    policy_version TEXT NOT NULL,
    updated_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id),
    CHECK (amounts_enabled IN (0,1)),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE push_consents (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    privacy_mode TEXT NOT NULL DEFAULT 'REDACTED',
    tenant_amounts_policy_enabled INTEGER NOT NULL DEFAULT 0,
    owner_amounts_opt_in INTEGER NOT NULL DEFAULT 0,
    device_fingerprint TEXT NOT NULL,
    granted_at DATETIME NOT NULL,
    revoked_at DATETIME,
    actor_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, user_id, purpose, device_fingerprint, policy_version),
    CHECK (purpose IN ('OWNER_ALERTS','OPERATIONAL_MOBILE')),
    CHECK (privacy_mode IN ('REDACTED','AMOUNTS')),
    CHECK (tenant_amounts_policy_enabled IN (0,1)),
    CHECK (owner_amounts_opt_in IN (0,1)),
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    consent_id TEXT NOT NULL,
    branch_id TEXT,
    terminal_id TEXT,
    provider TEXT NOT NULL,
    provider_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    endpoint_token_ciphertext TEXT NOT NULL,
    endpoint_token_fingerprint TEXT NOT NULL,
    credential_ciphertext TEXT,
    credential_fingerprint TEXT,
    encryption_key_version TEXT NOT NULL,
    device_fingerprint TEXT NOT NULL,
    client_module_version TEXT,
    client_module_sha256 TEXT,
    last_verified_at DATETIME,
    revoked_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, provider, endpoint_token_fingerprint),
    CHECK (provider IN ('WEB_PUSH','FCM_HTTP_V1')),
    CHECK (status IN ('ACTIVE','REVOKED','STALE','INVALID')),
    CHECK (
      (provider = 'WEB_PUSH' AND credential_ciphertext IS NOT NULL
        AND credential_fingerprint IS NOT NULL) OR
      (provider = 'FCM_HTTP_V1' AND credential_ciphertext IS NULL
        AND credential_fingerprint IS NULL)
    ),
    CHECK (
      (status = 'ACTIVE' AND revoked_at IS NULL) OR
      (status <> 'ACTIVE' AND revoked_at IS NOT NULL)
    ),
    CHECK (
      (branch_id IS NULL AND terminal_id IS NULL) OR
      (branch_id IS NOT NULL AND terminal_id IS NOT NULL)
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, consent_id) REFERENCES push_consents(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id, terminal_id)
      REFERENCES pos_terminals(tenant_id, branch_id, id)
);

CREATE TABLE push_events (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    source_entity_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    idempotency_key_hash TEXT NOT NULL,
    target_scope TEXT NOT NULL,
    target_user_id TEXT,
    target_branch_id TEXT,
    payload_redacted_json TEXT NOT NULL,
    amount_cents INTEGER,
    deep_link_kind TEXT NOT NULL,
    deep_link_entity_id TEXT NOT NULL,
    ttl_seconds INTEGER NOT NULL,
    collapse_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key_hash),
    CHECK (event_type IN (
      'CASH_CLOSE','CASH_DISCREPANCY','INVENTORY_STOCKOUT',
      'INSTALLMENT_OVERDUE','ACCOUNTS_RECEIVABLE_OVERDUE',
      'CUSTOMER_ORDER_EXPIRY','RECURRING_GRACE','BILLING_REMINDER'
    )),
    CHECK (target_scope IN ('OWNER_ALERTS','OPERATIONAL_MOBILE')),
    CHECK (
      (target_scope = 'OWNER_ALERTS' AND target_user_id IS NULL AND target_branch_id IS NULL) OR
      (target_scope = 'OPERATIONAL_MOBILE' AND target_user_id IS NOT NULL AND target_branch_id IS NOT NULL)
    ),
    CHECK (status IN ('PENDING','DISPATCHING','COMPLETE','EXPIRED')),
    CHECK (ttl_seconds > 0 AND ttl_seconds <= 86400),
    CHECK (amount_cents IS NULL OR amount_cents >= 0),
    CHECK (expires_at > created_at),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, target_user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, target_branch_id) REFERENCES branches(tenant_id, id)
);

CREATE TABLE push_deliveries (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    collapse_key TEXT NOT NULL,
    ttl_seconds INTEGER NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at DATETIME,
    lease_owner_hash TEXT,
    lease_expires_at DATETIME,
    provider_message_id_hash TEXT,
    provider_response_code TEXT,
    accepted_at DATETIME,
    displayed_at DATETIME,
    display_context TEXT,
    ack_receipt_hash TEXT,
    ack_key_version TEXT,
    ack_expires_at DATETIME,
    ack_consumed_at DATETIME,
    failure_reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, event_id, subscription_id),
    UNIQUE (tenant_id, ack_receipt_hash),
    CHECK (provider IN ('WEB_PUSH','FCM_HTTP_V1')),
    CHECK (status IN ('PENDING','LEASED','ACCEPTED','DISPLAYED','RETRY','FAILED','EXPIRED')),
    CHECK (display_context IS NULL OR display_context IN ('NORMAL','OFFLINE','DOZE')),
    CHECK (attempt_count >= 0),
    CHECK (ttl_seconds > 0 AND ttl_seconds <= 86400),
    CHECK (
      (lease_owner_hash IS NULL AND lease_expires_at IS NULL) OR
      (lease_owner_hash IS NOT NULL AND lease_expires_at IS NOT NULL)
    ),
    CHECK (
      (ack_receipt_hash IS NULL AND ack_key_version IS NULL
        AND ack_expires_at IS NULL AND ack_consumed_at IS NULL) OR
      (ack_receipt_hash IS NOT NULL AND ack_key_version IS NOT NULL
        AND ack_expires_at IS NOT NULL)
    ),
    CHECK (ack_consumed_at IS NULL OR ack_consumed_at <= ack_expires_at),
    CHECK (displayed_at IS NULL OR accepted_at IS NOT NULL),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, event_id) REFERENCES push_events(tenant_id, id),
    FOREIGN KEY (tenant_id, subscription_id) REFERENCES push_subscriptions(tenant_id, id)
);

CREATE INDEX idx_push_consents_user_purpose
  ON push_consents(tenant_id, user_id, purpose, revoked_at);
CREATE INDEX idx_push_subscriptions_dispatch
  ON push_subscriptions(tenant_id, status, provider, user_id);
CREATE INDEX idx_push_events_due
  ON push_events(tenant_id, status, expires_at, created_at);
CREATE INDEX idx_push_deliveries_due
  ON push_deliveries(tenant_id, status, next_retry_at, lease_expires_at);
CREATE INDEX idx_push_deliveries_slo
  ON push_deliveries(tenant_id, display_context, created_at, displayed_at);

CREATE TRIGGER epoch_push_privacy_settings_insert AFTER INSERT ON push_privacy_settings BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_privacy_settings_update AFTER UPDATE ON push_privacy_settings BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_privacy_settings_delete BEFORE DELETE ON push_privacy_settings BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_push_consents_insert AFTER INSERT ON push_consents BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_consents_update AFTER UPDATE ON push_consents BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_consents_delete BEFORE DELETE ON push_consents BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_push_subscriptions_insert AFTER INSERT ON push_subscriptions BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_subscriptions_update AFTER UPDATE ON push_subscriptions BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_subscriptions_delete BEFORE DELETE ON push_subscriptions BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_push_events_insert AFTER INSERT ON push_events BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_events_update AFTER UPDATE ON push_events BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_events_delete BEFORE DELETE ON push_events BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER epoch_push_deliveries_insert AFTER INSERT ON push_deliveries BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_deliveries_update AFTER UPDATE ON push_deliveries BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER epoch_push_deliveries_delete BEFORE DELETE ON push_deliveries BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;

INSERT INTO schema_meta(key, value)
VALUES ('mobile.push.sprint45', '1');
