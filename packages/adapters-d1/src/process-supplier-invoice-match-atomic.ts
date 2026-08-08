/**
 * Supplier invoice 3-way match — Sprint 29 (§5.3 regla 14).
 * Match factura↔OC↔recepción; CxP por monto facturado; true-up PMP; SUPPLIER_PRICE_DIFF.
 */
import {
  assertThreeWayMatch,
  planCreateAp,
  planSupplierInvoiceJournal,
  type ThreeWayLineInput,
} from '@kipuspay/domain-cash';
import { QUANTITY_SCALE, refreshAvgCostCents } from '@kipuspay/domain-inventory';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import { appendJournalToPlan, loadChartAccountsByCode } from './journal-post.js';

export interface SupplierInvoiceLineInput {
  readonly productId: string;
  readonly invoicedQty: number;
  readonly invoiceUnitCostCents: number;
}

export interface ProcessSupplierInvoiceMatchInput {
  readonly purchaseOrderId: string;
  readonly branchId: string;
  readonly invoiceNumber: string;
  readonly totalCents: number;
  readonly igvCents: number;
  readonly lines: readonly SupplierInvoiceLineInput[];
  readonly priceDiffOverride?: boolean;
  readonly overrideReason?: string | null;
  readonly authorizedByUserId?: string | null;
  readonly dueDateIso?: string;
  readonly chartOfAccountsEnabled?: boolean;
}

export interface ProcessSupplierInvoiceMatchResult {
  readonly status: 'SUCCESS';
  readonly invoiceId: string;
  readonly invoiceStatus: string;
  readonly apId: string;
  readonly apAmountCents: number;
  readonly requiresPriceDiffAudit: boolean;
}

interface PoItemRow {
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost_cents: number;
}

interface TrueUpRow {
  productId: string;
  receivedQty: number;
  invoiceUnitCostCents: number;
  poUnitCostCents: number;
  newPmp: number;
}

function poReceived(status: string): boolean {
  return status === 'RECEIVED' || status === 'PARTIALLY_RECEIVED';
}

function buildThreeWayLines(
  lines: readonly SupplierInvoiceLineInput[],
  byProduct: ReadonlyMap<string, PoItemRow>,
  alreadyInvoicedByProduct: ReadonlyMap<string, number>,
): ThreeWayLineInput[] {
  const threeWayLines: ThreeWayLineInput[] = [];
  for (const line of lines) {
    const poItem = byProduct.get(line.productId);
    if (!poItem) throw new Error('INVOICE_PRODUCT_NOT_ON_PO');
    const receivedQty = poItem.quantity_received ?? 0;
    const alreadyInvoiced = alreadyInvoicedByProduct.get(line.productId) ?? 0;
    const remaining = Math.max(0, receivedQty - alreadyInvoiced);
    threeWayLines.push({
      productId: line.productId,
      orderedQty: poItem.quantity_ordered,
      receivedQty: remaining,
      invoicedQty: line.invoicedQty,
      poUnitCostCents: poItem.unit_cost_cents,
      invoiceUnitCostCents: line.invoiceUnitCostCents,
    });
  }
  return threeWayLines;
}

async function computePmpTrueUps(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  lines: readonly SupplierInvoiceLineInput[],
  byProduct: ReadonlyMap<string, PoItemRow>,
): Promise<TrueUpRow[]> {
  const trueUps: TrueUpRow[] = [];
  for (const line of lines) {
    const poItem = byProduct.get(line.productId)!;
    if (line.invoiceUnitCostCents === poItem.unit_cost_cents) continue;
    const snap = await db
      .prepare(
        `SELECT stock, pmp_unit_cost_cents FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ? LIMIT 1`,
      )
      .bind(tenantId, branchId, line.productId)
      .first<{ stock: number; pmp_unit_cost_cents: number }>();
    if (!snap || snap.stock <= 0) continue;
    // Re-blend: treat as if we "re-receive" at invoice cost for the invoiced qty against current PMP.
    const newPmp = refreshAvgCostCents({
      previousStock: Math.max(0, snap.stock - line.invoicedQty),
      previousPmpCents: snap.pmp_unit_cost_cents,
      inboundQty: line.invoicedQty,
      inboundUnitCostCents: line.invoiceUnitCostCents,
    });
    trueUps.push({
      productId: line.productId,
      receivedQty: line.invoicedQty,
      invoiceUnitCostCents: line.invoiceUnitCostCents,
      poUnitCostCents: poItem.unit_cost_cents,
      newPmp,
    });
  }
  return trueUps;
}

async function loadAlreadyInvoiced(
  db: D1DatabaseLike,
  tenantId: string,
  purchaseOrderId: string,
): Promise<ReadonlyMap<string, number>> {
  const res = await db
    .prepare(
      `SELECT sil.product_id, COALESCE(SUM(sil.invoiced_qty), 0) AS qty
       FROM supplier_invoice_lines sil
       INNER JOIN supplier_invoices si ON si.tenant_id = sil.tenant_id AND si.id = sil.invoice_id
       WHERE si.tenant_id = ? AND si.purchase_order_id = ?
         AND si.status IN ('MATCHED','PARTIAL','CLOSED')
       GROUP BY sil.product_id`,
    )
    .bind(tenantId, purchaseOrderId)
    .all<{ product_id: string; qty: number }>();
  return new Map((res.results ?? []).map((r) => [r.product_id, r.qty]));
}

async function sha256Hex(payload: Record<string, unknown>): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function processSupplierInvoiceMatchAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessSupplierInvoiceMatchInput,
): Promise<ProcessSupplierInvoiceMatchResult> {
  const po = await db
    .prepare(
      `SELECT id, status, supplier_id, branch_id FROM purchase_orders
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(input.purchaseOrderId, tenantId)
    .first<{ id: string; status: string; supplier_id: string; branch_id: string }>();
  if (!po) throw new Error('PO_NOT_FOUND');
  if (!poReceived(po.status)) throw new Error('PO_NOT_RECEIVED');

  const branchId = input.branchId || po.branch_id;
  const itemsRes = await db
    .prepare(
      `SELECT product_id, quantity_ordered, quantity_received, unit_cost_cents
       FROM purchase_order_items WHERE purchase_order_id = ?`,
    )
    .bind(input.purchaseOrderId)
    .all<PoItemRow>();
  const items = itemsRes.results ?? [];
  const byProduct = new Map(items.map((i) => [i.product_id, i]));

  // F1: acumular lo ya facturado por producto (facturas previas no abiertas) para
  // impedir sobre-facturación: Σ invoiced_qty de esta + anterior ≤ received_qty.
  const alreadyInvoicedByProduct = await loadAlreadyInvoiced(db, tenantId, input.purchaseOrderId);

  const threeWayLines = buildThreeWayLines(input.lines, byProduct, alreadyInvoicedByProduct);

  const priceDiffOverride = input.priceDiffOverride === true;
  if (priceDiffOverride && !input.authorizedByUserId) {
    throw new Error('AUTH_REQUIRED');
  }

  const matchPlan = assertThreeWayMatch({
    lines: threeWayLines,
    priceDiffOverride,
    invoiceTotalCents: input.totalCents,
    invoiceIgvCents: input.igvCents,
  });

  const dueDateIso =
    input.dueDateIso ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const invoiceId = crypto.randomUUID();
  const apId = crypto.randomUUID();
  const apPlan = planCreateAp({
    id: apId,
    tenantId,
    supplierId: po.supplier_id,
    purchaseOrderId: input.purchaseOrderId,
    amountCents: matchPlan.apAmountCents,
    dueDateIso,
  });

  const trueUps = await computePmpTrueUps(db, tenantId, branchId, input.lines, byProduct);

  const auditId = crypto.randomUUID();
  const prevHash = await db
    .prepare(
      `SELECT row_hash FROM audit_events WHERE tenant_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  const rowHash = await sha256Hex({
    action: matchPlan.requiresPriceDiffAudit ? 'SUPPLIER_PRICE_DIFF' : 'SUPPLIER_INVOICE_MATCH',
    entity_id: invoiceId,
    prev: prevHash?.row_hash ?? null,
  });

  const chartOn = input.chartOfAccountsEnabled === true;
  const chartAccounts = chartOn
    ? await loadChartAccountsByCode(db, tenantId)
    : new Map<string, string>();

  await runD1AtomicPlan(db, async (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO supplier_invoices (
               id, tenant_id, branch_id, supplier_id, purchase_order_id, invoice_number,
               status, total_cents, igv_cents, matched_qty, matched_qty_microunits,
               matched_amount_cents, price_diff_override
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          invoiceId,
          tenantId,
          branchId,
          po.supplier_id,
          input.purchaseOrderId,
          input.invoiceNumber.trim(),
          matchPlan.status === 'CLOSED'
            ? 'CLOSED'
            : matchPlan.status === 'PARTIAL'
              ? 'PARTIAL'
              : 'MATCHED',
          input.totalCents,
          input.igvCents,
          matchPlan.matchedQty,
          Math.round(matchPlan.matchedQty * QUANTITY_SCALE),
          matchPlan.matchedAmountCents,
          priceDiffOverride ? 1 : 0,
        ),
    );

    plan.add(
      db
        .prepare(
          `INSERT INTO accounts_payable (
               id, tenant_id, supplier_id, purchase_order_id,
               original_amount_cents, balance_due_cents, due_date, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          apPlan.apId,
          apPlan.tenantId,
          apPlan.supplierId,
          apPlan.purchaseOrderId,
          apPlan.originalAmountCents,
          apPlan.balanceDueCents,
          apPlan.dueDateIso,
          apPlan.status,
        ),
    );

    for (const line of input.lines) {
      plan.add(
        db
          .prepare(
            `INSERT INTO supplier_invoice_lines (
                 id, tenant_id, invoice_id, product_id, invoiced_qty, invoiced_qty_microunits, unit_cost_cents
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            invoiceId,
            line.productId,
            line.invoicedQty,
            Math.round(line.invoicedQty * QUANTITY_SCALE),
            line.invoiceUnitCostCents,
          ),
      );
    }

    for (const t of trueUps) {
      plan.add(
        db
          .prepare(
            `UPDATE branch_product_stock
             SET pmp_unit_cost_cents = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
          )
          .bind(t.newPmp, tenantId, branchId, t.productId),
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO inventory_movements (
               id, tenant_id, branch_id, product_id, movement_type, quantity_delta,
               quantity_delta_microunits, unit_cost_cents, stock_after,
               stock_after_microunits, user_id, reference_id
             ) VALUES (?, ?, ?, ?, 'AJUSTE', 0, 0, ?,
               (SELECT stock FROM branch_product_stock
                WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
               (SELECT stock_microunits FROM branch_product_stock
                WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
               ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            branchId,
            t.productId,
            t.invoiceUnitCostCents,
            tenantId,
            branchId,
            t.productId,
            tenantId,
            branchId,
            t.productId,
            userId,
            invoiceId,
          ),
      );
    }

    if (chartOn && matchPlan.apAmountCents > 0) {
      await appendJournalToPlan(plan, db, {
        tenantId,
        branchId,
        userId,
        accountsByCode: chartAccounts,
        prevAuditHash: prevHash?.row_hash ?? null,
        entry: planSupplierInvoiceJournal({
          sourceId: invoiceId,
          postDate: dueDateIso.slice(0, 10),
          amountCents: matchPlan.apAmountCents,
        }),
      });
    }

    if (matchPlan.requiresPriceDiffAudit) {
      plan.add(
        db
          .prepare(
            `INSERT INTO audit_events (
                 id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                 payload_json, prev_hash, row_hash
               ) VALUES (?, ?, ?, ?, 'SUPPLIER_PRICE_DIFF', 'supplier_invoice', ?, ?, ?, ?)`,
          )
          .bind(
            auditId,
            tenantId,
            branchId,
            userId,
            invoiceId,
            JSON.stringify({
              purchaseOrderId: input.purchaseOrderId,
              reason: input.overrideReason ?? null,
              authorizedByUserId: input.authorizedByUserId ?? null,
              totalCents: input.totalCents,
              lines: input.lines,
            }),
            prevHash?.row_hash ?? null,
            rowHash,
          ),
      );
    } else {
      plan.add(
        db
          .prepare(
            `INSERT INTO audit_events (
                 id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                 payload_json, prev_hash, row_hash
               ) VALUES (?, ?, ?, ?, 'SUPPLIER_INVOICE_MATCH', 'supplier_invoice', ?, ?, ?, ?)`,
          )
          .bind(
            auditId,
            tenantId,
            branchId,
            userId,
            invoiceId,
            JSON.stringify({
              purchaseOrderId: input.purchaseOrderId,
              status: matchPlan.status,
              totalCents: input.totalCents,
            }),
            prevHash?.row_hash ?? null,
            rowHash,
          ),
      );
    }
  });

  return {
    status: 'SUCCESS',
    invoiceId,
    invoiceStatus: matchPlan.status,
    apId,
    apAmountCents: matchPlan.apAmountCents,
    requiresPriceDiffAudit: matchPlan.requiresPriceDiffAudit,
  };
}
