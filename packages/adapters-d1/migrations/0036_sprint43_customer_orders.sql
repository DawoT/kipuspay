-- Sprint 43 — orders.customer_orders (Arquitectura §5.10 / DAT-12).
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_tenant_id
    ON branches(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_id
    ON customers(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_id
    ON users(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_id
    ON products(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_uoms_tenant_id
    ON product_uoms(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_id
    ON sales(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_items_tenant_id
    ON sale_items(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_items_tenant_sale_id
    ON sale_items(tenant_id, sale_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_terminals_tenant_id
    ON pos_terminals(tenant_id, id);

ALTER TABLE authorization_tokens ADD COLUMN customer_order_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN terminal_session_id TEXT;
CREATE INDEX idx_authorization_tokens_customer_order_reprice
    ON authorization_tokens(tenant_id, customer_order_id);

CREATE TABLE customer_orders (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN'
      CHECK (status IN ('OPEN','PARTIAL','FULFILLED','CANCELLED','EXPIRED')),
    pickup_at DATETIME,
    reserved_until DATETIME NOT NULL,
    idempotency_key TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by_user_id TEXT NOT NULL,
    closed_by_user_id TEXT,
    close_reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    CHECK (
      (status IN ('OPEN','PARTIAL') AND closed_at IS NULL) OR
      (status IN ('FULFILLED','CANCELLED','EXPIRED') AND closed_at IS NOT NULL)
    ),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, branch_id, id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, closed_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE customer_order_items (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_uom_id TEXT NOT NULL,
    uom_code_snapshot TEXT NOT NULL,
    entered_quantity_microunits INTEGER NOT NULL
      CHECK (entered_quantity_microunits > 0),
    factor_numerator INTEGER NOT NULL CHECK (factor_numerator > 0),
    factor_denominator INTEGER NOT NULL CHECK (factor_denominator > 0),
    requested_quantity_microunits INTEGER NOT NULL
      CHECK (requested_quantity_microunits > 0),
    reserved_quantity_microunits INTEGER NOT NULL
      CHECK (reserved_quantity_microunits >= 0),
    fulfilled_quantity_microunits INTEGER NOT NULL DEFAULT 0
      CHECK (fulfilled_quantity_microunits >= 0),
    released_quantity_microunits INTEGER NOT NULL DEFAULT 0
      CHECK (released_quantity_microunits >= 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    batch_id TEXT,
    location_id TEXT,
    serial_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (requested_quantity_microunits = fulfilled_quantity_microunits + released_quantity_microunits + reserved_quantity_microunits),
    CHECK (
      entered_quantity_microunits * factor_numerator =
      requested_quantity_microunits * factor_denominator
    ),
    CHECK (
      serial_id IS NULL OR
      (requested_quantity_microunits = 1000000 AND location_id IS NOT NULL)
    ),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, customer_order_id, id),
    FOREIGN KEY (tenant_id, branch_id, customer_order_id)
      REFERENCES customer_orders(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, product_uom_id) REFERENCES product_uoms(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id, product_id, batch_id)
      REFERENCES inventory_batches(tenant_id, branch_id, product_id, id),
    FOREIGN KEY (tenant_id, branch_id, location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, branch_id, location_id, product_id, serial_id)
      REFERENCES serial_numbers(tenant_id, branch_id, location_id, product_id, id)
);

CREATE TABLE customer_order_fulfillments (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_order_id TEXT NOT NULL,
    customer_order_item_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    terminal_session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'LEASED'
      CHECK (status IN ('LEASED','CONSUMED','REJECTED','EXPIRED')),
    quantity_microunits INTEGER NOT NULL CHECK (quantity_microunits > 0),
    envelope_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_id TEXT NOT NULL,
    consume_idempotency_key TEXT,
    actor_user_id TEXT,
    lease_expires_at DATETIME NOT NULL,
    sale_id TEXT,
    sale_item_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at DATETIME,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
      (status = 'CONSUMED' AND sale_id IS NOT NULL AND sale_item_id IS NOT NULL
       AND consumed_at IS NOT NULL) OR
      (status <> 'CONSUMED' AND sale_id IS NULL AND sale_item_id IS NULL
       AND consumed_at IS NULL)
    ),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, envelope_id, customer_order_item_id),
    UNIQUE (tenant_id, token_hash, customer_order_item_id),
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (tenant_id, request_id, customer_order_item_id),
    UNIQUE (tenant_id, consume_idempotency_key, customer_order_item_id),
    UNIQUE (tenant_id, sale_id, sale_item_id),
    FOREIGN KEY (tenant_id, branch_id, customer_order_id)
      REFERENCES customer_orders(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, customer_order_id, customer_order_item_id)
      REFERENCES customer_order_items(tenant_id, customer_order_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_session_id) REFERENCES pos_terminal_sessions(tenant_id, id),
    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id, sale_item_id)
      REFERENCES sale_items(tenant_id, sale_id, id)
);

CREATE TABLE customer_order_notifications (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_order_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('EXPIRY_WARNING')),
    channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP','IN_APP')),
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (status IN (
        'PENDING','DISPATCHING','SENT','DELIVERED','RETRY','ESCALATED','FAILED'
      )),
    idempotency_key TEXT NOT NULL,
    provider_send_key TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at DATETIME,
    delivered_at DATETIME,
    last_error_code TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
      (status IN ('SENT','DELIVERED') AND delivered_at IS NOT NULL) OR
      (status NOT IN ('SENT','DELIVERED') AND delivered_at IS NULL)
    ),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (tenant_id, provider_send_key),
    UNIQUE (tenant_id, customer_order_id, event_type, channel),
    FOREIGN KEY (tenant_id, branch_id, customer_order_id)
      REFERENCES customer_orders(tenant_id, branch_id, id)
);

CREATE TRIGGER customer_orders_status_transition_guard
BEFORE UPDATE OF status ON customer_orders
WHEN NEW.status <> OLD.status AND NOT (
  (OLD.status = 'OPEN' AND NEW.status IN ('PARTIAL','FULFILLED','CANCELLED','EXPIRED')) OR
  (OLD.status = 'PARTIAL' AND NEW.status IN ('FULFILLED','CANCELLED','EXPIRED'))
)
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ORDER_INVALID_TRANSITION');
END;

CREATE TRIGGER customer_orders_expiry_notice_guard
BEFORE UPDATE OF status ON customer_orders
WHEN NEW.status = 'EXPIRED' AND OLD.status <> 'EXPIRED'
  AND NOT EXISTS (
    SELECT 1 FROM customer_order_notifications notification
    WHERE notification.tenant_id = OLD.tenant_id
      AND notification.customer_order_id = OLD.id
      AND notification.event_type = 'EXPIRY_WARNING'
  )
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ORDER_EXPIRY_NOTICE_REQUIRED');
END;

CREATE TRIGGER customer_orders_fulfilled_items_guard
BEFORE UPDATE OF status ON customer_orders
WHEN NEW.status = 'FULFILLED' AND OLD.status <> 'FULFILLED'
  AND EXISTS (
    SELECT 1 FROM customer_order_items item
    WHERE item.tenant_id = OLD.tenant_id
      AND item.customer_order_id = OLD.id
      AND (
        item.fulfilled_quantity_microunits <> item.requested_quantity_microunits OR
        item.reserved_quantity_microunits <> 0 OR
        item.released_quantity_microunits <> 0
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ORDER_NOT_FULLY_FULFILLED');
END;

CREATE TRIGGER customer_order_fulfillments_quantity_guard
BEFORE INSERT ON customer_order_fulfillments
WHEN (
  NEW.status = 'LEASED' AND NEW.quantity_microunits > (
    SELECT item.reserved_quantity_microunits -
      COALESCE(SUM(existing.quantity_microunits), 0)
    FROM customer_order_items item
    LEFT JOIN customer_order_fulfillments existing
      ON existing.tenant_id = item.tenant_id
     AND existing.customer_order_item_id = item.id
     AND existing.status = 'LEASED'
    WHERE item.tenant_id = NEW.tenant_id AND item.id = NEW.customer_order_item_id
  )
) OR (
  NEW.status = 'CONSUMED' AND NEW.quantity_microunits > (
    SELECT item.fulfilled_quantity_microunits -
      COALESCE(SUM(existing.quantity_microunits), 0)
    FROM customer_order_items item
    LEFT JOIN customer_order_fulfillments existing
      ON existing.tenant_id = item.tenant_id
     AND existing.customer_order_item_id = item.id
     AND existing.status = 'CONSUMED'
    WHERE item.tenant_id = NEW.tenant_id AND item.id = NEW.customer_order_item_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_ITEM');
END;

CREATE TRIGGER customer_order_fulfillments_quantity_guard_update
BEFORE UPDATE OF status, quantity_microunits ON customer_order_fulfillments
WHEN (
  NEW.status = 'LEASED' AND NEW.quantity_microunits > (
    SELECT item.reserved_quantity_microunits -
      COALESCE(SUM(existing.quantity_microunits), 0)
    FROM customer_order_items item
    LEFT JOIN customer_order_fulfillments existing
      ON existing.tenant_id = item.tenant_id
     AND existing.customer_order_item_id = item.id
     AND existing.status = 'LEASED'
     AND existing.id <> OLD.id
    WHERE item.tenant_id = NEW.tenant_id AND item.id = NEW.customer_order_item_id
  )
) OR (
  NEW.status = 'CONSUMED' AND NEW.quantity_microunits > (
    SELECT item.fulfilled_quantity_microunits -
      COALESCE(SUM(existing.quantity_microunits), 0)
    FROM customer_order_items item
    LEFT JOIN customer_order_fulfillments existing
      ON existing.tenant_id = item.tenant_id
     AND existing.customer_order_item_id = item.id
     AND existing.status = 'CONSUMED'
     AND existing.id <> OLD.id
    WHERE item.tenant_id = NEW.tenant_id AND item.id = NEW.customer_order_item_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_ITEM');
END;

CREATE TRIGGER customer_order_fulfillments_scope_immutable
BEFORE UPDATE OF tenant_id, branch_id, customer_order_id, customer_order_item_id,
  terminal_id, terminal_session_id, quantity_microunits, envelope_id, token_hash, idempotency_key,
  request_id, actor_user_id
ON customer_order_fulfillments
WHEN NEW.tenant_id <> OLD.tenant_id
  OR NEW.branch_id <> OLD.branch_id
  OR NEW.customer_order_id <> OLD.customer_order_id
  OR NEW.customer_order_item_id <> OLD.customer_order_item_id
  OR NEW.terminal_id <> OLD.terminal_id
  OR NEW.terminal_session_id <> OLD.terminal_session_id
  OR NEW.quantity_microunits <> OLD.quantity_microunits
  OR NEW.envelope_id <> OLD.envelope_id
  OR NEW.token_hash <> OLD.token_hash
  OR NEW.idempotency_key <> OLD.idempotency_key
  OR NEW.request_id <> OLD.request_id
  OR NEW.actor_user_id IS NOT OLD.actor_user_id
BEGIN
  SELECT RAISE(ABORT, 'CUSTOMER_ORDER_FULFILLMENT_SCOPE_IMMUTABLE');
END;

CREATE INDEX idx_customer_orders_pickup
    ON customer_orders(tenant_id, branch_id, status, pickup_at);
CREATE INDEX idx_customer_orders_expiry
    ON customer_orders(tenant_id, status, reserved_until);
CREATE INDEX idx_customer_order_items_order
    ON customer_order_items(tenant_id, customer_order_id, id);
CREATE INDEX idx_customer_order_items_allocation
    ON customer_order_items(tenant_id, branch_id, product_id, location_id, batch_id);
CREATE INDEX idx_customer_order_fulfillments_order
    ON customer_order_fulfillments(tenant_id, customer_order_id, created_at, id);
CREATE INDEX idx_customer_order_fulfillments_lease
    ON customer_order_fulfillments(tenant_id, status, lease_expires_at);
CREATE INDEX idx_customer_order_notifications_retry
    ON customer_order_notifications(tenant_id, status, next_attempt_at);

CREATE TRIGGER backup_epoch_customer_orders_insert AFTER INSERT ON customer_orders BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_orders_update AFTER UPDATE ON customer_orders BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_orders_delete BEFORE DELETE ON customer_orders BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_items_insert AFTER INSERT ON customer_order_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_items_update AFTER UPDATE ON customer_order_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_items_delete BEFORE DELETE ON customer_order_items BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_fulfillments_insert AFTER INSERT ON customer_order_fulfillments BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_fulfillments_update AFTER UPDATE ON customer_order_fulfillments BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_fulfillments_delete BEFORE DELETE ON customer_order_fulfillments BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_notifications_insert AFTER INSERT ON customer_order_notifications BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_notifications_update AFTER UPDATE ON customer_order_notifications BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = NEW.tenant_id;
END;
CREATE TRIGGER backup_epoch_customer_order_notifications_delete BEFORE DELETE ON customer_order_notifications BEGIN
  UPDATE tenant_data_epochs SET epoch = epoch + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = OLD.tenant_id;
END;

INSERT INTO schema_meta(key, value)
VALUES ('orders.customer_orders.sprint43', '1');
