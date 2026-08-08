---
doc_id: arch-05-7-inventory-scale
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.7"
---

### **5.7 Peso variable, transporte de balanza y reconciliación**

#### Regla 25 — Venta por peso (`inventory.scale`, ADR-0024)

`WEIGH` es un producto físico con seguimiento de stock. Toda cantidad de masa usa
`INTEGER` microunidades (`WEIGHT_SCALE = 1_000_000` por unidad base); quedan
prohibidos `REAL`, gramos/kilos decimales y subtotales de cliente como fuente de
verdad. El servidor resuelve el precio vigente y calcula, para enteros no negativos:

`subtotal_cents = floor((unit_price_per_base_cents * weight_microunits + 500_000) / 1_000_000)`

La multiplicación se evalúa con entero exacto y guard de overflow. Una línea `WEIGH`
requiere `weight_microunits > 0`, descuenta esa cantidad del stock en microunidades y
tiene exactamente una `weight_measurement`. Dos líneas del mismo producto no se
fusionan: `measurement_id` y `sale_item_id` preservan cada pesada.

##### Matriz de transporte y normalización local

| Transporte | Entrada admitida | Responsabilidad local | Falla cerrada |
|---|---|---|---|
| WebHID | reportes binarios del descriptor seleccionado | validar report ID, estabilidad y escala declarada por perfil | reporte desconocido o heartbeat stale |
| Web Serial | tramas ASCII del perfil seleccionado | framing, checksum, signo, unidad y estabilidad | trama parcial, checksum inválido o puerto cerrado |
| WebUSB | endpoint del dispositivo seleccionado | framing binario, unidad y estabilidad | endpoint/cable/suspensión o heartbeat stale |

Los tres adapters producen el mismo `ScaleReading` local:
`{ device_id, protocol, sequence, weight_microunits, stable, observed_at_epoch_ms }`.
No se envían bytes crudos al Worker. Una lectura solo es cobrable si es estable,
positiva y su heartbeat tiene menos de `2_000 ms`; a los `2_000 ms` ya está stale.
Desconexión, suspensión o stale cambian la UI a estado rojo `MANUAL_REQUIRED`; nunca
devuelven cero ni reutilizan la última lectura.

##### DTO HTTP confiable, autorización y offline

El DTO HTTP de venta solo transporta identidad y hechos normalizados:
`measurement_id`, `sale_item_id`, `product_id`, `weight_microunits`,
`measurement_source = DEVICE | MANUAL`, `scale_protocol`, `scale_device_id`,
`observed_at`, `heartbeat_sequence` y, cuando corresponda, `authorization_token`.
El Worker elimina cualquier `tenant_id`, `unit_price_per_base_cents`,
`subtotal_cents`, bytes o unidad enviados por el cliente. Tenant y usuario proceden
del JWT; una cabecera solo identifica un terminal candidato. El servidor exige una
`pos_terminal_sessions` activa que una tenant + usuario + sucursal + sesión de caja
abierta + terminal activo. Catálogo y precio se resuelven server-side.

`tenant_weight_policies.manual_weight_threshold_microunits` es
`INTEGER NOT NULL DEFAULT 0`; existe una política tenant-scoped y no se modifica la
tabla raíz `tenants`. Un peso `MANUAL` superior al umbral exige autorización
`WEIGHT_OVERRIDE`. El token dura como máximo 90 segundos, es opaco, se persiste solo
como SHA-256, es one-shot y queda ligado a `tenant_id + actor_user_id + terminal_id +
sale_id/offline_sale_id + sale_item_id + measurement_id + action`.
`approved_by_user_id` identifica al supervisor aprobador y `actor_user_id` al cajero
que puede consumirlo; no son intercambiables. Scope incorrecto, expiración, replay o
dependencia de revocación no disponible fallan cerrados. Consumo de token, medición,
línea, stock, auditoría y venta ocurren en el mismo `db.batch`.

El heartbeat autenticado actualiza solo el dispositivo de la sesión de terminal
registrada. Dispositivo/terminal ajeno, protocolo distinto, secuencia no creciente u
observación stale fallan cerrados; una venta `DEVICE` exige heartbeat fresco.

Offline no cambia autoridad: la cola conserva los campos normalizados y la identidad
de medición, pero al sincronizar el servidor revalida flag, producto `WEIGH`, precio,
umbral/token, unicidad por línea, stock y fórmula. El ack devuelve peso y total
autoritativos; cualquier total local es solo una proyección reemplazable.

#### DDL canónico objetivo Sprint 40

Este DDL es contrato de la futura migración 0033; documentarlo no instala la
migración ni cierra el Sprint.

```sql
CREATE TABLE tenant_weight_policies (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    manual_weight_threshold_microunits INTEGER NOT NULL DEFAULT 0
      CHECK (manual_weight_threshold_microunits >= 0),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE pos_terminal_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id),
    FOREIGN KEY (tenant_id, cash_register_session_id)
      REFERENCES cash_register_sessions(tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);

CREATE UNIQUE INDEX uq_pos_terminal_sessions_active_terminal
  ON pos_terminal_sessions(tenant_id, terminal_id)
  WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_pos_terminal_sessions_active_cash_session
  ON pos_terminal_sessions(tenant_id, cash_register_session_id)
  WHERE status = 'ACTIVE';

CREATE TABLE scale_devices (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    protocol TEXT NOT NULL CHECK (protocol IN ('WEBHID','WEB_SERIAL','WEBUSB')),
    device_fingerprint TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE','DISCONNECTED','DISABLED')),
    last_heartbeat_at DATETIME,
    last_heartbeat_sequence INTEGER CHECK (
      last_heartbeat_sequence IS NULL OR last_heartbeat_sequence >= 0
    ),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, terminal_id, device_fingerprint),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id)
);

ALTER TABLE authorization_tokens ADD COLUMN action TEXT;
ALTER TABLE authorization_tokens ADD COLUMN actor_user_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN terminal_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN sale_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN offline_sale_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN sale_item_id TEXT;
ALTER TABLE authorization_tokens ADD COLUMN measurement_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_authorization_tokens_tenant_id
  ON authorization_tokens(tenant_id, id);

CREATE TABLE weight_measurements (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    sale_item_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    scale_device_id TEXT,
    operation_type TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    weight_microunits INTEGER NOT NULL CHECK (weight_microunits > 0),
    unit_price_per_base_cents INTEGER NOT NULL CHECK (unit_price_per_base_cents >= 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    measurement_source TEXT NOT NULL CHECK (measurement_source IN ('DEVICE','MANUAL')),
    scale_protocol TEXT CHECK (scale_protocol IN ('WEBHID','WEB_SERIAL','WEBUSB')),
    heartbeat_sequence INTEGER,
    observed_at DATETIME NOT NULL,
    authorization_token_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, sale_item_id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, sale_item_id) REFERENCES sale_items(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id),
    FOREIGN KEY (tenant_id, scale_device_id) REFERENCES scale_devices(tenant_id, id),
    FOREIGN KEY (tenant_id, authorization_token_id) REFERENCES authorization_tokens(tenant_id, id)
);

CREATE INDEX idx_weight_measurements_product
  ON weight_measurements(tenant_id, product_id, created_at);
CREATE INDEX idx_weight_measurements_operation
  ON weight_measurements(tenant_id, operation_type, operation_id);

CREATE TRIGGER weight_measurements_no_update
BEFORE UPDATE ON weight_measurements
BEGIN
  SELECT RAISE(ABORT, 'WEIGHT_MEASUREMENTS_APPEND_ONLY');
END;

CREATE TRIGGER weight_measurements_no_delete
BEFORE DELETE ON weight_measurements
BEGIN
  SELECT RAISE(ABORT, 'WEIGHT_MEASUREMENTS_APPEND_ONLY');
END;
```

La migración 0033 deberá hacer explícito `products.product_type = 'WEIGH'` y usar
`sale_items.base_quantity_microunits` como cantidad física. No puede revivir
`sale_items.quantity REAL` ni crear una segunda representación decimal del peso.
