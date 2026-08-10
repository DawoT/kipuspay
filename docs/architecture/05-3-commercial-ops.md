---
doc_id: arch-05-3-commercial-ops
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "5.3"
---

### **5.3 Operación comercial (KipusPay v8.1) — Zero-Trust de caja, inventario y comandas**

Extiende el DDL base con entidades de operación. Implementación por sprints Roadmap FASE 6 (17–20). **No sustituye** el pipeline fiscal §5.2.

> **Delimitación de §5.3:** la **prosa normativa** (reglas 1–12 Zero-Trust + reglas FASE 6B–6G 13–37) y el **DDL**, salvo contratos extraídos explícitamente a capítulos especializados, viven aquí. No colocar en §5.3: reglas fiscales/SUNAT (§5.1–5.2), ecosistema Perú (§5.4), client-side/sync (§6–7) ni backlog v10 (Roadmap FASE 7). Si una regla pertenece a otra sección, se referencia por `§`, nunca se re-escribe.

#### Reglas Zero-Trust de negocio

1. **Precios:** el cliente nunca impone `unit_price_cents`; el servidor resuelve lista (branch → customer → default) y recalcula IGV/ICBPER.
2. **Descuentos:** si % o monto supera umbral del tenant → requiere `authorization_token` de supervisor/Dueño; siempre `audit_events`. **Mecánica del token (SEC-09):** el `authorization_token` es un JWT o UUID hasheado emitido server-side tras verificar el **PIN del supervisor** (argon2id + rate limit 5 fallos/15 min), con **TTL 90 s** y **un solo uso**; se guarda como `authorization_token_hash` en `audit_events.payload_json` (y en `sale_items`/`cash_register_cash_movements` cuando aplica). El motor §6 rechaza (422 `AUTH_TOKEN_REQUIRED`/`AUTH_TOKEN_INVALID`) cualquier descuento, precio manual, monto de merma o cierre sobre umbral sin token válido. Nunca se verifica client-side.
3. **Crédito:** `payment_method = credit` ⇒ `saldo_cxc + venta ≤ credit_limit_cents` salvo override auditado.
4. **FEFO (`inventory.batches`):** productos con lotes: descontar batch con `expiry_date` más próxima y `quantity_available > 0`; lote vencido = 422.
5. **Kits (`inventory.bom`):** explosión BOM atómica; fallo de un componente = rollback de toda la venta.
6. **Arqueo Z ciego (`cash.blind_z`):** en cierre, el cajero no recibe `expected_cash` hasta confirmar conteo; diferencia documentada. **Gate de impresión (edge 2D):** antes de iniciar el flujo de cierre Z, el POS consulta la **print outbox** (IndexedDB, Sprint 25); si hay tickets en `PENDING`/`FAILED`, muestra un **modal bloqueante** — *"Tienes N comprobantes sin imprimir. Resuélvelos o cancélalos antes de arquear la caja"* — y **no permite** avanzar hasta resolverlos o cancelarlos (reimprimir en caja, o cancelar con motivo que se audita como `REPRINT`); se evita cerrar el turno con boletas "huérfanas" de impresión.
7. **Órdenes (`orders.*`):** si el tenant tiene capability `orders.lifecycle`, el stock de ítems físicos sigue la política configurable del tenant (`reserve_on_fired` | `deduct_on_sale`); **default:** descontar al convertir order_item → `sale`. Sin `switch(vertical)` (ADR-ARCH-002).
8. **Transferencias (`stock.transfers`):** suma (destino recibido + merma) = cantidad enviada; estados monotónicos.
9. **Costo promedio ponderado — PMP (`inventory.pmp`):** el COGS no se configura a mano. Al recibir una compra/ajuste en un branch se recomputa el costo promedio del `(product, branch)` en la **misma tx** (`avg = valor_inventario_cents / stock`); la venta usa el PMP vigente como snapshot `unit_cost_cents` en `sale_items`; una NC/devolución restaura stock y **revierte el efecto de costo**; el invariante `refresh_avg_cost(product_id, branch_id)` se ejecuta en recepción, transferencia, ajuste y merma. **Invariante forward-only:** el COGS de una venta cerrada es su snapshot `unit_cost_cents` **inmutable**; ningún evento posterior (compra, devolución, ajuste) recalcula ventas pasadas. El PMP solo se ajusta para transacciones futuras; los rollups y reportes ya generados (§9) jamás se recalculan ni reescriben — **excepción única (PERF-11, edge D §9):** ante un sync offline tardío que mueve `issued_at_lima` de un día cerrado, SOLO se re-materializan las filas `(tenant, branch, report_date)` de **días anteriores y cerrados**, recomputadas desde `sale_items`/`inventory_movements` (snapshots), **sin tocar** PMP ni `forecast_outputs`; si un reporte se regenera, lo hace con los snapshots históricos, nunca con el PMP vigente.
10. **Conteo físico y merma (`inventory.counts`, `inventory.losses`):** el inventario se controla por conteo ciego (el cajero no ve el stock esperado por línea) → diferencias → `AJUSTE` con motivo + authz si `|diff|` supera umbral; **merma** (dañado/caducado/sospecha de hurto) es append-only con evidencia foto (R2) y aprobación; nunca se edita un conteo ya aprobado.
11. **Movimientos de caja no-venta (`cash.cash_movements`):** todo flujo de efectivo que no es una venta (envío de valores, fondo para cambio, pago a proveedor, ajuste) se registra en `cash_register_cash_movements` con `authorized_by` si supera umbral. **Fórmula de arqueo:** `expected_cash = opening_balance_cents + Σ ventas efectivo + Σ ingresos − Σ retiros − Σ egresos`; el Z ciego concilia contra `cash_count_lines` y documenta la diferencia. **Desglose por operador (edge de integración, FASE 6G):** como el handoff (R35) transfiere una sesión `OPEN` con conteo intermedio opcional, el reporte Z impreso y el Modo Dueño **desglosan la diferencia total del día por tramo de `cash_register_shifts`** (cada `SHIFT_TRANSFER` con su `cash_diff_cents` e `interim_count_cents`), de modo que `Σ tramos + diferencia del tramo final = diferencia total del cierre`; si faltan S/ 50 en todo el día, el dueño ve si faltaron en el turno de la mañana (registrado en el `SHIFT_TRANSFER`) o en el de la noche, sin culpar al cajero incorrecto.
12. **Reimpresión y auditoría de config (`audit.reprints`, `audit.config`):** reimprimir un comprobante es un acto fiscal → `sale_reprints` con sello **"COPIA"**; todo cambio sensible (precio, producto, permiso, formalización, PMP) genera `audit_events`. Ningún rol reimprime sin dejar rastro.
13. **Devoluciones con política N días (`sales.returns`, FASE 6B):** ventana configurable por tenant (días, por método de pago/categoría); unidad mínima = `sale_item` con su `batch_id`; genera **NC fiscal (07)** en electrónico o **NV_RETURN** en control interno; **revierte el efecto PMP** del `unit_cost_cents` snapshot del item original (reusa `refresh_avg_cost`); vuelto por el mismo método si aplica, asentado en `cash_register_cash_movements`; devolución de turno cerrado o sobre umbral requiere authz (regla 2). La NC no reembolsa el cupo del doc original (§4.1). **Excepción de línea genérica (edge de integración, FASE 6G):** si `sale_item.is_uncatalogued = TRUE` (venta rápida, R34), la devolución genera la NC/NV_RETURN y el vuelto según método, pero **omite** la restauración de stock y `refresh_avg_cost` — la línea **nunca descontó stock** (`unit_cost_cents = 0`, sin `batch_id`); re-materializar el rollup (§9) refleja solo el efecto monetario. El flag viaja en el ítem devuelto (`audit_events` `RETURN` con `is_uncatalogued` en payload) para que el contador no confunda un inventario "positivo fantasma". **Compensación de CxC (edge E-D):** si la venta original tenía saldo pendiente (`accounts_receivable.balance_due_cents > 0`, regla 21), la NC/NV_RETURN reduce ese saldo en la **misma tx** por el monto acreditado (total o prorrateado); vuelto ya cobrado se entrega por método del último abono/efectivo o se convierte en crédito de tienda (regla 20); nunca se ajusta CxC en silencio (`audit_events`).
14. **Proveedores 3-way (`purchasing.three_way`, FASE 6B):** la compra (factura de proveedor) se liga a su OC y recepción; el **matching 3-way** exige cantidad OC = recepción = factura y precio/costo coherentes; diferencia = `422` o `override` autorizado + audit (`SUPPLIER_PRICE_DIFF`); al cerrar se actualiza `inventory_movements` + `refresh_avg_cost` + CxP por lo facturado. Jamás se ajusta CxP en silencio.
15. **Promociones y tramos (`pricing.promotions`, FASE 6B):** 2x1, % fijo, % por umbral de monto/cantidad, precio por tramo; **el precio final lo impone el sale engine** (el cliente envía solo el ID de la promoción); anti-apilamiento configurable; descuento manual sobre umbral → authz (regla 2); promoción sobre producto con lote respeta asignación `batch_id` (regla 4). Crear/editar regla = `audit_events`.
16. **Variantes y unidades de medida (`catalog.variants`, `catalog.uom`, FASE 6B; ADR-0015):** variantes = filas `products` de un solo nivel con `parent_product_id`, stock propio y precio derivado del padre con override; padre con variantes = agrupador no vendible/sin stock. Toda cantidad física canónica usa `INTEGER *_microunits` (`QUANTITY_SCALE=1_000_000`); `product_uoms` convierte por factor racional positivo numerador/denominador y tiene exactamente una base `1/1`. El costo vive por unidad base en producto/PMP (no se duplica por UOM); venta persiste snapshots de UOM/factor/cantidad base; PMP y conteo físico se resuelven por variante/base. 0 stock cruzado entre variantes; conversión half-up server-side con overflow guard (nunca `toFixed`).
17. **Apartados y diario contable (`sales.layaway`, `ledger.chart_of_accounts`, FASE 6B; ADR-0016):** el apartado reserva ítems en microunidades (`sale_deposit_items`) y recibe abonos (`sale_deposit_payments`); **no emite CPE hasta la conversión a venta completa**; cancelación de `OPEN`/`OVERDUE` reembolsa Σ abonos según política (reusa regla 13) **sin** `07`/`NV_RETURN` y libera la reserva (`LAYAWAY_CANCEL`). `chart_of_accounts` + asientos automáticos (`JOURNAL_POST`) desde ventas/cobros/pagos/CxP/CxC/arqueo/apartado/devolución; GL S23 (`1011`/`1212`/`7011`/`4011`) + `2101` anticipos + `2011` CxP; el ledger es **solo lectura** para la UI (el contador lee vía export Cadena, no muta).
18. **Cotizaciones/presupuestos (`sales.quotes`, FASE 6C; ADR-0017):** congela precios server-side (regla 1) con vencimiento; **no emite doc fiscal ni reserva stock**; estados `DRAFT → SENT → APPROVED → CONVERTED | EXPIRED | CANCELLED`; solo `CONVERTED` genera venta (`processOfflineSaleAtomic`, sin `skipStockDeduction`); `audit_events` `QUOTE_*`. **COM-05:** `quote_items.unit_price_cents` snapshot rige al convertir **aunque** la lista cambie; expirada → nueva cotización/pricing + re-aprobación. Cantidades en `INTEGER *_microunits` (DAT-12).
19. **Devolución a proveedor (`purchasing.returns`, FASE 6C; ADR-0018):** NC del proveedor (ref externa, 0 CPE/cupo); `OPEN → CLOSED | CANCELLED`; close revierte stock (`DEVOLUCION_PROVEEDOR`) + PMP outbound + CxP; mismatch = 422 o `SUPPLIER_PRICE_DIFF`; `audit_events` `SUPPLIER_RETURN`. **Forward-only (regla 9).** Microunits DAT-12.
20. **Crédito de tienda / vales / gift cards (`ledger.store_credit`, FASE 6C; ADR-0019):** saldo por cliente (solo servidor); venta de vale = venta (doc+cupo); canje impone `min(balance, due)` (0 monto cliente); NC sin reembolso+consent → ISSUE (0 AR/cash); GL **2102** (no 2101); `audit_events` `STORE_CREDIT_ISSUE`/`STORE_CREDIT_REDEEM`.
21. **Cuotas / pago en partes (`sales.installments`, FASE 6C; ADR-0020):** 1 AR + N cuotas (schedule); Σ principal = saldo; interés COM-06 **no** reduce CxC; pago Zero-Trust + `idempotency_key`; OVERDUE on-read (0 corta caja); `credit_limit` (regla 3); `audit_events` `INSTALLMENT`.
22. **Comisiones de vendedor (`sales.commissions`, FASE 6C; ADR-0021):** rates→accrual por `seller_id` (servidor); NC setea `reversed_at` (COM-07, 0 DELETE); payout Zero-Trust; GL **6311/2111**; **nómina OOS**; `audit_events` `COMMISSION`.
23. **Ubicaciones de inventario (`inventory.locations`, FASE 6D; ADR-0022):** `inventory_location_stock` es fuente granular y `branch_product_stock` agregado compatible (`branch = Σ ubicaciones activas`, INTEGER microunits); dual-write en el mismo batch incluso con flag UI off; `DEFAULT` determinista para backfill/oversell; lotes multi-rack; conteo esperado server-side; transferencia intra-sucursal idempotente conserva agregado/PMP y audita `LOCATION_TRANSFER`; picking guiado OC.
24. **Números de serie (`inventory.serials`, FASE 6D; ADR-0023):** identidad, historial, leases offline y DDL canónico viven una sola vez en §5.6.
25. **Venta por peso variable (`inventory.scale`, FASE 6D):** captura de peso en caja (balanza USB o manual), precio por unidad de base, redondeo de monto en servidor; el peso lo fija la caja pero el precio/monto final lo recalcula el servidor. **Heartbeat anti desconexión silenciosa (edge 2C):** el Staff Hardware mantiene un **heartbeat continuo** hacia la balanza (WebUSB); si la conexión se pierde (suspensión de la tablet, cable movido), el POS **nunca lee 0.00 silencioso** — cambia de inmediato a una interfaz **roja "Peso Manual"** que exige al cajero teclear el peso para poder cobrar; si el peso se teclea manualmente, se registra `WEIGHT_OVERRIDE` en `audit_events` y, si supera el umbral del tenant, requiere **PIN de supervisor** (reusa authz de reglas 2/17) antes de continuar.
26. **Etiquetas de precio/estantería (`catalog.price_labels`, FASE 6D):** contrato, autoridad de snapshots, DDL y transporte canónicos viven una sola vez en §5.8 (ADR-0025).
27. **Export/restore total del negocio (`data.backup`, FASE 6D/6F):** alcance, formato KPBK1, registry, cifrado de envoltura, DDL objetivo y restore dry-run viven una sola vez en §5.9 (ADR-0026); apply y DR operativo pertenecen a Sprint 48.
28. **Preventa / pedido a cliente (`orders.customer_orders`, FASE 6E):** semántica, reserva, precio snapshot, avisos, fulfillment offline, contrato ACID y DDL objetivo 0036 viven una sola vez en §5.10 (ADR-0027).
29. **Ventas recurrentes / membresías (`sales.recurring`, FASE 6E):** generación programada de venta/NV por plan con **idempotencia** (cada ocurrencia = doc fiscal propio); cancelación y proporcionalidad; adaptada a la vertical Servicios; `audit_events` `RECURRING_*`.
30. **Notificaciones push + caja móvil (`mobile.push`, `client.mobile_pos`, FASE 6E):** push real (Web Push/FCM) al Modo Dueño para arqueo, quiebre y discrepancias (no solo polling); la caja móvil es una terminal PWA que reusa el core (multi-caja portátil); sin fork de dominio.
31. **Analítica predictiva (`analytics.forecasting`, FASE 6F):** modelo determinista (**Holt-Winters** triple smoothing, ADR-0030) sobre `daily_product_rollups` (D1, exacto) + features de Analytics Engine solo para dashboards (muestreado, nunca fuente de forecast ni facturación); forecast de ventas por sucursal/producto y detección de quiebre; salida = **sugerencias** (reposición, alertas), **nunca decisiones automáticas de precio/stock**; gated a plan Cadena — 403 `PLAN_REQUIRES_CADENA` semántico + 402 Plan Guard por trial/past_due, **sin tocar arqueo** — con disclaimer; respalda el claim GTM §4.1 "analítica predictiva".
32. **LPDP y DR/BCP (`compliance.lpdp`, `platform.dr`, FASE 6F):** (a) **LPDP Perú** (reglas LPDP-01..04; ADR-0031; Ley N.º 29733): inventario de PII (nombre, email, teléfono, dirección, RUC/DNI) en `customers`, consentimiento explícito **por propósito** en `consent_records` (migración 0040; reusa y migra el opt-in de mensajería Sprint 24), derecho de export y **borrado/anonimización** — los doc fiscales se retienen (SUNAT ~5 años) pero **se anonimizan** (`[ANONYMIZED]`/`00000000` en el snapshot, `pii_erased` en `customers`), no se destruyen; el motor ACID bloquea la re-materialización (`LPDP_ERASE_BLOCK`); (b) **DR/BCP**: RPO=0 en tx ACID comprometidas, RPO≤1d en rollups, RTO objetivo por shard con replay de colas, backups versionados (regla 27) con restauración probada y simulacro anual (extiende Sprint 14).
    - **LPDP-01 (consentimiento por propósito):** `consent_records` con `UNIQUE (tenant_id, customer_id, purpose)`, `granted`/`granted_at`/`revoked_at` y `purpose` del catálogo `'messaging_whatsapp' | 'marketing' | ...`; 0 PII usada para un propósito sin registro `granted=1` vigente (sin revocación). El opt-in `messaging_opt_ins` del Sprint 24 se migra a `consent_records` en la migración 0040; `messaging_opt_ins` queda solo como lectura de compatibilidad del flujo WhatsApp, jamás como segunda fuente de verdad.
    - **LPDP-02 (derecho de acceso/export):** `GET /customers/:id/export` entrega la PII del titular (perfil + consentimientos + ventas vinculadas); el export **tenant-wide** sigue siendo `data_backups` (regla 27, Sprint 42). Nunca se devuelve PII de otro tenant.
    - **LPDP-03 (borrado/anonimización):** `POST /customers/:id/erase` en un `db.batch([...])`: `pii_erased=1`, `erased_at` sellado, `name/email/phone/address = NULL`; los snapshots fiscales (`sales.client_name`, `sales.client_document_*`) se anonimizan a `'[ANONYMIZED]'`/`'00000000'` y los CPE/XML ya emitidos a SUNAT se retienen intactos; `audit_events` `LPDP_ERASE`. El guard ACID `LPDP_ERASE_BLOCK` (§6, SEC-07) impide re-materializar PII de filas anonimizadas.
    - **LPDP-04 (aislamiento multi-tenant):** toda lectura/escritura de PII fuerza `tenant_id` del JWT verificado (nunca del payload); 0 fugas entre tenants en la suite multi-tenant.
33. **Inteligencia del negocio / Agente de insights (`analytics.agentic_insights`, FASE 6F, Sprint 49):** capa **determinista** sobre D1 — el LLM **nunca calcula ni decide**; D1 es la única calculadora (Principio 9). Pipeline: (1) **router de intención** (LLM ligero) clasifica la pregunta en una lista whitelist de acciones; (2) **Text-to-SQL** (LLM solo traductor) genera el `SELECT` sobre un **schema estricto** (tablas/columnas conocidas, sin `JOIN` libre ni funciones fuera de whitelist) validado por schema JSON y **parametrizado** — jamás se concatena texto del LLM; (3) la consulta se ejecuta en **D1** (calculadora exacta, `_cents`) — **PERF-12:** con `sql_timeout` y contra la **réplica de lectura** del shard (si no hay réplica, prioridad baja / ventana fuera de hora punta) para no competir con el write-lock del cobro; el validador del schema **inyecta forzosamente `LIMIT 50`** (umbral configurable por tenant) en todo `SELECT` generado; para listas amplias fuerza **agregaciones** (`GROUP BY`/totales) y, si la pregunta pide detalle masivo, responde *"los datos son muy amplios para el chat: muestro los 50 principales, descarga el Excel completo en Configuración"* — **jamás** se materializa un listado grande en el isolate (memoria 128 MB, evita OOM/5xx que degraden el SLO); (4) **NLG server-side**: los números se computan antes y se inyectan como **hechos tipados** con placeholders; el LLM solo redacta prosa conectándolos verbatim, con un **post-check determinista** que rechaza cualquier cifra que contradiga el input (0 alucinaciones verificable por Staff QA); (5) respuesta por **SSE** (P95 <2s, canal premium — no es hot path de cobro, no aplica el SLO Sub-50ms). **Idempotencia del chat (anti doble cobro):** cada pregunta desde el móvil lleva `insight_idempotency_key` (UUID del mensaje); si el SSE se corta por red móvil y el cliente reenvía, el backend devuelve la respuesta cacheada en KV `insights:{tenant_id}:{idem}` (TTL ~10 min) **sin re-invocar al LLM**; `ai_usage_counters` sube solo en el primer procesamiento (reusa el patrón `sale_idempotency_key`). **Morning Briefing proactivo:** cron 3:30 AM post `buildDailySummaryCron`, genera 3 viñetas (ventas, quiebre, excepciones de caja) y las cachea en **KV** `insights:{tenant_id}:{fecha}` (lectura UI <10ms); el usuario puede abrir el chat para profundizar. **Regeneración ante sync offline tardío:** si una venta con `issued_at` de un día cerrado se reconcilia después del cron, la re-materialización del rollup (§9) **invalida** la llave KV del briefing y lo regenera con las cifras ya integradas (edge D, Sprint 6/49). **Zero-trust multi-tenant:** `tenant_id` se extrae del JWT y se fuerza en el `WHERE` **fuera del prompt**; el LLM es stateless y no ve datos de otros tenants; el output se renderiza como **texto plano escapado** (los nombres de producto son data, nunca markdown/HTML del modelo). **Schema PII-free (LPDP, regla 32):** el whitelist del Text-to-SQL **excluye columnas de datos personales** (`email`, `phone`, `address`, `document_number` de `customers`) y expone `customer_id` + **seudónimo** (iniciales/alias) para el análisis; un **post-check escanea `facts_json`** y rechaza la respuesta si detecta PII crudo antes de la NLG — la IA nunca procesa datos personales identificables. **Metering:** `ai_usage_counters` por tenant/día (queries, tokens de entrada/salida) + rate limit → costo Workers AI cubierto por el modelo de sobregiro (§4.1); gated a **Cadena/Enterprise**. **Auditabilidad:** cada interacción se persiste en `insight_log` (append-only) con la consulta SQL ejecutada, los hechos JSON, el texto NLG y `model_version`. Se **compone** con `analytics.forecasting` (regla 31): el briefing puede citar el forecast, pero no lo reemplaza. Respalda el claim GTM "El único POS que viene con un Gerente de Operaciones incluido" (freeze hasta Sprint 49).
34. **Alta rápida de catálogo + venta rápida (`catalog.quick_add`, `sales.quick_line`, FASE 6G, Sprint 50):** (a) **Escáner Rápido** en Modo Dueño/Admin: cámara del celular (`BarcodeDetector`/`getUserMedia`, cliente) lee un código y **rutea por namespace** — prefijo `EMP-` ⇒ lookup en `users` (atribución de vendedor, R36); dígitos EAN-13/UPC ⇒ lookup en `products.barcode` (si existe → edición de stock/precio; si no → crea producto con nombre + precio en ~3 segundos, reusa `products.barcode`, sin depender de CSV ni de CatalogImporter del Sprint 21); **`EMP-` está prohibido como barcode de producto** (validación en Escáner Rápido y CatalogImporter); (b) **Venta rápida sin catálogo**: línea genérica en caja (`sale_items.is_uncatalogued = TRUE`, precio libre del cajero dentro del umbral sin authz, regla 2/17) para vender un artículo aún no catalogado a mitad de transacción; la línea queda **marcada** para catalogarse después (pendiente visible en Admin) y jamás corrompe stock (no descuenta ítem sin sku/barcode). **Excepción Zero-Trust offline (edge de integración):** como la línea genérica no tiene producto en listas, el motor `processOfflineSaleAtomic` (§6) **acepta `manualPriceCents` del cliente como fuente de verdad** para `is_uncatalogued = TRUE` (dentro del umbral sin authz), en vez de rechazarla por `Product not found` o sobreescribir el precio con la lista (regla 1) — la venta sincroniza y se audita como `GENERIC_LINE`. `audit_events` `QUICK_ADD`/`GENERIC_LINE`.
35. **Handoff de turno (`ops.shift_handoff`, FASE 6G, Sprint 51):** el cambio de operador **no cierra la caja**: la sesión `cash_register_sessions` **sigue `OPEN`** y se transfiere con un **PIN temporal** de un solo uso (TTL corto, hash servidor, verificado server-side; el entrante nunca recibe las credenciales del saliente). La atribución queda garantizada por `sales.user_id` (operador real de cada venta) + `cash_register_shifts` (log de operadores por sesión). **Conteo ligero intermedio opcional**: `interim_count_cents` nullable + `interim_required` en política del tenant (`branch_stock_policies`/tenant policy) — si se exige, el cajero saliente confirma el efectivo (diferencia → `audit_events` `SHIFT_TRANSFER` con `cash_diff_cents`) **sin** emitir cierre Z; si no se exige, transferencia instantánea. El arqueo Z real (regla 11) sigue siendo del cierre de sesión/caja y **desglosa las diferencias por operador usando `cash_register_shifts`** (regla 11), visible en el ticket Z y en el Modo Dueño.
36. **Equipo e invitaciones (`ops.team_invite`, FASE 6G, Sprint 51):** el Owner/Admin invita cajeros y vendedores (email/link) y les emite **PIN de caja** y/o **badge barcode** (`users.pin_hash`, `users.badge_barcode`); el cajero asigna el vendedor en el carrito en <1s escaneando su badge o tecleando su PIN (reusa el lector del Escáner Rápido, R34) — `sale_items.seller_id` se setea a nivel **carrito** con override por ítem; sin menú desplegable largo. **Namespace anti-colisión:** todo `badge_barcode` generado por KipusPay usa el prefijo reservado **`EMP-`** + identificador server-side (`EMP-12345`), **único por tenant** y **fuera** del espacio EAN-13/UPC de los productos físicos — así un producto chino `12345` jamás colisiona con un badge `EMP-12345`; los badges no se editan a mano y el prefijo `EMP-` está **prohibido** en `products.barcode` (validado también por `CatalogImporter`/Escáner Rápido, R34). `audit_events` `TEAM_INVITE`.
37. **Descubrimiento de capabilities + diagnóstico de hardware (`onboarding.tour`, `hardware.diagnostics`, FASE 6G, Sprints 52–53):** (a) **Product Tour** post-onboarding activado **por las capabilities del tenant** (ADR-ARCH-002): al elegir rubro, tooltips contextuales guían la primera configuración ("Como eres restaurante, activamos las comandas de cocina — configura aquí tu pantalla de chef") + **checklist de setup del "segundo día"** (logo, impresora, invitar cajero, activar facturación, subir catálogo) que mide completitud y reduce abandono del trial; (b) **Troubleshooter de hardware**: asistente visual en Admin → Configuración (Impresión/hardware) con botones *"Probar impresora USB"* / *"Buscar impresoras en mi red"* / *"Probar balanza"* — oculta la escalera WebUSB → WSS → Bluetooth (Sprint 25) y el diagnóstico de red detrás de estados claros (✓/✗ con causa y paso siguiente); `audit_events` `HARDWARE_DIAG`.

#### DDL adicional (v8.1)

```sql
-- Runtime flags (ADR-ARCH-002). vertical_type sigue en tenants solo para UX/analytics.
CREATE TABLE tenant_capabilities (
    tenant_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    -- 'cash.blind_z' | 'inventory.batches' | 'orders.kds' | 'stock.transfers' | ...
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (tenant_id, capability),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    -- Catálogo canónico de códigos por FASE: Nota v8.1 (catálogo de
    -- audit_events.action). Base (FASE 6): 'DISCOUNT_OVERRIDE' | 'CREDIT_OVERRIDE' |
    -- 'CASH_CLOSE' | 'VOID' | 'NC' | 'FORMALIZATION_CHANGE' | 'ORDER_ITEM_CANCEL' |
    -- 'TRANSFER_VARIANCE' | ... (ver tabla canónica Nota v8.1 — no hardcodear nuevos aquí)
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    prev_hash TEXT,                  -- SEC-10: hash-chaining SHA-256(fila anterior) → tamper-evidence
    row_hash TEXT NOT NULL,           -- SHA-256 de canonical(row sin hash + prev_hash)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_tenant_time ON audit_events(tenant_id, created_at);
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'AUDIT_APPEND_ONLY'); END;

CREATE TABLE authorization_tokens (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    approved_by_user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, token_hash),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES users(tenant_id, id)
);
CREATE INDEX idx_authorization_tokens_active
    ON authorization_tokens(tenant_id, expires_at) WHERE used_at IS NULL;

CREATE TABLE fiscal_outbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    must_submit_by DATETIME,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, sale_id),
    CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','QUARANTINED')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

CREATE TABLE cash_count_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    denomination_cents INTEGER NOT NULL,  -- 0.10, 0.20, 1, 2, 5, 10, 20, 50, 100, 200
    quantity INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

-- Extender cash_register_sessions:
-- counted_total_cents INTEGER, expected_total_cents INTEGER, difference_amount_cents INTEGER,
-- difference_reason TEXT, closed_blind BOOLEAN DEFAULT TRUE,
-- authorized_by_user_id TEXT

CREATE TABLE tenant_discount_policies (
    tenant_id TEXT PRIMARY KEY NOT NULL,   -- DAT-12: en SQLite un PK TEXT admite NULL si no se declara
    max_percent_without_auth REAL NOT NULL DEFAULT 5.0,
    max_amount_without_auth_cents INTEGER NOT NULL DEFAULT 2000,  -- S/ 20.00 en centavos
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    table_label TEXT,           -- mesa / salón
    status TEXT NOT NULL DEFAULT 'OPEN',
    -- OPEN | FIRED | READY | PAID | CANCELLED
    opened_by_user_id TEXT NOT NULL,
    customer_id TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE order_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,   -- snapshot servidor
    status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | FIRED | READY | CANCELLED | BILLED
    sale_id TEXT,               -- set al split/cobro
    authorized_by_user_id TEXT, -- quién autorizó la cancelación (S19)
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE stock_transfers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    from_branch_id TEXT NOT NULL,
    to_branch_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    -- DRAFT | IN_TRANSIT | RECEIVED | CANCELLED
    notes TEXT,
    created_by_user_id TEXT NOT NULL,
    shipped_at DATETIME,
    received_at DATETIME,
    FOREIGN KEY (from_branch_id) REFERENCES branches(id),
    FOREIGN KEY (to_branch_id) REFERENCES branches(id)
);

CREATE TABLE stock_transfer_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    transfer_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    qty_sent REAL NOT NULL,
    qty_received REAL DEFAULT 0,
    qty_shrink REAL DEFAULT 0,  -- merma; requiere reason + audit
    shrink_reason TEXT,
    FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id)
);

-- purchase_orders.status ampliado: DRAFT | SENT | PARTIALLY_RECEIVED | RECEIVED | CANCELLED
-- Tabla receiving sugerida:
CREATE TABLE purchase_receipts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    purchase_order_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    received_by_user_id TEXT NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
);

CREATE TABLE purchase_receipt_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    receipt_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_number TEXT,
    expiry_date DATE,
    quantity REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id)
);

-- ============================================================================
-- v8.1 — Control de inventario y caja retail
-- ============================================================================

-- M4: política de stock por (product, branch): punto de reposición y sugerencia de OC
CREATE TABLE branch_stock_policies (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    min_stock REAL NOT NULL DEFAULT 0,       -- alerta de stock mínimo
    reorder_point REAL NOT NULL DEFAULT 0,   -- cruzar este nivel dispara sugerencia
    reorder_qty REAL NOT NULL DEFAULT 0,     -- cantidad sugerida de reposición
    is_active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, branch_id, product_id)
);

-- M4: conteo físico de inventario (hoja ciega → diferencias → AJUSTE)
CREATE TABLE inventory_counts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COUNTING',
    -- COUNTING | DIFFERENCE_REVIEW | APPROVED | CANCELLED
    blind INTEGER NOT NULL DEFAULT 1,        -- 1 = el cajero no ve stock esperado
    approved_by_user_id TEXT,
    difference_threshold_cents INTEGER,      -- authz si |diff| valorizado > umbral
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME
);

CREATE TABLE inventory_count_lines (
    id TEXT PRIMARY KEY,
    count_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    counted_qty REAL,
    system_qty REAL NOT NULL,
    difference_qty REAL,                     -- counted - system (server)
    unit_cost_cents INTEGER,
    diff_value_cents INTEGER,                -- |difference| * PMP, para threshold de authz
    approved_by_user_id TEXT,
    FOREIGN KEY (count_id) REFERENCES inventory_counts(id)
);

-- M5: merma/faltante con evidencia y aprobación (append-only)
CREATE TABLE stock_losses (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    quantity REAL NOT NULL CHECK (quantity > 0),
    category TEXT NOT NULL,
    -- 'DAMAGED' | 'EXPIRED' | 'THEFT_SUSPECTED' | 'SHRINK' | 'OTHER'
    evidence_r2_key TEXT,                    -- foto/PDF en R2
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING | APPROVED | REJECTED
    created_by_user_id TEXT NOT NULL,
    approved_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME
);
-- Aprobar una merma genera un inventory_movements 'AJUSTE' negativo + audit_events.

-- M6: movimientos de caja que NO son venta
CREATE TABLE cash_register_cash_movements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    -- 'DEPOSIT_VALUES' (envío de valores) | 'CHANGE_FUND_IN' | 'CHANGE_FUND_OUT'
    -- | 'SUPPLIER_PAYMENT' | 'ADJUSTMENT' | 'SALE_REFUND' | 'LAYAWAY_DEPOSIT' | 'LAYAWAY_REFUND'
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    counterparty_ref TEXT,                   -- supplier_id / accounts_payable_id
    reason TEXT,
    created_by_user_id TEXT NOT NULL,
    authorized_by_user_id TEXT,              -- obligatorio si amount_cents > umbral
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);
-- Arqueo: expected_cash_cents = opening_balance_cents + ventas efectivo + ingresos − retiros − egresos.

-- M7: reimpresión con sello fiscal COPIA
CREATE TABLE sale_reprints (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    printed_by_user_id TEXT NOT NULL,
    copied_watermark INTEGER NOT NULL DEFAULT 1,  -- sello "COPIA" obligatorio en reimpresión
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);
```

**Nota v8.1:** la extensión de `cash_register_sessions` (`counted_total_cents INTEGER, expected_total_cents INTEGER, difference_amount_cents INTEGER, difference_reason TEXT, closed_blind BOOLEAN DEFAULT TRUE, authorized_by_user_id TEXT`) y los umbrales de descuento (`max_percent_without_auth REAL`, `max_amount_without_auth_cents INTEGER`) aplican junto con las tablas anteriores. **Catálogo canónico de `audit_events.action` por FASE** (única fuente de verdad; el DDL arriba lo referencia — nuevos códigos se agregan aquí, no como literales sueltos):

| FASE / sprint | `audit_events.action` |
|---|---|
| Base (FASE 6, sprints 17–20) | `DISCOUNT_OVERRIDE`, `CREDIT_OVERRIDE`, `CASH_CLOSE`, `VOID`, `NC`, `FORMALIZATION_CHANGE`, `ORDER_ITEM_CANCEL`, `TRANSFER_VARIANCE` + `PRICE_CHANGE`, `PRODUCT_EDIT`, `PERMISSION_CHANGE`, `REPRINT`, `STOCK_ADJUST`, `MERMA_APPROVE`, `CASH_MOVEMENT`, `CONFIG_CHANGE` |
| FASE 6B (28–32) | `RETURN`, `SUPPLIER_PRICE_DIFF`, `PROMOTION_CHANGE`, `LAYAWAY_CANCEL`, `JOURNAL_POST` |
| FASE 6C-6F (33–49) | `QUOTE_CREATE`, `QUOTE_SEND`, `QUOTE_APPROVE`, `QUOTE_CANCEL`, `QUOTE_CONVERT`, `QUOTE_EXPIRE`, `SUPPLIER_RETURN`, `STORE_CREDIT_ISSUE`, `STORE_CREDIT_REDEEM`, `INSTALLMENT`, `COMMISSION`, `LOCATION_TRANSFER`, `SERIAL_ASSIGN`, `SERIAL_TRANSITION`, `WEIGHT_OVERRIDE`, `PRICE_LABEL_REPRINT`, `DATA_BACKUP`, `DATA_RESTORE`, `CUSTOMER_ORDER_CANCEL`, `RECURRING_CANCEL`, `FORECAST_*`, `LPDP_ERASE`, `LPDP_ERASE_BLOCK`, `LPDP_CONSENT_CHANGE`, `LPDP_EXPORT`, `DR_SIMULATION` |
| Sprint 24 (edge A, fidelidad) | `LOYALTY_RESERVATION_EXPIRED` |
| Sprint 49 (insights) | `INSIGHT_GENERATED`, `AI_QUOTA_EXCEEDED` |
| FASE 6G (50–53) | `SHIFT_TRANSFER`, `TEAM_INVITE`, `QUICK_ADD`, `GENERIC_LINE`, `HARDWARE_DIAG` |

#### DDL adicional (v8.1, FASE 6B — profundidad retail)

```sql
-- FASE 6B / Sprint 28 — devoluciones con política N días
CREATE TABLE return_policies (
    tenant_id TEXT PRIMARY KEY NOT NULL,   -- DAT-12: en SQLite un PK TEXT admite NULL si no se declara
    window_days INTEGER NOT NULL DEFAULT 7,
    by_payment_method_json TEXT NOT NULL DEFAULT '{}',   -- {"cash": 7, "card": 7, "credit": 0}
    refund_to_original_method BOOLEAN NOT NULL DEFAULT TRUE,
    allow_turn_closed_with_auth BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sales_returns (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    doc_type TEXT NOT NULL,               -- '07' (NC fiscal) | 'NV_RETURN'
    doc_series TEXT, doc_number TEXT,
    refund_amount_cents INTEGER NOT NULL,
    refund_payment_method TEXT NOT NULL,
    refund_movement_id TEXT,              -- cash_register_cash_movements.id (si cash)
    reason TEXT NOT NULL,
    authorized_by_user_id TEXT,           -- obligatorio si turno cerrado / sobre umbral
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);
CREATE INDEX idx_sales_returns_sale ON sales_returns(tenant_id, sale_id);

CREATE TABLE sale_return_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,               -- COM-01: toda tabla de dominio lleva tenant_id (aislamiento multi-tenant)
    return_id TEXT NOT NULL,
    original_sale_item_id TEXT NOT NULL,  -- revierte unit_cost_cents snapshot + batch_id
    batch_id TEXT,
    qty REAL NOT NULL,
    unit_price_cents INTEGER NOT NULL,    -- del item original (Zero-Trust)
    igv_affectation_code TEXT NOT NULL DEFAULT '10',  -- COM-03: snapshot fiscal del ítem devuelto (la NC 07 exige base+IGV+afectación)
    igv_amount_cents INTEGER NOT NULL DEFAULT 0,
    icbper_amount_cents INTEGER NOT NULL DEFAULT 0,
    unit_price_without_tax_cents INTEGER NOT NULL DEFAULT 0,
    line_total_cents INTEGER NOT NULL,
    FOREIGN KEY (return_id) REFERENCES sales_returns(id)
);

-- FASE 6B / Sprint 29 — proveedores 3-way (OC → recepción → compra)
-- Requiere uq_purchase_orders_tenant_id, uq_branches_tenant_id y uq_suppliers_tenant_id
-- (ver 05-5 §DDL): las FKs son compuestas (tenant_id, parent_id) — DAT-12.
CREATE TABLE supplier_invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    purchase_order_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | MATCHED | PARTIAL | CLOSED
    total_cents INTEGER NOT NULL,
    igv_cents INTEGER NOT NULL,
    matched_qty REAL NOT NULL DEFAULT 0,
    matched_amount_cents INTEGER NOT NULL DEFAULT 0,
    price_diff_override INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('OPEN','MATCHED','PARTIAL','CLOSED')),
    CHECK (total_cents >= 0),
    CHECK (igv_cents >= 0),
    CHECK (price_diff_override IN (0,1)),
    UNIQUE (tenant_id, supplier_id, invoice_number),
    FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders(tenant_id, id),  -- COM-04: 3-way OC→recepción→factura
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id)
);
CREATE UNIQUE INDEX uq_supplier_invoices_tenant_id ON supplier_invoices(tenant_id, id);
CREATE INDEX idx_supplier_invoices_po ON supplier_invoices(tenant_id, purchase_order_id);

-- Líneas facturadas por producto: permiten acumular lo ya facturado por producto y
-- rechazar sobre-facturación (Σ invoiced_qty + yaFacturado ≤ received_qty — COM-04).
CREATE TABLE supplier_invoice_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    invoiced_qty REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    UNIQUE (tenant_id, invoice_id, product_id),
    FOREIGN KEY (tenant_id, invoice_id) REFERENCES supplier_invoices(tenant_id, id)
);

-- FASE 6B / Sprint 30 — promociones y tramos (DAT-12 / ADR-0014)
CREATE TABLE promotions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at DATETIME, ends_at DATETIME,
    applies_to TEXT NOT NULL,             -- 'PRODUCT' | 'CATEGORY' | 'LIST' | 'CART'
    rule_json TEXT NOT NULL,              -- {"kind":"buy_x_get_y"|"percent"|"threshold"|"tier", ...}
    max_stack_json TEXT NOT NULL DEFAULT '{}',
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (applies_to IN ('PRODUCT','CATEGORY','LIST','CART'))
);
CREATE UNIQUE INDEX uq_promotions_tenant_id ON promotions(tenant_id, id);
CREATE TABLE product_promotions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    promotion_id TEXT NOT NULL,
    product_id TEXT,
    category_id TEXT,
    price_list_id TEXT,
    UNIQUE (tenant_id, promotion_id, product_id, category_id, price_list_id),
    FOREIGN KEY (tenant_id, promotion_id) REFERENCES promotions(tenant_id, id),  -- COM-04 / DAT-12
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id),
    FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_lists(tenant_id, id)
);

-- FASE 6B / Sprint 31 — variantes y unidades de medida (ADR-0015 / DAT-12)
-- products.parent_product_id TEXT NULL + variant_price_override_cents INTEGER NULL
-- + is_sellable INTEGER NOT NULL DEFAULT 1; variante = fila products con parent.
-- FK (tenant_id,parent_product_id) → products(tenant_id,id); no auto-parent/nesting.
CREATE TABLE product_uoms (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    uom_code TEXT NOT NULL,               -- 'UND' | 'CAJA' | 'PACK' | ...
    factor_numerator INTEGER NOT NULL,     -- factor racional: base = entered*numerator/denominator
    factor_denominator INTEGER NOT NULL,
    is_base INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (factor_numerator > 0),
    CHECK (factor_denominator > 0),
    CHECK (is_base IN (0,1)),
    CHECK (is_base = 0 OR (factor_numerator = 1 AND factor_denominator = 1)),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, product_id, uom_code),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE UNIQUE INDEX uq_product_uoms_base
    ON product_uoms(tenant_id, product_id) WHERE is_base = 1;
-- sale_items snapshots: sold_uom_id/code, entered_quantity_microunits,
-- factor_numerator/denominator y base_quantity_microunits.

-- FASE 6B / Sprint 32 — apartados y diario contable (ADR-0016 / DAT-12 / ADR-0015)
-- COM-08: TODO abono es una fila de sale_deposit_payments (sin initial_deposit_cents duplicado);
-- Σ sale_deposit_payments = total cobrado; la conversión valida saldo contra la venta.
CREATE TABLE sale_deposits (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | OVERDUE | CONVERTED | CANCELLED
    deposit_date DATE NOT NULL,
    due_date DATE,
    sale_id TEXT,                         -- set al convertir (emite CPE)
    snapshot_total_cents INTEGER NOT NULL DEFAULT 0,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('OPEN','OVERDUE','CONVERTED','CANCELLED')),
    CHECK (snapshot_total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);
CREATE TABLE sale_deposit_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_deposit_id TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount_cents > 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, sale_deposit_id) REFERENCES sale_deposits(tenant_id, id)
);
-- COM-08: ítems apartados (reserva física en microunidades base)
CREATE TABLE sale_deposit_items (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    sale_deposit_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT,
    sold_uom_id TEXT,
    sold_uom_code TEXT,
    entered_quantity_microunits INTEGER NOT NULL,
    factor_numerator INTEGER NOT NULL DEFAULT 1,
    factor_denominator INTEGER NOT NULL DEFAULT 1,
    base_quantity_microunits INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,    -- congelado por servidor (Zero-Trust)
    CHECK (entered_quantity_microunits > 0),
    CHECK (base_quantity_microunits > 0),
    CHECK (factor_numerator > 0),
    CHECK (factor_denominator > 0),
    CHECK (unit_price_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, sale_deposit_id) REFERENCES sale_deposits(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

CREATE TABLE chart_of_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,                   -- ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
    CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code)
);
CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    source_type TEXT NOT NULL,            -- SALE | PAYMENT | SUPPLIER_INVOICE | AR_AP | CASH_COUNT
    -- COM-07: extiende el ledger a la capa comercial
    --   + COMMISSION | SUPPLIER_RETURN | SALES_RETURN | STORE_CREDIT | LAYAWAY | INSTALLMENT
    source_id TEXT NOT NULL,
    post_date DATE NOT NULL,
    balanced_cents INTEGER NOT NULL DEFAULT 0,   -- sum debits - credits; debe ser 0
    posted_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (balanced_cents = 0),
    CHECK (source_type IN (
      'SALE','PAYMENT','SUPPLIER_INVOICE','AR_AP','CASH_COUNT',
      'LAYAWAY','SALES_RETURN','COMMISSION','SUPPLIER_RETURN','STORE_CREDIT','INSTALLMENT'
    )),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, source_type, source_id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE TABLE journal_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    journal_entry_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    debit_cents INTEGER NOT NULL DEFAULT 0,
    credit_cents INTEGER NOT NULL DEFAULT 0,
    memo TEXT,
    CHECK (debit_cents >= 0),
    CHECK (credit_cents >= 0),
    CHECK ((debit_cents = 0 AND credit_cents > 0) OR (credit_cents = 0 AND debit_cents > 0)),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, journal_entry_id) REFERENCES journal_entries(tenant_id, id),
    FOREIGN KEY (tenant_id, account_id) REFERENCES chart_of_accounts(tenant_id, id)
);
-- DAT-07: lectura del asiento completo por entrada
CREATE INDEX idx_journal_lines_entry ON journal_lines(tenant_id, journal_entry_id);
```

#### DDL adicional (v8.1, FASE 6C — cierre comercial)

```sql
-- FASE 6C / Sprint 33 — cotizaciones (ADR-0017 / DAT-12 / microunits; 0 reserva)
CREATE TABLE quotes (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
    customer_id TEXT, status TEXT NOT NULL DEFAULT 'DRAFT',
    valid_until DATE, total_cents INTEGER NOT NULL DEFAULT 0, sale_id TEXT,
    created_by_user_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('DRAFT','SENT','APPROVED','CONVERTED','EXPIRED','CANCELLED')),
    CHECK (total_cents >= 0), UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);
CREATE TABLE quote_items (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, quote_id TEXT NOT NULL,
    product_id TEXT NOT NULL, batch_id TEXT, sold_uom_id TEXT, sold_uom_code TEXT,
    entered_quantity_microunits INTEGER NOT NULL, factor_numerator INTEGER NOT NULL DEFAULT 1,
    factor_denominator INTEGER NOT NULL DEFAULT 1, base_quantity_microunits INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL, line_total_cents INTEGER NOT NULL,
    promotion_ids_json TEXT NOT NULL DEFAULT '[]',
    CHECK (entered_quantity_microunits > 0), CHECK (base_quantity_microunits > 0),
    CHECK (factor_numerator > 0), CHECK (factor_denominator > 0),
    CHECK (unit_price_cents >= 0), CHECK (line_total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, quote_id) REFERENCES quotes(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

-- FASE 6C / Sprint 34 — devolución proveedor (ADR-0018 / DAT-12 / microunits; 0 CPE)
CREATE TABLE supplier_returns (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL, supplier_invoice_id TEXT, purchase_receipt_id TEXT,
    purchase_order_id TEXT, status TEXT NOT NULL DEFAULT 'OPEN',
    total_cents INTEGER NOT NULL, reason TEXT NOT NULL, supplier_credit_note_ref TEXT,
    created_by_user_id TEXT NOT NULL, authorized_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (status IN ('OPEN','CLOSED','CANCELLED')), CHECK (total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id),
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id),
    FOREIGN KEY (tenant_id, supplier_invoice_id) REFERENCES supplier_invoices(tenant_id, id),
    FOREIGN KEY (tenant_id, purchase_receipt_id) REFERENCES purchase_receipts(tenant_id, id)
);
CREATE TABLE supplier_return_items (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, return_id TEXT NOT NULL,
    product_id TEXT NOT NULL, batch_id TEXT, sold_uom_id TEXT, sold_uom_code TEXT,
    entered_quantity_microunits INTEGER NOT NULL, factor_numerator INTEGER NOT NULL DEFAULT 1,
    factor_denominator INTEGER NOT NULL DEFAULT 1, base_quantity_microunits INTEGER NOT NULL,
    unit_cost_cents INTEGER NOT NULL, igv_affectation_code TEXT NOT NULL DEFAULT '10',
    igv_amount_cents INTEGER NOT NULL DEFAULT 0, icbper_amount_cents INTEGER NOT NULL DEFAULT 0,
    line_total_cents INTEGER NOT NULL,
    CHECK (entered_quantity_microunits > 0), CHECK (base_quantity_microunits > 0),
    CHECK (factor_numerator > 0), CHECK (factor_denominator > 0),
    CHECK (unit_cost_cents >= 0), CHECK (line_total_cents >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, return_id) REFERENCES supplier_returns(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);

-- FASE 6C / Sprint 35 — crédito de tienda (ADR-0019 / DAT-12 / cents; GL 2102)
CREATE TABLE store_credit_accounts (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'PEN', expires_at DATETIME,
    CHECK (balance_cents >= 0), CHECK (currency = 'PEN'),
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, customer_id),
    FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id)
);
CREATE TABLE store_credit_transactions (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, store_credit_account_id TEXT NOT NULL,
    type TEXT NOT NULL, amount_cents INTEGER NOT NULL, sale_id TEXT, source_ref TEXT NOT NULL,
    adjust_sign TEXT, created_by_user_id TEXT NOT NULL, authorized_by_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (type IN ('ISSUE','REDEEM','EXPIRE','ADJUST')), CHECK (amount_cents > 0),
    CHECK (adjust_sign IS NULL OR adjust_sign IN ('CREDIT','DEBIT')),
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, source_ref),
    FOREIGN KEY (tenant_id, store_credit_account_id) REFERENCES store_credit_accounts(tenant_id, id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);

-- FASE 6C / Sprint 36 — cuotas (ADR-0020 / DAT-12 / COM-06; principal≠interés CxC)
CREATE TABLE sale_installments (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sale_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    principal_cents INTEGER NOT NULL, interest_cents INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER NOT NULL, due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', paid_at DATETIME,
    CHECK (status IN ('PENDING','PAID','OVERDUE','CANCELLED')),
    CHECK (principal_cents >= 0), CHECK (interest_cents >= 0), CHECK (amount_cents > 0),
    CHECK (amount_cents = principal_cents + interest_cents),
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, sale_id, installment_number),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id)
);
CREATE TABLE sale_installment_payments (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sale_installment_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount_cents > 0),
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, sale_installment_id) REFERENCES sale_installments(tenant_id, id)
);

-- FASE 6C / Sprint 37 — comisiones (ADR-0021 / DAT-12 / COM-07; nómina OOS)
CREATE TABLE commission_rates (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, seller_id TEXT NOT NULL,
    product_id TEXT, category_id TEXT,
    rate_percent REAL NOT NULL, rate_amount_cents INTEGER,
    CHECK (rate_amount_cents IS NULL OR rate_amount_cents >= 0),
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, seller_id, product_id, category_id),
    FOREIGN KEY (tenant_id, seller_id) REFERENCES users(tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE TABLE commission_payouts (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, seller_id TEXT NOT NULL,
    period_start DATE NOT NULL, period_end DATE NOT NULL,
    gross_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (gross_cents > 0), CHECK (status IN ('OPEN','PAID','VOID')),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, seller_id) REFERENCES users(tenant_id, id)
);
CREATE TABLE commission_accruals (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sale_id TEXT NOT NULL,
    seller_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    reversed_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount_cents > 0), UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, sale_id, seller_id),
    FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id),
    FOREIGN KEY (tenant_id, seller_id) REFERENCES users(tenant_id, id)
);
```

#### DDL adicional (v8.1, FASE 6D — inventario avanzado)

```sql
-- FASE 6D / Sprint 38 — ubicaciones/racks
CREATE TABLE inventory_locations (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    code TEXT NOT NULL,                   -- 'A-01', 'B-02'...
    name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    UNIQUE (tenant_id, id), UNIQUE (tenant_id, branch_id, id),
    UNIQUE (tenant_id, branch_id, code),
    FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
);
CREATE TABLE inventory_location_stock (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity_microunits INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, branch_id, location_id, product_id),
    FOREIGN KEY (tenant_id, branch_id, location_id) REFERENCES inventory_locations(tenant_id, branch_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
);
CREATE TABLE inventory_location_batch_stock (
    tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, location_id TEXT NOT NULL,
    product_id TEXT NOT NULL, batch_id TEXT NOT NULL,
    quantity_microunits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, branch_id, location_id, product_id, batch_id),
    FOREIGN KEY (tenant_id, branch_id, location_id, product_id) REFERENCES inventory_location_stock(tenant_id, branch_id, location_id, product_id),
    FOREIGN KEY (tenant_id, branch_id, product_id, batch_id) REFERENCES inventory_batches(tenant_id, branch_id, product_id, id)
);

-- FASE 6D / Sprint 39 — números de serie
-- DDL canónico movido a §5.6 (ADR-0023) para mantener una única definición.

-- FASE 6D / Sprint 40 — venta por peso variable
-- Contrato y DDL canónicos movidos a §5.7 (ADR-0024): INTEGER microunits,
-- producto WEIGH stock-tracked y una medición exacta por sale_item.

-- FASE 6D / Sprint 41 — etiquetas de precio
-- Contrato y DDL canónicos movidos a §5.8 (ADR-0025): snapshot autoritativo,
-- retry inmutable, reimpresión explícita y ACK por ítem.

-- FASE 6G / Sprint 25 — config de terminales POS (fuente del printRouter)
-- La adaptabilidad de ticketera (58/80mm) es config del DISPOSITIVO, no del ticket:
-- el servidor la resuelve al abrir la sesión de caja y el cliente solo la sobreescribe
-- como fallback. 58mm => line_width 32 chars (maxNameLen 14); 80mm => 48 chars (26).
CREATE TABLE pos_terminals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    label TEXT,                           -- "Caja 1", "Terraza", ...
    paper_width_mm INTEGER NOT NULL DEFAULT 58,  -- 58 | 80
    line_width INTEGER NOT NULL DEFAULT 32,      -- 32 | 48 (derivado: 58mm->32, 80mm->48)
    printer_strategy TEXT NOT NULL DEFAULT 'webusb',  -- webusb | wss_lan | bluetooth | system_print
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, branch_id, id),
    CHECK (paper_width_mm IN (58, 80)),
    CHECK (line_width IN (32, 48)),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- FASE 6D / Sprint 42 — export/restore del negocio
-- Contrato y DDL objetivo canónicos movidos a §5.9 (ADR-0026): KPBK1,
-- registry exhaustivo, epoch snapshot, cifrado de envoltura y dry-run sin apply.
```

#### DDL adicional (v8.1, FASE 6E — servicios y fuerza de venta)

```sql
-- FASE 6E / Sprint 43 — preventa / pedido a cliente
-- Contrato y DDL objetivo canónicos movidos a §5.10 (ADR-0027):
-- INTEGER microunits, DAT-12, parciales múltiples, avisos durables y leases offline.

-- FASE 6E / Sprint 44 — ventas recurrentes / membresías
-- Contrato y DDL objetivo canónicos movidos a §5.11 (ADR-0028):
-- pricing FIXED/CURRENT, períodos Lima, liquidación venta+CPE/NV+CxC,
-- scheduler exactly-once, gracia y prorrateo mediante NC/NV_RETURN.

-- FASE 6E / Sprint 45 — notificaciones push + caja móvil
-- Contrato y DDL objetivo canónicos movidos a §5.12 (ADR-0029):
-- consentimiento S45, Web Push VAPID + FCM HTTP v1, privacidad lockscreen,
-- outbox/ACK DISPLAYED y caja móvil PWA sobre el mismo core y Service Worker.
```

#### DDL adicional (v8.1, FASE 6F — analítica predictiva + compliance)

```sql
-- FASE 6F / Sprint 46 — analítica predictiva (gated Cadena)
CREATE TABLE forecast_outputs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_qty REAL NOT NULL,
    predicted_gross_cents INTEGER NOT NULL,
    confidence_low_qty REAL, confidence_high_qty REAL,
    model_version TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, branch_id, product_id, forecast_date)
);

-- FASE 6F / Sprint 47 — LPDP: PII y consentimiento
CREATE TABLE consent_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    purpose TEXT NOT NULL,                -- 'messaging_whatsapp' | 'marketing' | ...
    granted BOOLEAN NOT NULL,
    granted_at DATETIME,
    revoked_at DATETIME,
    UNIQUE (tenant_id, customer_id, purpose)
);
-- Borrado/anonimización: customers.pii_erased BOOLEAN DEFAULT FALSE (anonimiza nombre/email/tel);
-- los doc fiscales se retienen (SUNAT) pero quedan anonimizados en su vínculo a persona.

-- FASE 6F / Sprint 48 — DR/BCP
-- Reusa data_backups (regla 27); los simulacros y RPO/RTO son runbooks de Staff SRE,
-- no tablas de dominio. Alarma: dr_simulation log vía audit_events.

-- FASE 6F / Sprint 49 — inteligencia del negocio (analytics.agentic_insights, gated Cadena/Enterprise)
CREATE TABLE insight_log (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,        -- UUID del mensaje por tenant; reenvío devuelve respuesta cacheada
    interaction_type TEXT NOT NULL,       -- 'chat_query' | 'briefing_generated' | 'briefing_viewed'
    status TEXT NOT NULL DEFAULT 'OK',    -- 'OK' | 'LIMIT_CAPPED' | 'PII_BLOCKED' | 'TOO_WIDE'
    sql_executed TEXT NOT NULL,           -- SELECT exacto ejecutado en D1 (auditable, append-only)
    facts_json TEXT NOT NULL,             -- hechos tipados que el NLG recibió verbatim
    response_text TEXT NOT NULL,          -- prosa generada (data de output, jamás se re-ejecuta)
    model_version TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_insight_log_tenant ON insight_log(tenant_id, created_at);
CREATE UNIQUE INDEX uq_insight_log_tenant_idem ON insight_log(tenant_id, idempotency_key);

CREATE TABLE ai_usage_counters (
    tenant_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    queries INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    quota_queries INTEGER NOT NULL,        -- cupo diario de consultas según plan (metering)
    PRIMARY KEY (tenant_id, usage_date)
);
-- Nota: el briefing diario (cron 3:30 AM) consume ai_usage_counters como 1 query + tokens_out;
-- el excedente del cupo se factura según el modelo de sobregiro (§4.1) y `AI_QUOTA_EXCEEDED` se
-- registra en audit_events + rate limit. El LLM es stateless; tenant_id viene del JWT (WHERE forzado).

-- FASE 6G / Sprints 50-53 — flujo del cliente (product/UX)
-- Handoff de turno (regla 35): log de operadores por sesión; la sesión NO se cierra, cambia de operador.
CREATE TABLE cash_register_shifts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    cash_register_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,                    -- operador saliente del tramo
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    transfer_pin_hash TEXT,                   -- PIN temporal de un solo uso (hash, expira)
    transfer_pin_expires_at DATETIME,
    interim_count_cents INTEGER,              -- conteo ligero intermedio (nullable, según política)
    cash_diff_cents INTEGER,                  -- diferencia si interim_required = true
    FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id)
);

-- Equipo (regla 36): PIN de caja + badge para el vendedor (atribución <1s en carrito).
-- Extensión de users: pin_hash TEXT, badge_barcode TEXT.
-- badge_barcode: generado server-side con prefijo reservado 'EMP-' + id (ej. 'EMP-12345'),
-- UNIQUE por tenant y FUERA del espacio EAN-13/UPC (regla 36). Nunca se edita a mano;
-- 'EMP-' está prohibido en products.barcode (validación Escáner Rápido + CatalogImporter, regla 34).

-- Venta rápida sin catálogo (regla 34b): línea genérica, no descuenta stock.
-- sale_items.is_uncatalogued INTEGER DEFAULT 0 declarado en el DDL §5.3 (product_id NULL si =1).
```

**Fuera de §5.3:** §5.4 (v9) · FASE 7.

