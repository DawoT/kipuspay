---
doc_id: arch-05-8-catalog-price-labels
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.8"
---

### **5.8 Etiquetas de precio, snapshots y transporte de impresión**

#### Regla 26 — Etiquetas de precio/estantería (`catalog.price_labels`, ADR-0025)

Una solicitud contiene una lista explícita y ordenada de `product_id`. Puede indicar
un `price_list_id`; si lo omite, el servidor resuelve la lista default vigente de la
sucursal autenticada. No existe contexto de cliente, segmento, promoción ni precio
manual en esta capability. Tenant, actor y sucursal proceden de identidad verificada;
`tenant_id`, `price_cents`, nombre, barcode, template o lista enviados como snapshots
por el cliente se ignoran o rechazan. Producto, lista y plantilla de otro tenant o
sucursal fallan cerrados.

El servidor resuelve todos los productos y precios en una lectura coherente, crea un
batch con `db.batch([...])` y persiste por ítem nombre, barcode, precio en centavos,
lista efectiva y versión de plantilla. `snapshot_hash` es SHA-256 sobre la
serialización canónica ordenada de esos snapshots. Esos campos son inmutables y
autoritativos: cambiar el catálogo mientras se imprime no puede producir un lote
híbrido.

Un retry técnico conserva el mismo `batch_id`, bytes y snapshots. Una **reimpresión
explícita** crea otro batch, vuelve a resolver catálogo/precio/plantilla vigentes,
enlaza `reprint_of_batch_id` y registra `audit_events.action =
'PRICE_LABEL_REPRINT'`; por tanto puede reflejar un precio nuevo. Cada etiqueta tiene
ACK independiente; un lote puede quedar `PARTIAL` y el retry solo envía ítems no
confirmados. La idempotencia está scoped por `tenant_id + branch_id +
idempotency_key`.

##### Plantilla y barcode

`template_json` usa un DSL versionado, declarativo y allowlisted. Versión inicial
`PRICE_LABEL_V1`: bloques `TEXT`, `PRICE`, `BARCODE`, `SPACER`; campos
`product_name`, `price`, `barcode`; alineación `LEFT|CENTER|RIGHT`; sin HTML, script,
URL, expresiones, acceso a red ni propiedades arbitrarias. Una versión o nodo no
allowlisted se rechaza. La plantilla es append-only por `template_key + version`; una
edición crea versión nueva.

Los anchos admitidos son exactamente 58 y 80 mm y producen bytes deterministas desde
el snapshot. El encoder barcode es zero-dependency y valida antes de renderizar:

- `EAN8`: exactamente 8 dígitos y checksum GS1 válido.
- `EAN13`: exactamente 13 dígitos y checksum GS1 válido.
- `CODE128`: ASCII imprimible, 1–80 caracteres; el encoder calcula checksum módulo
  103 y no acepta controles.

##### Outbox, transportes y degradación

Las etiquetas usan una outbox **genérica y no bloqueante para caja**, separada de la
venta y de `close Z`. Sobrevive F5 en IndexedDB, conserva payload/bytes por ítem,
alerta al 80% de cuota y ante `QuotaExceededError` falla la impresión sin borrar
trabajo ni impedir cobrar/cerrar caja. Offline solo permite reintentar batches ya
materializados; crear o reimprimir exige conexión porque el precio es server-side.

`PrinterTransport` para Sprint 41 admite WebUSB y WSS:

- WebUSB ejecuta `open → selectConfiguration → claimInterface → transferOut`; en ACK,
  error o timeout libera interface y cierra el dispositivo en `finally`.
- WSS acepta únicamente `wss:` y hosts previamente paired/allowlisted. Requiere ACK
  por ítem, timeout acotado, cierre y reconnect explícito; jamás degrada a `ws:`.

La capability `FEATURE_CATALOG_PRICE_LABELS` y su equivalente público están
default-off. RBAC: owner/admin configuran plantillas; owner/admin/supervisor crean o
reimprimen; cashier no configura ni reimprime. Un error de etiqueta, transporte,
outbox o cuota nunca bloquea una venta ni el cierre Z.

#### DDL canónico objetivo Sprint 41

Este DDL es contrato de la futura migración 0034. Documentarlo no instala la
migración, no activa flags y no cierra Sprint 41.

```sql
CREATE TABLE price_label_templates (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    template_key TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    name TEXT NOT NULL,
    dsl_version TEXT NOT NULL CHECK (dsl_version IN ('PRICE_LABEL_V1')),
    template_json TEXT NOT NULL,
    paper_width_mm INTEGER NOT NULL CHECK (paper_width_mm IN (58, 80)),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, template_key, version),
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE price_label_batches (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    price_list_id TEXT NOT NULL,
    reprint_of_batch_id TEXT,
    idempotency_key TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','PRINTING','PARTIAL','ACKED','FAILED')),
    requested_by_user_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, branch_id, idempotency_key),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, template_id) REFERENCES price_label_templates(tenant_id, id),
    FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_lists(tenant_id, id),
    FOREIGN KEY (tenant_id, reprint_of_batch_id) REFERENCES price_label_batches(tenant_id, id),
    FOREIGN KEY (tenant_id, requested_by_user_id) REFERENCES users(tenant_id, id)
);

CREATE TABLE price_label_items (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    product_name_snapshot TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    barcode_type TEXT NOT NULL CHECK (barcode_type IN ('EAN8','EAN13','CODE128')),
    barcode_value_snapshot TEXT NOT NULL,
    template_version INTEGER NOT NULL CHECK (template_version > 0),
    rendered_payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','ACKED','FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    acknowledged_at DATETIME,
    last_error_code TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, batch_id, ordinal),
    FOREIGN KEY (tenant_id, batch_id) REFERENCES price_label_batches(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE INDEX idx_price_label_batches_status
  ON price_label_batches(tenant_id, branch_id, status, created_at);
CREATE INDEX idx_price_label_items_pending
  ON price_label_items(tenant_id, batch_id, status, ordinal);

CREATE TRIGGER price_label_batches_snapshot_no_update
BEFORE UPDATE OF branch_id, template_id, price_list_id, reprint_of_batch_id,
  idempotency_key, snapshot_hash ON price_label_batches
BEGIN
  SELECT RAISE(ABORT, 'PRICE_LABEL_BATCH_SNAPSHOT_IMMUTABLE');
END;

CREATE TRIGGER price_label_items_snapshot_no_update
BEFORE UPDATE OF batch_id, product_id, ordinal, product_name_snapshot, price_cents,
  barcode_type, barcode_value_snapshot, template_version, rendered_payload_hash
  ON price_label_items
BEGIN
  SELECT RAISE(ABORT, 'PRICE_LABEL_ITEM_SNAPSHOT_IMMUTABLE');
END;
```

La migración down 0034 debe ser protegida: aborta si existe cualquier batch, item o
versión de plantilla no bootstrap; solo entonces elimina triggers, índices y tablas
en orden hijo→padre y retira `schema_meta`. No se permite pérdida silenciosa de
snapshots ni auditoría de reimpresión.
