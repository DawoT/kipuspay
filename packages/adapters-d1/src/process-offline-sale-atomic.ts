/**
 * processOfflineSaleAtomic — NV/CPE hot path (Arquitectura §6 / §5 / SYN-12).
 * Preflight fuera del batch; una sola db.batch vía runD1AtomicPlan.
 */
/* eslint-disable complexity -- motor ACID multi-rama NV/CPE/return; split diferido */
import {
  assertOfflineSaleShape,
  computeNvLineTotals,
  InsufficientStockError,
  planCrmLww,
  resolveIssuedAtMs,
  splitNvLinesByFefo,
  toLimaTimestamp,
  type NvLineCents,
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
import {
  assertCreditWithinLimit,
  assertDiscountAuthorized,
  compensateArOnCreditNote,
  defaultCreditDueDateIso,
  discountRequiresAuthz,
  planCreateAr,
} from '@kipuspay/domain-cash';
import { ExpiredBatchError, InsufficientBatchStockError } from '@kipuspay/domain-inventory';
import {
  assertOfflineCapturePolicy,
  assertOfflineLoyaltyPolicy,
  assertRedeemAuthorized,
  buildCaptureIdempotencyKey,
  buildLoyaltyIdempotencyKey,
  isPaymentMethodCode,
  LOYALTY_RESERVATION_EXPIRED,
  methodCodeToAcquirer,
  type LoyaltyReservationStatus,
  type OfflineLoyaltyOutcome,
  type PaymentMethodCode,
} from '@kipuspay/domain-integrations';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import { rematerializeDailyRollupIfClosedDay, type InsightsKv } from './rollup-rematerialize.js';
import {
  loadBatchesForProduct,
  loadBomComponents,
  planBomExplosion,
  planFefoForQty,
  resolveServerUnitPriceCents,
  type S18SaleCaps,
} from './s18-sale-inventory.js';

async function requireLiveAuthToken(
  db: D1DatabaseLike,
  tenantId: string,
  tokenHash: string | null | undefined,
): Promise<string> {
  if (!tokenHash?.trim()) throw new Error('AUTH_TOKEN_REQUIRED');
  const row = await db
    .prepare(
      `SELECT id FROM authorization_tokens
       WHERE tenant_id = ? AND token_hash = ?
         AND used_at IS NULL
         AND expires_at > datetime('now')
       LIMIT 1`,
    )
    .bind(tenantId, tokenHash)
    .first<{ id: string }>();
  if (!row) throw new Error('AUTH_TOKEN_INVALID');
  return row.id;
}
export type OfflineSaleResult =
  | {
      status: 'SUCCESS';
      saleId: string;
      authoritativeTotalAmount: number;
      series: string;
      number: number;
      customerId?: string | null;
      /** Sprint 24 edge A / redeem. */
      loyaltyOutcome?: 'REDEEMED' | 'EXPIRED_ON_RETRY' | 'NONE';
      loyaltyReservationId?: string | null;
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
  pmp_unit_cost_cents: number | null;
  allow_negative_stock: number | boolean;
  branch_stock: number;
}

interface CatalogEntry {
  priceCents: number;
  costCents: number;
  name: string;
  type: string;
  pmpUnitCostCents: number;
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
  catalog: Map<string, CatalogEntry>;
  stockByProduct: Map<string, { stock: number; allowNegative: boolean; hasBranchRow: boolean }>;
}> {
  const catalog = new Map<string, CatalogEntry>();
  const stockByProduct = new Map<
    string,
    { stock: number; allowNegative: boolean; hasBranchRow: boolean }
  >();
  if (productIds.length === 0) return { catalog, stockByProduct };

  const placeholders = productIds.map(() => '?').join(',');
  const params = [branchId, tenantId, ...productIds];
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.product_type, p.price_cents, p.cost_cents, p.allow_negative_stock,
              COALESCE(bps.stock, p.stock) AS branch_stock,
              bps.pmp_unit_cost_cents AS pmp_unit_cost_cents,
              CASE WHEN bps.product_id IS NULL THEN 0 ELSE 1 END AS has_branch_row
       FROM products p
       LEFT JOIN branch_product_stock bps
         ON bps.tenant_id = p.tenant_id AND bps.product_id = p.id AND bps.branch_id = ?
       WHERE p.tenant_id = ? AND p.id IN (${placeholders}) AND p.deleted_at IS NULL AND p.is_active = 1`,
    )
    .bind(...params)
    .all<ProductRow & { has_branch_row: number }>();

  const foundSet = new Set<string>();
  for (const row of results ?? []) {
    foundSet.add(row.id);
    const catalogCost = row.cost_cents ?? 0;
    const pmp =
      row.pmp_unit_cost_cents !== null && row.pmp_unit_cost_cents !== undefined
        ? row.pmp_unit_cost_cents
        : catalogCost;
    catalog.set(row.id, {
      priceCents: row.price_cents,
      costCents: pmp,
      name: row.name,
      type: row.product_type,
      pmpUnitCostCents: pmp,
    });
    stockByProduct.set(row.id, {
      stock: row.branch_stock,
      allowNegative: row.allow_negative_stock === 1,
      hasBranchRow: row.has_branch_row === 1,
    });
  }

  for (const productId of productIds) {
    if (!foundSet.has(productId)) {
      throw new Error(`Product not found: ${productId}`);
    }
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

export interface ProcessOfflineSaleOptions {
  readonly nowMs?: number;
  readonly insightsKv?: InsightsKv;
  /** FEATURE_LEDGER_AR_AP — DAT-05 + E-D compensación. */
  readonly ledgerArApEnabled?: boolean;
  /** Sprint 18 capabilities (env FEATURE_* / tenant_capabilities). */
  readonly s18?: S18SaleCaps;
}

/**
 * Consolida venta offline NV/CPE de forma atómica (Sprint 4–5 / Sprint 8 ledger).
 */
export async function processOfflineSaleAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  payload: OfflineSalePayload,
  nowMsOrOpts: number | ProcessOfflineSaleOptions = Date.now(),
  insightsKv?: InsightsKv,
): Promise<OfflineSaleResult> {
  const opts: ProcessOfflineSaleOptions =
    typeof nowMsOrOpts === 'number'
      ? {
          nowMs: nowMsOrOpts,
          ...(insightsKv ? { insightsKv } : {}),
          ledgerArApEnabled: false,
        }
      : nowMsOrOpts;

  const nowMs = opts.nowMs ?? Date.now();
  const kv = opts.insightsKv ?? insightsKv;
  const ledgerOn = opts.ledgerArApEnabled === true;
  const s18: S18SaleCaps = opts.s18 ?? {
    inventoryBatches: false,
    inventoryBom: false,
    pricingLists: false,
  };

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

  // Precio lista: lookup cliente por documento (Zero-Trust; sin usar precio cliente).
  if (s18.pricingLists) {
    const custRow = await db
      .prepare(
        `SELECT id FROM customers
         WHERE tenant_id = ? AND document_type_code = ? AND document_number = ?
           AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(tenantId, payload.clientDocumentType, payload.clientDocumentNumber)
      .first<{ id: string }>();
    const pricingCustomerId = custRow?.id ?? null;
    for (const pid of productIds) {
      const entry = catalog.get(pid)!;
      const resolved = await resolveServerUnitPriceCents(
        db,
        tenantId,
        payload.branchId,
        pricingCustomerId,
        pid,
        entry.priceCents,
        true,
      );
      catalog.set(pid, { ...entry, priceCents: resolved });
    }
  }

  // BOM: stock a descontar = componentes; kit no debitar stock propio.
  const bomDebits = new Map<string, number>();
  const isReturnDoc = payload.documentType === 'NV_RETURN' || payload.documentType === '07';
  if (s18.inventoryBom && !isReturnDoc) {
    for (const item of payload.items) {
      const entry = catalog.get(item.productId)!;
      if (entry.type !== 'kit') continue;
      const comps = await loadBomComponents(db, tenantId, item.productId);
      const exploded = planBomExplosion(comps, item.quantity);
      for (const line of exploded) {
        bomDebits.set(
          line.componentProductId,
          (bomDebits.get(line.componentProductId) ?? 0) + line.qty,
        );
      }
    }
    const missingCompIds = [...bomDebits.keys()].filter((id) => !catalog.has(id));
    if (missingCompIds.length > 0) {
      const extra = await loadCatalogAndStock(db, tenantId, payload.branchId, missingCompIds);
      for (const [id, e] of extra.catalog) catalog.set(id, e);
      for (const [id, s] of extra.stockByProduct) stockByProduct.set(id, s);
    }
    for (const [compId, qty] of bomDebits) {
      const st = stockByProduct.get(compId);
      if (!st) throw new InsufficientStockError(compId, qty, 0);
      if (!st.allowNegative && st.stock < qty) {
        throw new InsufficientStockError(compId, qty, st.stock);
      }
    }
  }

  assertStockAvailable(payload, catalog, stockByProduct);

  // FEFO preflight
  const fefoByProduct = new Map<string, ReturnType<typeof planFefoForQty>>();
  const nowIso = new Date(nowMs).toISOString();
  if (s18.inventoryBatches && !isReturnDoc) {
    try {
      for (const item of payload.items) {
        const entry = catalog.get(item.productId)!;
        if (entry.type !== 'physical') continue;
        const batches = await loadBatchesForProduct(db, tenantId, payload.branchId, item.productId);
        if (batches.length === 0) continue;
        fefoByProduct.set(
          item.productId,
          planFefoForQty(batches, item.productId, item.quantity, nowIso),
        );
      }
    } catch (err) {
      if (err instanceof ExpiredBatchError || err instanceof InsufficientBatchStockError) {
        throw err;
      }
      throw err;
    }
  }

  const totals = computeNvLineTotals(
    payload.items,
    new Map(
      [...catalog.entries()].map(([id, p]) => [
        id,
        { priceCents: p.priceCents, costCents: p.pmpUnitCostCents },
      ]),
    ),
  );
  let saleLines: readonly NvLineCents[] = totals.lines;
  if (fefoByProduct.size > 0) {
    saleLines = splitNvLinesByFefo(totals.lines, fefoByProduct);
  }

  const paySum = payload.payments.reduce((s, p) => s + p.amountCents, 0);
  if (paySum !== totals.totalAmountCents) throw new Error('PAYMENT_TOTAL_MISMATCH');

  // S22: resolve payment_methods.code + edge 2B capture policy (preflight).
  const methodCodeById = new Map<string, PaymentMethodCode | null>();
  for (const pay of payload.payments) {
    if (methodCodeById.has(pay.paymentMethodId)) continue;
    const pm = await db
      .prepare(
        `SELECT code FROM payment_methods
         WHERE tenant_id = ? AND id = ? AND is_active = 1 LIMIT 1`,
      )
      .bind(tenantId, pay.paymentMethodId)
      .first<{ code: string }>();
    if (!pm) throw new Error('PAYMENT_METHOD_NOT_FOUND');
    methodCodeById.set(pay.paymentMethodId, isPaymentMethodCode(pm.code) ? pm.code : null);
  }
  for (let i = 0; i < payload.payments.length; i++) {
    const pay = payload.payments[i]!;
    const code = methodCodeById.get(pay.paymentMethodId);
    if (pay.captureStatus && !code) throw new Error('INVALID_PAYMENT_METHOD_CODE');
    if (code) {
      assertOfflineCapturePolicy({
        methodCode: code,
        captureStatus: pay.captureStatus ?? null,
        online: false,
      });
    }
  }

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

  // CRM LWW (SYN-08): preflight SELECT; plan INSERT/UPDATE/KEEP — nunca UPSERT INTO.
  const customerRow = await db
    .prepare(
      `SELECT id, profile_updated_at, pii_erased, deleted_at
       FROM customers
       WHERE tenant_id = ? AND document_type_code = ? AND document_number = ?
       LIMIT 1`,
    )
    .bind(tenantId, payload.clientDocumentType, payload.clientDocumentNumber)
    .first<{
      id: string;
      profile_updated_at: string;
      pii_erased: number;
      deleted_at: string | null;
    }>();
  const crmPlan = planCrmLww(
    {
      clientDocumentType: payload.clientDocumentType,
      clientDocumentNumber: payload.clientDocumentNumber,
      clientName: payload.clientName,
      clientEmail: payload.clientEmail,
      clientPhone: payload.clientPhone,
      clientAddress: payload.clientAddress,
      clientProfileUpdatedAt: payload.clientProfileUpdatedAt,
    },
    customerRow
      ? {
          id: customerRow.id,
          profileUpdatedAtIso: customerRow.profile_updated_at,
          piiErased: customerRow.pii_erased === 1,
          deleted: customerRow.deleted_at !== null,
        }
      : null,
    nowMs,
    crypto.randomUUID(),
  );
  // SEC-07: fail-closed si PII borrado / customer soft-deleted.
  if (crmPlan.kind === 'BLOCK_ERASED') {
    throw new Error('CUSTOMER_PII_ERASED');
  }
  const customerId =
    crmPlan.kind === 'INSERT' || crmPlan.kind === 'UPDATE' || crmPlan.kind === 'KEEP'
      ? crmPlan.customerId
      : null;

  const creditPayments = ledgerOn ? payload.payments.filter((p) => p.isCredit === true) : [];
  if (creditPayments.length > 0 && !customerId) {
    throw new Error('CREDIT_REQUIRES_CUSTOMER');
  }

  // S17: enforce credit_limit_cents (Arquitectura §5.3 / capability ledger.credit_limit_cents).
  const authTokensToConsume: string[] = [];
  if (creditPayments.length > 0 && customerId) {
    const custCredit = await db
      .prepare(`SELECT credit_limit_cents FROM customers WHERE tenant_id = ? AND id = ? LIMIT 1`)
      .bind(tenantId, customerId)
      .first<{ credit_limit_cents: number | null }>();
    const openAr = await db
      .prepare(
        `SELECT COALESCE(SUM(balance_due_cents), 0) AS open_cents
         FROM accounts_receivable
         WHERE tenant_id = ? AND customer_id = ? AND balance_due_cents > 0`,
      )
      .bind(tenantId, customerId)
      .first<{ open_cents: number }>();
    const creditSaleCents = creditPayments.reduce((s, p) => s + p.amountCents, 0);
    try {
      assertCreditWithinLimit({
        creditLimitCents: custCredit?.credit_limit_cents ?? 0,
        openArBalanceCents: openAr?.open_cents ?? 0,
        saleAmountCents: creditSaleCents,
        creditOverrideTokenHash: payload.creditOverrideTokenHash ?? null,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'CREDIT_LIMIT_EXCEEDED') {
        throw new Error('CREDIT_LIMIT_EXCEEDED', { cause: err });
      }
      throw err;
    }
    const limit = custCredit?.credit_limit_cents ?? 0;
    const projected = (openAr?.open_cents ?? 0) + creditSaleCents;
    if (projected > limit) {
      const tokenId = await requireLiveAuthToken(db, tenantId, payload.creditOverrideTokenHash);
      authTokensToConsume.push(tokenId);
    }
  }

  // S17: descuentos sobre umbral requieren authorization_token (SEC-09).
  {
    const policyRow = await db
      .prepare(
        `SELECT max_percent_without_auth, max_amount_without_auth_cents
         FROM tenant_discount_policies WHERE tenant_id = ? LIMIT 1`,
      )
      .bind(tenantId)
      .first<{ max_percent_without_auth: number; max_amount_without_auth_cents: number }>();
    const policy = {
      maxPercentWithoutAuth: policyRow?.max_percent_without_auth ?? 5,
      maxAmountWithoutAuthCents: policyRow?.max_amount_without_auth_cents ?? 2000,
    };
    let needsDiscountToken = false;
    for (const line of totals.lines) {
      try {
        assertDiscountAuthorized({
          lineSubtotalCents: line.quantity * line.unitPriceCents,
          discountCents: line.discountCents,
          policy,
          authorizationTokenHash: payload.discountAuthorizationTokenHash ?? null,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'AUTH_TOKEN_REQUIRED') {
          throw new Error('AUTH_TOKEN_REQUIRED', { cause: err });
        }
        throw err;
      }
      if (
        discountRequiresAuthz({
          lineSubtotalCents: line.quantity * line.unitPriceCents,
          discountCents: line.discountCents,
          policy,
          authorizationTokenHash: payload.discountAuthorizationTokenHash ?? null,
        })
      ) {
        needsDiscountToken = true;
      }
    }
    if (needsDiscountToken) {
      const tokenId = await requireLiveAuthToken(
        db,
        tenantId,
        payload.discountAuthorizationTokenHash,
      );
      authTokensToConsume.push(tokenId);
    }
  }

  // E-D preflight: NV_RETURN sobre venta con CxC abierta.
  let arCompensate:
    | {
        arId: string;
        plan: ReturnType<typeof compensateArOnCreditNote>;
      }
    | undefined;
  if (ledgerOn && isReturn && payload.referencedSaleId) {
    const arRow = await db
      .prepare(
        `SELECT id, balance_due_cents FROM accounts_receivable
         WHERE tenant_id = ? AND sale_id = ? AND balance_due_cents > 0 LIMIT 1`,
      )
      .bind(tenantId, payload.referencedSaleId)
      .first<{ id: string; balance_due_cents: number }>();
    if (arRow) {
      arCompensate = {
        arId: arRow.id,
        plan: compensateArOnCreditNote({
          accountsReceivableId: arRow.id,
          originSaleId: payload.referencedSaleId,
          currentBalanceCents: arRow.balance_due_cents,
          creditAmountCents: totals.totalAmountCents,
          paymentId: crypto.randomUUID(),
          collectedByUserId: userId,
          source: 'NV_RETURN',
        }),
      };
    }
  }

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

  // Sprint 24: loyalty.points — preflight edge A / redeem (fuera del batch).
  const loyaltyPoints = payload.loyaltyPoints ?? 0;
  let loyaltyPlan:
    | {
        outcome: OfflineLoyaltyOutcome;
        reservationId: string | null;
        points: number;
        customerId: string;
        auditId?: string;
        prevHash?: string | null;
        rowHash?: string;
      }
    | undefined;
  if (loyaltyPoints !== 0) {
    if (!customerId) throw new Error('LOYALTY_REQUIRES_CUSTOMER');
    const idemKey = buildLoyaltyIdempotencyKey(payload.offlineSaleId);
    const reservation = await db
      .prepare(
        `SELECT id, status, points, customer_id FROM loyalty_reservations
         WHERE tenant_id = ? AND sale_idempotency_key = ? LIMIT 1`,
      )
      .bind(tenantId, idemKey)
      .first<{
        id: string;
        status: LoyaltyReservationStatus;
        points: number;
        customer_id: string;
      }>();
    const outcome = assertOfflineLoyaltyPolicy({
      offlineOrigin: reservation === null,
      requestedPoints: loyaltyPoints,
      reservationStatus: reservation?.status ?? null,
    });
    if (outcome === 'REDEEM' && reservation) {
      assertRedeemAuthorized(Boolean(payload.discountAuthorizationTokenHash?.trim()));
      if (reservation.points !== loyaltyPoints) {
        throw new Error('LOYALTY_POINTS_MISMATCH');
      }
      if (payload.discountAuthorizationTokenHash?.trim()) {
        const tokenId = await requireLiveAuthToken(
          db,
          tenantId,
          payload.discountAuthorizationTokenHash,
        );
        authTokensToConsume.push(tokenId);
      }
      const auditId = crypto.randomUUID();
      const rowHash = await computeAuditHash({
        action: 'LOYALTY_REDEEMED',
        entity_id: reservation.id,
        sale_id: saleId,
        points: reservation.points,
        prev_hash: chainPrev,
      });
      loyaltyPlan = {
        outcome,
        reservationId: reservation.id,
        points: reservation.points,
        customerId: reservation.customer_id,
        auditId,
        prevHash: chainPrev,
        rowHash,
      };
    } else if (outcome === 'EXPIRED_ON_RETRY' && reservation) {
      const auditId = crypto.randomUUID();
      const rowHash = await computeAuditHash({
        action: LOYALTY_RESERVATION_EXPIRED,
        entity_id: saleId,
        loyalty_reservation_id: reservation.id,
        reason: 'EXPIRED_ON_RETRY',
        prev_hash: chainPrev,
      });
      loyaltyPlan = {
        outcome,
        reservationId: reservation.id,
        points: 0,
        customerId: reservation.customer_id,
        auditId,
        prevHash: chainPrev,
        rowHash,
      };
    } else {
      loyaltyPlan = {
        outcome: 'REDEEM',
        reservationId: null,
        points: 0,
        customerId,
      };
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

      if (crmPlan.kind === 'INSERT') {
        plan.add(
          db
            .prepare(
              `INSERT INTO customers (
                 id, tenant_id, document_type_code, document_number, name, email, phone, address,
                 profile_updated_at, is_active
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            )
            .bind(
              crmPlan.customerId,
              tenantId,
              payload.clientDocumentType,
              payload.clientDocumentNumber,
              payload.clientName,
              payload.clientEmail ?? null,
              payload.clientPhone ?? null,
              payload.clientAddress ?? null,
              crmPlan.profileUpdatedAtIso,
            ),
        );
      } else if (crmPlan.kind === 'UPDATE') {
        plan.add(
          db
            .prepare(
              `UPDATE customers
               SET name = ?, email = ?, phone = ?, address = ?,
                   profile_updated_at = ?, is_active = 1
               WHERE id = ? AND tenant_id = ?
                 AND profile_updated_at <= ?
                 AND pii_erased = 0 AND deleted_at IS NULL`,
            )
            .bind(
              payload.clientName,
              payload.clientEmail ?? null,
              payload.clientPhone ?? null,
              payload.clientAddress ?? null,
              crmPlan.profileUpdatedAtIso,
              crmPlan.customerId,
              tenantId,
              crmPlan.profileUpdatedAtIso,
            ),
        );
      }

      plan.add(
        db
          .prepare(
            `INSERT INTO sales (
                 id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
                 offline_client_sale_id, client_document_type, client_document_number, client_name,
                 document_type, series, number, currency, exchange_rate,
                 total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
                 total_discount_cents, total_cogs_cents, total_amount_cents,
                 issued_at_lima, sunat_status, must_submit_by
               )
               SELECT
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 (SELECT current_number FROM branch_document_series WHERE id = ?),
                 'PEN', 1.0, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?`,
          )
          .bind(
            saleId,
            tenantId,
            payload.branchId,
            payload.cashRegisterSessionId,
            userId,
            customerId,
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

      for (const line of saleLines) {
        const product = catalog.get(line.productId)!;
        plan.add(
          db
            .prepare(
              `INSERT INTO sale_items (
                   id, tenant_id, sale_id, product_id, product_name, product_type,
                   quantity, unit_price_cents, unit_cost_cents, discount_amount_cents,
                   subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
                   total_amount_cents, is_uncatalogued, batch_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '10', ?, 0, ?, 0, ?)`,
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
              line.batchId ?? null,
            ),
        );
      }

      // Stock: físicos (y FEFO lotes) + componentes BOM. Kits no debitan stock propio.
      const stockDebits = new Map<string, number>();
      for (const [productId, qty] of qtyByProduct) {
        const typ = catalog.get(productId)!.type;
        if (typ === 'kit' && s18.inventoryBom) continue;
        if (typ !== 'physical' && typ !== 'kit') continue;
        if (typ === 'physical' || !s18.inventoryBom) {
          stockDebits.set(productId, (stockDebits.get(productId) ?? 0) + qty);
        }
      }
      for (const [compId, qty] of bomDebits) {
        stockDebits.set(compId, (stockDebits.get(compId) ?? 0) + qty);
      }

      for (const [productId, qty] of stockDebits) {
        const before = stockByProduct.get(productId)!;
        const allow = isReturn || before.allowNegative ? 1 : 0;
        const signedQty = isReturn ? -qty : qty;
        const delta = isReturn ? qty : -qty;
        const isBomComp = bomDebits.has(productId);
        const movementType = isReturn ? 'DEVOLUCION_NC' : isBomComp ? 'VENTA_BOM' : 'VENTA';
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
                catalog.get(productId)!.pmpUnitCostCents,
              ),
          );
        }
        const fefoAllocs = fefoByProduct.get(productId);
        if (fefoAllocs && !isReturn) {
          for (const alloc of fefoAllocs) {
            plan.add(
              db
                .prepare(
                  `UPDATE inventory_batches
                   SET stock = stock - ?
                   WHERE id = ? AND tenant_id = ? AND stock >= ?`,
                )
                .bind(alloc.qty, alloc.batchId, tenantId, alloc.qty),
            );
            plan.add(
              db
                .prepare(
                  `INSERT INTO inventory_movements (
                       id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
                       unit_cost_cents, stock_after, user_id, reference_id
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                       (SELECT stock FROM branch_product_stock
                        WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                       ?, ?)`,
                )
                .bind(
                  crypto.randomUUID(),
                  tenantId,
                  payload.branchId,
                  productId,
                  alloc.batchId,
                  movementType,
                  -alloc.qty,
                  catalog.get(productId)!.pmpUnitCostCents,
                  tenantId,
                  payload.branchId,
                  productId,
                  userId,
                  saleId,
                ),
            );
          }
        } else {
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
                catalog.get(productId)!.pmpUnitCostCents,
                tenantId,
                payload.branchId,
                productId,
                userId,
                saleId,
              ),
          );
        }
      }

      for (let paymentIndex = 0; paymentIndex < payload.payments.length; paymentIndex++) {
        const pay = payload.payments[paymentIndex]!;
        const salePaymentId = crypto.randomUUID();
        plan.add(
          db
            .prepare(
              `INSERT INTO sale_payments (
                   id, tenant_id, sale_id, payment_method_id, amount_cents, reference_number
                 ) VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              salePaymentId,
              tenantId,
              saleId,
              pay.paymentMethodId,
              pay.amountCents,
              pay.referenceNumber ?? null,
            ),
        );
        // §5.4 edge 2B: MANUAL_ELECTRONIC_CAPTURE en la misma batch (nunca inventa CAPTURED).
        if (pay.captureStatus === 'MANUAL') {
          const code = methodCodeById.get(pay.paymentMethodId);
          const acquirer = code ? methodCodeToAcquirer(code) : null;
          if (!acquirer) throw new Error('MANUAL_CAPTURE_REQUIRES_ACQUIRER');
          plan.add(
            db
              .prepare(
                `INSERT INTO payment_captures (
                     id, tenant_id, sale_id, sale_payment_id, acquirer, acquirer_ref,
                     status, amount_cents, idempotency_key
                   ) VALUES (?, ?, ?, ?, ?, ?, 'MANUAL_ELECTRONIC_CAPTURE', ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                tenantId,
                saleId,
                salePaymentId,
                acquirer,
                pay.referenceNumber ?? null,
                pay.amountCents,
                buildCaptureIdempotencyKey(payload.offlineSaleId, paymentIndex, code!),
              ),
          );
        }
        // DAT-05: crédito → CxC en la MISMA tx (mismo db.batch).
        if (ledgerOn && pay.isCredit === true && customerId) {
          const ar = planCreateAr({
            id: crypto.randomUUID(),
            tenantId,
            customerId,
            saleId,
            amountCents: pay.amountCents,
            dueDateIso: defaultCreditDueDateIso(limaTs, 30),
            createdAtIso: limaTs,
          });
          plan.add(
            db
              .prepare(
                `INSERT INTO accounts_receivable (
                     id, tenant_id, customer_id, sale_id, original_amount_cents,
                     balance_due_cents, due_date, status, created_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
              )
              .bind(
                ar.arId,
                ar.tenantId,
                ar.customerId,
                ar.originSaleId,
                ar.originalAmountCents,
                ar.balanceDueCents,
                ar.dueDateIso,
                ar.createdAtIso,
              ),
          );
        }
      }

      if (arCompensate) {
        const c = arCompensate.plan;
        plan.add(
          db
            .prepare(
              `INSERT INTO accounts_receivable_payments (
                   id, accounts_receivable_id, amount_cents, payment_method,
                   cash_register_session_id, collected_by_user_id
                 ) VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              c.paymentId,
              c.accountsReceivableId,
              c.appliedCents,
              c.paymentMethod,
              payload.cashRegisterSessionId,
              c.collectedByUserId,
            ),
        );
        plan.add(
          db
            .prepare(
              `UPDATE accounts_receivable
                 SET balance_due_cents = ?, status = ?
               WHERE id = ? AND tenant_id = ? AND balance_due_cents > 0`,
            )
            .bind(c.nextBalanceCents, c.nextStatus, c.accountsReceivableId, tenantId),
        );
      }

      // Sprint 24: loyalty redeem / edge A en la misma batch.
      if (
        loyaltyPlan?.outcome === 'REDEEM' &&
        loyaltyPlan.reservationId &&
        loyaltyPlan.points > 0
      ) {
        const guardId = crypto.randomUUID();
        stockGuardIds.push(guardId);
        plan.add(
          db
            .prepare(
              `INSERT INTO atomic_guards (id, ok)
               SELECT ?, CASE WHEN points_balance >= ? THEN 1 ELSE 0 END
               FROM loyalty_accounts
               WHERE tenant_id = ? AND customer_id = ?`,
            )
            .bind(guardId, loyaltyPlan.points, tenantId, loyaltyPlan.customerId),
        );
        plan.add(
          db
            .prepare(
              `UPDATE loyalty_accounts
               SET points_balance = points_balance - ?
               WHERE tenant_id = ? AND customer_id = ? AND points_balance >= ?`,
            )
            .bind(loyaltyPlan.points, tenantId, loyaltyPlan.customerId, loyaltyPlan.points),
        );
        plan.add(
          db
            .prepare(
              `UPDATE loyalty_reservations
               SET status = 'REDEEMED'
               WHERE id = ? AND tenant_id = ? AND status = 'RESERVED'`,
            )
            .bind(loyaltyPlan.reservationId, tenantId),
        );
        plan.add(
          db
            .prepare(
              `INSERT INTO audit_events (
                   id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                   payload_json, prev_hash, row_hash
                 ) VALUES (?, ?, ?, ?, 'LOYALTY_REDEEMED', 'loyalty_reservation', ?, ?, ?, ?)`,
            )
            .bind(
              loyaltyPlan.auditId!,
              tenantId,
              payload.branchId,
              userId,
              loyaltyPlan.reservationId,
              JSON.stringify({
                sale_id: saleId,
                points: loyaltyPlan.points,
                customer_id: loyaltyPlan.customerId,
              }),
              loyaltyPlan.prevHash ?? null,
              loyaltyPlan.rowHash!,
            ),
        );
      } else if (
        loyaltyPlan?.outcome === 'EXPIRED_ON_RETRY' &&
        loyaltyPlan.reservationId &&
        loyaltyPlan.auditId &&
        loyaltyPlan.rowHash
      ) {
        plan.add(
          db
            .prepare(
              `INSERT INTO audit_events (
                   id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                   payload_json, prev_hash, row_hash
                 ) VALUES (?, ?, ?, ?, ?, 'loyalty_reservation', ?, ?, ?, ?)`,
            )
            .bind(
              loyaltyPlan.auditId,
              tenantId,
              payload.branchId,
              userId,
              LOYALTY_RESERVATION_EXPIRED,
              loyaltyPlan.reservationId,
              JSON.stringify({
                sale_id: saleId,
                loyalty_reservation_id: loyaltyPlan.reservationId,
                reason: 'EXPIRED_ON_RETRY',
              }),
              loyaltyPlan.prevHash ?? null,
              loyaltyPlan.rowHash,
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

      for (const tokenId of authTokensToConsume) {
        plan.add(
          db
            .prepare(
              `UPDATE authorization_tokens SET used_at = CURRENT_TIMESTAMP
               WHERE id = ? AND tenant_id = ? AND used_at IS NULL`,
            )
            .bind(tokenId, tenantId),
        );
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

  // Edge D: sync tardío de día cerrado → rematerialize rollup + invalidate insights KV.
  await rematerializeDailyRollupIfClosedDay(db, tenantId, payload.branchId, limaTs, nowMs, kv);

  return {
    status: 'SUCCESS',
    saleId,
    authoritativeTotalAmount: totals.totalAmountCents,
    series: payload.series,
    number: saved?.number ?? 0,
    customerId,
    loyaltyOutcome:
      loyaltyPlan?.outcome === 'EXPIRED_ON_RETRY'
        ? 'EXPIRED_ON_RETRY'
        : loyaltyPlan?.outcome === 'REDEEM' && (loyaltyPlan.points ?? 0) > 0
          ? 'REDEEMED'
          : 'NONE',
    loyaltyReservationId: loyaltyPlan?.reservationId ?? null,
  };
}
