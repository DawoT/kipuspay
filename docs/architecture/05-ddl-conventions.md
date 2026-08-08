---
doc_id: arch-05-ddl-conventions
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5"
---

## **5. Esquema DDL SQL Desacoplado, Multi-Branch, Full Economic Ledger & Tax Engine (v8.0)**

### **5.0 Representación de dinero (convención obligatoria, v8.1)**

**Todo monto se almacena como INTEGER en centavos** (sufijo `_cents`) — nunca `REAL`/float. Motivo: la "Financial ACID Guarantee" es falsa con coma flotante (`0.1+0.2`, redondeo IGV/SUNAT inestable). Reglas:

1. **Columnas monetarias = `INTEGER` cents:** `price_cents`, `cost_cents`, `unit_price_cents`, `unit_cost_cents`, `total_*_cents`, `subtotal_cents`, `igv_/icbper_amount_cents`, `discount_amount_cents`, `amount_cents`, `original_amount_cents`, `balance_due_cents`, `credit_limit_cents`, `opening_/closing_balance_cents`, `denomination_cents`, `flat_fee_amount_cents`, `max_amount_without_auth_cents`, etc. Las columnas `REAL` restantes son **ratios/cantidades**: `rate_percentage`, `exchange_rate`, `rate`, `stock`, `quantity`, `points_balance`, `quantity_delta`, `qty_*`.
2. **Redondeo de centavo en servidor** (`Math.round`), nunca `toFixed` del cliente; el cliente envía/recibe centavos y la UI los formatea a S/ solo para display.
3. **Tolerancias explícitas** (vuelto, conciliación de pagos) definidas por el servidor; nunca comparaciones `==` de flotantes.
4. **Conversión S/ ↔ centavos** ocurre **una sola vez** en el límite de entrada/salida (payload → D1 y D1 → reporte), nunca en el motor de cálculo.

### 5.0.0 Representación de cantidades físicas (ADR-0015)

Toda cantidad física canónica se almacena como `INTEGER *_microunits`, con
`QUANTITY_SCALE = 1_000_000` microunidades por unidad base. Factores UOM son
racionales (`factor_numerator/factor_denominator`), nunca `REAL`; la conversión
se hace half-up en servidor y rechaza overflow fuera de safe integer. `REAL`
queda permitido para ratios no monetarios, pero no como fuente de verdad de
stock, venta, lote, BOM, conteo, transferencia, recepción, devolución o rollup.

### 5.0.1 Invariante de aislamiento tenant (DAT-12)

Toda FK entre tablas tenant-owned debe incluir `(tenant_id, parent_id)` y apuntar a
una clave única equivalente `(tenant_id, id)`. Las FKs simples por UUID quedan
prohibidas porque permiten referencias cruzadas entre tenants si un ID se filtra.
El CI de migraciones debe revisar que cada tabla con `tenant_id` cumpla esta regla;
las tablas críticas ya aplican el patrón en `sales`, `customers`, `users`,
`payment_methods`, `sale_items`, `sale_payments`, `accounts_receivable` y
`payment_captures`. Toda tabla nueva debe incluir la misma pareja y su índice único.

**`tenant_id` siempre `NOT NULL` (verificado por V-05).** En SQLite una columna
`TEXT PRIMARY KEY` **admite `NULL`** si no se declara `NOT NULL` (solo `INTEGER
PRIMARY KEY` y las tablas `WITHOUT ROWID` lo implican), así que la declaración es
obligatoria incluso cuando `tenant_id` es la clave primaria.

**FK a `tenants`: no obligatoria, y a propósito.** `tenants` es catálogo (lleva
`shard_id`) y D1 valida integridad referencial en cada inserción: exigir la FK a
`tenants` en cada tabla del hot path cobraría validación por venta sin añadir
aislamiento — el aislamiento lo dan `tenant_id NOT NULL`, el `WHERE` forzado desde
el JWT (§3) y las claves compuestas de arriba. Las tablas de configuración y
ecosistema sí la declaran porque su escritura es infrecuente.

**Deuda legada congelada (ratchet, verificado por V-14).** Las FKs simples hacia
tablas tenant-owned que ya existen en el DDL v8.0 están inventariadas en
`scripts/checks/fk_composite_baseline.txt`: el gate **falla si el número crece**,
de modo que toda tabla nueva nace compuesta y el burn-down del legado se hace por
sprint con entrada de Ledger, nunca en silencio.

