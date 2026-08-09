---
doc_id: arch-05-11-recurring-sales
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.11"
---

### **5.11 Ventas recurrentes y membresías**

#### Regla 29 — Membresía de cliente (`sales.recurring`, ADR-0028)

Sprint 44 tiene software GREEN local condicionado: migración 0037, dominio, settlement
atómico D1, scheduler, rutas Admin, RPC privado, UI, E2E local y chaos ejecutable. La
capability permanece default-off y el claim GTM-25/rollout siguen NO-GO por falta de
cron/staging/canary Cloudflare real y firmas humanas independientes QA+PM A+V. La
evidencia y los residuales están en `docs/ops/s44-recurring-sales-qg.md`.

Una **membresía de cliente** es una instrucción del tenant para generar, por cada
período de servicio, una venta ordinaria con su NV/CPE y una única cuenta por cobrar.
No es:

- la suscripción SaaS que el tenant paga a KipusPay, administrada por billing;
- `sales.installments`, que divide una CxC ya creada en cuotas;
- `sales.layaway`, que recibe anticipos y reserva stock antes de una venta;
- `orders.customer_orders`, que reserva para retiro sin venta ni CPE al crear;
- un mandato de pago: Sprint 44 no guarda tarjeta, token ni credencial y no autocobra.

El cliente de POS/Admin envía IDs, cantidades, frecuencia y la política elegida, pero
nunca precio, impuesto, total, saldo, correlativo ni estado fiscal autoritativo.

##### Precio por versión

Cada versión del plan elige exactamente una política:

- `FIXED` (**default**): al crear o editar, el servidor resuelve catálogo, lista,
  UOM, impuestos y `unit_price_cents`, y guarda ese snapshot en la nueva versión.
  Todas sus ocurrencias usan ese snapshot.
- `CURRENT`: la versión conserva producto/UOM/cantidad, pero el servidor resuelve el
  precio vigente al ejecutar cada período.

Editar no reescribe historia: crea una versión nueva, deja la anterior inmutable y
programa la nueva desde el siguiente límite de período. Cada ocurrencia conserva
líneas aplicadas normalizadas con precio, UOM, cantidad, impuesto y total; por ello un
cambio posterior de catálogo nunca altera una venta histórica. Para ambas políticas,
los montos se calculan y validan exclusivamente en servidor.

##### Calendario civil de Lima

La zona contractual es `America/Lima`. Los períodos son semiabiertos
`[period_start, period_end)`: un instante pertenece a uno solo. El scheduler convierte
a UTC solo en el borde de persistencia/transporte y deriva fechas fiscales desde la
fecha civil de Lima.

- `DAILY`: siguiente límite = mismo horario civil del día siguiente.
- `WEEKLY`: siguiente límite = siete días civiles después.
- `MONTHLY`: conserva `anchor_day` original. Si ese día no existe, usa el último día
  del mes sin cambiar el ancla; un plan del 31 produce 28/29 en febrero y vuelve al 31.
  `anchor_is_last_day` conserva explícitamente la intención “último día”.

`next_run_at` se deriva solo de la versión, su período previo y esas reglas: nunca de
la hora de finalización del cron. El catch-up procesa períodos vencidos en orden con
un límite positivo configurado por ejecución; alcanzar el límite deja el siguiente
período pendiente. La clave física `UNIQUE (tenant_id, plan_id, period_start)` impide
duplicados aunque dos schedulers, un replay o un lease expirado compitan.

##### Liquidación, deuda y gracia

Una ocurrencia exitosa crea en **un solo `db.batch([...])`**:

1. guardas de lease, versión, período, stock, serie y precio;
2. `sales` y `sale_items` normales;
3. exactamente una `accounts_receivable` por el total completo;
4. `fiscal_outbox` para `01`/`03` (NV usa el pipeline normal sin outbox);
5. `usage_events`/contador por el documento emitido;
6. stock y movimientos solo para productos físicos; servicios no tocan stock;
7. ocurrencia, líneas aplicadas, `next_run_at` y auditoría `RECURRING_*`.

No se crea captura de tarjeta ni autocobro. Un fallo en cualquier sentencia revierte
todo, no avanza `next_run_at` y deja el período reintentable. Stock insuficiente en un
ítem físico produce retry opaco sin venta, CPE, CxC, consumo ni descuento parcial.

La mora de esa CxC entra a `GRACE` durante `grace_days` configurados en la versión.
Nunca bloquea checkout ordinario, venta offline, caja, impresión, emisión fiscal ni
reconciliación. Después de la gracia, una política explícita
`PAUSE_FUTURE_EXECUTION` puede pausar **solo futuras ejecuciones de esa membresía**;
`CONTINUE` sigue ejecutándolas. La pausa no cambia la capability del tenant ni el
billing SaaS de KipusPay, y jamás intercepta ventas ordinarias.

##### Lease, retry e idempotencia

El cron reclama planes vencidos con compare-and-swap de `version`, lease opaco con
TTL acotado y scope tenant+plan+versión. El token crudo no se persiste. El claim no
crea la venta; el settlement verifica lease vigente y compila una sola lista de
statements para `db.batch`. Dos crons pueden leer el mismo candidato, pero solo uno
obtiene el claim y la unicidad de período es la segunda barrera.

Los fallos guardan únicamente `last_error_code` opaco, incrementan `retry_count` y
calculan `next_retry_at` con backoff determinista y acotado. No exponen SQL, stock,
PII ni detalles internos. El fallo no salta períodos ni mueve el calendario. Un retry
exitoso limpia el estado operacional y deriva el siguiente límite desde
`period_end`, no desde “ahora”.

##### Cancelación y prorrateo

`AT_PERIOD_END` conserva el período ya vendido, no emite crédito y evita nuevas
ocurrencias desde su límite. `IMMEDIATE` cancela futuras ejecuciones y, si existe una
ocurrencia del período activo, acredita **días civiles completos no usados**. El día
de cancelación ya iniciado se considera consumido; no se acreditan horas.

Para una línea no negativa:

`numerator = line_total_cents × unused_service_days`

`credit_cents = floor((2 × numerator + service_days) / (2 × service_days))`

La fórmula es racional entera half-up, usa safe integers y se aplica por línea antes
de sumar. El ajuste guarda días, numerador, denominador y monto aplicado. Nunca muta
la venta original: invoca el motor normal de devoluciones para crear `07` cuando el
origen es CPE o `NV_RETURN` cuando es NV, con su fiscalidad, CxC, cupo y auditoría
habituales. Replay de cancelación devuelve el mismo ajuste/documento.

##### DDL implementado — migración `0037_sprint44_recurring_sales.sql`

La migración, su down protegido, el registry KPBK1 y los triggers de epoch forman
parte de la implementación GREEN local condicionada de Sprint 44.

```sql
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
    anchor_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
      CHECK (status IN ('ACTIVE','PAUSED','CANCEL_AT_PERIOD_END','CANCELLED')),
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
    CHECK (effective_until IS NULL OR effective_until > effective_from)
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
    FOREIGN KEY (tenant_id, occurrence_id)
      REFERENCES recurring_occurrences(tenant_id, id),
    FOREIGN KEY (tenant_id, plan_item_id)
      REFERENCES recurring_plan_items(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_item_id) REFERENCES sale_items(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, product_uom_id) REFERENCES product_uoms(tenant_id, id)
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
    FOREIGN KEY (tenant_id, adjustment_sale_id) REFERENCES sales(tenant_id, id)
);

CREATE INDEX idx_recurring_plans_due
    ON recurring_plans(status, next_retry_at, next_run_at, tenant_id);
CREATE INDEX idx_recurring_plans_lease
    ON recurring_plans(lease_expires_at, tenant_id);
CREATE INDEX idx_recurring_occurrences_plan_period
    ON recurring_occurrences(tenant_id, plan_id, period_start, period_end);
CREATE INDEX idx_recurring_proration_original
    ON recurring_proration_adjustments(tenant_id, original_sale_id);
```

El down de 0037 debe abortar con `RECURRING_SALES_DOWN_PROTECTED` si cualquiera de
las cinco tablas contiene filas, y solo después eliminar en orden hijo→padre. Las
cinco tablas se clasifican `BUSINESS` en el registry KPBK1 generado. Cada mutación
autoritativa incrementa `tenant_data_epochs` mediante triggers de la migración para
que un backup snapshot no mezcle épocas.

##### Contratos RED→GREEN de Sprint 44

Los tests RED fallaron por módulos/migración ausentes, no por sintaxis, y GREEN cubre:

- dominio temporal Lima, anclas, FIXED/CURRENT, safe integer, gracia y prorrateo;
- schema/workerd DAT-12, down protegido, registry/epoch, leases y concurrencia;
- un batch indivisible de venta/ítems/CxC/fiscal/cupo/stock/ocurrencia/next-run/audit;
- scheduled handler sin endpoint público, capability fail-closed y RBAC Admin/Owner;
- cliente/Admin sin autoridad monetaria ni campos de tarjeta y checkout independiente;
- chaos determinista de 500 ciclos con cero duplicados, omisiones o commits parciales.
