---
doc_id: arch-05-6-inventory-serials
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.6"
---

### **5.6 Identidad serial, historial y asignación offline**

#### Regla 24 — Números de serie (`inventory.serials`, ADR-0023)

Un producto con `serial_tracking_mode = REQUIRED` representa cada unidad física con
una serie normalizada única por tenant. Cada serie equivale a
`QUANTITY_SCALE = 1_000_000` microunidades; no admite UOM fraccionaria ni producto
`WEIGH`. Recepción crea la identidad `AVAILABLE` con procedencia exacta. Venta,
apartado, traslado, devolución, conteo, merma y retorno a proveedor cambian identidad
y stock granular/agregado en el mismo `db.batch`.

`serial_numbers` es la proyección actual y `serial_number_events` el historial
append-only. Estados válidos: `AVAILABLE`, `RESERVED`, `SOLD`, `IN_TRANSIT`,
`RETURNED_INSPECTION`, `LOST`, `DAMAGED`, `RETURNED_SUPPLIER`. Una devolución
registra evento `RETURNED` y libera el vínculo de venta, pero solo una disposición
server-side puede volver a `AVAILABLE`.

La caja offline solo vende una serie con lease opaco exclusivo de su terminal. El
lease no se reasigna por timeout: se consume al sincronizar o se libera
explícitamente. Replay, terminal distinta, tenant/branch/location cruzado, serie
duplicada o transición inválida devuelven 422 y abortan el batch completo. El flag
oculta UI/API; nunca desactiva consistencia. `allow_negative_stock` no fabrica una
serie. Auditoría hash-chain: `SERIAL_ASSIGN` y `SERIAL_TRANSITION`.

#### DDL canónico Sprint 39

```sql
ALTER TABLE products ADD COLUMN serial_tracking_mode TEXT NOT NULL DEFAULT 'NONE'
  CHECK (serial_tracking_mode IN ('NONE','REQUIRED'));

CREATE TABLE serial_numbers (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    normalized_serial TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE'
      CHECK (status IN ('AVAILABLE','RESERVED','SOLD','IN_TRANSIT',
                        'RETURNED_INSPECTION','LOST','DAMAGED','RETURNED_SUPPLIER')),
    purchase_receipt_line_id TEXT,
    current_sale_item_id TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, normalized_serial),
    UNIQUE (tenant_id, branch_id, location_id, product_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id, location_id)
      REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, purchase_receipt_line_id)
      REFERENCES purchase_receipt_lines(tenant_id, id),
    FOREIGN KEY (tenant_id, current_sale_item_id) REFERENCES sale_items(tenant_id, id)
);

CREATE TABLE serial_number_events (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    serial_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT,
    actor_user_id TEXT,
    idempotency_key TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, serial_id) REFERENCES serial_numbers(tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, actor_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE serial_terminal_leases (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    serial_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE','CONSUMED','RELEASED','REVOKED')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at DATETIME,
    released_at DATETIME,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, serial_id),
    UNIQUE (tenant_id, token_hash),
    FOREIGN KEY (tenant_id, serial_id) REFERENCES serial_numbers(tenant_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id)
);

CREATE TABLE serial_manifests (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    serial_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    operation_line_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, operation_type, operation_id, serial_id),
    FOREIGN KEY (tenant_id, serial_id) REFERENCES serial_numbers(tenant_id, id)
);

CREATE INDEX idx_serial_numbers_lookup
  ON serial_numbers(tenant_id, normalized_serial);
CREATE INDEX idx_serial_numbers_stock
  ON serial_numbers(tenant_id, branch_id, location_id, product_id, status);
CREATE INDEX idx_serial_events_history
  ON serial_number_events(tenant_id, serial_id, created_at, id);
```

El down de 0032 es fail-closed: aborta si hay leases activos, estados distintos de
`AVAILABLE` o si el conteo de series físicas no concilia exactamente contra el stock
serializado por ubicación. Nunca colapsa identidades con drift.
