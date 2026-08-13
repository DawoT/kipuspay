/**
 * Sprint 29 — 3-way supplier invoice match + owner discrepancies.
 */
import { processSupplierInvoiceMatchAtomic } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { parseFiniteNumber, parseMoneyInteger } from '../http/money-input.js';

interface InvoiceLine {
  readonly productId: string;
  readonly invoicedQty: number;
  readonly invoiceUnitCostCents: number;
}

interface MatchInput {
  readonly purchaseOrderId: string;
  readonly invoiceNumber: string;
  readonly totalCents: number;
  readonly igvCents: number;
  readonly lines: readonly InvoiceLine[];
}

function parseInvoiceLines(value: unknown): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  const lines: InvoiceLine[] = [];
  for (const raw of value) {
    const line = raw as Record<string, unknown>;
    const productId = typeof line.productId === 'string' ? line.productId.trim() : '';
    const invoicedQty = parseFiniteNumber(line.invoicedQty);
    const invoiceUnitCostCents = parseMoneyInteger(line.invoiceUnitCostCents);
    if (productId.length > 0 && invoicedQty !== null && invoiceUnitCostCents !== null) {
      lines.push({ productId, invoicedQty, invoiceUnitCostCents });
    }
  }
  return lines;
}

function matchInput(
  purchaseOrderId: string,
  invoiceNumber: string,
  lines: readonly InvoiceLine[],
  totalCents: number | null,
  igvCents: number | null,
): MatchInput | null {
  if (
    !purchaseOrderId ||
    !invoiceNumber ||
    lines.length === 0 ||
    totalCents === null ||
    igvCents === null
  ) {
    return null;
  }
  return { purchaseOrderId, invoiceNumber, lines, totalCents, igvCents };
}

export function isPurchasingThreeWayEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_PURCHASING_THREE_WAY === '1' || env?.FEATURE_PURCHASING_THREE_WAY === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(): HttpResult {
  return {
    status: 404,
    body: { error: 'FEATURE_PURCHASING_THREE_WAY off', code: 'FEATURE_OFF' },
  };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

const CLIENT_422 = new Set([
  'THREE_WAY_MISMATCH',
  'THREE_WAY_QTY_MISMATCH',
  'THREE_WAY_REQUIRES_LINES',
  'AUTH_REQUIRED',
  'INVALID_INVOICE_TOTAL',
  'INVALID_INVOICE_IGV',
  'INVOICE_PRODUCT_NOT_ON_PO',
]);

function mapError(err: unknown): HttpResult {
  const code = err instanceof Error ? err.message : 'INVOICE_MATCH_FAILED';
  const status =
    code === 'PO_NOT_FOUND'
      ? 404
      : code === 'PO_NOT_RECEIVED'
        ? 400
        : CLIENT_422.has(code) || code.includes('MISMATCH') || code.includes('INVALID')
          ? 422
          : 400;
  const copy =
    code === 'THREE_WAY_MISMATCH'
      ? 'La factura no cuadra con la OC/recepción. Autorizá override de precio o corregí cantidades.'
      : code === 'PO_NOT_RECEIVED'
        ? 'La orden de compra aún no está recibida.'
        : code;
  return { status, body: { error: copy, code } };
}

function parseMatchBody(body: {
  purchaseOrderId?: string;
  branchId?: string;
  invoiceNumber?: string;
  totalCents?: number;
  igvCents?: number;
  lines?: readonly {
    productId?: string;
    invoicedQty?: number;
    invoiceUnitCostCents?: number;
  }[];
  priceDiffOverride?: boolean;
  overrideReason?: string | null;
  authorizedByUserId?: string | null;
}):
  | { ok: false; result: HttpResult }
  | {
      ok: true;
      purchaseOrderId: string;
      branchId: string;
      invoiceNumber: string;
      totalCents: number;
      igvCents: number;
      lines: readonly InvoiceLine[];
      priceDiffOverride: boolean;
      overrideReason: string | null;
      authorizedByUserId: string | null;
    } {
  const purchaseOrderId = body.purchaseOrderId?.trim() ?? '';
  const invoiceNumber = body.invoiceNumber?.trim() ?? '';
  const branchId = body.branchId?.trim() ?? '';
  const parsed = matchInput(
    purchaseOrderId,
    invoiceNumber,
    parseInvoiceLines(body.lines),
    parseMoneyInteger(body.totalCents),
    parseMoneyInteger(body.igvCents ?? 0),
  );
  if (!parsed) {
    return {
      ok: false,
      result: {
        status: 400,
        body: {
          error:
            'purchaseOrderId, invoiceNumber and lines required; invoicedQty, invoiceUnitCostCents, totalCents and igvCents must be numbers',
          code: 'BAD_REQUEST',
        },
      },
    };
  }
  return {
    ok: true,
    ...parsed,
    branchId,
    priceDiffOverride: body.priceDiffOverride === true,
    overrideReason: body.overrideReason ?? null,
    authorizedByUserId: body.authorizedByUserId ?? null,
  };
}

export async function runMatchSupplierInvoiceHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    purchaseOrderId?: string;
    branchId?: string;
    invoiceNumber?: string;
    totalCents?: number;
    igvCents?: number;
    lines?: readonly {
      productId?: string;
      invoicedQty?: number;
      invoiceUnitCostCents?: number;
    }[];
    priceDiffOverride?: boolean;
    overrideReason?: string | null;
    authorizedByUserId?: string | null;
  },
): Promise<HttpResult> {
  if (!isPurchasingThreeWayEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId || !userId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }

  const parsed = parseMatchBody(body);
  if (!parsed.ok) return parsed.result;

  try {
    const result = await processSupplierInvoiceMatchAtomic(env.DB, tenantId, userId, {
      purchaseOrderId: parsed.purchaseOrderId,
      branchId: parsed.branchId,
      invoiceNumber: parsed.invoiceNumber,
      totalCents: parsed.totalCents,
      igvCents: parsed.igvCents,
      lines: parsed.lines,
      priceDiffOverride: parsed.priceDiffOverride,
      overrideReason: parsed.overrideReason,
      authorizedByUserId: parsed.authorizedByUserId,
      chartOfAccountsEnabled:
        env.FEATURE_LEDGER_CHART_OF_ACCOUNTS === '1' ||
        env.FEATURE_LEDGER_CHART_OF_ACCOUNTS === 'true',
    });
    return {
      status: 200,
      body: {
        invoiceId: result.invoiceId,
        invoiceStatus: result.invoiceStatus,
        apId: result.apId,
        apAmountCents: result.apAmountCents,
        requiresPriceDiffAudit: result.requiresPriceDiffAudit,
      },
    };
  } catch (err) {
    return mapError(err);
  }
}

export async function runOwnerThreeWayReportHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  role = '',
): Promise<HttpResult> {
  if (!isPurchasingThreeWayEnabled(env)) return featureOff();
  if (!env?.DB) return dbUnavailable();
  if (!tenantId) {
    return { status: 401, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  // S29-H2: reporte Dueño 3-way → solo admin/owner (nunca cashier).
  if (role !== 'owner' && role !== 'admin') {
    return { status: 403, body: { error: 'Forbidden', code: 'FORBIDDEN_ROLE' } };
  }

  const openPos = await env.DB.prepare(
    `SELECT id, branch_id, supplier_id, status, total_amount_cents, created_at
     FROM purchase_orders
     WHERE tenant_id = ?
       AND status IN ('SENT','PARTIALLY_RECEIVED','RECEIVED')
       AND NOT EXISTS (
         SELECT 1 FROM supplier_invoices si
         WHERE si.tenant_id = purchase_orders.tenant_id
           AND si.purchase_order_id = purchase_orders.id
           AND si.status = 'CLOSED'
       )
     ORDER BY created_at DESC
     LIMIT 100`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      branch_id: string;
      supplier_id: string;
      status: string;
      total_amount_cents: number;
      created_at: string;
    }>();

  const uninvoiced = await env.DB.prepare(
    `SELECT r.id AS receipt_id, r.purchase_order_id, r.branch_id, r.received_at
     FROM purchase_receipts r
     WHERE r.tenant_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM supplier_invoices si
         WHERE si.tenant_id = r.tenant_id AND si.purchase_order_id = r.purchase_order_id
           AND si.status IN ('MATCHED','PARTIAL','CLOSED')
       )
     ORDER BY r.received_at DESC
     LIMIT 100`,
  )
    .bind(tenantId)
    .all<{
      receipt_id: string;
      purchase_order_id: string;
      branch_id: string;
      received_at: string;
    }>();

  const discrepancies = await env.DB.prepare(
    `SELECT id, purchase_order_id, invoice_number, total_cents, status, price_diff_override, created_at
     FROM supplier_invoices
     WHERE tenant_id = ? AND price_diff_override = 1
     ORDER BY created_at DESC
     LIMIT 50`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      purchase_order_id: string;
      invoice_number: string;
      total_cents: number;
      status: string;
      price_diff_override: number;
      created_at: string;
    }>();

  return {
    status: 200,
    body: {
      openPurchaseOrders: (openPos.results ?? []).map((r) => ({
        id: r.id,
        branchId: r.branch_id,
        supplierId: r.supplier_id,
        status: r.status,
        totalAmountCents: r.total_amount_cents,
        createdAt: r.created_at,
      })),
      uninvoicedReceipts: (uninvoiced.results ?? []).map((r) => ({
        receiptId: r.receipt_id,
        purchaseOrderId: r.purchase_order_id,
        branchId: r.branch_id,
        receivedAt: r.received_at,
      })),
      priceDiffOverrides: (discrepancies.results ?? []).map((r) => ({
        invoiceId: r.id,
        purchaseOrderId: r.purchase_order_id,
        invoiceNumber: r.invoice_number,
        totalCents: r.total_cents,
        status: r.status,
        createdAt: r.created_at,
      })),
    },
  };
}
