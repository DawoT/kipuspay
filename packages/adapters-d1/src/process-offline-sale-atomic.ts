/**
 * processOfflineSaleAtomic — NV/CPE hot path (Arquitectura §6 / §5 / SYN-12).
 * Preflight fuera del batch; una sola db.batch vía runD1AtomicPlan.
 */
/* eslint-disable complexity -- motor ACID multi-rama NV/CPE/return; split diferido */
import {
  assertOfflineSaleShape,
  computeNvLineTotals,
  InsufficientStockError,
  resolveIssuedAtMs,
  toLimaTimestamp,
  type OfflineSalePayload,
} from '@kipuspay/domain-sales';
import {
  assertEmissionAllowed,
  computeMustSubmitByIso,
  defaultSunatStatus,
  type DocumentTypeCode,
  type FormalizationMode,
  type TaxRegime,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export type OfflineSaleResult =
  | {
      status: 'SUCCESS';
      saleId: string;
      authoritativeTotalAmount: number;
      series: string;
      number: number;
    }
  | {
      status: 'ALREADY_SYNCED';
      saleId: string;
      authoritativeTotalAmount: number;
      authoritativeStatus: string;
      authoritativeIssuedAt: string;
      reconciliationRequired: true;
    };

interface ProductRow {
  id: string;
  name: string;
  product_type: string;
  price_cents: number;
  cost_cents: number;
  allow_negative_stock: number | boolean;
  branch_stock: number;
}

function isUniqueConstraint(error: unknown): boolean {
  const msg = String(error);
  return /UNIQUE|constraint/i.test(msg);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computeAuditHash(event: Record<string, unknown>): Promise<string> {
  return sha256Hex(JSON.stringify(event));
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

async function loadAlreadySynced(
  db: D1DatabaseLike,
  tenantId: string,
  offlineSaleId: string,
): Promise<OfflineSaleResult | null> {
  const existing = await db
    .prepare(
      `SELECT id, total_amount_cents, sunat_status, created_at FROM sales
       WHERE tenant_id = ? AND offline_client_sale_id = ? AND deleted_at IS NULL`,
    )
    .bind(tenantId, offlineSaleId)
    .first<{
      id: string;
      total_amount_cents: number;
      sunat_status: string;
      created_at: string;
    }>();
  if (!existing) return null;
  return {
    status: 'ALREADY_SYNCED',
    saleId: existing.id,
    authoritativeTotalAmount: existing.total_amount_cents,
    authoritativeStatus: existing.sunat_status,
    authoritativeIssuedAt: existing.created_at,
    reconciliationRequired: true,
  };
}

async function loadCatalogAndStock(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  productIds: readonly string[],
): Promise<{
  catalog: Map<string, { priceCents: number; costCents: number; name: string; type: string }>;
  stockByProduct: Map<string, { stock: number; allowNegative: boolean; hasBranchRow: boolean }>;
}> {
  const catalog = new Map<
    string,
    { priceCents: number; costCents: number; name: string; type: string }
  >();
  const stockByProduct = new Map<
    string,
    { stock: number; allowNegative: boolean; hasBranchRow: boolean }
  >();

  for (const productId of productIds) {
    const row = await db
      .prepare(
        `SELECT p.id, p.name, p.product_type, p.price_cents, p.cost_cents, p.allow_negative_stock,
                COALESCE(bps.stock, p.stock) AS branch_stock,
                CASE WHEN bps.product_id IS NULL THEN 0 ELSE 1 END AS has_branch_row
         FROM products p
         LEFT JOIN branch_product_stock bps
           ON bps.tenant_id = p.tenant_id AND bps.product_id = p.id AND bps.branch_id = ?
         WHERE p.tenant_id = ? AND p.id = ? AND p.deleted_at IS NULL AND p.is_active = 1`,
      )
      .bind(branchId, tenantId, productId)
      .first<ProductRow & { has_branch_row: number }>();
    if (!row) throw new Error(`Product not found: ${productId}`);
    catalog.set(productId, {
      priceCents: row.price_cents,
      costCents: row.cost_cents ?? 0,
      name: row.name,
      type: row.product_type,
    });
    stockByProduct.set(productId, {
      stock: row.branch_stock,
      allowNegative: Boolean(row.allow_negative_stock),
      hasBranchRow: row.has_branch_row === 1,
    });
  }
  return { catalog, stockByProduct };
}

function assertStockAvailable(
  payload: OfflineSalePayload,
  catalog: Map<string, { type: string }>,
  stockByProduct: Map<string, { stock: number; allowNegative: boolean }>,
): void {
  if (payload.documentType === 'NV_RETURN') return;
  for (const item of payload.items) {
    const stock = stockByProduct.get(item.productId)!;
    if (
      catalog.get(item.productId)!.type === 'physical' &&
      !stock.allowNegative &&
      stock.stock < item.quantity
    ) {
      throw new InsufficientStockError(item.productId, item.quantity, stock.stock);
    }
  }
}

/**
 * Consolida venta offline NV/CPE de forma atómica (Sprint 4–5).
 */
export async function processOfflineSaleAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  payload: OfflineSalePayload,
  nowMs: number = Date.now(),
): Promise<OfflineSaleResult> {
  assertOfflineSaleShape(payload);

  const already = await loadAlreadySynced(db, tenantId, payload.offlineSaleId);
  if (already) return already;

  const tenant = await db
    .prepare(`SELECT formalization_mode, tax_regime FROM tenants WHERE id = ?`)
    .bind(tenantId)
    .first<{ formalization_mode: string; tax_regime: string }>();
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  const session = await db
    .prepare(
      `SELECT id FROM cash_register_sessions
       WHERE id = ? AND tenant_id = ? AND branch_id = ? AND status = 'OPEN'`,
    )
    .bind(payload.cashRegisterSessionId, tenantId, payload.branchId)
    .first<{ id: string }>();
  if (!session) throw new Error('Invalid or closed cash register session');

  const issuedMs = resolveIssuedAtMs(payload.issuedAt, nowMs);
  const limaTs = toLimaTimestamp(issuedMs);

  const productIds = [...new Set(payload.items.map((i) => i.productId))];
  const { catalog, stockByProduct } = await loadCatalogAndStock(
    db,
    tenantId,
    payload.branchId,
    productIds,
  );
  assertStockAvailable(payload, catalog, stockByProduct);

  const totals = computeNvLineTotals(
    payload.items,
    new Map(
      [...catalog.entries()].map(([id, p]) => [
        id,
        { priceCents: p.priceCents, costCents: p.costCents },
      ]),
    ),
  );

  const paySum = payload.payments.reduce((s, p) => s + p.amountCents, 0);
  if (paySum !== totals.totalAmountCents) throw new Error('PAYMENT_TOTAL_MISMATCH');

  const docType = payload.documentType as DocumentTypeCode;
  assertEmissionAllowed({
    formalizationMode: tenant.formalization_mode as FormalizationMode,
    taxRegime: tenant.tax_regime as TaxRegime,
    documentType: docType,
    totalAmountCents: totals.totalAmountCents,
    clientDocumentType: payload.clientDocumentType,
    clientDocumentNumber: payload.clientDocumentNumber,
    clientName: payload.clientName,
  });

  const seriesDocCode = docType === 'NV_RETURN' ? 'NV_RETURN' : docType;
  const seriesRow = await db
    .prepare(
      `SELECT id, series, current_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
         AND series = ? AND is_active = 1`,
    )
    .bind(tenantId, payload.branchId, seriesDocCode, payload.series)
    .first<{ id: string; series: string; current_number: number }>();
  if (!seriesRow) throw new Error('SERIES_NOT_FOUND');

  const sunatStatus = defaultSunatStatus(docType);
  const mustSubmitBy = computeMustSubmitByIso(docType, issuedMs);
  const isReturn = docType === 'NV_RETURN';

  const saleId = crypto.randomUUID();
  const qtyByProduct = new Map<string, number>();
  for (const item of payload.items) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  // SYN-06: preparar OFFLINE_OVERSELL antes del batch (hash-chain sobre stock preflight).
  const oversellAudits: Array<{
    id: string;
    productId: string;
    requested: number;
    available: number;
    prevHash: string | null;
    rowHash: string;
  }> = [];
  let chainPrev = await previousAuditHash(db, tenantId);
  if (!isReturn) {
    for (const [productId, qty] of qtyByProduct) {
      if (catalog.get(productId)!.type !== 'physical') continue;
      const st = stockByProduct.get(productId)!;
      if (st.allowNegative && st.stock < qty) {
        const id = crypto.randomUUID();
        const rowHash = await computeAuditHash({
          action: 'OFFLINE_OVERSELL',
          entity_id: saleId,
          productId,
          requested: qty,
          available: st.stock,
          prev_hash: chainPrev,
        });
        oversellAudits.push({
          id,
          productId,
          requested: qty,
          available: st.stock,
          prevHash: chainPrev,
          rowHash,
        });
        chainPrev = rowHash;
      }
    }
  }

  try {
    await runD1AtomicPlan(db, (plan) => {
      const stockGuardIds: string[] = [];
      // Stock guard SQL (anti-carrera): ok=0 → CHECK aborta el batch entero.
      // NV_RETURN no exige stock previo (restaura).
      for (const [productId, qty] of qtyByProduct) {
        if (catalog.get(productId)!.type !== 'physical') continue;
        const st = stockByProduct.get(productId)!;
        const allow = isReturn || st.allowNegative ? 1 : 0;
        const guardId = crypto.randomUUID();
        stockGuardIds.push(guardId);
        if (st.hasBranchRow) {
          plan.add(
            db
              .prepare(
                `INSERT INTO atomic_guards (id, ok)
                 SELECT ?, CASE WHEN stock >= ? OR ? = 1 THEN 1 ELSE 0 END
                 FROM branch_product_stock
                 WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
              )
              .bind(guardId, qty, allow, tenantId, payload.branchId, productId),
          );
        } else {
          plan.add(
            db
              .prepare(
                `INSERT INTO atomic_guards (id, ok)
                 SELECT ?, CASE WHEN stock >= ? OR ? = 1 THEN 1 ELSE 0 END
                 FROM products WHERE tenant_id = ? AND id = ?`,
              )
              .bind(guardId, qty, allow, tenantId, productId),
          );
        }
      }

      for (const audit of oversellAudits) {
        plan.add(
          db
            .prepare(
              `INSERT INTO audit_events (
                   id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                   payload_json, prev_hash, row_hash
                 ) VALUES (?, ?, ?, ?, 'OFFLINE_OVERSELL', 'sale_item', ?, ?, ?, ?)`,
            )
            .bind(
              audit.id,
              tenantId,
              payload.branchId,
              userId,
              saleId,
              JSON.stringify({
                productId: audit.productId,
                requested: audit.requested,
                available: audit.available,
              }),
              audit.prevHash,
              audit.rowHash,
            ),
        );
      }

      // Correlativo atómico en el batch (evita carrera en current_number).
      plan.add(
        db
          .prepare(
            `UPDATE branch_document_series
             SET current_number = current_number + 1
             WHERE id = ? AND tenant_id = ?`,
          )
          .bind(seriesRow.id, tenantId),
      );

      plan.add(
        db
          .prepare(
            `INSERT INTO sales (
                 id, tenant_id, branch_id, cash_register_session_id, user_id,
                 offline_client_sale_id, client_document_type, client_document_number, client_name,
                 document_type, series, number, currency, exchange_rate,
                 total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
                 total_discount_cents, total_cogs_cents, total_amount_cents,
                 issued_at_lima, sunat_status, must_submit_by
               )
               SELECT
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 (SELECT current_number FROM branch_document_series WHERE id = ?),
                 'PEN', 1.0, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?`,
          )
          .bind(
            saleId,
            tenantId,
            payload.branchId,
            payload.cashRegisterSessionId,
            userId,
            payload.offlineSaleId,
            payload.clientDocumentType,
            payload.clientDocumentNumber,
            payload.clientName,
            docType,
            payload.series,
            seriesRow.id,
            totals.totalTaxableCents,
            totals.totalIgvCents,
            totals.totalDiscountCents,
            totals.totalCogsCents,
            totals.totalAmountCents,
            limaTs,
            sunatStatus,
            mustSubmitBy,
          ),
      );

      for (const line of totals.lines) {
        const product = catalog.get(line.productId)!;
        plan.add(
          db
            .prepare(
              `INSERT INTO sale_items (
                   id, tenant_id, sale_id, product_id, product_name, product_type,
                   quantity, unit_price_cents, unit_cost_cents, discount_amount_cents,
                   subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
                   total_amount_cents, is_uncatalogued
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '10', ?, 0, ?, 0)`,
            )
            .bind(
              crypto.randomUUID(),
              tenantId,
              saleId,
              line.productId,
              product.name,
              product.type,
              line.quantity,
              line.unitPriceCents,
              line.unitCostCents,
              line.discountCents,
              line.subtotalCents,
              line.igvCents,
              line.totalCents,
            ),
        );
      }

      for (const [productId, qty] of qtyByProduct) {
        if (catalog.get(productId)!.type !== 'physical') continue;
        const before = stockByProduct.get(productId)!;
        const allow = isReturn || before.allowNegative ? 1 : 0;
        const signedQty = isReturn ? -qty : qty; // UPDATE uses stock - signedQty
        const delta = isReturn ? qty : -qty;
        const movementType = isReturn ? 'DEVOLUCION_NC' : 'VENTA';
        if (before.hasBranchRow) {
          plan.add(
            db
              .prepare(
                `UPDATE branch_product_stock
                   SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
                   WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
                     AND (stock >= ? OR ? = 1)`,
              )
              .bind(signedQty, tenantId, payload.branchId, productId, isReturn ? 0 : qty, allow),
          );
        } else {
          plan.add(
            db
              .prepare(
                `INSERT INTO branch_product_stock (
                     tenant_id, branch_id, product_id, stock, pmp_unit_cost_cents, version
                   ) VALUES (?, ?, ?, ?, ?, 1)`,
              )
              .bind(
                tenantId,
                payload.branchId,
                productId,
                before.stock - signedQty,
                catalog.get(productId)!.costCents,
              ),
          );
        }
        plan.add(
          db
            .prepare(
              `INSERT INTO inventory_movements (
                   id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
                   unit_cost_cents, stock_after, user_id, reference_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?,
                   (SELECT stock FROM branch_product_stock
                    WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                   ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              tenantId,
              payload.branchId,
              productId,
              movementType,
              delta,
              catalog.get(productId)!.costCents,
              tenantId,
              payload.branchId,
              productId,
              userId,
              saleId,
            ),
        );
      }

      for (const pay of payload.payments) {
        plan.add(
          db
            .prepare(
              `INSERT INTO sale_payments (
                   id, tenant_id, sale_id, payment_method_id, amount_cents, reference_number
                 ) VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              tenantId,
              saleId,
              pay.paymentMethodId,
              pay.amountCents,
              pay.referenceNumber ?? null,
            ),
        );
      }

      // CPE → fiscal_outbox (NV nunca). Sprint 5: PENDING sin RC (5b).
      if (sunatStatus === 'PENDING') {
        plan.add(
          db
            .prepare(
              `INSERT INTO fiscal_outbox (
                   id, tenant_id, sale_id, status, must_submit_by
                 ) VALUES (?, ?, ?, 'PENDING', ?)`,
            )
            .bind(crypto.randomUUID(), tenantId, saleId, mustSubmitBy),
        );
      }

      for (const gid of stockGuardIds) {
        plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(gid));
      }
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const synced = await loadAlreadySynced(db, tenantId, payload.offlineSaleId);
      if (synced) return synced;
    }
    throw error;
  }

  const saved = await db
    .prepare(`SELECT number FROM sales WHERE id = ? AND tenant_id = ?`)
    .bind(saleId, tenantId)
    .first<{ number: number }>();

  return {
    status: 'SUCCESS',
    saleId,
    authoritativeTotalAmount: totals.totalAmountCents,
    series: payload.series,
    number: saved?.number ?? 0,
  };
}
