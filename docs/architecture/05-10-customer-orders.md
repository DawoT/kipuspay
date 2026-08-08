---
doc_id: arch-05-10-customer-orders
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.10"
---

### **5.10 Pedidos de cliente, reserva y cumplimiento**

#### Regla 28 — Pedido de cliente con retiro (`orders.customer_orders`, ADR-0027)

Sprint 43 publica únicamente este contrato y sus tests RED. La capability permanece
default-off; no se crea la migración 0036, módulos de producción, rutas, UI ni chaos
ejecutable en este baseline, y no se cierra el sprint ni se habilita un claim.

Un **pedido de cliente** reserva inventario para retiro futuro y no captura pago ni
crea venta, CPE, outbox fiscal, cuenta por cobrar o consumo de cupo al crearse. Es
distinto de:

- `orders.lifecycle`: comanda operativa de food service, sin este contrato de reserva;
- `sales.quotes`: cotización que congela precio, pero no reserva inventario;
- `sales.layaway`: apartado que sí registra pagos/anticipos antes de convertir;
- venta ordinaria: checkout inmediato, online u offline, que nunca requiere un pedido.

La política “tenant requiere pedido” solo puede aplicar al flujo explícito de
**retiro de pedido**. Nunca intercepta ni bloquea el checkout ordinario, la venta
offline, el cobro, la impresión ni la reconciliación normal.

##### Estado, cantidades y snapshot

Estados cerrados: `OPEN`, `PARTIAL`, `FULFILLED`, `CANCELLED`, `EXPIRED`. Todo pedido
terminal fija `closed_at`; `FULFILLED` implica remanente reservado cero y todos los
ítems cumplidos; `CANCELLED`/`EXPIRED` liberan únicamente el remanente. Las cantidades
son `INTEGER *_microunits` (§5.0.0). Para cada ítem se conserva exactamente:

`requested = fulfilled + released + reserved`

La igualdad se valida en cada escritura; ningún componente puede ser negativo. El
snapshot inmutable incluye UOM, factor racional y `unit_price_cents`, además de
producto, lote, ubicación y serie cuando aplican. Una serie representa exactamente
una unidad base. Los movimientos respetan FEFO/lote, ubicación, serie y UOM sin
degradar trazabilidad.

Mientras el pedido esté vigente, el snapshot de precio **siempre gana** frente a la
lista actual. Si ya expiró, primero se registra intención de aviso y se libera el
remanente; solo después puede iniciarse una venta ordinaria nueva con pricing actual.
Esa recotización requiere autorización de supervisor acotada a pedido, venta,
tenant y diferencia, y deja auditoría encadenada. El cliente nunca envía un precio
autoritativo.

##### Contrato ACID D1

Cada transición usa un único `db.batch([...])` con guard/versionado e idempotencia:

1. **Crear:** valida tenant/sucursal/cliente/actor, precio y asignaciones; reserva
   stock agregado y granular (lote/ubicación/serie), inserta pedido e ítems con
   snapshot y auditoría `CUSTOMER_ORDER_CREATED`. Cualquier fallo revierte todo.
2. **Cumplir:** bloquea lógicamente pedido e ítems, consume un lease válido, crea
   `sales`, `sale_items`, pagos del checkout, CPE/outbox y auditoría, mueve
   `reserved → fulfilled` y actualiza estado en el mismo batch. El stock ya fue
   descontado al reservar: cumplir **no lo descuenta por segunda vez**. Cada venta
   parcial queda como fulfillment independiente; una venta puede cubrir varios ítems.
3. **Cancelar/expirar:** compite mediante el mismo guard/versionado contra fulfill.
   Mueve solo `reserved → released`, devuelve exactamente ese remanente a las mismas
   dimensiones de inventario, cierra el pedido y audita. Un ganador idempotente deja
   al perdedor sin efectos; no hay doble venta ni doble liberación.

Crear produce exactamente cero filas de venta, pago, CPE y outbox fiscal. Fulfill
repetido con la misma idempotency key devuelve el mismo resultado; con otra key sobre
cantidad agotada falla cerrado. Toda referencia usa tenant derivado del JWT y FKs
compuestas DAT-12; IDs cross-tenant responden 404 opaco y no mutan nada.

##### Aviso antes de expiración

Antes de una liberación automática por expiración debe existir en D1 una intención
durable `EXPIRY_WARNING`, con auditoría encadenada e idempotency key. No se exige que
un transporte externo confirme entrega:

- si `messaging.whatsapp_receipt` está habilitada y existe opt-in vigente, se intenta
  WhatsApp con el adapter ya existente;
- en otro caso se crea aviso operacional `IN_APP` para seguimiento del personal;
- Web Push no es garantía de Sprint 43: `mobile.push` solo se garantiza en Sprint 45.

Timeout, rechazo o indisponibilidad de transporte pasa la intención a `RETRY` o
`ESCALATED`, incrementa un contador observable y conserva `next_attempt_at`; nunca
bloquea checkout ni retiene indefinidamente una reserva vencida. El release puede
continuar después de persistir la intención/auditoría. Replays del mismo evento no
duplican mensajes, liberaciones ni auditoría de negocio.

##### Fulfillment offline: lease y envelope

El servidor puede acuñar un lease/envelope firmado y opaco con `tenant_id`,
`customer_order_id`, `customer_order_item_id`, `branch_id`, `terminal_id`, cantidad
máxima, scope `CUSTOMER_ORDER_FULFILL`, nonce y expiración. TTL es corto y acotado por
`reserved_until`; el token es one-shot e idempotente y solo se persiste su hash.

El cliente no aporta tenant, precio, estado ni autoridad de stock. Al reconciliar,
el servidor verifica firma, scope, terminal, sucursal, TTL, nonce, versión y remanente,
y aplica el snapshot vigente autoritativo. Replay devuelve el resultado previo;
envelope expirado, ajeno o sobreconsumido no muta el pedido. Si el fulfillment de
pedido falla, la venta ordinaria/offline continúa por su contrato normal; nunca se
descarta una venta aceptada para preservar una reserva.

##### DDL objetivo — migración `0036_sprint43_customer_orders.sql`

Este es el target canónico para la implementación GREEN futura. La migración y su
down todavía no existen en Sprint 43 RED.

```sql
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
    CHECK (
      requested_quantity_microunits =
      fulfilled_quantity_microunits +
      released_quantity_microunits +
      reserved_quantity_microunits
    ),
    CHECK (
      serial_id IS NULL OR
      requested_quantity_microunits = 1000000
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
    FOREIGN KEY (tenant_id, serial_id) REFERENCES serial_numbers(tenant_id, id)
);

CREATE TABLE customer_order_fulfillments (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_order_id TEXT NOT NULL,
    customer_order_item_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'LEASED'
      CHECK (status IN ('LEASED','CONSUMED','REJECTED','EXPIRED')),
    quantity_microunits INTEGER NOT NULL CHECK (quantity_microunits > 0),
    envelope_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
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
    UNIQUE (tenant_id, envelope_id),
    UNIQUE (tenant_id, token_hash),
    UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, branch_id, customer_order_id)
      REFERENCES customer_orders(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, customer_order_id, customer_order_item_id)
      REFERENCES customer_order_items(tenant_id, customer_order_id, id),
    FOREIGN KEY (tenant_id, terminal_id) REFERENCES pos_terminals(tenant_id, id),
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
      CHECK (status IN ('PENDING','DELIVERED','RETRY','ESCALATED','FAILED')),
    idempotency_key TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at DATETIME,
    delivered_at DATETIME,
    last_error_code TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
      (status = 'DELIVERED' AND delivered_at IS NOT NULL) OR
      (status <> 'DELIVERED' AND delivered_at IS NULL)
    ),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    UNIQUE (tenant_id, customer_order_id, event_type, channel),
    FOREIGN KEY (tenant_id, branch_id, customer_order_id)
      REFERENCES customer_orders(tenant_id, branch_id, id)
);

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

INSERT INTO schema_meta(key, value)
VALUES ('orders.customer_orders.sprint43', '1');
```

El down objetivo es **protegido**: antes de `DROP`, inserta un guard que aborta si
existe cualquier pedido, ítem, fulfillment o notificación, y elimina tablas en orden
hijo→padre. Nunca borra datos para facilitar rollback.

##### Evidencia contractual RED

Los contratos RED cubren dominio de ventas; schema/migración 0036; ciclo atómico y
workerd; rutas Worker, capability y RBAC; cliente/UI/cola offline; y chaos determinista
de 500 ciclos. Deben incluir cross-tenant, doble fulfill, fulfill concurrente contra
cancel/expire, parciales, lote/ubicación/serie/UOM, drift de precio y autorización,
duplicado/fallo de aviso, replay offline, cadena de auditoría, cero CPE/pago al crear
y cero bloqueo de checkout. Su fallo esperado es ausencia explícita de módulos,
migración, rutas y UI; no error de sintaxis.
