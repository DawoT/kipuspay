-- owner.push_alerts — push_subscriptions (Arquitectura §5.3 / DAT-12).
-- mobile.push completo = Sprints 43–45; aquí solo suscripción Dueño.

CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE UNIQUE INDEX uq_push_subscriptions_endpoint
  ON push_subscriptions(tenant_id, endpoint);

CREATE INDEX idx_push_subscriptions_tenant_user
  ON push_subscriptions(tenant_id, user_id);
