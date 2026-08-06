---
doc_id: arch-05-4-ecosystem-ports
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.4"
---

### **5.4 Ecosistema Perú (KipusPay v9) — puertos de integración Zero-Trust**

Extiende el core sin meter SDKs de terceros en `domain-sales`. Implementación: Roadmap FASE 7 (sprints 21–24). **Stripe de billing SaaS** no es medio de pago de caja.

> **Delimitación de §5.4:** **puertos de integración** (import/export, catálogo, ecosistema) con sus reglas y DDL. No colocares en §5.4: operación comercial interna (§5.3), pipeline fiscal (§5.2) ni el motor transaccional (§6). Cualquier regla compartida se referencia por `§` (ver Registry §0.4).

#### Reglas

1. **Import:** `CatalogImporter` solo escribe tras dry-run aprobado; claves externas (`external_source`, `external_id`) evitan duplicados; impuestos se mapean a tablas KipusPay, nunca se copian reglas fiscales opacas del competidor.
2. **Pagos en caja:** el cliente elige método; el servidor llama `PaymentAcquirer` y persiste `sale_payments` con estado monotónico; montos los impone el sale engine; reintentos idempotentes. **Captura offline de medio electrónico (edge 2B):** si el POS está sin red, un pago con billetera/QR (Yape/Plin/MP) puede marcarse **"Captura Manual"**: la UI muestra alerta ámbar al cajero *"Sin conexión. Verifica visualmente la app del cliente antes de entregar el producto"*; al sincronizar, el servidor persiste el pago con estado **`MANUAL_ELECTRONIC_CAPTURE`** en `payment_captures` (sin llamar al adquirente) y Modo Dueño lo lista como **no conciliado por API** (reporte §9), para que el dueño audite la confianza del cajero. Nunca se marca manual un pago online con captura API confirmada.
3. **Export contable:** `AccountingExporter` es de solo lectura sobre ventas/CxC/CxP ya ACID; no altera el ledger al exportar.
4. **API pública:** autenticación por API key de tenant; webhooks con HMAC; eventos mínimos `sale.created`, `cpe.accepted`, `cpe.rejected`; capability `integrations.api` (Plan Guard 402 en rutas API, nunca en cobro).
5. **Messaging:** `MessagingSender` post-commit; opt-in del cliente; NV y CPE usan plantillas distintas (leyendas correctas).
6. **Loyalty:** puntos como policy de descuento/`CreditLimit`-adjacent; canje pasa por authz Sprint 17; no `switch(vertical)`.

#### DDL adicional (v9)

```sql
CREATE TABLE external_entity_map (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source TEXT NOT NULL,          -- 'bsale' | 'alegra' | 'csv'
    entity_type TEXT NOT NULL,     -- 'product' | 'customer' | 'series'
    external_id TEXT NOT NULL,
    internal_id TEXT NOT NULL,
    UNIQUE (tenant_id, source, entity_type, external_id)
);

CREATE TABLE payment_captures (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    sale_payment_id TEXT NOT NULL,
    acquirer TEXT NOT NULL,        -- 'yape' | 'plin' | 'mercadopago' | 'culqi' | 'niubiz'
    acquirer_ref TEXT,
    status TEXT NOT NULL,          -- 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUNDED' | 'MANUAL_ELECTRONIC_CAPTURE'
    amount_cents INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_payment_id) REFERENCES sale_payments(tenant_id, id),
    -- DAT-04: catálogo cerrado de estados de captura
    CHECK (status IN ('PENDING','CAPTURED','FAILED','REFUNDED','MANUAL_ELECTRONIC_CAPTURE'))
);

CREATE TABLE api_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,           -- HMAC-SHA256 con salt aleatorio por key (+ pepper) — nunca SHA-1 sin salt
    status TEXT NOT NULL DEFAULT 'active',
    last_used_at DATETIME,            -- SEC-04: telemetría de uso/rotación
    created_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    UNIQUE (tenant_id, key_prefix),   -- SEC-04
    CHECK (status IN ('active','revoked'))  -- SEC-04
);

CREATE TABLE webhook_endpoints (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    url TEXT NOT NULL,                -- SEC-04: solo HTTPS, deny-list de IP privada/link-local/169.254.169.254
    secret_hash TEXT NOT NULL,        -- SHA-256 con salt; lookup/compare de configuración
    secret_kms_ref TEXT NOT NULL,     -- secreto operativo cifrado; nunca se intenta reconstruir desde el hash
    secret_salt BLOB NOT NULL,
    events_json TEXT NOT NULL,        -- ["sale.created","cpe.accepted"]
    status TEXT NOT NULL DEFAULT 'active',
    failure_count INTEGER NOT NULL DEFAULT 0,  -- SEC-04: auto-disable tras N fallos (5s timeout, backoff)
    last_failure_at DATETIME
);
CREATE UNIQUE INDEX uq_webhook_endpoints_tenant_id ON webhook_endpoints(tenant_id, id);

CREATE TABLE webhook_deliveries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    delivered_at DATETIME,
    UNIQUE (endpoint_id, event_id),
    CHECK (status IN ('PENDING','PROCESSING','DELIVERED','FAILED','DISABLED')),
    FOREIGN KEY (tenant_id, endpoint_id) REFERENCES webhook_endpoints(tenant_id, id)
);

-- SEC-03: certificados SUNAT del tenant — la clave privada vive SOLO en Workers Secrets/envoltura KMS,
-- jamás en D1/KV/R2; rotación ≥ 2 años y en caso de compromiso.
CREATE TABLE tenant_certificates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    alias TEXT NOT NULL,              -- 'SUNAT' | 'PSE_PLATFORM'
    private_key_kms_ref TEXT NOT NULL, -- ref KMS/Secret, no la clave
    cert_chain_pem TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    rotated_at DATETIME,
    UNIQUE (tenant_id, alias),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- SEC-08: dedup de eventos entrantes de pasarelas/Stripe (anti replay y anti re-entrega doble)
CREATE TABLE webhook_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    source TEXT NOT NULL,             -- 'stripe' | 'yape' | 'plin' | 'mercadopago' | ...
    event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    processed_at DATETIME,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, event_id),
    CHECK (status IN ('PROCESSING','PROCESSED','FAILED'))
);

CREATE TABLE loyalty_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    points_balance INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, customer_id),
    -- COM-12: saldo jamás negativo + vínculo al cliente
    CHECK (points_balance >= 0),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Canje con bloqueo pesimista (v8.2). Offline: loyalty deshabilitado.
CREATE TABLE loyalty_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    sale_idempotency_key TEXT NOT NULL,  -- misma key que la venta offline/online
    points INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'RESERVED',
    -- RESERVED | REDEEMED | EXPIRED | CANCELLED
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, sale_idempotency_key),
    CHECK (points >= 0),
    CHECK (status IN ('RESERVED','REDEEMED','EXPIRED','CANCELLED')),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX idx_loyalty_res_expiry ON loyalty_reservations(status, expires_at);
```

**Loyalty (FASE 7, v9 — `loyalty.points`, Sprint 24):** al aplicar puntos online → `RESERVED` (no resta del balance visible hasta commit); al consolidar venta ACID → `REDEEMED` + `audit_events`; si falla/offline/expira → barrendero (`alarm`/cron) marca `EXPIRED` y libera. Reintento de venta con la misma `idempotency_key` **reutiliza** la reserva.

**Reserva expirada en retry offline (edge case, Sprint 24):** si una venta **empezó online** (puntos `RESERVED`), la red se cortó antes del commit, la venta cayó a la cola offline y el barrendero expiró la reserva antes del sync, al consolidar el retry el servidor **commite la venta sin puntos** (promesa de caja intacta, Principio 5): no bloquea el cobro, no descuenta del balance y **jamás** genera saldo negativo de puntos. Se registra `audit_events` `LOYALTY_RESERVATION_EXPIRED` (`sale_id`, `loyalty_reservation_id`, motivo `EXPIRED_ON_RETRY`) + notificación al Dueño vía push (Modo Dueño) para ofrecer crédito de cortesía. Alternativa válida para el cajero online: si la reserva aún está vigente, el retry la reutiliza (canje normal).

**No copiar de la categoría (fuera de KipusPay):** ERP nómina/MRP, marketplace propio, “contingencia SUNAT” por falta de `.pfx`.

