/**
 * Cotizaciones ACID — Sprint 33 / ADR-0017 / §5.3 regla 18 / COM-05.
 * Un db.batch por create/send/approve/convert/cancel. 0 reserva; 0 CPE hasta convertir.
 */
import { convertEnteredToBaseMicrounits, QUANTITY_SCALE } from '@kipuspay/domain-inventory';
import {
  aggregateSaleItems,
  assertQuoteApprovable,
  assertQuoteCancelAllowed,
  assertQuoteConvertible,
  assertQuoteSendable,
  computeNvLineTotals,
  markQuoteExpired,
  planQuoteCreate,
  type OfflinePaymentPayload,
  type OfflineSaleItemPayload,
  type OfflineSalePayload,
  type QuoteStatus,
} from '@kipuspay/domain-sales';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import { auditChainClaimStatements, readAuditChainHead } from './audit-chain.js';
import {
  processOfflineSaleAtomic,
  type ProcessOfflineSaleOptions,
} from './process-offline-sale-atomic.js';
import { resolveServerUnitPriceCents } from './s18-sale-inventory.js';
import { sha256HexOf } from './crypto.js';

export interface QuoteItemInput {
  readonly productId: string;
  readonly uomId?: string | null;
  readonly enteredQuantityMicrounits: number;
  readonly batchId?: string | null;
  readonly promotionIds?: readonly string[] | null;
}

export interface ProcessQuoteCreateInput {
  readonly branchId: string;
  readonly customerId?: string | null;
  readonly validUntilIso?: string | null;
  readonly items: readonly QuoteItemInput[];
}

export interface ProcessQuoteIdInput {
  readonly quoteId: string;
}

export interface ProcessQuoteConvertInput {
  readonly quoteId: string;
  readonly cashRegisterSessionId: string;
  readonly series: string;
  readonly documentType: 'NV' | '01' | '03';
  readonly creditOverrideTokenHash?: string | null;
  readonly saleOpts?: ProcessOfflineSaleOptions;
}

export interface ProcessQuoteCancelInput {
  readonly quoteId: string;
  readonly reason: string;
}

export interface ProcessQuoteOptions {
  readonly catalogUomEnabled?: boolean;
  readonly pricingListsEnabled?: boolean;
  readonly ledgerChartOfAccountsEnabled?: boolean;
  readonly nowMs?: number;
}

interface QuoteRow {
  readonly id: string;
  readonly branch_id: string;
  readonly customer_id: string | null;
  readonly status: string;
  readonly valid_until: string | null;
  readonly total_cents: number;
  readonly sale_id: string | null;
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  return readAuditChainHead(db, tenantId);
}

async function loadQuote(db: D1DatabaseLike, tenantId: string, quoteId: string): Promise<QuoteRow> {
  const row = await db
    .prepare(
      `SELECT id, branch_id, customer_id, status, valid_until, total_cents, sale_id
       FROM quotes WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, quoteId)
    .first<QuoteRow>();
  if (!row) throw new Error('QUOTE_NOT_FOUND');
  return row;
}

async function persistExpiredIfNeeded(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  quote: QuoteRow,
  nowIso: string,
): Promise<QuoteRow> {
  const next = markQuoteExpired({
    status: quote.status as QuoteStatus,
    validUntilIso: quote.valid_until,
    nowIso,
  });
  if (next !== quote.status && next === 'EXPIRED') {
    // G4: expire + QUOTE_EXPIRE audit en un solo batch (nunca UPDATE suelto).
    const prevHash = await previousAuditHash(db, tenantId);
    const rowHash = await sha256HexOf({
      action: 'QUOTE_EXPIRE',
      entity_id: quote.id,
      prev: prevHash,
    });
    await runD1AtomicPlan(db, (builder) => {
      builder.add(
        db
          .prepare(`UPDATE quotes SET status = 'EXPIRED' WHERE tenant_id = ? AND id = ?`)
          .bind(tenantId, quote.id),
      );
      builder.add(
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, 'QUOTE_EXPIRE', 'quote', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            userId,
            quote.id,
            JSON.stringify({ validUntilIso: quote.valid_until }),
            prevHash,
            rowHash,
          ),
      );
      for (const claim of auditChainClaimStatements(db, tenantId, prevHash, [rowHash])) {
        builder.add(claim);
      }
    });
    return { ...quote, status: 'EXPIRED' };
  }
  return quote;
}

async function resolveItemSnapshot(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  customerId: string | null,
  item: QuoteItemInput,
  catalogUomEnabled: boolean,
  pricingListsEnabled: boolean,
): Promise<{
  productId: string;
  batchId: string | null;
  soldUomId: string | null;
  soldUomCode: string | null;
  enteredQuantityMicrounits: number;
  factorNumerator: number;
  factorDenominator: number;
  baseQuantityMicrounits: number;
  unitPriceCents: number;
  lineTotalCents: number;
  promotionIdsJson: string;
}> {
  const product = await db
    .prepare(
      `SELECT id, price_cents, variant_price_override_cents, parent_product_id, is_sellable
       FROM products WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(tenantId, item.productId)
    .first<{
      id: string;
      price_cents: number;
      variant_price_override_cents: number | null;
      parent_product_id: string | null;
      is_sellable: number;
    }>();
  if (!product) throw new Error('PRODUCT_NOT_FOUND');
  if (product.is_sellable === 0) throw new Error('PRODUCT_NOT_SELLABLE');
  const catalogPrice = product.variant_price_override_cents ?? product.price_cents;
  const unitPriceCents = await resolveServerUnitPriceCents(
    db,
    tenantId,
    branchId,
    customerId,
    product.id,
    catalogPrice,
    pricingListsEnabled,
    product.parent_product_id,
  );
  let factorNumerator = 1;
  let factorDenominator = 1;
  let soldUomId: string | null = item.uomId?.trim() || null;
  let soldUomCode: string | null = null;
  if (soldUomId && catalogUomEnabled) {
    const uom = await db
      .prepare(
        `SELECT id, uom_code, factor_numerator, factor_denominator
         FROM product_uoms WHERE tenant_id = ? AND product_id = ? AND id = ? LIMIT 1`,
      )
      .bind(tenantId, product.id, soldUomId)
      .first<{
        id: string;
        uom_code: string;
        factor_numerator: number;
        factor_denominator: number;
      }>();
    if (!uom) throw new Error('UOM_NOT_FOUND');
    factorNumerator = uom.factor_numerator;
    factorDenominator = uom.factor_denominator;
    soldUomCode = uom.uom_code;
  } else if (catalogUomEnabled) {
    const base = await db
      .prepare(
        `SELECT id, uom_code FROM product_uoms
         WHERE tenant_id = ? AND product_id = ? AND is_base = 1 LIMIT 1`,
      )
      .bind(tenantId, product.id)
      .first<{ id: string; uom_code: string }>();
    soldUomId = base?.id ?? null;
    soldUomCode = base?.uom_code ?? 'UND';
  }
  const baseQuantityMicrounits = convertEnteredToBaseMicrounits({
    enteredQuantityMicrounits: item.enteredQuantityMicrounits,
    factorNumerator,
    factorDenominator,
  });
  const lineTotalCents = Math.floor(
    (baseQuantityMicrounits * unitPriceCents + QUANTITY_SCALE / 2) / QUANTITY_SCALE,
  );
  return {
    productId: product.id,
    batchId: item.batchId ?? null,
    soldUomId,
    soldUomCode,
    enteredQuantityMicrounits: item.enteredQuantityMicrounits,
    factorNumerator,
    factorDenominator,
    baseQuantityMicrounits,
    unitPriceCents,
    lineTotalCents,
    promotionIdsJson: JSON.stringify(item.promotionIds ?? []),
  };
}

export async function processQuoteCreateAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessQuoteCreateInput,
  options: ProcessQuoteOptions = {},
): Promise<{
  quoteId: string;
  snapshotTotalCents: number;
  emitsFiscalDocument: false;
  reservesStock: false;
}> {
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const snapshots: Awaited<ReturnType<typeof resolveItemSnapshot>>[] = [];
  for (const item of input.items) {
    snapshots.push(
      await resolveItemSnapshot(
        db,
        tenantId,
        input.branchId,
        input.customerId ?? null,
        item,
        options.catalogUomEnabled === true,
        options.pricingListsEnabled === true,
      ),
    );
  }
  const plan = planQuoteCreate({
    items: snapshots.map((s) => ({
      productId: s.productId,
      baseQuantityMicrounits: s.baseQuantityMicrounits,
      unitPriceCents: s.unitPriceCents,
    })),
    validUntilIso: input.validUntilIso ?? null,
    nowIso,
  });
  const quoteId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, tenantId);
  const rowHash = await sha256HexOf({
    action: 'QUOTE_CREATE',
    entity_id: quoteId,
    prev: prevHash,
  });
  await runD1AtomicPlan(db, (builder) => {
    builder.add(
      db
        .prepare(
          `INSERT INTO quotes (
             id, tenant_id, branch_id, customer_id, status, valid_until, total_cents,
             created_by_user_id
           ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        )
        .bind(
          quoteId,
          tenantId,
          input.branchId,
          input.customerId ?? null,
          input.validUntilIso ?? null,
          plan.snapshotTotalCents,
          userId,
        ),
    );
    for (const snap of snapshots) {
      builder.add(
        db
          .prepare(
            `INSERT INTO quote_items (
               id, tenant_id, quote_id, product_id, batch_id, sold_uom_id, sold_uom_code,
               entered_quantity_microunits, factor_numerator, factor_denominator,
               base_quantity_microunits, unit_price_cents, line_total_cents, promotion_ids_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            quoteId,
            snap.productId,
            snap.batchId,
            snap.soldUomId,
            snap.soldUomCode,
            snap.enteredQuantityMicrounits,
            snap.factorNumerator,
            snap.factorDenominator,
            snap.baseQuantityMicrounits,
            snap.unitPriceCents,
            snap.lineTotalCents,
            snap.promotionIdsJson,
          ),
      );
    }
    builder.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, 'QUOTE_CREATE', 'quote', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          userId,
          quoteId,
          JSON.stringify({ snapshotTotalCents: plan.snapshotTotalCents }),
          prevHash,
          rowHash,
        ),
    );
    for (const claim of auditChainClaimStatements(db, tenantId, prevHash, [rowHash])) {
      builder.add(claim);
    }
  });
  return {
    quoteId,
    snapshotTotalCents: plan.snapshotTotalCents,
    emitsFiscalDocument: false,
    reservesStock: false,
  };
}

async function transitionQuote<TStatus extends 'SENT' | 'APPROVED' | 'CANCELLED'>(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  quoteId: string,
  nextStatus: TStatus,
  action: 'QUOTE_SEND' | 'QUOTE_APPROVE' | 'QUOTE_CANCEL',
  assertFn: (status: QuoteStatus) => void,
  extraPayload: Record<string, unknown> = {},
): Promise<{ quoteId: string; status: TStatus; emitsFiscalDocument: false }> {
  const nowIso = new Date().toISOString();
  const loaded = await persistExpiredIfNeeded(
    db,
    tenantId,
    userId,
    await loadQuote(db, tenantId, quoteId),
    nowIso,
  );
  assertFn(loaded.status as QuoteStatus);
  const prevHash = await previousAuditHash(db, tenantId);
  const rowHash = await sha256HexOf({ action, entity_id: quoteId, prev: prevHash });
  await runD1AtomicPlan(db, (builder) => {
    builder.add(
      db
        .prepare(`UPDATE quotes SET status = ? WHERE tenant_id = ? AND id = ?`)
        .bind(nextStatus, tenantId, quoteId),
    );
    builder.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'quote', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          userId,
          action,
          quoteId,
          JSON.stringify(extraPayload),
          prevHash,
          rowHash,
        ),
    );
    for (const claim of auditChainClaimStatements(db, tenantId, prevHash, [rowHash])) {
      builder.add(claim);
    }
  });
  return { quoteId, status: nextStatus, emitsFiscalDocument: false };
}

export async function processQuoteSendAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessQuoteIdInput,
): Promise<{ quoteId: string; status: 'SENT'; emitsFiscalDocument: false }> {
  return transitionQuote(db, tenantId, userId, input.quoteId, 'SENT', 'QUOTE_SEND', (status) =>
    assertQuoteSendable({ status }),
  );
}

export async function processQuoteApproveAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessQuoteIdInput,
): Promise<{ quoteId: string; status: 'APPROVED'; emitsFiscalDocument: false }> {
  return transitionQuote(
    db,
    tenantId,
    userId,
    input.quoteId,
    'APPROVED',
    'QUOTE_APPROVE',
    (status) => assertQuoteApprovable({ status }),
  );
}

export async function processQuoteCancelAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessQuoteCancelInput,
): Promise<{ quoteId: string; status: 'CANCELLED'; emitsFiscalDocument: false }> {
  return transitionQuote(
    db,
    tenantId,
    userId,
    input.quoteId,
    'CANCELLED',
    'QUOTE_CANCEL',
    (status) => assertQuoteCancelAllowed({ status }),
    { reason: input.reason },
  );
}

export async function processQuoteConvertAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessQuoteConvertInput,
  options: ProcessQuoteOptions = {},
): Promise<{ saleId: string; quoteId: string }> {
  const nowIso = new Date(options.nowMs ?? Date.now()).toISOString();
  const quote = await persistExpiredIfNeeded(
    db,
    tenantId,
    userId,
    await loadQuote(db, tenantId, input.quoteId),
    nowIso,
  );
  assertQuoteConvertible({
    status: quote.status as QuoteStatus,
    validUntilIso: quote.valid_until,
    nowIso,
  });
  const items = await db
    .prepare(
      `SELECT product_id, sold_uom_id, sold_uom_code, entered_quantity_microunits,
              factor_numerator, factor_denominator, base_quantity_microunits, unit_price_cents
       FROM quote_items WHERE tenant_id = ? AND quote_id = ?`,
    )
    .bind(tenantId, quote.id)
    .all<{
      product_id: string;
      sold_uom_id: string | null;
      sold_uom_code: string | null;
      entered_quantity_microunits: number;
      factor_numerator: number;
      factor_denominator: number;
      base_quantity_microunits: number;
      unit_price_cents: number;
    }>();
  const customer = quote.customer_id
    ? await db
        .prepare(
          `SELECT document_type_code, document_number, name FROM customers
           WHERE tenant_id = ? AND id = ? LIMIT 1`,
        )
        .bind(tenantId, quote.customer_id)
        .first<{ document_type_code: string; document_number: string; name: string }>()
    : null;
  const paymentMethodRows = await db
    .prepare(`SELECT id, code FROM payment_methods WHERE tenant_id = ? AND is_active = 1`)
    .bind(tenantId)
    .all<{ id: string; code: string }>();
  const methods = paymentMethodRows.results ?? [];
  const cash = methods.find((m) => m.code === 'cash') ?? methods[0];
  if (!cash) throw new Error('PAYMENT_METHOD_NOT_FOUND');
  const payloadItems: OfflineSaleItemPayload[] = (items.results ?? []).map((row) => {
    const base: OfflineSaleItemPayload = {
      productId: row.product_id,
      quantity: row.base_quantity_microunits / QUANTITY_SCALE,
      baseQuantityMicrounits: row.base_quantity_microunits,
      serverUnitPriceCents: row.unit_price_cents,
      resolvedUomCode: row.sold_uom_code ?? 'UND',
      resolvedFactorNumerator: row.factor_numerator ?? 1,
      resolvedFactorDenominator: row.factor_denominator ?? 1,
    };
    return row.sold_uom_id
      ? {
          ...base,
          uomId: row.sold_uom_id,
          enteredQuantityMicrounits: row.entered_quantity_microunits,
        }
      : base;
  });
  const aggregated = aggregateSaleItems(payloadItems);
  const totals = computeNvLineTotals(
    aggregated,
    new Map(
      aggregated.map((item) => [
        item.productId,
        { priceCents: item.serverUnitPriceCents ?? 0, costCents: 0 },
      ]),
    ),
  );
  const payments: OfflinePaymentPayload[] = [
    { paymentMethodId: cash.id, amountCents: totals.totalAmountCents },
  ];
  const payload: OfflineSalePayload = {
    offlineSaleId: `quote-${quote.id}`,
    branchId: quote.branch_id,
    cashRegisterSessionId: input.cashRegisterSessionId,
    documentType: input.documentType,
    series: input.series,
    clientDocumentType: customer?.document_type_code ?? '0',
    clientDocumentNumber: customer?.document_number ?? '0',
    clientName: customer?.name ?? 'Cliente cotizacion',
    items: aggregated,
    payments,
    creditOverrideTokenHash: input.creditOverrideTokenHash ?? null,
  };
  const sale = await processOfflineSaleAtomic(db, tenantId, userId, payload, {
    ...(input.saleOpts ?? {}),
    catalogUomEnabled: options.catalogUomEnabled === true,
    ledgerChartOfAccountsEnabled: options.ledgerChartOfAccountsEnabled === true,
    afterSaleStatements: async (builder, saleId, auditPrevHash) => {
      builder.add(
        db
          .prepare(
            `UPDATE quotes SET status = 'CONVERTED', sale_id = ?
             WHERE tenant_id = ? AND id = ? AND status = 'APPROVED'`,
          )
          .bind(saleId, tenantId, quote.id),
      );
      const rowHash = await sha256HexOf({
        action: 'QUOTE_CONVERT',
        entity_id: quote.id,
        sale_id: saleId,
        prev: auditPrevHash,
      });
      builder.add(
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, 'QUOTE_CONVERT', 'quote', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            userId,
            quote.id,
            JSON.stringify({ saleId, totalAmountCents: totals.totalAmountCents }),
            auditPrevHash,
            rowHash,
          ),
      );
      for (const claim of auditChainClaimStatements(db, tenantId, auditPrevHash, [rowHash])) {
        builder.add(claim);
      }
    },
  });
  if (sale.status !== 'SUCCESS') throw new Error('QUOTE_CONVERT_FAILED');
  return { saleId: sale.saleId, quoteId: quote.id };
}
