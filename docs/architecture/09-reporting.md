---
doc_id: arch-09-reporting
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "9"
---

## **9. Capa de Reportes — Daily Rollups en D1 + Analítica en AE (v8.1)**

**Regla de arquitectura:** la fuente de verdad de reportes es **`daily_financial_rollups` en D1** (exacta, no muestreada), escrita por un cron idempotente. Analytics Engine sigue siendo **solo dashboards** y **nunca factura** (consistente con §4.1: AE muestreado). Los reportes del cliente leen D1; los dashboards internos/globales leen AE.

```sql
-- Rollup diario por (tenant, branch, día Lima) — fuente de verdad de reportes.
CREATE TABLE daily_financial_rollups (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    report_date DATE NOT NULL,          -- día de emisión Lima
    gross_sales_cents INTEGER NOT NULL DEFAULT 0,      -- Σ total_amount_cents (sin NC)
    net_sales_cents INTEGER NOT NULL DEFAULT 0,        -- ventas − NC/ND del día
    cogs_cents INTEGER NOT NULL DEFAULT 0,             -- Σ unit_cost_cents × qty (PMP)
    igv_cents INTEGER NOT NULL DEFAULT 0,
    icbper_cents INTEGER NOT NULL DEFAULT 0,
    discounts_cents INTEGER NOT NULL DEFAULT 0,
    doc_count INTEGER NOT NULL DEFAULT 0,
    cash_expected_cents INTEGER NOT NULL DEFAULT 0,    -- arqueo: opening + efectivo + ingresos − retiros − egresos
    cash_counted_cents INTEGER,
    cash_diff_cents INTEGER,
    payments_by_method TEXT NOT NULL DEFAULT '{}',     -- JSON {"EFECTIVO": 1200, "YAPE": 800}
    overage_docs INTEGER NOT NULL DEFAULT 0,           -- docs sobre cupo (§4.1)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, branch_id, report_date)
);

CREATE TABLE daily_product_rollups (
    tenant_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    product_id TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 0,
    gross_cents INTEGER NOT NULL DEFAULT 0,
    cogs_cents INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, branch_id, report_date, product_id)
);
```

**Cron (idempotente, paralelo por shard con `Promise.all`):** por cada shard D1 y cada `(tenant, branch, fecha Lima)` cerrado → `DELETE`+`INSERT` del rollup del día (o `UPSERT`). **Jamás** se leen reportes desde el hot path de venta; el rollup se calcula sobre `sales`/`sale_items`/`sale_payments`/`cash_register_cash_movements`/`cash_count_lines` ya ACID.

```typescript
// src/cron/dailyRollups.ts
// Cron: 3:00 AM hora Lima (UTC-5) — buildDailySummaryCron corre antes que el
// Morning Briefing (regla 33, 3:30 AM) y que la RC de boletas (fin de día Lima).
// `closedLimaWindow` devuelve límites ISO UTC equivalentes al día Lima cerrado y
// `reportDateLima` en YYYY-MM-DD; el SQL nunca interpreta el huso horario.
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const shards: string[] = JSON.parse(await env.TENANT_KV.get('active_shards') ?? '["D1_SHARD_01"]');
    await Promise.all(shards.map(async (shardKey) => {
      const db = env[shardKey] as D1Database;
      if (!db) return;
      const { startOfLimaDay, endOfLimaDay, reportDateLima } = closedLimaWindow(event.scheduledTime);
      const rows = await db.prepare(`
        WITH sales_day AS (
          SELECT s.tenant_id, s.branch_id,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN 0 ELSE s.total_amount_cents END) AS gross,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -s.total_amount_cents ELSE s.total_amount_cents END) AS net,
                 SUM(s.total_igv_cents) AS igv,
                 SUM(s.total_icbper_cents) AS icbper,
                 SUM(s.total_discount_cents) AS discounts,
                 COUNT(*) AS doc_count
          FROM sales s
          WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ? AND s.deleted_at IS NULL
          GROUP BY s.tenant_id, s.branch_id
        ),
        items_day AS (
          SELECT s.tenant_id, s.branch_id,
                  SUM(CASE WHEN s.document_type IN ('07','08') THEN -si.total_amount_cents ELSE si.total_amount_cents END) AS item_gross,
                  SUM(CASE WHEN s.document_type IN ('07','08') THEN -1 ELSE 1 END * si.unit_cost_cents * si.quantity) AS cogs
           FROM sales s
           JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
          WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ? AND s.deleted_at IS NULL
          GROUP BY s.tenant_id, s.branch_id
        ),
        payment_totals AS (
          SELECT s.tenant_id, s.branch_id, sp.payment_method_id,
                 SUM(sp.amount_cents) AS amount_cents
          FROM sales s
          JOIN sale_payments sp ON sp.sale_id = s.id AND sp.tenant_id = s.tenant_id
          WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ?
            AND s.deleted_at IS NULL
          GROUP BY s.tenant_id, s.branch_id, sp.payment_method_id
        ),
        payments_day AS (
          SELECT tenant_id, branch_id,
                 json_group_object(payment_method_id, amount_cents) AS payments_by_method
          FROM payment_totals
          GROUP BY tenant_id, branch_id
        )
        SELECT s.tenant_id, s.branch_id, s.gross, s.net, s.igv, s.icbper,
               s.discounts, s.doc_count, i.item_gross, i.cogs, p.payments_by_method
        FROM sales_day s
        LEFT JOIN items_day i USING (tenant_id, branch_id)
        LEFT JOIN payments_day p USING (tenant_id, branch_id)
      `).bind(
        startOfLimaDay, endOfLimaDay,
        startOfLimaDay, endOfLimaDay,
        startOfLimaDay, endOfLimaDay
      ).all();
      // PERF-09: cada fuente 1:N se pre-agrega antes del join final; así no se multiplican
      // gross/IGV por cantidad de líneas o pagos. El worker asocia reportDateLima calculado
      // con America/Lima y nunca usa date() UTC para decidir el día fiscal.
       for (const row of rows.results) {
         await db.prepare(`
           INSERT INTO daily_financial_rollups
             (tenant_id, branch_id, report_date, gross_sales_cents, net_sales_cents,
              igv_cents, icbper_cents, discounts_cents, doc_count, cogs_cents,
              payments_by_method, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (tenant_id, branch_id, report_date) DO UPDATE SET
             gross_sales_cents = excluded.gross_sales_cents,
             net_sales_cents = excluded.net_sales_cents,
             igv_cents = excluded.igv_cents,
             icbper_cents = excluded.icbper_cents,
             discounts_cents = excluded.discounts_cents,
             doc_count = excluded.doc_count,
             cogs_cents = excluded.cogs_cents,
             payments_by_method = excluded.payments_by_method,
             created_at = CURRENT_TIMESTAMP
         `).bind(row.tenant_id, row.branch_id, reportDateLima, row.gross, row.net,
           row.igv, row.icbper, row.discounts, row.doc_count, row.cogs ?? 0,
           row.payments_by_method ?? '{}').run();
       }
        const productRows = await db.prepare(`
          SELECT s.tenant_id, s.branch_id, si.product_id,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -si.quantity ELSE si.quantity END) AS qty,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -si.total_amount_cents ELSE si.total_amount_cents END) AS gross,
                 SUM(CASE WHEN s.document_type IN ('07','08') THEN -1 ELSE 1 END * si.unit_cost_cents * si.quantity) AS cogs
            FROM sales s JOIN sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
           WHERE s.issued_at_lima >= ? AND s.issued_at_lima < ? AND s.deleted_at IS NULL
             AND si.product_id IS NOT NULL
           GROUP BY s.tenant_id, s.branch_id, si.product_id
        `).bind(startOfLimaDay, endOfLimaDay).all();
        await db.batch(productRows.results.map((row: any) => db.prepare(`
          INSERT INTO daily_product_rollups (tenant_id, branch_id, report_date, product_id, qty, gross_cents, cogs_cents)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (tenant_id, branch_id, report_date, product_id) DO UPDATE SET
            qty = excluded.qty, gross_cents = excluded.gross_cents, cogs_cents = excluded.cogs_cents
        `).bind(row.tenant_id, row.branch_id, reportDateLima, row.product_id, row.qty, row.gross, row.cogs)));
        // AE.writeDataPoint solo se usa para dashboards globales.
    }));
  }
};
```

**Catálogo de reportes retail (lectura de D1, gating por plan + rol):**

**PERF-12 — lectura de insights:** el path de insights debe abrir `db.withSession('first-unconstrained')`
para usar réplica cuando exista; si no existe réplica, usa prioridad baja/ventana fuera de hora punta.
No se llama `db.prepare()` directamente esperando réplica: sin Sessions, D1 ejecuta en primary.

| Reporte | Fuente | Plan (GTM §4.1) |
|---|---|---|
| Ventas por hora / ticket promedio / ventas por cajero | `sales` | Arranque |
| Ventas por método de pago | `daily_financial_rollups.payments_by_method` | Arranque |
| Arqueo Z por cajero (esperado vs contado vs diferencia) | `cash_register_sessions` + `cash_count_lines` | Arranque |
| Desglose de diferencias por operador/turno (Z total = Σ tramos) | `cash_register_shifts` (SHIFT_TRANSFER) | Arranque |
| IGV / ICBPER recaudado, docs del día | `daily_financial_rollups` | Arranque |
| Top productos / margen bruto por producto | `daily_product_rollups` (PMP) | Crece |
| Inventario valorizado (costo) y rotación | `products` + PMP + `inventory_movements` | Crece |
| Merma por sucursal y motivo | `stock_losses` | Crece |
| Comparativo entre sucursales (ranking Dueño) | `daily_financial_rollups` | Crece |
| Ventas por vendedor y comisiones pendientes | `sale_items.seller_id` + `commission_payouts` | Crece |
| Cuotas por cobrar / atrasos | `sale_installments` | Crece |
| Devoluciones y créditos de tienda emitidos | `sales_returns` + `store_credit_transactions` | Crece |
| Forecasting de ventas y quiebres previstos | `forecast_outputs` (modelo §5.3 regla 31) | Cadena |
| Insight del negocio / briefing diario (agente de insights) | `insight_log` + rollups D1 (§5.3 regla 33) | Cadena/Enterprise |
| Aging CxC / CxP | `accounts_receivable` / `accounts_payable` | Cadena |

**Gating:** reportes "avanzados" (Crece/Cadena) se cortan por el mismo `plan` middleware (§3) — **nunca** se niega el arqueo ni el cierre Z (operación de caja, promesa "el POS no se cae"). Export CSV/Excel de cualquier reporte leído de D1.

**Modo Dueño offline (lectura pura, edge D):** la app del Dueño cachea en IndexedDB el **último estado conocido** de `daily_financial_rollups` y del ranking por sucursal (solo lectura, cero escrituras; jamás crea ni muta documentos). Sin conexión, el resumen del día se muestra desde la caché con un **banner de marca de tiempo** ("Datos de hace X horas") — nunca se presenta data cachead como si fuera en vivo; el título cambia a "sin conexión". Al reconectar, refresca y quita el banner; las alertas push (regla 30) avisan cuando el rollup nuevo está disponible (edge D cubierto en Sprint 8/45).

**Re-materialización por sync offline tardío (edge D, la fuente de verdad manda):** el cron del rollup es idempotente (`DELETE`+`INSERT`/`UPSERT`) por `(tenant, branch, report_date)` **cerrado** — pero una venta emitida en un día cerrado que sincroniza al día siguiente (ej. tablet offline toda la tarde, sync a las 8 AM) llegaría **después** de ese cómputo y dejaría el rollup stale. Regla: al reconciliar exitosamente en `processOfflineSaleAtomic` una venta con `issued_at` perteneciente a un `report_date` anterior, el sistema **re-materializa** el rollup afectado reusando el mismo cómputo idempotente (los snapshots PMP se conservan, regla 9 forward-only) **y** **invalida** `insights:{tenant_id}:{fecha}` en KV para que el briefing se regenere con las cifras integradas (regla 33). Sin esto, todos los reportes §9 (comparativo Dueño, margen, arqueo esperado) quedarían mal, no solo el briefing.

