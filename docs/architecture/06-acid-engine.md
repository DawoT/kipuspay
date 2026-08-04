---
doc_id: arch-06-acid-engine
alias: Arquitectura
authority: normativa
owner: "@DawoT"
section: "6"
---

## **6. Motor de Transacciones Explícitas D1 (processOfflineSaleAtomic) & Reconciliación Autoritativa (v8.0)**

### Contrato de atomicidad D1 (API vigente)

D1 no expone `db.transaction(callback)`. El patrón obligatorio es: (1) leer y validar con
`db.withSession('first-primary')`; (2) construir todos los `D1PreparedStatement` de escritura;
(3) ejecutar **una sola** `await db.batch(statements)`; (4) interpretar los resultados y emitir
el ack. `batch()` es la frontera atómica: si una sentencia falla, D1 aborta/revierte la secuencia.
No se permite ejecutar escrituras una por una ni llamar al REST API de D1.

`runD1AtomicPlan` es el adapter de composition root: `txn.prepare(...)` en el pseudocódigo solo
agrega statements al plan; no ejecuta I/O inmediato. Las lecturas del preflight usan una sesión
D1 separada y se inyectan como datos validados al plan; las llamadas `.first()`/`.all()` que
aparecen dentro del bloque son marcadores de esa etapa y no ejecutan lecturas durante el batch.
Los resultados del `batch()` se convierten en `SUCCESS`, `ALREADY_SYNCED` o un error de dominio.

Para condiciones que deben abortar el batch (stock, versión, cupo o serie), la migración crea
`atomic_guards` con `CHECK (ok = 1)`. La primera sentencia del batch inserta un guard calculado
desde el estado actual; una precondición falsa viola el `CHECK` y revierte toda la secuencia; la
última sentencia elimina el guard. El bloque de referencia siguiente es **pseudocódigo de
orquestación**, no un fragmento copiable: la implementación debe compilarlo a una lista de
statements y usar `db.batch()`.

```sql
CREATE TABLE atomic_guards (
    id TEXT PRIMARY KEY,
    ok INTEGER NOT NULL CHECK (ok = 1),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

// src/services/transactionEngine.ts  
import type { D1Database } from '@cloudflare/workers-types';

export class InsufficientStockError extends Error {  
  constructor(public productId: string, public requested: number, public available: number) {  
    super(`Stock insuficiente para producto ${productId}: solicitado ${requested}, disponible ${available}`);  
    this.name = 'InsufficientStockError';  
  }  
}

export interface OfflinePaymentPayload {  
  paymentMethodId: string;  
  amount_cents: number;  
  isCredit?: boolean;                  // solo con payment method CREDIT; monto restante queda en CxC
  referenceNumber?: string;  
  // Captura offline de medio electrónico (regla 2 §5.4, edge 2B): 'API' si el
  // adquirente confirmó en línea; 'MANUAL' = el cajero verificó visualmente la app
  // del cliente sin red (persistido como MANUAL_ELECTRONIC_CAPTURE).
  captureStatus?: 'API' | 'MANUAL';  
}

export interface OfflineSaleItemPayload {  
  productId: string | null;             // NULL obligatorio cuando isUncatalogued=true
  saleItemId?: string;                  // obligatorio para NC/NV_RETURN parcial; origen server-side
  batchId?: string;  
  quantity: number;  
  discountAmountCents?: number;  
  igvAffectationCode?: string;          // hint; el servidor resuelve el catálogo fiscal del producto
  // Venta rápida sin catálogo (regla 34): el motor acepta manualPriceCents como
  // fuente de verdad y NO descuenta stock. Nunca coexiste con productId real.
  isUncatalogued?: boolean;  
  manualPriceCents?: number;  
  // SEC-02: el descuento/sobreprecio manual solo se acepta server-side; si supera
  // los umbrales de tenant_discount_policies requiere authorizationToken (regla 2/17).
  requiresAuth?: boolean;  
}

export interface OfflineSalePayload {  
  offlineSaleId: string;  
  issuedAt?: string;  
  branchId: string;  
  cashRegisterSessionId: string;  
  customerId?: string;  
  clientDocumentType: string;  
  clientDocumentNumber: string;  
  clientName: string;  
  clientEmail?: string;  
  clientPhone?: string;  
  clientAddress?: string;  
  clientProfileUpdatedAt?: string;  
  priceListId?: string;  
  documentType: 'NV' | 'NV_RETURN' | '01' | '03' | '07' | '08' | '12';  // SYN-12: NV_RETURN viaja por el canal offline
  referencedSaleId?: string;              // obligatorio para NC '07' / ND '08' / NV_RETURN (residual §8)
  creditNoteMotiveCode?: string;          // Catálogo 09 (NC) / 10 (ND)
  authorizationToken?: string;            // SEC-02/09: supervisor/Dueño para overrides sobre umbral
  series?: string;                       // hint de idempotencia; nunca se persiste sin resolver servidor/DO
  number?: number;                       // hint de idempotencia; nunca es folio autoritativo
  currency?: string;  
  sellerId?: string;                   // COM-07/regla 36: atribución de vendedor (badge/PIN, carrito)
  items: OfflineSaleItemPayload[];  
  payments: OfflinePaymentPayload[];  
}

function assertOfflineSaleShape(payload: OfflineSalePayload): void {
  if (!Array.isArray(payload.items) || payload.items.length === 0) throw new Error('SALE_ITEMS_REQUIRED');
  for (const item of payload.items) {
    if (!Number.isFinite(item.quantity) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('INVALID_QUANTITY');
    }
    if (item.discountAmountCents !== undefined &&
        (!Number.isFinite(item.discountAmountCents) || !Number.isInteger(item.discountAmountCents) || item.discountAmountCents < 0)) {
      throw new Error('INVALID_DISCOUNT_CENTS');
    }
    if (item.isUncatalogued &&
        (typeof item.manualPriceCents !== 'number' || !Number.isFinite(item.manualPriceCents) || !Number.isInteger(item.manualPriceCents) || item.manualPriceCents < 0)) {
      throw new Error('INVALID_MANUAL_PRICE_CENTS');
    }
    if (item.isUncatalogued !== (item.productId === null)) throw new Error('GENERIC_LINE_PRODUCT_MISMATCH');
  }
  for (const payment of payload.payments) {
    if (!Number.isFinite(payment.amount_cents) || !Number.isInteger(payment.amount_cents) || payment.amount_cents < 0) {
      throw new Error('INVALID_PAYMENT_CENTS');
    }
  }
}

async function assertTenantUserAndBranch(db: D1Database, tenantId: string, userId: string, branchId: string): Promise<void> {
  const user = await db.prepare(
    `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND branch_id = ? AND is_active = 1 AND deleted_at IS NULL`
  ).bind(userId, tenantId, branchId).first();
  if (!user) throw new Error('FORBIDDEN_USER_BRANCH');
}

async function reserveServerFolio(
  tenantId: string,
  branchId: string,
  documentType: string,
  clientHint?: string
): Promise<{ series: string; number: number }> {
  // Implementado por el Series DO/lease server-side; `clientHint` solo selecciona una serie
  // habilitada. La respuesta se valida contra branch_document_series y el índice único de sales;
  // una colisión se reintenta como SERIES_MISMATCH, nunca se acepta el número del cliente.
  return seriesAuthority.reserve({ tenantId, branchId, documentType, clientHint });
}

async function resolveAndReserveBatch(
  txn: any,
  tenantId: string,
  branchId: string,
  productId: string | null,
  requestedBatchId: string | undefined,
  quantity: number,
  todayLima: string
): Promise<string | null> {
  if (!productId) return null;
  const batch = requestedBatchId
    ? await txn.prepare(
        `SELECT id, expiration_date, stock FROM inventory_batches
          WHERE id = ? AND tenant_id = ? AND branch_id = ? AND product_id = ? AND is_active = 1`
      ).bind(requestedBatchId, tenantId, branchId, productId).first<any>()
    : await txn.prepare(
        `SELECT id, expiration_date, stock FROM inventory_batches
          WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND is_active = 1
            AND (expiration_date IS NULL OR expiration_date >= date(?)) AND stock >= ?
          ORDER BY expiration_date IS NULL, expiration_date ASC LIMIT 1`
      ).bind(tenantId, branchId, productId, todayLima, quantity).first<any>();
  if (!batch) {
    const hasBatch = await txn.prepare(
      `SELECT 1 FROM inventory_batches WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`
    ).bind(tenantId, branchId, productId).first();
    if (!hasBatch) return null;
    throw new Error('INSUFFICIENT_BATCH');
  }
  if (batch.expiration_date && batch.expiration_date < todayLima.slice(0, 10)) throw new Error('EXPIRED_BATCH');
  const updated = await txn.prepare(
    `UPDATE inventory_batches SET stock = stock - ?
      WHERE id = ? AND tenant_id = ? AND branch_id = ? AND stock - ? >= 0`
  ).bind(quantity, batch.id, tenantId, branchId, quantity).run();
  if (updated.meta.changes !== 1) throw new Error('INSUFFICIENT_BATCH');
  return batch.id;
}

async function preloadCatalogForSale(
  db: D1Database,
  tenantId: string,
  branchId: string,
  items: OfflineSaleItemPayload[],
  priceListId?: string
) {
  const productIds = [...new Set(items.filter((item) => !item.isUncatalogued && item.productId).map((item) => item.productId as string))];
  const placeholders = productIds.map(() => '?').join(',') || "''";
  const statements = [
    db.prepare(`
      SELECT p.id, p.product_type, p.allow_negative_stock, p.price_cents, p.cost_cents,
             p.igv_affectation_code_default, COALESCE(bs.stock, 0) AS branch_stock,
             COALESCE(bs.pmp_unit_cost_cents, p.cost_cents) AS pmp_cost_cents
        FROM products p LEFT JOIN branch_product_stock bs
          ON bs.product_id = p.id AND bs.tenant_id = p.tenant_id AND bs.branch_id = ?
       WHERE p.tenant_id = ? AND p.id IN (${placeholders}) AND p.is_active = 1 AND p.deleted_at IS NULL`
    ).bind(branchId, tenantId, ...productIds),
    db.prepare(`SELECT price_list_id, product_id, price_cents FROM product_prices
                 WHERE tenant_id = ? AND price_list_id = ? AND product_id IN (${placeholders})`).bind(tenantId, priceListId ?? '', ...productIds),
    db.prepare(`SELECT pt.product_id, t.code, t.rate_percentage, t.is_flat_fee, t.flat_fee_amount_cents
                  FROM product_taxes pt JOIN taxes t ON t.id = pt.tax_id AND t.tenant_id = pt.tenant_id
                 WHERE pt.tenant_id = ? AND pt.product_id IN (${placeholders}) AND t.is_active = 1`).bind(tenantId, ...productIds),
    db.prepare(`SELECT rate_percentage FROM taxes WHERE tenant_id = ? AND code = '1000' AND is_active = 1
                 ORDER BY created_at DESC LIMIT 1`).bind(tenantId)
  ];
  const [products, prices, taxes, defaultTax] = await db.batch(statements);
  return {
    products: new Map(products.results.map((row: any) => [row.id, row])),
    prices: new Map(prices.results.map((row: any) => [`${row.price_list_id}:${row.product_id}`, row])),
    taxes: taxes.results.reduce((map: Map<string, any[]>, row: any) => {
      const current = map.get(row.product_id) ?? [];
      current.push(row); map.set(row.product_id, current); return map;
    }, new Map()),
    defaultIgvRate: defaultTax.results[0]?.rate_percentage ?? 18
  };
}

type ReferencedDocumentPayload = {
  documentType: '07' | '08' | 'NV_RETURN';
  referencedSaleId: string;
  creditNoteMotiveCode: string;
  branchId: string;
  items?: Array<{ saleItemId?: string; productId: string | null; quantity: number; isUncatalogued?: boolean; batchId?: string }>;
};

async function processReferencedDocumentAtomic(
  db: D1Database,
  tenantId: string,
  userId: string,
  payload: ReferencedDocumentPayload
) {
  if (!payload.referencedSaleId || !payload.creditNoteMotiveCode) throw new Error('REFERENCE_AND_MOTIVE_REQUIRED');
  const original = await db.prepare(
    `SELECT id, tenant_id, document_type, sunat_status, total_amount_cents
       FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`
  ).bind(payload.referencedSaleId, tenantId).first<{ id: string; tenant_id: string; document_type: string; sunat_status: string; total_amount_cents: number }>();
  if (!original) throw new Error('REFERENCED_SALE_NOT_FOUND');
  if (payload.documentType === '07' && !['09'].includes(payload.creditNoteMotiveCode)) throw new Error('MOTIVE_09_REQUIRED');
  if (payload.documentType === '08' && !['10'].includes(payload.creditNoteMotiveCode)) throw new Error('MOTIVE_10_REQUIRED');
  if (payload.documentType === '08' && original.sunat_status !== 'ACCEPTED') throw new Error('FISCAL_CDR_REQUIRED');
  const noCdrTotalCancellation = payload.documentType === '07' &&
    ['REJECTED', 'QUARANTINED', 'DEADLINE_EXCEEDED'].includes(original.sunat_status);
  if (payload.documentType === '07' && original.sunat_status !== 'ACCEPTED' && !noCdrTotalCancellation) {
    throw new Error('FISCAL_CDR_REQUIRED');
  }
  if (noCdrTotalCancellation && payload.items?.length) throw new Error('E_A_REQUIRES_TOTAL_CANCELLATION');
  const creditTotal = noCdrTotalCancellation || !payload.items?.length
    ? original.total_amount_cents
    : await resolveReferencedCreditTotal(db, tenantId, original.id, payload.items);
  // E-A es únicamente anulación total, confirmada y auditable; no convierte el origen en
  // ACCEPTED. El batch actualiza residual, documento referenciado, stock/CxC, audit, usage y
  // outbox fiscal de forma indivisible. La respuesta solo se emite después del batch exitoso.
  const referencedDocumentId = crypto.randomUUID();
  return runD1AtomicPlan(db, async (txn) => {
    await txn.prepare(
      `INSERT INTO sales (id, tenant_id, branch_id, user_id, document_type, referenced_sale_id,
         credit_note_motive_code, total_amount_cents, sunat_status, void_status, issued_at_lima)
       SELECT ?, tenant_id, branch_id, ?, ?, id, ?, ?, 'PENDING', 'NONE', CURRENT_TIMESTAMP
         FROM sales WHERE id = ? AND tenant_id = ?`
    ).bind(referencedDocumentId, userId, payload.documentType, payload.creditNoteMotiveCode,
      creditTotal, original.id, tenantId).run();
    await txn.prepare(
      `INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash)
       SELECT ?, tenant_id, branch_id, ?, ?, 'sale', id, ?, ?, ?
         FROM sales WHERE id = ? AND tenant_id = ?`
    ).bind(crypto.randomUUID(), userId, noCdrTotalCancellation ? 'CREDIT_NOTE_NO_CDR' : 'CREDIT_NOTE',
      JSON.stringify({ sourceStatus: original.sunat_status, total: noCdrTotalCancellation }), await previousAuditHash(txn, tenantId),
      await computeAuditHash({ action: noCdrTotalCancellation ? 'CREDIT_NOTE_NO_CDR' : 'CREDIT_NOTE', entity_id: original.id }),
      original.id, tenantId).run();
    for (const item of payload.items ?? []) {
      if (item.isUncatalogued) continue;
      await txn.prepare(
        `UPDATE inventory_batches SET stock = stock + ?
          WHERE id = ? AND tenant_id = ? AND branch_id = ? AND is_active = 1`
      ).bind(item.quantity, item.batchId, tenantId, payload.branchId).run();
      await txn.prepare(
        `INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, batch_id,
           movement_type, quantity_delta, unit_cost_cents, user_id, reference_id)
         SELECT ?, tenant_id, ?, product_id, ?, 'DEVOLUCION_NC', ?, unit_cost_cents, ?, ?
           FROM sale_items WHERE id = ? AND tenant_id = ?`
      ).bind(crypto.randomUUID(), payload.branchId, item.batchId, item.quantity, userId,
        original.id, item.productId, tenantId).run();
    }
    await txn.prepare(
      `UPDATE accounts_receivable SET balance_due_cents = MAX(0, balance_due_cents - ?),
         status = CASE WHEN balance_due_cents - ? <= 0 THEN 'PAID' ELSE 'PARTIALLY_PAID' END
       WHERE sale_id = ? AND tenant_id = ? AND balance_due_cents > 0`
     ).bind(creditTotal, creditTotal, original.id, tenantId).run();
    const usageInsert = await txn.prepare(
      `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
       VALUES (?, ?, ?, strftime('%Y-%m', 'now'), ?)
       ON CONFLICT (tenant_id, usage_key) DO NOTHING`
    ).bind(crypto.randomUUID(), tenantId, `usage:${referencedDocumentId}`, referencedDocumentId).run();
    if (usageInsert.meta.changes === 1) {
      await txn.prepare(
        `INSERT INTO usage_counters (tenant_id, period_ym, doc_count, updated_at)
         VALUES (?, strftime('%Y-%m', 'now'), 1, CURRENT_TIMESTAMP)
         ON CONFLICT (tenant_id, period_ym) DO UPDATE SET doc_count = doc_count + 1,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(tenantId).run();
    }
    await txn.prepare(
      `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, must_submit_by)
       VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`
    ).bind(crypto.randomUUID(), tenantId, referencedDocumentId).run();
     return { status: 'SUCCESS', referencedSaleId: original.id, totalAmountCents: creditTotal, auditRequired: noCdrTotalCancellation };
  });
}

async function resolveReferencedCreditTotal(
  db: D1Database,
  tenantId: string,
  originalSaleId: string,
  items: Array<{ saleItemId?: string; quantity: number }>
): Promise<number> {
  let total = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('INVALID_RETURN_QUANTITY');
    if (!item.saleItemId) throw new Error('RETURN_ITEM_REFERENCE_REQUIRED');
    const row = await db.prepare(
      `SELECT total_amount_cents, quantity FROM sale_items
        WHERE id = ? AND sale_id = ? AND tenant_id = ? AND is_uncatalogued IN (0, 1)`
    ).bind(item.saleItemId, originalSaleId, tenantId).first<{ total_amount_cents: number; quantity: number }>();
    if (!row || item.quantity > row.quantity) throw new Error('RETURN_QUANTITY_EXCEEDS_ORIGINAL');
    total += Math.round(row.total_amount_cents * item.quantity / row.quantity);
  }
  return total;
}

async function verifyAuthorization(
  db: D1Database,
  tenantId: string,
  rawToken: string
): Promise<{ authorizationId: string; approvedBy: string } | null> {
  const tokenHash = await argon2idHash(rawToken);
  const row = await db.prepare(
    `SELECT id, token_hash, expires_at, used_at, approved_by_user_id
       FROM authorization_tokens
      WHERE tenant_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
  ).bind(tenantId, tokenHash).first<{ id: string; token_hash: string; expires_at: string; used_at: string | null; approved_by_user_id: string }>();
  if (!row || !(await argon2idVerify(rawToken, row.token_hash))) return null;
  // El UPDATE used_at + audit se agregan al mismo plan db.batch() del cobro;
  // nunca se consume un token en una escritura separada de la venta.
  return { authorizationId: row.id, approvedBy: row.approved_by_user_id };
}

async function computeAuditHash(event: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(event, Object.keys(event).sort());
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function previousAuditHash(txn: any, tenantId: string): Promise<string | null> {
  const row = await txn.prepare(
    `SELECT row_hash FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`
  ).bind(tenantId).first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

export async function processOfflineSaleAtomic(  
  db: D1Database,  
  tenantId: string,  
  userId: string,  
  payload: OfflineSalePayload  
) {  
  // 0. Zero-Trust fiscal y financiero (validación ejecutable, no solo comentario):
  //    - identidad local obligatoria; JWT/tenant no sustituyen la fila users activa.
  //    - document_type ∈ enabled_document_types ∩ matriz §5.1; régimen×modo se valida en D1.
  //    - 01 ⇒ RUC tipo 6 válido; 03 >= 70000 ⇒ documento real + clientName; NRUS nunca 01.
  //    - cantidades y todos los *_cents son finitos, enteros y no negativos; quantity > 0.
  //    - isUncatalogued ⇒ productId === null y manualPriceCents válido; producto catalogado ⇒ productId != null.
  //    - payload.series/number son hints: el servidor/DO reserva el folio por branch en el batch.
  //    - 07/08/NV_RETURN salen por el handler de documento referenciado, nunca por el flujo de venta normal.
  assertOfflineSaleShape(payload);
  await assertTenantUserAndBranch(db, tenantId, userId, payload.branchId);
  // 1. Idempotencia: respaldada por idx_sales_offline_id (PERF-02/SYN-01) — el SELECT pre-tx es
  //    optimización; la garantía real es el UNIQUE + ON CONFLICT / captura SQLITE_CONSTRAINT →
  //    {status:'ALREADY_SYNCED'} dentro de la tx.
  const existingSale = await db.prepare(  
    `SELECT id, total_amount_cents, sunat_status, created_at FROM sales   
     WHERE tenant_id = ? AND offline_client_sale_id = ? AND deleted_at IS NULL`  
  ).bind(tenantId, payload.offlineSaleId).first<{  
    id: string;  
    total_amount_cents: number;  
    sunat_status: string;  
    created_at: string;  
  }>();

  if (existingSale) {  
    const itemsTaxDetail = await db.prepare(  
      `SELECT product_id, igv_amount_cents, icbper_amount_cents, total_amount_cents FROM sale_items WHERE sale_id = ?`  
    ).bind(existingSale.id).all();

    return {  
      status: 'ALREADY_SYNCED',  
      saleId: existingSale.id,  
      authoritativeTotalAmount: existingSale.total_amount_cents,  
      authoritativeStatus: existingSale.sunat_status,  
      authoritativeIssuedAt: existingSale.created_at,  
      itemsTaxDetail: itemsTaxDetail.results,  
      reconciliationRequired: true  
    };  
  }

  if (['07', '08', 'NV_RETURN'].includes(payload.documentType)) {
    return processReferencedDocumentAtomic(db, tenantId, userId, payload);
  }

  // 2. Plan atómico D1 (ACID Guarantee): el adapter compila el plan a db.batch([...]).  
  return await runD1AtomicPlan(db, async (txn) => {  
    if (overrideAuthorization) {
      await txn.prepare(
        `UPDATE authorization_tokens SET used_at = CURRENT_TIMESTAMP
          WHERE id = ? AND tenant_id = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
      ).bind(overrideAuthorization.authorizationId, tenantId).run();
      await txn.prepare(
        `INSERT INTO audit_events (id, tenant_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash)
         VALUES (?, ?, ?, 'AUTHORIZATION_CONSUMED', 'authorization_token', ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), tenantId, userId, overrideAuthorization.authorizationId,
        JSON.stringify({ approved_by: overrideAuthorization.approvedBy }), await previousAuditHash(txn, tenantId),
        await computeAuditHash({ action: 'AUTHORIZATION_CONSUMED', entity_id: overrideAuthorization.authorizationId })).run();
    }
    // Validar Sesión de Caja  
    const session = await txn.prepare(  
      `SELECT id FROM cash_register_sessions   
       WHERE id = ? AND tenant_id = ? AND branch_id = ? AND status = 'OPEN'`  
    ).bind(payload.cashRegisterSessionId, tenantId, payload.branchId).first();

    if (!session) {  
      throw new Error('Invalid or closed cash register session');  
    }

    // Timestamps UTC-5
    // SYN-04/SEC-06: ventana de skew ÚNICA ±6h (Principio 7). Fuera de ventana → 422 explícito,
    // NUNCA re-fecha a now (movería summary_date/must_submit_by a un día fiscal falso). La única
    // re-fecha permitida es con audit_events TIMESTAMP_OVERRIDE + autorización supervisor.
    const clientTime = payload.issuedAt ? new Date(payload.issuedAt).getTime() : Date.now();  
    const now = Date.now();  
    const ISSUED_AT_SKEW_MS = 6 * 3600 * 1000;  
    if (!Number.isFinite(clientTime)) throw new Error('INVALID_ISSUED_AT');
    if (now - clientTime > ISSUED_AT_SKEW_MS || clientTime > now + ISSUED_AT_SKEW_MS) {  
      throw new Error('ISSUED_AT_SKEW_VIOLATION');  
    }  
    const validatedTimeMs = clientTime;  
    const peruTimestamp = new Date(validatedTimeMs - 5 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    // Tipo de Cambio Servidor  
    const currency = payload.currency || 'PEN';  
    let serverExchangeRate = 1.0;  
    if (currency !== 'PEN') {  
      const rateRow = await txn.prepare(  
        `SELECT rate FROM exchange_rates   
         WHERE tenant_id = ? AND source_currency = ? AND target_currency = 'PEN'   
         AND effective_date <= date(?) ORDER BY effective_date DESC LIMIT 1`  
      ).bind(tenantId, currency, peruTimestamp.substring(0, 10)).first<{ rate: number }>();

      if (!rateRow) {  
        throw new Error(`Exchange rate missing for ${currency}`);  
      }  
      serverExchangeRate = rateRow.rate;  
    }
    const toPenCents = (sourceCents: number) => Math.round(sourceCents * serverExchangeRate);

    const saleId = crypto.randomUUID();  
    // Convención dinero (§5): todo monto en INTEGER cents. El cliente envía centavos.
    // IGV = subtotal_cents × tasa / 100; el resultado se redondea a centavo en el servidor
    // (Math.round), nunca toFixed/floats. El cobro NUNCA redondea por su cuenta.
    let calculatedTotalTaxable = 0;
    let calculatedTotalExempt = 0;
    let calculatedTotalDiscount = 0;
    let calculatedTotalIgv = 0;  
    let calculatedTotalIcbper = 0;  
    let calculatedTotalCogs = 0;  
    let calculatedTotalAmount = 0;

    // CRM Customer Upsert — LWW por clientProfileUpdatedAt (Last-Write-Wins).
    // SYN-08: el LWW compara SIEMPRE en reloj de SERVIDOR — clientProfileUpdatedAt se
    // ajusta antes de comparar: serverAdjusted = clamp(deviceTs, serverNow ± 6h). Un
    // reloj de dispositivo adelantado dentro del skew jamás sobrescribe datos nuevos.
    // PERF-07: el upsert usa RETURNING id (D1/SQLite ≥3.35) para evitar el re-SELECT.
    // SEC-07/LPDP: una fila con pii_erased=1 o deleted_at NO NULL está anonimizada/borrada
    // → NO se re-materializa PII; el upsert se bloquea con LPDP_ERASE_BLOCK + alerta Admin.
    let finalCustomerId = payload.customerId || null;  
    if (payload.clientDocumentNumber && payload.clientDocumentNumber !== '00000000') {  
      const generatedCustId = crypto.randomUUID();  
      const deviceTs = new Date(payload.clientProfileUpdatedAt || new Date().toISOString()).getTime();  
      if (!Number.isFinite(deviceTs)) throw new Error('INVALID_PROFILE_TIMESTAMP');
      const serverNowMs = Date.now();  
      const adjusted = Math.min(Math.max(deviceTs, serverNowMs - ISSUED_AT_SKEW_MS), serverNowMs + ISSUED_AT_SKEW_MS);  
      const profileTs = new Date(adjusted).toISOString();  
      const erasedCheck = await txn.prepare(  
        `SELECT pii_erased, deleted_at FROM customers WHERE tenant_id = ? AND document_type_code = ? AND document_number = ?`  
      ).bind(tenantId, payload.clientDocumentType, payload.clientDocumentNumber).first<{ pii_erased: number; deleted_at: string | null }>();
      if (erasedCheck && (erasedCheck.pii_erased === 1 || erasedCheck.deleted_at !== null)) {  
        await txn.prepare(`  
          INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, created_at)  
          VALUES (?, ?, ?, ?, 'LPDP_ERASE_BLOCK', 'customer', ?, ?, ?)  
        `).bind(crypto.randomUUID(), tenantId, payload.branchId, userId, erasedCheck.deleted_at ? '' : payload.clientDocumentNumber, JSON.stringify({ documentNumber: payload.clientDocumentNumber }), peruTimestamp).run();  
        finalCustomerId = null;  // venta SIN perfil: se guarda solo el snapshot fiscal del comprobante
      } else {  
        const upsertResult = await txn.prepare(`  
          INSERT INTO customers (id, tenant_id, document_type_code, document_number, name, email, phone, address, profile_updated_at, is_active)  
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)  
          ON CONFLICT(tenant_id, document_type_code, document_number) WHERE deleted_at IS NULL  
          DO UPDATE SET  
            name = excluded.name,  
            email = excluded.email,  
            phone = excluded.phone,  
            address = excluded.address,  
            profile_updated_at = excluded.profile_updated_at,  
            is_active = 1  
          WHERE customers.profile_updated_at <= excluded.profile_updated_at  
          RETURNING id  
        `).bind(generatedCustId, tenantId, payload.clientDocumentType, payload.clientDocumentNumber, payload.clientName, payload.clientEmail ?? null, payload.clientPhone ?? null, payload.clientAddress ?? null, profileTs).first<{ id: string }>();
        if (upsertResult) {
          finalCustomerId = upsertResult.id;
        } else {
          const existingCustomer = await txn.prepare(
            `SELECT id FROM customers WHERE tenant_id = ? AND document_type_code = ? AND document_number = ? AND deleted_at IS NULL`
          ).bind(tenantId, payload.clientDocumentType, payload.clientDocumentNumber).first<{ id: string }>();
          if (!existingCustomer) throw new Error('CUSTOMER_UPSERT_INCONSISTENT');
          finalCustomerId = existingCustomer.id;
        }
      }  
    }
    // Nota: sales.client_name / client_document_* son SNAPSHOT histórico del comprobante
    // (no se reescriben retroactivamente). El perfil VIVO vive en customers y es el único
    // que se actualiza con LWW arriba.

    // Pre-validar Stock y Calcular Impuestos
    // PERF-01 (regla dura): el hot path NO hace lecturas por ítem dentro del plan db.batch().
    // 1 SELECT batch: products JOIN product_prices LEFT JOIN product_taxes WHERE p.id IN (placeholders)  
    // para TODOS los ítems del payload (≤ 7 round-trips D1 totales por venta: idempotencia,
    // 1 batch de productos+precios+impuestos, upsert CRM, multi-row sale_items, stock,
    // INSERT sales, upsert cupo — SIN lecturas por ítem dentro del plan db.batch()).
    // SEC-02: el servidor re-valida CADA item:
    //   - discountAmount ≤ subtotal y ≤ max_*_without_auth (tenant_discount_policies) → else 422
  //     DISCOUNT_EXCEEDS_LIMIT (o AUTH_TOKEN_REQUIRED si no trae authorizationToken válido);
    //   - manualPriceCents dentro de max_amount_without_auth_cents salvo authz (venta rápida R34);
    //   - Σ payments == calculatedTotalAmount → else 422 PAYMENT_TOTAL_MISMATCH (tras el bucle de pagos).
  // tenantPolicies (tenant_discount_policies del tenant, cache 5-10s in-isolate) se carga FUERA
  // de la tx; authorizationToken se verifica server-side (argon2id, TTL 90s, single-use, regla 2).
  const overrideAuthorization = payload.authorizationToken
    ? await verifyAuthorization(db, tenantId, payload.authorizationToken)
    : null;
  const catalog = await preloadCatalogForSale(db, tenantId, payload.branchId, payload.items, payload.priceListId);
  for (const item of payload.items) {  
      // Venta rápida sin catálogo (regla 34, edge de integración 2A): no hay
      // producto en listas → el motor acepta manualPriceCents del cliente como
      // fuente de verdad (dentro del umbral sin authz, regla 2/17), aplica IGV
      // default del tenant, NO descuenta stock y NO registra inventory_movements.
      if (item.isUncatalogued) {  
        if (typeof item.manualPriceCents !== 'number' || item.manualPriceCents < 0) {  
          throw new Error('Uncatalogued line requires a valid manualPriceCents');  
        }  
        const manualPricePenCents = toPenCents(item.manualPriceCents);
        const discountPenCents = toPenCents(item.discountAmountCents ?? 0);
        if (manualPricePenCents > tenantPolicies.max_amount_without_auth_cents && !overrideAuthorization) {  
          throw new Error('AUTH_TOKEN_REQUIRED');  
        }  
        const itemSubtotal = (item.quantity * manualPricePenCents) - discountPenCents;  
        if (itemSubtotal < 0) {  
          throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');  
        }  
        const igvRate = catalog.defaultIgvRate;
        const itemIgv = Math.round((itemSubtotal * igvRate) / 100);  
        const itemTotalAmount = itemSubtotal + itemIgv;  
        calculatedTotalTaxable += itemSubtotal;
        calculatedTotalDiscount += discountPenCents;
        calculatedTotalIgv += itemIgv;  
        calculatedTotalAmount += itemTotalAmount;  
        await txn.prepare(`  
          INSERT INTO sale_items (id, tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price_cents, unit_cost_cents, discount_amount_cents, subtotal_cents, igv_amount_cents, icbper_amount_cents, total_amount_cents, batch_id, seller_id, is_uncatalogued)  
          VALUES (?, ?, ?, NULL, 'Artículo sin catalogar', 'generic', ?, ?, 0, ?, ?, ?, 0, ?, ?, 1)  
        `).bind(  
          crypto.randomUUID(), tenantId, saleId, item.quantity, manualPricePenCents,  
          discountPenCents, itemSubtotal, itemIgv, itemTotalAmount, payload.sellerId ?? null  
        ).run();  
        await txn.prepare(`  
          INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash, created_at)  
          VALUES (?, ?, ?, ?, 'GENERIC_LINE', 'sale_item', ?, ?, ?, ?, ?)  
        `).bind(crypto.randomUUID(), tenantId, payload.branchId, userId, saleId,
          JSON.stringify({ manualPriceCents: item.manualPriceCents, quantity: item.quantity }), await previousAuditHash(txn, tenantId),
          await computeAuditHash({ action: 'GENERIC_LINE', entity_id: saleId }), peruTimestamp).run();  
        continue;  
      }  

      const product = catalog.products.get(item.productId as string);

      if (!product) throw new Error(`Product not found: ${item.productId}`);

      // SYN-06 (política de oversell offline): una venta ACEPTADA en caja jamás se pierde.
      // Si el sync descubre stock insuficiente, se COMMITEA con stock negativo TRANSITORIO
      // (flag OFFLINE_OVERSELL + audit_events) + alerta Modo Dueño; el conteo físico (regla 10)
      // es el punto de reconciliación. Solo se rechaza (422) si el producto no existe o el
      // tenant prohíbe negativo (allow_negative_stock). Nunca se abandona la venta entregada.
      if (product.product_type === 'physical' && !product.allow_negative_stock && product.branch_stock < item.quantity) {  
        throw new InsufficientStockError(product.id, item.quantity, product.branch_stock);  
      }
      // SYN-05 (FEFO/lotes): para ítems con batchId el servidor RE-valida el lote en la tx:
      //   SELECT expiry_date, stock FROM inventory_batches WHERE id=? AND is_active=1
      //   → expiry < hoy ⇒ 422 EXPIRED_BATCH; UPDATE inventory_batches SET stock=stock-?
      //     WHERE id=? AND stock-?>=0 (0 filas ⇒ InsufficientBatchError);
      //   si el cliente NO propone lote, el servidor asigna FEFO (expiry más próxima, stock>0).
      //   Esto ancla el descuento a inventory_batches (no solo a products.stock agregado).

      let validatedUnitPrice = toPenCents(product.price_cents);  
      if (payload.priceListId) {  
        const override = catalog.prices.get(`${payload.priceListId}:${item.productId}`);
        if (override) validatedUnitPrice = toPenCents(override.price_cents);  
      }

      const taxesList = { results: catalog.taxes.get(item.productId as string) ?? [] };

      let itemIgv = 0;
      let itemIgvAffectationCode = product.igv_affectation_code_default;
      let itemIcbper = 0;  
       const discountCents = toPenCents(item.discountAmountCents ?? 0);
       const itemSubtotal = (item.quantity * validatedUnitPrice) - discountCents;
      // SEC-02: descuento que excede el subtotal o el umbral del tenant → 422 (o AUTH_TOKEN_REQUIRED).
      if (itemSubtotal < 0) {  
        throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');  
      }  
       if (discountCents > tenantPolicies.max_amount_without_auth_cents && !overrideAuthorization) {  
        throw new Error('AUTH_TOKEN_REQUIRED');  
      }

      for (const tax of taxesList.results) {  
        if (tax.code === '1000') itemIgv = Math.round((itemSubtotal * tax.rate_percentage) / 100);  
        else if (tax.code === '7152' || tax.is_flat_fee) itemIcbper = tax.flat_fee_amount_cents * item.quantity;  
      }

      const itemTotalAmount = itemSubtotal + itemIgv + itemIcbper;  
      const effectiveBatchId = await resolveAndReserveBatch(txn, tenantId, payload.branchId, item.productId, item.batchId, item.quantity, peruTimestamp);
      const itemCogs = product.pmp_cost_cents * item.quantity;

      if (['20', '30', '31'].includes(itemIgvAffectationCode)) calculatedTotalExempt += itemSubtotal;
      else calculatedTotalTaxable += itemSubtotal;
      calculatedTotalDiscount += discountCents;
      calculatedTotalIgv += itemIgv;  
      calculatedTotalIcbper += itemIcbper;  
      calculatedTotalCogs += itemCogs;  
      calculatedTotalAmount += itemTotalAmount;

      await txn.prepare(`  
        INSERT INTO sale_items (id, tenant_id, sale_id, product_id, product_name, product_type, quantity, unit_price_cents, unit_cost_cents, discount_amount_cents, subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents, total_amount_cents, batch_id)  
        VALUES (?, ?, ?, ?, 'Producto POS', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)  
      `).bind(  
        crypto.randomUUID(), tenantId, saleId, item.productId, product.product_type,  
         item.quantity, validatedUnitPrice, product.pmp_cost_cents, discountCents,  
        itemSubtotal, itemIgvAffectationCode, itemIgv, itemIcbper, itemTotalAmount, effectiveBatchId  
      ).run();

      if (product.product_type === 'service') continue;

      if (product.product_type === 'physical' && product.allow_negative_stock && product.branch_stock < item.quantity) {
        await txn.prepare(
          `INSERT INTO audit_events (id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id, payload_json, prev_hash, row_hash)
           VALUES (?, ?, ?, ?, 'OFFLINE_OVERSELL', 'sale_item', ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), tenantId, payload.branchId, userId, saleId,
          JSON.stringify({ productId: item.productId, requested: item.quantity, available: product.branch_stock }), await previousAuditHash(txn, tenantId),
          await computeAuditHash({ action: 'OFFLINE_OVERSELL', entity_id: saleId })).run();
        // La alerta al Modo Dueño se publica post-commit; no bloquea la venta aceptada en caja.
      }

      const updateRes = await txn.prepare(`  
        UPDATE branch_product_stock
           SET stock = stock - ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
           AND (stock - ? >= 0 OR ? = 1)  
      `).bind(item.quantity, tenantId, payload.branchId, item.productId, item.quantity, product.allow_negative_stock ? 1 : 0).run();

      if (updateRes.meta.changes === 0) {  
        throw new InsufficientStockError(product.id, item.quantity, product.branch_stock);  
      }

      await txn.prepare(`  
        INSERT INTO inventory_movements (id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta, unit_cost_cents, stock_after, user_id, reference_id, created_at)  
        VALUES (?, ?, ?, ?, ?, 'VENTA', ?, ?, (SELECT stock FROM branch_product_stock WHERE tenant_id = ? AND branch_id = ? AND product_id = ?), ?, ?, ?)  
      `).bind(  
        crypto.randomUUID(), tenantId, payload.branchId, item.productId,  
        effectiveBatchId, -item.quantity, product.pmp_cost_cents, tenantId, payload.branchId, item.productId, userId, saleId, peruTimestamp  
      ).run();  
    }

    for (const [paymentIndex, payment] of payload.payments.entries()) {
      const paymentMethod = await txn.prepare(
        `SELECT id, code FROM payment_methods WHERE id = ? AND tenant_id = ? AND is_active = 1`
      ).bind(payment.paymentMethodId, tenantId).first<{ id: string; code: string }>();
      if (!paymentMethod) throw new Error('PAYMENT_METHOD_NOT_FOUND');
      if (payment.isCredit && paymentMethod.code !== 'credit') throw new Error('CREDIT_METHOD_MISMATCH');
      const paymentAmountCents = toPenCents(payment.amount_cents);
      if (payment.isCredit) {
        if (!finalCustomerId) throw new Error('CREDIT_CUSTOMER_REQUIRED');
        const credit = await txn.prepare(
          `SELECT c.credit_limit_cents,
                  COALESCE((SELECT SUM(ar.balance_due_cents) FROM accounts_receivable ar
                    WHERE ar.customer_id = c.id AND ar.tenant_id = c.tenant_id AND ar.balance_due_cents > 0), 0) AS balance_due
             FROM customers c WHERE c.id = ? AND c.tenant_id = ? AND c.pii_erased = 0`
        ).bind(finalCustomerId, tenantId).first<{ credit_limit_cents: number; balance_due: number }>();
        if (!credit || credit.balance_due + paymentAmountCents > credit.credit_limit_cents) {
          throw new Error('CREDIT_LIMIT_EXCEEDED');
        }
      }
      const salePaymentId = crypto.randomUUID();  
      await txn.prepare(`  
        INSERT INTO sale_payments (id, tenant_id, sale_id, payment_method_id, amount_cents, reference_number)  
        VALUES (?, ?, ?, ?, ?, ?)  
      `).bind(  
        salePaymentId, tenantId, saleId, payment.paymentMethodId, paymentAmountCents, payment.referenceNumber ?? null
      ).run();  
      // Captura offline (regla 2 §5.4, edge 2B): pago electrónico aceptado sin red
      // → MANUAL_ELECTRONIC_CAPTURE para que Modo Dueño sepa que NO fue conciliado por API.
      // DAT-11: se REUSA el id de sale_payments (nunca un UUID nuevo → FK huérfana).
      if (payment.captureStatus === 'MANUAL') {  
        await txn.prepare(`  
          INSERT INTO payment_captures (id, tenant_id, sale_id, sale_payment_id, acquirer, acquirer_ref, status, amount_cents, idempotency_key, created_at)  
          VALUES (?, ?, ?, ?, ?, ?, 'MANUAL_ELECTRONIC_CAPTURE', ?, ?, ?)  
        `).bind(  
          crypto.randomUUID(), tenantId, saleId, salePaymentId, 'manual', payment.referenceNumber ?? null, paymentAmountCents, `${payload.offlineSaleId}:${paymentIndex}:${payment.paymentMethodId}`, peruTimestamp
        ).run();  
      }  
      // DAT-05: pago a crédito → CxC en la MISMA tx (regla 21). El cliente marca `isCredit` solo
      // en NV y CPE con método 'crédito' (§4.2); el servidor re-valida contra payment_methods
      // en producción (regla 2). due_date = política de crédito del tenant (default +30d).
      if (payment.isCredit) {  
        await txn.prepare(`  
          INSERT INTO accounts_receivable (id, tenant_id, customer_id, sale_id, original_amount_cents, balance_due_cents, due_date, status, created_at)  
          VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)  
        `).bind(  
          crypto.randomUUID(), tenantId, finalCustomerId, saleId, paymentAmountCents, paymentAmountCents, addDays(peruTimestamp, tenantCreditPolicyDays), peruTimestamp
        ).run();  
      }  
    }

    // SEC-02: reconciliación de pagos — Σ amount_cents DEBE igualar calculatedTotalAmount
    // (un pago que no suma el total no crea CxC silenciosa: o hay crédito declarado o es 422).
    const sumPayments = payload.payments.reduce((acc, p) => acc + toPenCents(p.amount_cents), 0);  
    if (sumPayments !== calculatedTotalAmount) {  
      throw new Error('PAYMENT_TOTAL_MISMATCH');  
    }

    // FIS-02/DAT-02: estado SUNAT y deadline por tipo de documento.
    // NV / NV_RETURN → sin fiscalidad (NOT_APPLICABLE, must_submit_by = null);
    // CPE '01' → PENDING + must_submit_by = issued_date_lima + 3d (fin día Lima);
    // CPE '03' → PENDING + must_submit_by = issued_date_lima + 7d (fin día Lima); se encola a RC.
    // SEC-05/SYN-02: el correlativo lo EMITE el servidor (branch_document_series / DO de serie)
    // en esta tx; si el folio propuesto colisiona → 409 SERIES_MISMATCH, nunca se persiste verbatim.
    const isCpe = payload.documentType !== 'NV' && payload.documentType !== 'NV_RETURN';  
    const sunatStatus = isCpe ? 'PENDING' : 'NOT_APPLICABLE';  
    const mustSubmitBy = isCpe ? computeMustSubmitBy(peruTimestamp, payload.documentType) : null;  
    const authoritativeFolio = await reserveServerFolio(tenantId, payload.branchId, payload.documentType, payload.series);

    await txn.prepare(`  
      INSERT INTO sales (id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id, offline_client_sale_id, client_document_type, client_document_number, client_name, document_type, series, number, referenced_sale_id, credit_note_motive_code, currency, exchange_rate, total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents, total_discount_cents, total_cogs_cents, total_amount_cents, sunat_status, issued_at_lima, must_submit_by, void_status, created_at)  
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NONE', ?)  
    `).bind(  
      saleId, tenantId, payload.branchId, payload.cashRegisterSessionId, userId,  
      finalCustomerId, payload.offlineSaleId, payload.clientDocumentType,  
      payload.clientDocumentNumber, payload.clientName, payload.documentType,  
      authoritativeFolio.series, authoritativeFolio.number, null, null, currency, serverExchangeRate,  
      calculatedTotalTaxable, calculatedTotalExempt, calculatedTotalIgv, calculatedTotalIcbper, calculatedTotalDiscount,
      calculatedTotalCogs, calculatedTotalAmount, sunatStatus, peruTimestamp,  
      mustSubmitBy, peruTimestamp  
    ).run();

    if (isCpe) {
      await txn.prepare(
        `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, next_attempt_at)
         VALUES (?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`
      ).bind(crypto.randomUUID(), tenantId, saleId).run();
    }

    // PERF-10/PERF-08: cupo por documento emitido (§4.1) en la MISMA tx, idempotente por venta
    // (reusa la semántica de sale_idempotency_key — la re-entrega no doble-cuenta).
    // PERF-08: TODOS los tipos cuentan cupo, incluidos NV/NV_RETURN (tabla §4.1); la
    // idempotencia física viene del UNIQUE idx_sales_offline_id (PERF-02/SYN-01), no del SELECT.
    const usageInsert = await txn.prepare(
      `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id, usage_key) DO NOTHING`
    ).bind(crypto.randomUUID(), tenantId, `usage:${saleId}`, peruTimestamp.slice(0, 7), saleId).run();
    if (usageInsert.meta.changes === 1) {
      await txn.prepare(`
        INSERT INTO usage_counters (tenant_id, period_ym, doc_count, updated_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT (tenant_id, period_ym) DO UPDATE SET doc_count = doc_count + 1
      `).bind(tenantId, peruTimestamp.slice(0, 7), peruTimestamp).run();
    }

    return { status: 'SUCCESS', saleId, totalAmountCents: calculatedTotalAmount };  
  });  
}

