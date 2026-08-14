/**
 * processOfflineSaleAtomic — NV/CPE hot path (Arquitectura §6 / §5 / SYN-12).
 * Preflight fuera del batch; una sola db.batch vía runD1AtomicPlan.
 */
/* eslint-disable complexity -- motor ACID y nombres SQL canónicos */
import {
  aggregateSaleItems,
  assertAndApplyPromotions,
  assertOfflineSaleShape,
  assertTipAllowed,
  computeNvLineTotals,
  InsufficientStockError,
  planCrmLww,
  resolveIssuedAtMs,
  splitNvLinesByFefo,
  totalTipCents,
  toLimaTimestamp,
  type NvLineCents,
  type OfflineSalePayload,
} from '@kipuspay/domain-sales';
import {
  assertDocumentTypeEnabled,
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
  planSaleJournal,
  assertStoreCreditRedeemable,
  giftCardSaleSourceRef,
  planStoreCreditIssue,
} from '@kipuspay/domain-cash';
import {
  calculateWeightedSubtotalCents,
  convertEnteredToBaseMicrounits,
  ExpiredBatchError,
  InsufficientBatchStockError,
  QUANTITY_SCALE,
} from '@kipuspay/domain-inventory';
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
import { runD1AtomicPlan, resolveShardId, type D1Bound, type D1DatabaseLike } from './index.js';
import { appendJournalToPlan, loadChartAccountsByCode } from './journal-post.js';
import {
  appendStoreCreditIssueToPlan,
  appendStoreCreditRedeemToPlan,
  ensureStoreCreditAccount,
  loadStoreCreditAccount,
} from './process-store-credit-atomic.js';
import { appendInstallmentPlanToBatch } from './process-installment-atomic.js';
import { appendCommissionAccrualToBatch } from './process-commission-atomic.js';
import {
  appendLocationBatchStockDeltaToPlan,
  appendLocationStockDeltaToPlan,
} from './process-inventory-location-atomic.js';
import {
  appendSerialTransitionToPlan,
  hashSerialLeaseToken,
  loadSerialsForStockOperation,
  type PreparedSerialIdentity,
} from './process-inventory-serial-atomic.js';
import { appendUsageMeterToPlan } from './usage-meter-batch.js';
import { rematerializeDailyRollupIfClosedDay, type InsightsKv } from './rollup-rematerialize.js';
import {
  loadBatchesForProduct,
  loadBomComponents,
  planBomExplosion,
  planFefoForQty,
  resolveServerUnitPriceCents,
  type S18SaleCaps,
} from './s18-sale-inventory.js';
import { loadPromotionsByIds } from './load-promotions.js';
import { resolveActiveTerminalSession } from './process-inventory-scale-atomic.js';
import { sha256Hex } from './crypto.js';

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
  branch_stock_microunits: number;
  parent_product_id: string | null;
}

interface CatalogEntry {
  priceCents: number;
  costCents: number;
  name: string;
  type: string;
  pmpUnitCostCents: number;
  parentProductId: string | null;
}

function isUniqueConstraint(error: unknown): boolean {
  const msg = String(error);
  return /UNIQUE|constraint/i.test(msg);
}

async function computeAuditHash(event: Record<string, unknown>): Promise<string> {
  return sha256Hex(JSON.stringify(event));
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1`,
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
  stockByProduct: Map<
    string,
    { stock: number; stockMicrounits: number; allowNegative: boolean; hasBranchRow: boolean }
  >;
}> {
  const catalog = new Map<string, CatalogEntry>();
  const stockByProduct = new Map<
    string,
    {
      stock: number;
      stockMicrounits: number;
      allowNegative: boolean;
      hasBranchRow: boolean;
    }
  >();
  if (productIds.length === 0) return { catalog, stockByProduct };

  const placeholders = productIds.map(() => '?').join(',');
  const params = [branchId, tenantId, ...productIds];
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.product_type,
              COALESCE(p.variant_price_override_cents, parent.price_cents, p.price_cents) AS price_cents,
              p.cost_cents, p.allow_negative_stock, p.parent_product_id,
              COALESCE(bps.stock, p.stock) AS branch_stock,
              COALESCE(bps.stock_microunits, p.stock_microunits) AS branch_stock_microunits,
              bps.pmp_unit_cost_cents AS pmp_unit_cost_cents,
              CASE WHEN bps.product_id IS NULL THEN 0 ELSE 1 END AS has_branch_row
       FROM products p
       LEFT JOIN products parent
         ON parent.tenant_id = p.tenant_id AND parent.id = p.parent_product_id
       LEFT JOIN branch_product_stock bps
         ON bps.tenant_id = p.tenant_id AND bps.product_id = p.id AND bps.branch_id = ?
       WHERE p.tenant_id = ? AND p.id IN (${placeholders}) AND p.deleted_at IS NULL
         AND p.is_active = 1 AND p.is_sellable = 1`,
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
      parentProductId: row.parent_product_id,
    });
    stockByProduct.set(row.id, {
      stock: row.branch_stock,
      stockMicrounits: row.branch_stock_microunits,
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

function requiredQuantity(item: OfflineSalePayload['items'][number]): number {
  if (!Number.isFinite(item.quantity) || item.quantity === undefined || item.quantity <= 0) {
    throw new Error('INVALID_QUANTITY');
  }
  return item.quantity;
}

function isPhysicalStockType(productType: string): boolean {
  return productType === 'physical' || productType === 'WEIGH';
}

/**
 * S51-H2: verifica que todo sellerId del payload (carrito o ítem) exista,
 * esté activo y pertenezca al tenant — el cliente no puede atribuir ventas a
 * vendedores arbitrarios ni forjar comisiones (regla 22).
 */
async function assertSellersExist(
  db: D1DatabaseLike,
  tenantId: string,
  payload: OfflineSalePayload,
): Promise<void> {
  const sellers = new Set<string>();
  if (payload.sellerId?.trim()) sellers.add(payload.sellerId.trim());
  for (const item of payload.items ?? []) {
    if (item.sellerId?.trim()) sellers.add(item.sellerId.trim());
  }
  if (sellers.size === 0) return;
  const placeholders = [...sellers].map(() => '?').join(',');
  const rows = await db
    .prepare(
      `SELECT id FROM users
       WHERE tenant_id = ? AND id IN (${placeholders})
         AND is_active = 1 AND deleted_at IS NULL`,
    )
    .bind(tenantId, ...sellers)
    .all<{ id: string }>();
  const found = new Set((rows.results ?? []).map((r) => r.id));
  for (const sellerId of sellers) {
    if (!found.has(sellerId)) throw new Error('SELLER_NOT_ACTIVE');
  }
}

async function normalizeUomItems(
  db: D1DatabaseLike,
  tenantId: string,
  payload: OfflineSalePayload,
  enabled: boolean,
): Promise<OfflineSalePayload> {
  const items = await Promise.all(
    payload.items.map(async (item) => {
      if (item.weightMeasurement) {
        const weightMicrounits = item.weightMeasurement.weightMicrounits;
        return {
          productId: item.productId,
          saleItemId: item.saleItemId,
          weightMeasurement: item.weightMeasurement,
          discountAmountCents: item.discountAmountCents,
          promotionIds: item.promotionIds,
          serialId: item.serialId,
          serialLeaseToken: item.serialLeaseToken,
          quantity: weightMicrounits / QUANTITY_SCALE,
          enteredQuantityMicrounits: weightMicrounits,
          baseQuantityMicrounits: weightMicrounits,
          resolvedUomCode: 'BASE',
          resolvedFactorNumerator: 1,
          resolvedFactorDenominator: 1,
        };
      }
      const preResolved =
        item.baseQuantityMicrounits !== undefined &&
        item.resolvedFactorNumerator !== undefined &&
        item.resolvedFactorDenominator !== undefined;
      if (preResolved) {
        if (
          !Number.isSafeInteger(item.baseQuantityMicrounits) ||
          item.baseQuantityMicrounits <= 0 ||
          !Number.isFinite(item.resolvedFactorNumerator) ||
          item.resolvedFactorNumerator <= 0 ||
          !Number.isFinite(item.resolvedFactorDenominator) ||
          item.resolvedFactorDenominator <= 0
        ) {
          throw new Error('INVALID_RESOLVED_UOM');
        }
        const quantity = requiredQuantity(item);
        return {
          ...item,
          quantity,
          baseQuantityMicrounits: item.baseQuantityMicrounits,
          enteredQuantityMicrounits: item.enteredQuantityMicrounits ?? item.baseQuantityMicrounits,
          resolvedUomCode: item.resolvedUomCode ?? 'UND',
          resolvedFactorNumerator: item.resolvedFactorNumerator,
          resolvedFactorDenominator: item.resolvedFactorDenominator,
        };
      }
      if (!item.uomId || item.enteredQuantityMicrounits === undefined) {
        const quantity = requiredQuantity(item);
        return {
          ...item,
          quantity,
          enteredQuantityMicrounits: Math.round(quantity * QUANTITY_SCALE),
          baseQuantityMicrounits: Math.round(quantity * QUANTITY_SCALE),
          resolvedUomCode: 'UND',
          resolvedFactorNumerator: 1,
          resolvedFactorDenominator: 1,
        };
      }
      if (!enabled) throw new Error('FEATURE_OFF');
      const uom = await db
        .prepare(
          `SELECT uom_code, factor_numerator, factor_denominator
           FROM product_uoms
           WHERE tenant_id = ? AND product_id = ? AND id = ? LIMIT 1`,
        )
        .bind(tenantId, item.productId, item.uomId)
        .first<{
          uom_code: string;
          factor_numerator: number;
          factor_denominator: number;
        }>();
      if (!uom) throw new Error('UOM_NOT_FOUND');
      const baseQuantityMicrounits = convertEnteredToBaseMicrounits({
        enteredQuantityMicrounits: item.enteredQuantityMicrounits,
        factorNumerator: uom.factor_numerator,
        factorDenominator: uom.factor_denominator,
      });
      return {
        ...item,
        quantity: baseQuantityMicrounits / QUANTITY_SCALE,
        baseQuantityMicrounits,
        resolvedUomCode: uom.uom_code,
        resolvedFactorNumerator: uom.factor_numerator,
        resolvedFactorDenominator: uom.factor_denominator,
      };
    }),
  );
  return { ...payload, items: aggregateSaleItems(items) };
}

function assertStockAvailable(
  payload: OfflineSalePayload,
  catalog: Map<string, { type: string }>,
  stockByProduct: Map<string, { stockMicrounits: number; allowNegative: boolean }>,
): void {
  if (payload.documentType === 'NV_RETURN') return;
  for (const item of payload.items) {
    if (item.isUncatalogued === true) continue; // línea genérica: sin stock
    const stock = stockByProduct.get(item.productId)!;
    const qtyMicrounits = Math.round(requiredQuantity(item) * QUANTITY_SCALE);
    if (
      isPhysicalStockType(catalog.get(item.productId)!.type) &&
      !stock.allowNegative &&
      stock.stockMicrounits < qtyMicrounits
    ) {
      throw new InsufficientStockError(
        item.productId,
        qtyMicrounits / QUANTITY_SCALE,
        stock.stockMicrounits / QUANTITY_SCALE,
      );
    }
  }
}

interface PreparedWeightMeasurement {
  readonly saleItemId: string;
  readonly measurementId: string;
  readonly productId: string;
  readonly weightMicrounits: number;
  readonly unitPricePerBaseCents: number;
  readonly subtotalCents: number;
  readonly measurementSource: 'DEVICE' | 'MANUAL';
  readonly scaleProtocol: 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB' | null;
  readonly scaleDeviceId: string | null;
  readonly heartbeatSequence: number | null;
  readonly observedAt: string;
  readonly authorizationTokenId: string | null;
}

async function prepareWeightMeasurements(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  payload: OfflineSalePayload,
  catalog: ReadonlyMap<string, CatalogEntry>,
  nowMs: number,
  enabled: boolean,
  terminalId: string,
): Promise<readonly PreparedWeightMeasurement[]> {
  const hasWeightedProduct = payload.items.some(
    (item) => item.isUncatalogued !== true && catalog.get(item.productId)?.type === 'WEIGH',
  );
  const hasMeasurement = payload.items.some((item) => item.weightMeasurement !== undefined);
  if (!hasWeightedProduct && !hasMeasurement) return [];
  if (!enabled) throw new Error('FEATURE_OFF');
  if (!terminalId.trim()) throw new Error('SCALE_TERMINAL_REQUIRED');
  await resolveActiveTerminalSession(db, {
    tenantId,
    userId,
    terminalId,
    cashRegisterSessionId: payload.cashRegisterSessionId,
    branchId: payload.branchId,
  });

  const policy = await db
    .prepare(
      `SELECT manual_weight_threshold_microunits
       FROM tenant_weight_policies WHERE tenant_id = ? LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ manual_weight_threshold_microunits: number }>();
  const threshold = policy?.manual_weight_threshold_microunits ?? 0;
  const seenLineIds = new Set<string>();
  const seenMeasurementIds = new Set<string>();
  const prepared: PreparedWeightMeasurement[] = [];
  for (const item of payload.items) {
    if (item.isUncatalogued === true) continue;
    const product = catalog.get(item.productId)!;
    const measurement = item.weightMeasurement;
    if (product.type !== 'WEIGH') {
      if (measurement) throw new Error('WEIGH_PRODUCT_REQUIRED');
      continue;
    }
    if (!measurement || !item.saleItemId) throw new Error('WEIGHT_MEASUREMENT_REQUIRED');
    if (seenLineIds.has(item.saleItemId) || seenMeasurementIds.has(measurement.measurementId)) {
      throw new Error('WEIGHT_MEASUREMENT_CARDINALITY');
    }
    seenLineIds.add(item.saleItemId);
    seenMeasurementIds.add(measurement.measurementId);
    if (!Number.isSafeInteger(measurement.weightMicrounits) || measurement.weightMicrounits <= 0) {
      throw new Error('SCALE_WEIGHT_INVALID');
    }
    const observedAtMs = Date.parse(measurement.observedAt);
    if (!Number.isFinite(observedAtMs)) throw new Error('WEIGHT_OBSERVED_AT_INVALID');

    let authorizationTokenId: string | null = null;
    if (measurement.measurementSource === 'DEVICE') {
      if (
        measurement.stable !== true ||
        !measurement.scaleDeviceId ||
        !measurement.scaleProtocol ||
        !Number.isSafeInteger(measurement.heartbeatSequence)
      ) {
        throw new Error('SCALE_READING_UNSTABLE');
      }
      // El observedAt y el heartbeat del dispositivo son tiempo REAL de la
      // balanza, no el nowMs de emisión de la venta (que puede venir del
      // cliente). La frescura se valida contra el reloj real del hardware.
      const readingClockMs = Date.now();
      if (readingClockMs - observedAtMs >= 2_000 || observedAtMs > readingClockMs) {
        throw new Error('SCALE_HEARTBEAT_STALE');
      }
      const device = await db
        .prepare(
          `SELECT last_heartbeat_at, last_heartbeat_sequence, last_weight_microunits
           FROM scale_devices
           WHERE tenant_id = ? AND id = ? AND terminal_id = ? AND protocol = ?
             AND status = 'ACTIVE' LIMIT 1`,
        )
        .bind(tenantId, measurement.scaleDeviceId, terminalId, measurement.scaleProtocol)
        .first<{
          last_heartbeat_at: string | null;
          last_heartbeat_sequence: number | null;
          last_weight_microunits: number | null;
        }>();
      const heartbeatMs = device?.last_heartbeat_at ? Date.parse(device.last_heartbeat_at) : NaN;
      if (!device) throw new Error('SCALE_DEVICE_SCOPE_MISMATCH');
      if (
        !Number.isFinite(heartbeatMs) ||
        readingClockMs - heartbeatMs >= 2_000 ||
        heartbeatMs > readingClockMs
      ) {
        throw new Error('SCALE_HEARTBEAT_STALE');
      }
      // S40-H1: el peso DEVICE DEBE ser exactamente la última lectura cruda
      // registrada por la balanza (jamás un valor arbitrario del cliente).
      if (
        typeof device.last_weight_microunits !== 'number' ||
        !Number.isInteger(device.last_weight_microunits) ||
        device.last_weight_microunits <= 0 ||
        device.last_weight_microunits !== measurement.weightMicrounits
      ) {
        throw new Error('WEIGHT_DEVICE_READING_MISMATCH');
      }
    } else {
      if (
        measurement.stable === false ||
        measurement.scaleDeviceId !== undefined ||
        measurement.scaleProtocol !== undefined ||
        measurement.heartbeatSequence !== undefined
      ) {
        throw new Error('WEIGHT_SOURCE_MISMATCH');
      }
      const tokenRequired = measurement.weightMicrounits > threshold;
      if (tokenRequired || measurement.authorizationToken) {
        if (!measurement.authorizationToken?.trim()) throw new Error('WEIGHT_OVERRIDE_REQUIRED');
        const tokenHash = await sha256Hex(measurement.authorizationToken);
        const token = await db
          .prepare(
            `SELECT id FROM authorization_tokens
             WHERE tenant_id = ? AND token_hash = ? AND action = 'WEIGHT_OVERRIDE'
               AND actor_user_id = ? AND terminal_id = ? AND sale_id IS NULL
               AND offline_sale_id = ? AND sale_item_id = ? AND measurement_id = ?
               AND used_at IS NULL AND expires_at > datetime(?, 'unixepoch')
               AND datetime(expires_at) <= datetime(created_at, '+90 seconds')
             LIMIT 1`,
          )
          .bind(
            tenantId,
            tokenHash,
            userId,
            terminalId,
            payload.offlineSaleId,
            item.saleItemId,
            measurement.measurementId,
            Math.floor(nowMs / 1000),
          )
          .first<{ id: string }>();
        if (!token) throw new Error('WEIGHT_OVERRIDE_INVALID');
        authorizationTokenId = token.id;
      }
    }
    prepared.push({
      saleItemId: item.saleItemId,
      measurementId: measurement.measurementId,
      productId: item.productId,
      weightMicrounits: measurement.weightMicrounits,
      unitPricePerBaseCents: product.priceCents,
      subtotalCents: calculateWeightedSubtotalCents({
        unitPricePerBaseCents: product.priceCents,
        weightMicrounits: measurement.weightMicrounits,
      }),
      measurementSource: measurement.measurementSource,
      scaleProtocol: measurement.scaleProtocol ?? null,
      scaleDeviceId: measurement.scaleDeviceId ?? null,
      heartbeatSequence: measurement.heartbeatSequence ?? null,
      observedAt: measurement.observedAt,
      authorizationTokenId,
    });
  }
  return prepared;
}

export interface ProcessOfflineSaleOptions {
  readonly nowMs?: number;
  readonly insightsKv?: InsightsKv;
  /** Sprint 1 router tenant→shard: set de shards activos del plano de control.
   *  Cuando se provee, el preflight valida tenants.shard_id contra él (fail-closed). */
  readonly activeShards?: readonly string[];
  /** FEATURE_LEDGER_AR_AP — DAT-05 + E-D compensación. */
  readonly ledgerArApEnabled?: boolean;
  /** Sprint 18 capabilities (env FEATURE_* / tenant_capabilities). */
  readonly s18?: S18SaleCaps;
  /** Sprint 30 — FEATURE_PRICING_PROMOTIONS. */
  readonly pricingPromotionsEnabled?: boolean;
  /** Sprint 31 — FEATURE_CATALOG_UOM. */
  readonly catalogUomEnabled?: boolean;
  /** Sprint 32 — FEATURE_LEDGER_CHART_OF_ACCOUNTS. */
  readonly ledgerChartOfAccountsEnabled?: boolean;
  /** Convertir apartado: la reserva ya descontó stock. */
  readonly skipStockDeduction?: boolean;
  /** Sprint 35 — FEATURE_LEDGER_STORE_CREDIT. */
  readonly storeCreditEnabled?: boolean;
  readonly storeCreditOnline?: boolean;
  readonly storeCreditActorIsAdminOrOwner?: boolean;
  /** Sprint 36 — FEATURE_SALES_INSTALLMENTS. */
  readonly salesInstallmentsEnabled?: boolean;
  /** Sprint 37 — FEATURE_SALES_COMMISSIONS. */
  readonly salesCommissionsEnabled?: boolean;
  /** Sprint 40 — inventory.scale; terminal identity is supplied by trusted HTTP context. */
  readonly inventoryScaleEnabled?: boolean;
  readonly terminalId?: string;
  /** Sprint 39: exact physical identities; REQUIRED products fail closed without these. */
  readonly serialAssignments?: readonly {
    readonly productId: string;
    readonly serialId: string;
    readonly terminalId?: string;
    readonly leaseToken?: string;
  }[];
  /** Extra statements en el mismo batch (p.ej. marcar sale_deposits CONVERTED). */
  readonly afterSaleStatements?: (
    plan: { add(statement: D1Bound): unknown },
    saleId: string,
    /**
     * Tail de la cadena audit_events del tenant tras los audits emitidos en este
     * batch (oversell → loyalty → journal → store-credit). Los converts (quote/
     * apartado) encadenan QUOTE_CONVERT / LAYAWAY_CONVERT a este hash.
     */
    auditPrevHash: string | null,
  ) => void | Promise<void>;
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
  const pricingPromotionsEnabled = opts.pricingPromotionsEnabled === true;
  const chartOn = opts.ledgerChartOfAccountsEnabled === true;
  const skipStock = opts.skipStockDeduction === true;
  const storeCreditOn = opts.storeCreditEnabled === true;
  const storeCreditOnline = opts.storeCreditOnline !== false;
  const storeCreditAdmin = opts.storeCreditActorIsAdminOrOwner === true;
  const installmentsOn = opts.salesInstallmentsEnabled === true;
  const commissionsOn = opts.salesCommissionsEnabled === true;

  assertOfflineSaleShape(payload);
  // S51-H2: el vendedor es verificado server-side — el sellerId del cliente
  // debe existir, estar activo y pertenecer al tenant (0 atribución a
  // vendedores inexistentes/coludidos; el accrual de comisión solo devenga
  // para vendedores reales del tenant).
  await assertSellersExist(db, tenantId, payload);
  payload = await normalizeUomItems(db, tenantId, payload, opts.catalogUomEnabled === true);

  const hasPromoIds = payload.items.some((i) => (i.promotionIds?.length ?? 0) > 0);
  if (hasPromoIds && !pricingPromotionsEnabled) {
    throw new Error('FEATURE_OFF');
  }

  const already = await loadAlreadySynced(db, tenantId, payload.offlineSaleId);
  if (already) return already;

  const tenant = await db
    .prepare(
      `SELECT formalization_mode, tax_regime, shard_id, enabled_document_types FROM tenants WHERE id = ?`,
    )
    .bind(tenantId)
    .first<{
      formalization_mode: string;
      tax_regime: string;
      shard_id: string;
      enabled_document_types: string;
    }>();
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  // Sprint 1 router tenant→shard (Principio 1): cuando el composition root
  // provee active_shards (plano de control), el shard del tenant debe estar
  // activo — fail-closed, nunca enrutar por omisión (invariante 5).
  if (opts.activeShards) {
    resolveShardId(tenant.shard_id, opts.activeShards);
  }

  // Sprint 1: la columna enabled_document_types es autoritativa (fail-closed).
  // Sin lista válida el tenant no puede emitir NADA; la matriz régimen×modo
  // (assertEmissionAllowed) sigue validando arriba de esto. docType se declara
  // más adelante en el flujo (preflight de emisión); aquí solo validamos.
  assertDocumentTypeEnabled(payload.documentType, tenant.enabled_document_types);

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

  const productIds = [
    ...new Set(payload.items.filter((i) => i.isUncatalogued !== true).map((i) => i.productId)),
  ];
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
        entry.parentProductId,
      );
      catalog.set(pid, { ...entry, priceCents: resolved });
    }
  }
  const weightedMeasurements = await prepareWeightMeasurements(
    db,
    tenantId,
    userId,
    payload,
    catalog,
    nowMs,
    opts.inventoryScaleEnabled === true,
    opts.terminalId ?? '',
  );
  const weightedByLineId = new Map(
    weightedMeasurements.map((measurement) => [measurement.saleItemId, measurement]),
  );

  // BOM: stock a descontar = componentes; kit no debitar stock propio.
  const bomDebits = new Map<string, number>();
  const isReturnDoc = payload.documentType === 'NV_RETURN' || payload.documentType === '07';
  if (s18.inventoryBom && !isReturnDoc) {
    for (const item of payload.items) {
      if (item.isUncatalogued === true) continue;
      const entry = catalog.get(item.productId)!;
      if (entry.type !== 'kit') continue;
      const comps = await loadBomComponents(db, tenantId, item.productId);
      const exploded = planBomExplosion(comps, requiredQuantity(item));
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
      const qtyMicrounits = Math.round(qty * QUANTITY_SCALE);
      if (!st) throw new InsufficientStockError(compId, qtyMicrounits / QUANTITY_SCALE, 0);
      if (!st.allowNegative && st.stockMicrounits < qtyMicrounits) {
        throw new InsufficientStockError(
          compId,
          qtyMicrounits / QUANTITY_SCALE,
          st.stockMicrounits / QUANTITY_SCALE,
        );
      }
    }
  }

  assertStockAvailable(payload, catalog, stockByProduct);

  // FEFO preflight
  const fefoByProduct = new Map<string, ReturnType<typeof planFefoForQty>>();
  const fefoByLine = new Map<string, ReturnType<typeof planFefoForQty>>();
  const nowIso = new Date(nowMs).toISOString();
  if (s18.inventoryBatches && !isReturnDoc) {
    try {
      for (const item of payload.items) {
        if (item.isUncatalogued === true) continue;
        const entry = catalog.get(item.productId)!;
        if (!isPhysicalStockType(entry.type)) continue;
        const batches = await loadBatchesForProduct(db, tenantId, payload.branchId, item.productId);
        if (batches.length === 0) continue;
        const allocations = planFefoForQty(batches, item.productId, requiredQuantity(item), nowIso);
        if (item.saleItemId) fefoByLine.set(item.saleItemId, allocations);
        else fefoByProduct.set(item.productId, allocations);
      }
      for (const [componentProductId, componentQty] of bomDebits) {
        const batches = await loadBatchesForProduct(
          db,
          tenantId,
          payload.branchId,
          componentProductId,
        );
        if (batches.length === 0) continue;
        fefoByProduct.set(
          componentProductId,
          planFefoForQty(batches, componentProductId, componentQty, nowIso),
        );
      }
    } catch (err) {
      if (err instanceof ExpiredBatchError || err instanceof InsufficientBatchStockError) {
        throw err;
      }
      throw err;
    }
  }

  // Sprint 30: lista → promoción → (luego descuento manual S17). Cliente solo envía IDs.
  let itemsForTotals = payload.items;
  if (pricingPromotionsEnabled && hasPromoIds) {
    const allPromoIds = payload.items.flatMap((i) => i.promotionIds ?? []);
    const promotionsById = await loadPromotionsByIds(db, tenantId, allPromoIds);
    const branchList = await db
      .prepare(`SELECT price_list_id FROM branches WHERE id = ? AND tenant_id = ? LIMIT 1`)
      .bind(payload.branchId, tenantId)
      .first<{ price_list_id: string | null }>();
    const priceListId = branchList?.price_list_id ?? null;
    const applied = assertAndApplyPromotions({
      lines: payload.items
        .filter((item) => item.isUncatalogued !== true)
        .map((item) => {
          const entry = catalog.get(item.productId)!;
          const line: {
            productId: string;
            quantity: number;
            unitPriceCents: number;
            categoryId: null;
            priceListId: string | null;
            promotionIds?: readonly string[];
          } = {
            productId: item.productId,
            quantity: requiredQuantity(item),
            unitPriceCents: entry.priceCents,
            categoryId: null,
            priceListId,
          };
          if (item.promotionIds?.length) line.promotionIds = item.promotionIds;
          return line;
        }),
      promotionsById,
      nowMs,
    });
    itemsForTotals = payload.items.map((item, idx) => {
      const promoLine = applied[idx]!;
      const manual = item.discountAmountCents ?? 0;
      return {
        ...item,
        serverUnitPriceCents: promoLine.unitPriceCents,
        discountAmountCents: manual + promoLine.promoDiscountCents,
      };
    });
  }

  let totals = computeNvLineTotals(
    itemsForTotals,
    new Map(
      [...catalog.entries()].map(([id, p]) => [
        id,
        { priceCents: p.priceCents, costCents: p.pmpUnitCostCents },
      ]),
    ),
  );
  if (weightedMeasurements.length > 0) {
    const lines = totals.lines.map((line) => {
      const weighted = line.sourceLineId ? weightedByLineId.get(line.sourceLineId) : undefined;
      if (!weighted) return line;
      const subtotalCents = weighted.subtotalCents - line.discountCents;
      if (subtotalCents < 0) throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');
      const igvCents = Math.round((subtotalCents * 18) / 100);
      const totalCents = subtotalCents + igvCents;
      return {
        ...line,
        quantity: weighted.weightMicrounits / QUANTITY_SCALE,
        unitPriceCents: weighted.unitPricePerBaseCents,
        subtotalCents,
        igvCents,
        totalCents,
        unitCostCents: catalog.get(weighted.productId)!.pmpUnitCostCents,
      };
    });
    totals = {
      lines,
      totalTaxableCents: lines.reduce((sum, line) => sum + line.subtotalCents, 0),
      totalIgvCents: lines.reduce((sum, line) => sum + line.igvCents, 0),
      totalDiscountCents: lines.reduce((sum, line) => sum + line.discountCents, 0),
      totalCogsCents: lines.reduce(
        (sum, line) =>
          sum +
          calculateWeightedSubtotalCents({
            unitPricePerBaseCents: line.unitCostCents,
            weightMicrounits: Math.round(line.quantity * QUANTITY_SCALE),
          }),
        0,
      ),
      totalAmountCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    };
  }
  let saleLines: readonly NvLineCents[] = totals.lines;
  if (fefoByProduct.size > 0) {
    saleLines = splitNvLinesByFefo(totals.lines, fefoByProduct);
  }

  // S22: resolve payment_methods.code + edge 2B capture policy (preflight).
  const methodCodeById = new Map<string, PaymentMethodCode | null>();
  const rawMethodCodeById = new Map<string, string>();
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
    rawMethodCodeById.set(pay.paymentMethodId, pm.code);
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

  const wantsStoreCreditTender =
    payload.useStoreCredit === true ||
    [...rawMethodCodeById.values()].some((code) => code === 'store_credit') ||
    [...methodCodeById.values()].some((code) => code === 'store_credit');
  const wantsStoreCreditIssue = payload.storeCreditIssue === true;
  if ((wantsStoreCreditTender || wantsStoreCreditIssue) && !storeCreditOn) {
    throw new Error('FEATURE_OFF');
  }
  if (!wantsStoreCreditTender) {
    // P2: el total a cobrar incluye la propina (fuera del valor de venta/IGV).
    const tipSum = totalTipCents(payload.payments);
    const paySum = payload.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paySum !== totals.totalAmountCents + tipSum) throw new Error('PAYMENT_TOTAL_MISMATCH');
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
  let creditOverrideVerified = false;
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
      creditOverrideVerified = true;
    }
  }
  const creditGuardCents = creditPayments.reduce((s, p) => s + p.amountCents, 0);

  let storeCreditRedeemPlan:
    | {
        appliedCents: number;
        nextBalanceCents: number;
        accountId: string;
        prevBalanceCents: number;
      }
    | undefined;
  let storeCreditIssuePlan:
    | { amountCents: number; accountId: string; prevBalanceCents: number; nextBalanceCents: number }
    | undefined;
  if (wantsStoreCreditTender) {
    const acc = customerId ? await loadStoreCreditAccount(db, tenantId, customerId) : null;
    const otherPaid = payload.payments
      .filter((p) => {
        const code =
          methodCodeById.get(p.paymentMethodId) ?? rawMethodCodeById.get(p.paymentMethodId);
        return code !== 'store_credit';
      })
      .reduce((s, p) => s + p.amountCents, 0);
    const remainingDue = Math.max(0, totals.totalAmountCents - otherPaid);
    const redeem = assertStoreCreditRedeemable({
      customerId,
      online: storeCreditOnline,
      actorIsAdminOrOwner: storeCreditAdmin,
      balanceCents: acc?.balance_cents ?? 0,
      remainingDueCents: remainingDue,
      nowMs,
      saleId,
      expiresAtMs: acc?.expires_at ? Date.parse(acc.expires_at) : null,
    });
    storeCreditRedeemPlan = {
      appliedCents: redeem.appliedCents,
      nextBalanceCents: redeem.nextBalanceCents,
      accountId: acc!.id,
      prevBalanceCents: acc!.balance_cents,
    };
    payload = {
      ...payload,
      payments: payload.payments.map((p) => {
        const code =
          methodCodeById.get(p.paymentMethodId) ?? rawMethodCodeById.get(p.paymentMethodId);
        if (code === 'store_credit') return { ...p, amountCents: redeem.appliedCents };
        return p;
      }),
    };
    const paySum = payload.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paySum !== totals.totalAmountCents) throw new Error('PAYMENT_TOTAL_MISMATCH');
  }
  if (wantsStoreCreditIssue) {
    if (!customerId) throw new Error('STORE_CREDIT_CUSTOMER_REQUIRED');
    const acc = await ensureStoreCreditAccount(db, tenantId, customerId);
    const issue = planStoreCreditIssue({
      customerId,
      currentBalanceCents: acc.balance_cents,
      amountCents: totals.totalAmountCents,
      sourceRef: giftCardSaleSourceRef(saleId),
    });
    storeCreditIssuePlan = {
      amountCents: issue.amountCents,
      accountId: acc.id,
      prevBalanceCents: acc.balance_cents,
      nextBalanceCents: issue.nextBalanceCents,
    };
  }

  // S17: descuentos sobre umbral requieren authorization_token (SEC-09).
  {
    const policyRow = await db
      .prepare(
        `SELECT max_percent_without_auth, max_amount_without_auth_cents, tip_max_percent
         FROM tenant_discount_policies WHERE tenant_id = ? LIMIT 1`,
      )
      .bind(tenantId)
      .first<{
        max_percent_without_auth: number;
        max_amount_without_auth_cents: number;
        tip_max_percent: number;
      }>();
    const policy = {
      maxPercentWithoutAuth: policyRow?.max_percent_without_auth ?? 5,
      maxAmountWithoutAuthCents: policyRow?.max_amount_without_auth_cents ?? 2000,
    };
    // P2: propina dentro del tope del tenant (default 25% del base gravable).
    const tipSum = totalTipCents(payload.payments);
    if (tipSum > 0) {
      assertTipAllowed(totals.totalTaxableCents, tipSum, policyRow?.tip_max_percent ?? 25);
    }
    let needsDiscountToken = false;
    for (let i = 0; i < totals.lines.length; i++) {
      const line = totals.lines[i]!;
      const originalItem = payload.items[Math.min(i, payload.items.length - 1)];
      // FEFO may split lines; authz uses manual discount only (promo no dispara S17).
      const manualDiscountCents = originalItem?.discountAmountCents ?? 0;
      try {
        assertDiscountAuthorized({
          lineSubtotalCents: line.subtotalCents + line.discountCents,
          discountCents: manualDiscountCents,
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
          lineSubtotalCents: line.subtotalCents + line.discountCents,
          discountCents: manualDiscountCents,
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

  // Sprint 50 (regla 34b): el precio manual de una línea genérica debe estar
  // dentro del umbral sin authz (max_amount_without_auth_cents, regla 2/17).
  for (const item of payload.items) {
    if (item.isUncatalogued !== true) continue;
    const policyRow = await db
      .prepare(
        `SELECT max_amount_without_auth_cents
         FROM tenant_discount_policies WHERE tenant_id = ? LIMIT 1`,
      )
      .bind(tenantId)
      .first<{ max_amount_without_auth_cents: number }>();
    const limitCents = policyRow?.max_amount_without_auth_cents ?? 2000;
    if ((item.manualPriceCents ?? 0) > limitCents) {
      throw new Error('GENERIC_LINE_PRICE_EXCEEDS_THRESHOLD');
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
    if (item.isUncatalogued === true) continue; // línea genérica: sin stock
    qtyByProduct.set(
      item.productId,
      (qtyByProduct.get(item.productId) ?? 0) + requiredQuantity(item),
    );
  }

  const serialAssignments = opts.serialAssignments ?? [];
  const serialIdsByProduct = new Map<string, string[]>();
  for (const assignment of serialAssignments) {
    const ids = serialIdsByProduct.get(assignment.productId) ?? [];
    ids.push(assignment.serialId);
    serialIdsByProduct.set(assignment.productId, ids);
  }
  const preparedSerials: readonly PreparedSerialIdentity[] = await loadSerialsForStockOperation(
    db,
    tenantId,
    payload.branchId,
    [...qtyByProduct].map(([productId, qty]) => ({
      productId,
      quantityMicrounits: Math.round(qty * QUANTITY_SCALE),
      serialIds: serialIdsByProduct.get(productId) ?? [],
    })),
    isReturn ? 'SOLD' : skipStock ? 'RESERVED' : 'AVAILABLE',
  );
  const leaseHashBySerial = new Map<string, string>();
  if (!isReturn && !skipStock) {
    for (const serial of preparedSerials) {
      const assignment = serialAssignments.find(
        (candidate) => candidate.serialId === serial.serialId,
      );
      if (!assignment?.terminalId || !assignment.leaseToken)
        throw new Error('SERIAL_LEASE_REQUIRED');
      const tokenHash = await hashSerialLeaseToken(assignment.leaseToken);
      const lease = await db
        .prepare(
          `SELECT l.id
           FROM serial_terminal_leases l
           INNER JOIN serial_numbers sn
             ON sn.tenant_id = l.tenant_id AND sn.id = l.serial_id
           INNER JOIN pos_terminals pt
             ON pt.tenant_id = l.tenant_id AND pt.id = l.terminal_id
            AND pt.branch_id = sn.branch_id AND pt.active = 1
           WHERE l.tenant_id = ? AND l.serial_id = ? AND l.terminal_id = ?
             AND l.token_hash = ? AND l.status = 'ACTIVE' LIMIT 1`,
        )
        .bind(tenantId, serial.serialId, assignment.terminalId, tokenHash)
        .first<{ id: string }>();
      if (!lease) throw new Error('SERIAL_LEASE_INVALID');
      leaseHashBySerial.set(serial.serialId, tokenHash);
    }
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
      if (!isPhysicalStockType(catalog.get(productId)!.type)) continue;
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

  const chartAccounts = chartOn
    ? await loadChartAccountsByCode(db, tenantId)
    : new Map<string, string>();
  // G5: tail de la cadena audit_events tras los audits planeados en este batch
  // (OFFLINE_OVERSELL → LOYALTY_*). Journal/store-credit/converts encadenan aquí.
  let auditTail: string | null = loyaltyPlan?.rowHash ?? chainPrev;
  const weightAuditPlans: Array<{
    measurement: PreparedWeightMeasurement;
    prevHash: string | null;
    rowHash: string;
  }> = [];
  for (const measurement of weightedMeasurements) {
    const weightAuditAction = measurement.authorizationTokenId
      ? 'WEIGHT_OVERRIDE'
      : 'WEIGHT_MEASUREMENT';
    const rowHash = await computeAuditHash({
      action: weightAuditAction,
      entity_id: measurement.measurementId,
      sale_id: saleId,
      sale_item_id: measurement.saleItemId,
      product_id: measurement.productId,
      weight_microunits: measurement.weightMicrounits,
      prev_hash: auditTail,
    });
    weightAuditPlans.push({ measurement, prevHash: auditTail, rowHash });
    auditTail = rowHash;
  }
  const journalPrevHash = auditTail;

  try {
    await runD1AtomicPlan(db, async (plan) => {
      const stockGuardIds: string[] = [];
      // Stock guard SQL (anti-carrera): ok=0 → CHECK aborta el batch entero.
      // NV_RETURN no exige stock previo (restaura). Convertir apartado ya reservó.
      if (skipStock) {
        /* reserva previa: no re-descontar */
      } else
        for (const [productId, qty] of qtyByProduct) {
          if (!isPhysicalStockType(catalog.get(productId)!.type)) continue;
          const st = stockByProduct.get(productId)!;
          const allow = isReturn || st.allowNegative ? 1 : 0;
          const qtyMicrounits = Math.round(qty * QUANTITY_SCALE);
          const guardId = crypto.randomUUID();
          stockGuardIds.push(guardId);
          plan.add(
            db
              .prepare(
                `INSERT INTO atomic_guards (id, ok)
               VALUES (
                 ?,
                 COALESCE(
                   (SELECT CASE WHEN
                      (stock_microunits >= ? OR ? = 1)
                      AND (? = 1 OR NOT EXISTS (
                        SELECT 1
                        FROM inventory_location_stock
                        WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
                          AND product_id = ?
                      ) OR COALESCE((
                        SELECT quantity_microunits
                        FROM inventory_location_stock
                        WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
                          AND product_id = ?
                      ), 0) >= ?)
                    THEN 1 ELSE 0 END
                    FROM branch_product_stock
                    WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                   CASE WHEN ? = 1 THEN 1 ELSE 0 END
                 )
               )`,
              )
              .bind(
                guardId,
                qtyMicrounits,
                allow,
                allow,
                tenantId,
                payload.branchId,
                `loc-default:${tenantId}:${payload.branchId}`,
                productId,
                tenantId,
                payload.branchId,
                `loc-default:${tenantId}:${payload.branchId}`,
                productId,
                qtyMicrounits,
                tenantId,
                payload.branchId,
                productId,
                allow,
              ),
          );
        }

      // B1 (47b): guard anti-carrera del cupo de crédito. El preflight es el
      // primer filtro (y valida el token de override); este guard recomputa el
      // límite contra la CxC COMMITTED en tiempo de batch: si dos POS aprueban
      // el mismo preflight en paralelo, el segundo batch ve la CxC del primero
      // (ok=0 → CHECK aborta todo el batch, sin efectos parciales).
      if (ledgerOn && creditGuardCents > 0 && customerId) {
        const creditGuardId = crypto.randomUUID();
        stockGuardIds.push(creditGuardId);
        plan.add(
          db
            .prepare(
              `INSERT INTO atomic_guards (id, ok)
               VALUES (
                 ?,
                 (SELECT CASE WHEN ? = 1 OR
                   COALESCE(
                     (SELECT credit_limit_cents FROM customers WHERE tenant_id = ? AND id = ?),
                     0
                   ) >=
                   COALESCE(
                     (SELECT SUM(balance_due_cents) FROM accounts_receivable
                      WHERE tenant_id = ? AND customer_id = ? AND balance_due_cents > 0),
                     0
                   ) + ?
                 THEN 1 ELSE 0 END)
               )`,
            )
            .bind(
              creditGuardId,
              creditOverrideVerified ? 1 : 0,
              tenantId,
              customerId,
              tenantId,
              customerId,
              creditGuardCents,
            ),
        );
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

      const saleItemIdsByProduct = new Map<string, string[]>();
      const saleItemBySerialId = new Map<string, string>();
      for (const line of saleLines) {
        const isGenericLine = line.productId === '';
        const product = isGenericLine ? undefined : catalog.get(line.productId)!;
        const source =
          (line.sourceLineId
            ? payload.items.find((item) => item.saleItemId === line.sourceLineId)
            : undefined) ?? payload.items.find((item) => item.productId === line.productId)!;
        const baseQuantityMicrounits = Math.round(line.quantity * QUANTITY_SCALE);
        const sourceBaseMicrounits = source.baseQuantityMicrounits ?? baseQuantityMicrounits;
        const enteredQuantityMicrounits = Math.round(
          ((source.enteredQuantityMicrounits ?? sourceBaseMicrounits) * baseQuantityMicrounits) /
            sourceBaseMicrounits,
        );
        const saleItemId = line.sourceLineId ?? crypto.randomUUID();
        const productLineIds = saleItemIdsByProduct.get(line.productId) ?? [];
        productLineIds.push(saleItemId);
        saleItemIdsByProduct.set(line.productId, productLineIds);
        if (source.serialId) saleItemBySerialId.set(source.serialId, saleItemId);
        const weighted = weightedByLineId.get(saleItemId);
        const weightedAllocations = weighted ? (fefoByLine.get(saleItemId) ?? []) : [];
        const effectiveBatchId =
          line.batchId ??
          (weightedAllocations.length === 1 ? weightedAllocations[0]!.batchId : null);
        if (isGenericLine) {
          // Sprint 50 (regla 34b): línea genérica — product_id NULL, sin stock,
          // sin PMP; audit GENERIC_LINE con la cadena de hashes.
          plan.add(
            db
              .prepare(
                `INSERT INTO sale_items (
                     id, tenant_id, sale_id, product_id, product_name, product_type,
                     quantity, unit_price_cents, unit_cost_cents, discount_amount_cents,
                     subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
                     total_amount_cents, is_uncatalogued, batch_id, sold_uom_id, sold_uom_code,
                     entered_quantity_microunits, factor_numerator, factor_denominator,
                     base_quantity_microunits, seller_id
                   ) VALUES (?, ?, ?, NULL, 'Venta rápida', 'service', ?, ?, 0, ?, ?, '10', ?, 0, ?, 1, ?, ?, 'UND', ?, 1, 1, ?, ?)`,
              )
              .bind(
                saleItemId,
                tenantId,
                saleId,
                line.quantity,
                line.unitPriceCents,
                line.discountCents,
                line.subtotalCents,
                line.igvCents,
                line.totalCents,
                effectiveBatchId,
                source.uomId ?? null,
                enteredQuantityMicrounits,
                baseQuantityMicrounits,
                source.sellerId?.trim() || payload.sellerId?.trim() || null,
              ),
          );
          const genericAuditId = crypto.randomUUID();
          const genericRowHash = await computeAuditHash({
            action: 'GENERIC_LINE',
            entity_id: saleItemId,
            sale_id: saleId,
            sale_item_id: saleItemId,
            prev_hash: auditTail,
          });
          plan.add(
            db
              .prepare(
                `INSERT INTO audit_events (
                     id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                     payload_json, prev_hash, row_hash
                   ) VALUES (?, ?, ?, ?, 'GENERIC_LINE', 'sale_item', ?, ?, ?, ?)`,
              )
              .bind(
                genericAuditId,
                tenantId,
                payload.branchId,
                userId,
                saleItemId,
                JSON.stringify({
                  manualPriceCents: line.unitPriceCents,
                  quantity: line.quantity,
                  isUncatalogued: true,
                }),
                auditTail,
                genericRowHash,
              ),
          );
          auditTail = genericRowHash;
          continue;
        }
        plan.add(
          db
            .prepare(
              `INSERT INTO sale_items (
                   id, tenant_id, sale_id, product_id, product_name, product_type,
                   quantity, unit_price_cents, unit_cost_cents, discount_amount_cents,
                   subtotal_cents, igv_affectation_code, igv_amount_cents, icbper_amount_cents,
                   total_amount_cents, is_uncatalogued, batch_id, sold_uom_id, sold_uom_code,
                   entered_quantity_microunits, factor_numerator, factor_denominator,
                   base_quantity_microunits, seller_id
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '10', ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              saleItemId,
              tenantId,
              saleId,
              line.productId,
              product!.name,
              product!.type,
              line.quantity,
              line.unitPriceCents,
              line.unitCostCents,
              line.discountCents,
              line.subtotalCents,
              line.igvCents,
              line.totalCents,
              effectiveBatchId,
              source.uomId ?? null,
              source.resolvedUomCode ?? 'UND',
              enteredQuantityMicrounits,
              source.resolvedFactorNumerator ?? 1,
              source.resolvedFactorDenominator ?? 1,
              baseQuantityMicrounits,
              source.sellerId?.trim() || payload.sellerId?.trim() || null,
            ),
        );
      }

      for (const weightAudit of weightAuditPlans) {
        const measurement = weightAudit.measurement;
        if (measurement.authorizationTokenId) {
          const tokenGuardId = crypto.randomUUID();
          stockGuardIds.push(tokenGuardId);
          plan.add(
            db
              .prepare(
                `INSERT INTO atomic_guards (id, ok)
                 SELECT ?, CASE WHEN EXISTS (
                   SELECT 1 FROM authorization_tokens
                   WHERE id = ? AND tenant_id = ? AND action = 'WEIGHT_OVERRIDE'
                     AND actor_user_id = ? AND terminal_id = ? AND sale_id IS NULL
                     AND offline_sale_id = ? AND sale_item_id = ? AND measurement_id = ?
                     AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
                     AND datetime(expires_at) <= datetime(created_at, '+90 seconds')
                 ) THEN 1 ELSE 0 END`,
              )
              .bind(
                tokenGuardId,
                measurement.authorizationTokenId,
                tenantId,
                userId,
                opts.terminalId,
                payload.offlineSaleId,
                measurement.saleItemId,
                measurement.measurementId,
              ),
          );
          plan.add(
            db
              .prepare(
                `UPDATE authorization_tokens SET used_at = CURRENT_TIMESTAMP, sale_id = ?
                 WHERE id = ? AND tenant_id = ? AND used_at IS NULL`,
              )
              .bind(saleId, measurement.authorizationTokenId, tenantId),
          );
        }
        plan.add(
          db
            .prepare(
              `INSERT INTO weight_measurements (
                 id, tenant_id, sale_item_id, product_id, terminal_id, scale_device_id,
                 operation_type, operation_id, idempotency_key, weight_microunits,
                 unit_price_per_base_cents, subtotal_cents, measurement_source,
                 scale_protocol, heartbeat_sequence, observed_at, authorization_token_id
               ) VALUES (?, ?, ?, ?, ?, ?, 'SALE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              measurement.measurementId,
              tenantId,
              measurement.saleItemId,
              measurement.productId,
              opts.terminalId,
              measurement.scaleDeviceId,
              saleId,
              `${payload.offlineSaleId}:${measurement.measurementId}`,
              measurement.weightMicrounits,
              measurement.unitPricePerBaseCents,
              measurement.subtotalCents,
              measurement.measurementSource,
              measurement.scaleProtocol,
              measurement.heartbeatSequence,
              measurement.observedAt,
              measurement.authorizationTokenId,
            ),
        );
        const auditGuardId = crypto.randomUUID();
        stockGuardIds.push(auditGuardId);
        plan.add(
          db
            .prepare(
              `INSERT INTO atomic_guards (id, ok)
               SELECT ?, CASE WHEN COALESCE((
                 SELECT row_hash FROM audit_events
                 WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1
               ), '') = COALESCE(?, '') THEN 1 ELSE 0 END`,
            )
            .bind(auditGuardId, tenantId, weightAudit.prevHash),
        );
        plan.add(
          db
            .prepare(
              `INSERT INTO audit_events (
                 id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
                 payload_json, prev_hash, row_hash
               ) VALUES (?, ?, ?, ?, ?, 'weight_measurement', ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              tenantId,
              payload.branchId,
              userId,
              measurement.authorizationTokenId ? 'WEIGHT_OVERRIDE' : 'WEIGHT_MEASUREMENT',
              measurement.measurementId,
              JSON.stringify({
                saleId,
                saleItemId: measurement.saleItemId,
                productId: measurement.productId,
                weightMicrounits: measurement.weightMicrounits,
                authorizationTokenId: measurement.authorizationTokenId,
              }),
              weightAudit.prevHash,
              weightAudit.rowHash,
            ),
        );
      }

      for (const serial of preparedSerials) {
        const productLineIds = saleItemIdsByProduct.get(serial.productId) ?? [];
        const saleItemId =
          saleItemBySerialId.get(serial.serialId) ??
          (productLineIds.length === 1 ? productLineIds[0] : undefined);
        if (!saleItemId) throw new Error('SERIAL_SALE_ITEM_REQUIRED');
        await appendSerialTransitionToPlan(plan, db, {
          tenantId,
          serialId: serial.serialId,
          branchId: serial.branchId,
          locationId: serial.locationId,
          productId: serial.productId,
          expectedStatus: serial.status,
          nextStatus: isReturn ? 'RETURNED_INSPECTION' : 'SOLD',
          expectedVersion: serial.version,
          eventType: isReturn ? 'RETURNED' : 'SALE',
          operationType: isReturn ? 'SALE_RETURN' : 'SALE_ITEM',
          operationId: saleId,
          operationLineId: saleItemId,
          idempotencyKey: `${payload.offlineSaleId}:${serial.serialId}`,
          actorUserId: userId,
          currentSaleItemId: isReturn ? null : saleItemId,
        });
        if (!isReturn && !skipStock) {
          const assignment = serialAssignments.find(
            (candidate) => candidate.serialId === serial.serialId,
          )!;
          plan.add(
            db
              .prepare(
                `UPDATE serial_terminal_leases
                 SET status = 'CONSUMED', consumed_at = CURRENT_TIMESTAMP, version = version + 1
                 WHERE tenant_id = ? AND serial_id = ? AND terminal_id = ?
                   AND token_hash = ? AND status = 'ACTIVE'
                   AND EXISTS (
                     SELECT 1
                     FROM serial_numbers sn
                     INNER JOIN pos_terminals pt
                       ON pt.tenant_id = sn.tenant_id AND pt.id = ?
                      AND pt.branch_id = sn.branch_id AND pt.active = 1
                     WHERE sn.tenant_id = serial_terminal_leases.tenant_id
                       AND sn.id = serial_terminal_leases.serial_id
                   )`,
              )
              .bind(
                tenantId,
                serial.serialId,
                assignment.terminalId!,
                leaseHashBySerial.get(serial.serialId),
                assignment.terminalId!,
              ),
          );
        }
      }

      // Stock: físicos (y FEFO lotes) + componentes BOM. Kits no debitan stock propio.
      const stockDebits = new Map<string, number>();
      for (const [productId, qty] of qtyByProduct) {
        const typ = catalog.get(productId)!.type;
        if (typ === 'kit' && s18.inventoryBom) continue;
        if (!isPhysicalStockType(typ) && typ !== 'kit') continue;
        if (isPhysicalStockType(typ) || !s18.inventoryBom) {
          stockDebits.set(productId, (stockDebits.get(productId) ?? 0) + qty);
        }
      }
      for (const [compId, qty] of bomDebits) {
        stockDebits.set(compId, (stockDebits.get(compId) ?? 0) + qty);
      }

      for (const [productId, qty] of skipStock ? [] : stockDebits) {
        const before = stockByProduct.get(productId)!;
        const allow = isReturn || before.allowNegative ? 1 : 0;
        const qtyMicrounits = Math.round(qty * QUANTITY_SCALE);
        const signedQtyMicrounits = isReturn ? -qtyMicrounits : qtyMicrounits;
        const delta = isReturn ? qty : -qty;
        const isBomComp = bomDebits.has(productId);
        const movementType = isReturn ? 'DEVOLUCION_NC' : isBomComp ? 'VENTA_BOM' : 'VENTA';
        if (before.hasBranchRow) {
          plan.add(
            db
              .prepare(
                `UPDATE branch_product_stock
                   SET stock_microunits = stock_microunits - ?,
                       stock = (stock_microunits - ?) * 0.000001,
                       updated_at = CURRENT_TIMESTAMP, version = version + 1
                   WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
                     AND (stock_microunits >= ? OR ? = 1)`,
              )
              .bind(
                signedQtyMicrounits,
                signedQtyMicrounits,
                tenantId,
                payload.branchId,
                productId,
                isReturn ? 0 : qtyMicrounits,
                allow,
              ),
          );
        } else {
          plan.add(
            db
              .prepare(
                `INSERT INTO branch_product_stock (
                     tenant_id, branch_id, product_id, stock, stock_microunits,
                     pmp_unit_cost_cents, version
                   ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
              )
              .bind(
                tenantId,
                payload.branchId,
                productId,
                (before.stockMicrounits - signedQtyMicrounits) * 0.000001,
                before.stockMicrounits - signedQtyMicrounits,
                catalog.get(productId)!.pmpUnitCostCents,
              ),
          );
        }
        appendLocationStockDeltaToPlan(plan, db, {
          tenantId,
          branchId: payload.branchId,
          productId,
          deltaMicrounits: isReturn ? qtyMicrounits : -qtyMicrounits,
          initialQuantityMicrounits: before.stockMicrounits,
        });
        const fefoAllocs = [
          ...(fefoByProduct.get(productId) ?? []),
          ...payload.items
            .filter((item) => item.productId === productId && item.saleItemId)
            .flatMap((item) => fefoByLine.get(item.saleItemId!) ?? []),
        ];
        if (fefoAllocs.length > 0 && !isReturn) {
          for (const alloc of fefoAllocs) {
            const allocMicrounits = Math.round(alloc.qty * QUANTITY_SCALE);
            appendLocationBatchStockDeltaToPlan(plan, db, {
              tenantId,
              branchId: payload.branchId,
              productId,
              batchId: alloc.batchId,
              deltaMicrounits: -allocMicrounits,
            });
            plan.add(
              db
                .prepare(
                  `UPDATE inventory_batches
                   SET stock_microunits = stock_microunits - ?,
                       stock = (stock_microunits - ?) * 0.000001
                   WHERE id = ? AND tenant_id = ? AND stock_microunits >= ?`,
                )
                .bind(allocMicrounits, allocMicrounits, alloc.batchId, tenantId, allocMicrounits),
            );
            plan.add(
              db
                .prepare(
                  `INSERT INTO inventory_movements (
                       id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
                       quantity_delta_microunits, unit_cost_cents, stock_after,
                       stock_after_microunits, user_id, reference_id
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
                       (SELECT stock FROM branch_product_stock
                        WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                       (SELECT stock_microunits FROM branch_product_stock
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
                  -Math.round(alloc.qty * QUANTITY_SCALE),
                  catalog.get(productId)!.pmpUnitCostCents,
                  tenantId,
                  payload.branchId,
                  productId,
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
                     quantity_delta_microunits, unit_cost_cents, stock_after,
                     stock_after_microunits, user_id, reference_id
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                     (SELECT stock FROM branch_product_stock
                      WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                     (SELECT stock_microunits FROM branch_product_stock
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
                isReturn ? qtyMicrounits : -qtyMicrounits,
                catalog.get(productId)!.pmpUnitCostCents,
                tenantId,
                payload.branchId,
                productId,
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
                   id, tenant_id, sale_id, payment_method_id, amount_cents, reference_number, tip_cents
                 ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              salePaymentId,
              tenantId,
              saleId,
              pay.paymentMethodId,
              pay.amountCents,
              pay.referenceNumber ?? null,
              pay.tipCents ?? 0,
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

      if (
        chartOn &&
        (docType === 'NV' || docType === '01' || docType === '03' || docType === '12')
      ) {
        const journalPayments = payload.payments.map((pay) => {
          const raw = rawMethodCodeById.get(pay.paymentMethodId) ?? '';
          const code = methodCodeById.get(pay.paymentMethodId);
          const methodCode =
            pay.isCredit === true || code === 'credit'
              ? 'credit'
              : code === 'store_credit' || raw === 'store_credit'
                ? 'store_credit'
                : raw === 'anticipo' ||
                    raw === 'layaway_deposit' ||
                    (pay.referenceNumber?.startsWith('anticipo:') ?? false)
                  ? 'anticipo'
                  : (code ?? 'cash');
          return { methodCode, amountCents: pay.amountCents };
        });
        const journalResult = await appendJournalToPlan(plan, db, {
          tenantId,
          branchId: payload.branchId,
          userId,
          accountsByCode: chartAccounts,
          prevAuditHash: journalPrevHash,
          entry: planSaleJournal({
            sourceId: saleId,
            postDate: limaTs.slice(0, 10),
            totalCents: totals.totalAmountCents,
            taxCents: totals.totalIgvCents,
            payments: journalPayments,
            ...(storeCreditIssuePlan
              ? { storeCreditIssueCents: storeCreditIssuePlan.amountCents }
              : {}),
          }),
        });
        auditTail = journalResult.rowHash;
      }

      if (storeCreditRedeemPlan && customerId) {
        const storeCreditRedeemResult = await appendStoreCreditRedeemToPlan(plan, db, {
          tenantId,
          userId,
          branchId: payload.branchId,
          accountId: storeCreditRedeemPlan.accountId,
          customerId,
          appliedCents: storeCreditRedeemPlan.appliedCents,
          prevBalanceCents: storeCreditRedeemPlan.prevBalanceCents,
          nextBalanceCents: storeCreditRedeemPlan.nextBalanceCents,
          saleId,
          prevAuditHash: auditTail,
        });
        auditTail = storeCreditRedeemResult.rowHash;
      }
      if (storeCreditIssuePlan && customerId) {
        const storeCreditIssueResult = await appendStoreCreditIssueToPlan(plan, db, {
          tenantId,
          userId,
          branchId: payload.branchId,
          accountId: storeCreditIssuePlan.accountId,
          customerId,
          amountCents: storeCreditIssuePlan.amountCents,
          sourceRef: giftCardSaleSourceRef(saleId),
          saleId,
          prevBalanceCents: storeCreditIssuePlan.prevBalanceCents,
          nextBalanceCents: storeCreditIssuePlan.nextBalanceCents,
          prevAuditHash: auditTail,
          chartOn,
          accountsByCode: chartAccounts,
          postDate: limaTs.slice(0, 10),
        });
        auditTail = storeCreditIssueResult.rowHash;
      }

      if (installmentsOn && payload.installmentPlan && creditPayments.length > 0) {
        const creditSaleCents = creditPayments.reduce((s, p) => s + p.amountCents, 0);
        const down =
          payload.installmentPlan.downPaymentCents ??
          Math.max(0, totals.totalAmountCents - creditSaleCents);
        const installmentResult = await appendInstallmentPlanToBatch(plan, db, {
          tenantId,
          userId,
          branchId: payload.branchId,
          saleId,
          saleTotalCents: totals.totalAmountCents,
          downPaymentCents: down,
          items: payload.installmentPlan.items,
          prevAuditHash: auditTail,
        });
        auditTail = installmentResult.rowHash;
      }

      // S37-H2: el vendedor se resuelve por ítem (item.sellerId) o carrito
      // (payload.sellerId) — regla 22: la venta con vendedor SIEMPRE devenga.
      const resolvedSellerId =
        payload.sellerId?.trim() ||
        payload.items.find((i) => i.sellerId?.trim())?.sellerId?.trim() ||
        '';
      if (commissionsOn && resolvedSellerId && !isReturn) {
        const commissionLines = saleLines.map((line) => ({
          productId: line.productId,
          categoryId: null as string | null,
          lineTotalCents: line.totalCents,
        }));
        const commissionResult = await appendCommissionAccrualToBatch(plan, db, {
          tenantId,
          userId,
          branchId: payload.branchId,
          saleId,
          sellerId: resolvedSellerId,
          lines: commissionLines,
          prevAuditHash: auditTail,
          chartOn,
          accountsByCode: chartAccounts,
          postDate: limaTs.slice(0, 10),
        });
        if (commissionResult.rowHash) auditTail = commissionResult.rowHash;
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

      // Sprint 27 §4.1: cupo en la misma tx (nunca Stripe aquí).
      appendUsageMeterToPlan(plan, db, {
        tenantId,
        documentId: saleId,
        documentType: docType,
      });

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

      if (opts.afterSaleStatements) {
        await opts.afterSaleStatements(plan, saleId, auditTail);
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
