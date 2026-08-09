---
doc_id: architecture-mobile-push-pos
alias: Arquitectura
authority: normativa
owner: "@DawoT"
---

### 5.12 Notificaciones push y caja móvil Android (regla 30)

Esta sección es la definición canónica de la regla 30 (`COM-11`) y del DDL objetivo
0038. Sprint 45 entrega dos capabilities independientes y default-off:

- `mobile.push`: motor de notificaciones operacionales para usuarios y empleados.
- `client.mobile_pos`: instalación PWA Android del mismo POS, con el mismo dominio,
  RBAC, sesión de terminal y cola offline.

`owner.push_alerts` es únicamente el alias legado de compatibilidad de Modo Dueño.
Migra hacia `mobile.push`; no habilita otro motor, esquema ni transporte. Ninguna de
las tres capabilities depende de `vertical_type` ni introduce rol o fork de dominio.

#### 5.12.1 Consentimiento S45 y registro canónico de eventos

El consentimiento de Sprint 45 pertenece a la persona autenticada que usa KipusPay:
usuario Owner/Admin o empleado. Es independiente del consentimiento de clientes que
Sprint 47 formaliza para marketing, WhatsApp y derechos LPDP. Un consentimiento se
otorga por propósito (`OWNER_ALERTS` u `OPERATIONAL_MOBILE`), versión de política y
dispositivo; debe registrar actor, instante y revocación. Sin grant vigente no se
crea ni entrega push. Revocar desactiva inmediatamente todas las suscripciones del
propósito.

El registro cerrado de eventos operacionales es:

- `CASH_CLOSE` y `CASH_DISCREPANCY`;
- `INVENTORY_STOCKOUT`;
- `INSTALLMENT_OVERDUE` y `ACCOUNTS_RECEIVABLE_OVERDUE`;
- `CUSTOMER_ORDER_EXPIRY`;
- `RECURRING_GRACE`.

Los recordatorios de cobro de la suscripción SaaS de KipusPay son `BILLING_REMINDER`
y pertenecen a billing, no a cuotas/CxC ni a la gracia de una venta recurrente. Un
productor solo agrega intención durable e idempotente al outbox; un fallo de push
nunca revierte, retrasa ni bloquea venta, CPE, cierre de caja, stock, pedido,
recurrencia, cobro o sincronización.

#### 5.12.2 Privacidad de lockscreen y detalle autenticado

`REDACTED` es la política predeterminada: título y cuerpo describen una categoría
operacional sin monto ni identidad. `AMOUNTS` se permite únicamente cuando existe
una política explícita del tenant y, además, opt-in vigente del Owner receptor. El
dispatcher evalúa ambas condiciones al construir cada entrega; no hereda una
preferencia de otro dispositivo.

Ningún modo incluye nombre de cliente, documento, teléfono, email, dirección,
contenido fiscal, endpoint, token, credencial, secreto ni identificador sensible.
Los deep links llevan solo tipo e ID opacos de una allowlist y nunca una URL
aportada por cliente. El detalle se obtiene después de `notificationclick`, sesión
autenticada y revalidación server-side de tenant, rol, branch y recurso. Una sesión
ausente o revocada abre login sin revelar el detalle y sin redirección arbitraria.

#### 5.12.3 Transportes y frontera criptográfica

Los transportes normativos son Web Push estándar con VAPID para PWA y FCM HTTP v1.
FCM legacy server keys queda prohibido. El registro FCM web usa un módulo vendorizado
de carga diferida, fijado a versión y contenido; el repositorio registra licencia,
SHA-256 y componente SBOM. No se agrega dependencia npm runtime. Si el módulo no
carga, el producto degrada a Web Push o polling/banner sin afectar la caja.

El Worker API nunca recibe material privado VAPID ni credenciales OAuth de service
account. Invoca por RPC un Worker de transporte aislado que posee `PUSH_KMS` y
Secrets Store. Ese Worker descifra por envoltura, firma VAPID o obtiene OAuth2 para
FCM HTTP v1 y devuelve solo estado/provider ID opacos. D1 persiste ciphertext,
versión de clave y fingerprint; jamás endpoint, `auth`, `p256dh`, token FCM, clave
VAPID privada o service account en claro. Rotación conserva versión/fingerprint,
invalida material revocado y falla cerrado si `PUSH_KMS` o revocación no están
disponibles.

#### 5.12.4 Semántica de entrega, ACK y SLO

`ACCEPTED` significa exclusivamente que Web Push/FCM aceptó la solicitud.
`DISPLAYED` exige ACK del Service Worker/dispositivo después de ejecutar
`showNotification`. El ACK presenta un receipt opaco, firmado, ligado a
tenant+delivery+subscription+device, de un solo uso y con ventana máxima de 300
segundos. Replays, firma inválida, receipt vencido o dispositivo/tenant distinto no
alteran estado.

La latencia se mide desde `push_events.created_at` hasta
`push_deliveries.displayed_at`; nunca desde la respuesta HTTP del proveedor. En la
matriz certificada de red normal, el objetivo es p95 < 10 s y tasa DISPLAYED >= 99%.
Dispositivos offline, en doze o sin conectividad se excluyen del denominador normal
solo si quedan etiquetados explícitamente `OFFLINE` o `DOZE`; no se presentan como
entrega exitosa ni justifican borrar la muestra.

#### 5.12.5 DDL objetivo 0038

```sql
CREATE TABLE push_consents (
    id TEXT PRIMARY KEY,
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, consent_id) REFERENCES push_consents(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id, terminal_id)
      REFERENCES pos_terminals(tenant_id, branch_id, id)
);

CREATE TABLE push_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    source_entity_type TEXT NOT NULL,
    source_entity_id TEXT NOT NULL,
    idempotency_key_hash TEXT NOT NULL,
    target_scope TEXT NOT NULL,
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
    CHECK (status IN ('PENDING','DISPATCHING','COMPLETE','EXPIRED')),
    CHECK (ttl_seconds > 0 AND ttl_seconds <= 86400),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE push_deliveries (
    id TEXT PRIMARY KEY,
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
```

La migración física 0038 debe crear triggers de epoch `insert/update/delete` para
las cuatro tablas y registrarlas en KPBK1: consentimientos y suscripciones como
`SENSITIVE`; eventos y deliveries como `BUSINESS`, sin exportar ciphertext o
receipts fuera de su política. El down es child-first, protegido por
`MOBILE_PUSH_DOWN_PROTECTED`, exige backup verificado y versión de registry/epoch
compatible antes de eliminar datos.

#### 5.12.6 Dispatcher, reintentos y degradación

El dispatcher reclama páginas con lease idempotente y deduplica por
evento×usuario×dispositivo. Respeta TTL, collapse key, `Retry-After`,
backoff+jitter y límites por tenant. HTTP 404/410 o token stale invalidan la
suscripción; 429/5xx reintentan mientras el TTL siga vigente. Provider IDs,
respuestas y razones se guardan como hashes/catálogos opacos sin cuerpo ni PII.
Dispatch concurrente no duplica notificaciones visibles.

Las rutas de consentimiento, suscripción, rotación, revocación, preferencias y ACK
derivan tenant/user/branch del JWT y sesión activa. Owner/Admin administran alertas
de Owner; cashier/supervisor solo su dispositivo y terminal móvil activa. Las
capabilities de deploy y tenant deben estar habilitadas; cualquier duda de sesión,
revocación, KMS o scope falla cerrada. La indisponibilidad push siempre degrada a
polling/banner y nunca bloquea la operación origen.

#### 5.12.7 Un único Service Worker y caja móvil

Existe un solo Service Worker para el scope del POS. El mismo artefacto versionado
coordina install/activate, cache allowlist, cola IndexedDB, background sync, Web
Push, mensaje FCM en background, `notificationclick` y ACK. Una actualización
conserva la cola offline y espera activación segura; no se registra un segundo SW
por rol, dominio, provider o modalidad.

El manifest hace instalable la PWA en modo `standalone`, con iconos versionados,
shortcuts sin datos sensibles y página offline. `client.mobile_pos` reutiliza
checkout, fiscal, impresión fallback, sesión/revocación de `pos_terminals` y
`pos_terminal_sessions`, así como la misma cola y reconciliación autoritativa. El
dispositivo móvil es una terminal server-bound; cámara, permiso push, instalación,
FCM o background sync fallidos no impiden ventas offline ni pierden cola.

La certificación incluye 360/375 px, targets Android >=48 px, teclado, `aria-live`,
contraste 4.5:1, reduced motion, modo oscuro, reinicio/F5/upgrade SW y 500 ventas
offline en gama baja. Chaos 500 cubre timeout/cuota/5xx, token stale, rotación,
offline/doze, presión IndexedDB, revocación, ACK falso/tardío/replay y dispatch
concurrente; exige cero push sin consentimiento, cero PII/secreto, cero duplicado
visible y cero venta perdida o bloqueada.
