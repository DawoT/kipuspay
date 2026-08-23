/**
 * Apartados ACID — Sprint 32 / ADR-0016 / §5.3 regla 17.
 * Un solo db.batch por create/deposit/convert/cancel. Sin CPE hasta convertir.
 */
/* eslint-disable complexity -- orquestador multi-rama reserva/abono/convert/cancel */
import { auditChainClaimStatements, readAuditChainHead } from './audit-chain.js';
import { planLayawayDepositJournal, planLayawayRefundJournal } from '@kipuspay/domain-cash';
import { convertEnteredToBaseMicrounits, QUANTITY_SCALE } from '@kipuspay/domain-inventory';
import {
  aggregateSaleItems,
  assertLayawayCancelAllowed,
  assertLayawayConvertible,
  computeNvLineTotals,
  parseReturnPolicyRow,
  planLayawayCreate,
  planLayawayDeposit,
  type OfflinePaymentPayload,
  type OfflineSaleItemPayload,
  type OfflineSalePayload,
} from '@kipuspay/domain-sales';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import { appendJournalToPlan, loadChartAccountsByCode } from './journal-post.js';
import {
  processOfflineSaleAtomic,
  type ProcessOfflineSaleOptions,
} from './process-offline-sale-atomic.js';
import { appendLocationStockDeltaToPlan } from './process-inventory-location-atomic.js';
import {
  appendSerialTransitionToPlan,
  loadSerialsForStockOperation,
} from './process-inventory-serial-atomic.js';
import { processReturnAtomic } from './process-return-atomic.js';
import { resolveServerUnitPriceCents } from './s18-sale-inventory.js';
import { sha256HexOf } from './crypto.js';

export interface LayawayItemInput {
  readonly productId: string;
  readonly uomId?: string | null;
  readonly enteredQuantityMicrounits: number;
  readonly batchId?: string | null;
  readonly serialIds?: readonly string[];
}

export interface ProcessLayawayCreateInput {
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly customerId?: string | null;
  readonly dueDateIso?: string | null;
  readonly depositDateIso?: string;
  readonly items: readonly LayawayItemInput[];
  readonly initialPayment?: { readonly paymentMethod: string; readonly amountCents: number } | null;
}

export interface ProcessLayawayDepositInput {
  readonly depositId: string;
  readonly cashRegisterSessionId: string;
  readonly paymentMethod: string;
  readonly amountCents: number;
}

export interface ProcessLayawayConvertInput {
  readonly depositId: string;
  readonly cashRegisterSessionId: string;
  readonly series: string;
  readonly documentType: 'NV' | '01' | '03';
  readonly remainingAsCredit?: boolean;
  readonly creditOverrideTokenHash?: string | null;
  readonly saleOpts?: ProcessOfflineSaleOptions;
}

export interface ProcessLayawayCancelInput {
  readonly depositId: string;
  readonly cashRegisterSessionId?: string | null;
  readonly reason: string;
}

export interface ProcessLayawayOptions {
  readonly chartOfAccountsEnabled?: boolean;
  readonly catalogUomEnabled?: boolean;
  readonly pricingListsEnabled?: boolean;
  readonly nowMs?: number;
}

function limaDate(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  return readAuditChainHead(db, tenantId);
}

async function resolveItemSnapshot(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  customerId: string | null,
  item: LayawayItemInput,
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
  };
}

export async function processLayawayCreateAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessLayawayCreateInput,
  options: ProcessLayawayOptions = {},
): Promise<{ depositId: string; snapshotTotalCents: number; emitsFiscalDocument: false }> {
  const nowMs = options.nowMs ?? Date.now();
  const depositDate = input.depositDateIso ?? limaDate(nowMs);
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
  const plan = planLayawayCreate({
    items: snapshots.map((s) => ({
      productId: s.productId,
      baseQuantityMicrounits: s.baseQuantityMicrounits,
      unitPriceCents: s.unitPriceCents,
    })),
    dueDateIso: input.dueDateIso ?? null,
    nowIso: new Date(nowMs).toISOString(),
  });
  let initial: ReturnType<typeof planLayawayDeposit> | null = null;
  if (input.initialPayment) {
    initial = planLayawayDeposit({
      snapshotTotalCents: plan.snapshotTotalCents,
      alreadyPaidCents: 0,
      amountCents: input.initialPayment.amountCents,
      status: 'OPEN',
    });
  }
  const depositId = crypto.randomUUID();
  const preparedSerials = await loadSerialsForStockOperation(
    db,
    tenantId,
    input.branchId,
    snapshots.map((snapshot, index) => ({
      productId: snapshot.productId,
      quantityMicrounits: snapshot.baseQuantityMicrounits,
      serialIds: input.items[index]?.serialIds ?? [],
    })),
    'AVAILABLE',
  );
  const journalOn = options.chartOfAccountsEnabled === true;
  const accounts = journalOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const prevHash = await previousAuditHash(db, tenantId);
  await runD1AtomicPlan(db, async (builder) => {
    builder.add(
      db
        .prepare(
          `INSERT INTO sale_deposits (
               id, tenant_id, branch_id, customer_id, status, deposit_date, due_date,
               snapshot_total_cents, created_by_user_id
             ) VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
        )
        .bind(
          depositId,
          tenantId,
          input.branchId,
          input.customerId ?? null,
          depositDate,
          input.dueDateIso ?? null,
          plan.snapshotTotalCents,
          userId,
        ),
    );
    for (let snapshotIndex = 0; snapshotIndex < snapshots.length; snapshotIndex++) {
      const snap = snapshots[snapshotIndex]!;
      const depositItemId = crypto.randomUUID();
      builder.add(
        db
          .prepare(
            `INSERT INTO sale_deposit_items (
                 id, tenant_id, sale_deposit_id, product_id, batch_id, sold_uom_id, sold_uom_code,
                 entered_quantity_microunits, factor_numerator, factor_denominator,
                 base_quantity_microunits, unit_price_cents
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            depositItemId,
            tenantId,
            depositId,
            snap.productId,
            snap.batchId,
            snap.soldUomId,
            snap.soldUomCode,
            snap.enteredQuantityMicrounits,
            snap.factorNumerator,
            snap.factorDenominator,
            snap.baseQuantityMicrounits,
            snap.unitPriceCents,
          ),
      );
      for (const serialId of input.items[snapshotIndex]?.serialIds ?? []) {
        const serial = preparedSerials.find((candidate) => candidate.serialId === serialId);
        if (!serial) throw new Error('SERIAL_IDENTITY_INVALID');
        await appendSerialTransitionToPlan(builder, db, {
          tenantId,
          serialId,
          branchId: serial.branchId,
          locationId: serial.locationId,
          productId: serial.productId,
          expectedStatus: 'AVAILABLE',
          nextStatus: 'RESERVED',
          expectedVersion: serial.version,
          eventType: 'LAYAWAY_RESERVE',
          operationType: 'LAYAWAY',
          operationId: depositId,
          operationLineId: depositItemId,
          idempotencyKey: `layaway:${depositId}:${serialId}`,
          actorUserId: userId,
        });
      }
      builder.add(
        db
          .prepare(
            `UPDATE branch_product_stock
               SET stock_microunits = stock_microunits - ?,
                   stock = (stock_microunits - ?) * 0.000001,
                   updated_at = CURRENT_TIMESTAMP, version = version + 1
             WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
               AND stock_microunits >= ?`,
          )
          .bind(
            snap.baseQuantityMicrounits,
            snap.baseQuantityMicrounits,
            tenantId,
            input.branchId,
            snap.productId,
            snap.baseQuantityMicrounits,
          ),
      );
      appendLocationStockDeltaToPlan(builder, db, {
        tenantId,
        branchId: input.branchId,
        productId: snap.productId,
        deltaMicrounits: -snap.baseQuantityMicrounits,
        batchId: snap.batchId,
      });
      if (snap.batchId) {
        builder.add(
          db
            .prepare(
              `UPDATE inventory_batches
                 SET stock_microunits = stock_microunits - ?,
                     stock = (stock_microunits - ?) * 0.000001
               WHERE id = ? AND tenant_id = ? AND stock_microunits >= ?`,
            )
            .bind(
              snap.baseQuantityMicrounits,
              snap.baseQuantityMicrounits,
              snap.batchId,
              tenantId,
              snap.baseQuantityMicrounits,
            ),
        );
      }
      builder.add(
        db
          .prepare(
            `INSERT INTO inventory_movements (
                 id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
                 quantity_delta_microunits, unit_cost_cents, stock_after, stock_after_microunits,
                 user_id, reference_id
               ) VALUES (?, ?, ?, ?, ?, 'RESERVA_APARTADO', ?, ?, 0,
                 (SELECT stock FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 (SELECT stock_microunits FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            input.branchId,
            snap.productId,
            snap.batchId,
            -(snap.baseQuantityMicrounits / QUANTITY_SCALE),
            -snap.baseQuantityMicrounits,
            tenantId,
            input.branchId,
            snap.productId,
            tenantId,
            input.branchId,
            snap.productId,
            userId,
            depositId,
          ),
      );
    }
    if (initial && input.initialPayment) {
      const paymentId = crypto.randomUUID();
      builder.add(
        db
          .prepare(
            `INSERT INTO sale_deposit_payments (
                 id, tenant_id, sale_deposit_id, payment_method, amount_cents, created_by_user_id
               ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            paymentId,
            tenantId,
            depositId,
            input.initialPayment.paymentMethod,
            initial.amountCents,
            userId,
          ),
      );
      builder.add(
        db
          .prepare(
            `INSERT INTO cash_register_cash_movements (
                 id, tenant_id, branch_id, cash_register_session_id, movement_type,
                 amount_cents, counterparty_ref, reason, created_by_user_id
               ) VALUES (?, ?, ?, ?, 'LAYAWAY_DEPOSIT', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            input.branchId,
            input.cashRegisterSessionId,
            initial.amountCents,
            depositId,
            'abono apartado',
            userId,
          ),
      );
      if (journalOn) {
        await appendJournalToPlan(builder, db, {
          tenantId,
          branchId: input.branchId,
          userId,
          accountsByCode: accounts,
          prevAuditHash: prevHash,
          entry: planLayawayDepositJournal({
            sourceId: paymentId,
            postDate: depositDate,
            amountCents: initial.amountCents,
          }),
        });
      }
    }
  });
  return { depositId, snapshotTotalCents: plan.snapshotTotalCents, emitsFiscalDocument: false };
}

export async function processLayawayDepositAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessLayawayDepositInput,
  options: ProcessLayawayOptions = {},
): Promise<{ paymentId: string; balanceAfterCents: number; emitsFiscalDocument: false }> {
  const nowMs = options.nowMs ?? Date.now();
  const deposit = await db
    .prepare(
      `SELECT id, branch_id, status, snapshot_total_cents FROM sale_deposits
       WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, input.depositId)
    .first<{ id: string; branch_id: string; status: string; snapshot_total_cents: number }>();
  if (!deposit) throw new Error('LAYAWAY_NOT_FOUND');
  const paid = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS paid FROM sale_deposit_payments
       WHERE tenant_id = ? AND sale_deposit_id = ?`,
    )
    .bind(tenantId, deposit.id)
    .first<{ paid: number }>();
  const depositPlan = planLayawayDeposit({
    snapshotTotalCents: deposit.snapshot_total_cents,
    alreadyPaidCents: paid?.paid ?? 0,
    amountCents: input.amountCents,
    status: deposit.status as 'OPEN' | 'OVERDUE' | 'CONVERTED' | 'CANCELLED',
  });
  const paymentId = crypto.randomUUID();
  const journalOn = options.chartOfAccountsEnabled === true;
  const accounts = journalOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const prevHash = await previousAuditHash(db, tenantId);
  await runD1AtomicPlan(db, async (builder) => {
    builder.add(
      db
        .prepare(
          `INSERT INTO sale_deposit_payments (
               id, tenant_id, sale_deposit_id, payment_method, amount_cents, created_by_user_id
             ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          paymentId,
          tenantId,
          deposit.id,
          input.paymentMethod,
          depositPlan.amountCents,
          userId,
        ),
    );
    builder.add(
      db
        .prepare(
          `INSERT INTO cash_register_cash_movements (
               id, tenant_id, branch_id, cash_register_session_id, movement_type,
               amount_cents, counterparty_ref, reason, created_by_user_id
             ) VALUES (?, ?, ?, ?, 'LAYAWAY_DEPOSIT', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          deposit.branch_id,
          input.cashRegisterSessionId,
          depositPlan.amountCents,
          deposit.id,
          'abono apartado',
          userId,
        ),
    );
    if (journalOn) {
      await appendJournalToPlan(builder, db, {
        tenantId,
        branchId: deposit.branch_id,
        userId,
        accountsByCode: accounts,
        prevAuditHash: prevHash,
        entry: planLayawayDepositJournal({
          sourceId: paymentId,
          postDate: limaDate(nowMs),
          amountCents: depositPlan.amountCents,
        }),
      });
    }
  });
  return {
    paymentId,
    balanceAfterCents: depositPlan.balanceAfterCents,
    emitsFiscalDocument: false,
  };
}

export async function processLayawayConvertAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessLayawayConvertInput,
  options: ProcessLayawayOptions = {},
): Promise<{ saleId: string; depositId: string }> {
  const deposit = await db
    .prepare(
      `SELECT id, branch_id, customer_id, status, snapshot_total_cents
       FROM sale_deposits WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, input.depositId)
    .first<{
      id: string;
      branch_id: string;
      customer_id: string | null;
      status: string;
      snapshot_total_cents: number;
    }>();
  if (!deposit) throw new Error('LAYAWAY_NOT_FOUND');
  const paid = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS paid FROM sale_deposit_payments
       WHERE tenant_id = ? AND sale_deposit_id = ?`,
    )
    .bind(tenantId, deposit.id)
    .first<{ paid: number }>();
  assertLayawayConvertible({
    status: deposit.status as 'OPEN' | 'OVERDUE' | 'CONVERTED' | 'CANCELLED',
    snapshotTotalCents: deposit.snapshot_total_cents,
    paidCents: paid?.paid ?? 0,
    remainingAsCredit: input.remainingAsCredit === true,
  });
  const items = await db
    .prepare(
      `SELECT product_id, sold_uom_id, sold_uom_code, entered_quantity_microunits,
              factor_numerator, factor_denominator, base_quantity_microunits, unit_price_cents
       FROM sale_deposit_items WHERE tenant_id = ? AND sale_deposit_id = ?`,
    )
    .bind(tenantId, deposit.id)
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
  const customer = deposit.customer_id
    ? await db
        .prepare(
          `SELECT document_type_code, document_number, name FROM customers
           WHERE tenant_id = ? AND id = ? LIMIT 1`,
        )
        .bind(tenantId, deposit.customer_id)
        .first<{ document_type_code: string; document_number: string; name: string }>()
    : null;
  const layawaySerials = await db
    .prepare(
      `SELECT sn.id, sn.product_id
       FROM serial_numbers sn
       INNER JOIN serial_manifest_items smi
         ON smi.tenant_id = sn.tenant_id AND smi.serial_id = sn.id
       INNER JOIN serial_manifests sm
         ON sm.tenant_id = smi.tenant_id AND sm.id = smi.manifest_id
       WHERE sn.tenant_id = ? AND sm.operation_type = 'LAYAWAY'
         AND sm.operation_id = ? AND sn.status = 'RESERVED'`,
    )
    .bind(tenantId, deposit.id)
    .all<{ id: string; product_id: string }>();
  const paidCents = paid?.paid ?? 0;
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
  const remainder = totals.totalAmountCents - paidCents;
  const paymentMethodRows = await db
    .prepare(`SELECT id, code FROM payment_methods WHERE tenant_id = ? AND is_active = 1`)
    .bind(tenantId)
    .all<{ id: string; code: string }>();
  const methods = paymentMethodRows.results ?? [];
  const anticipo =
    methods.find((m) => m.code === 'anticipo' || m.code === 'layaway_deposit') ?? methods[0];
  const cash = methods.find((m) => m.code === 'cash') ?? methods[0];
  const credit = methods.find((m) => m.code === 'credit') ?? methods[0];
  if (!anticipo || !cash || !credit) throw new Error('PAYMENT_METHOD_NOT_FOUND');
  const payments: OfflinePaymentPayload[] = [];
  if (paidCents > 0) {
    payments.push({
      paymentMethodId: anticipo.id,
      amountCents: paidCents,
      referenceNumber: `anticipo:${deposit.id}`,
    });
  }
  if (remainder > 0 && input.remainingAsCredit) {
    payments.push({ paymentMethodId: credit.id, amountCents: remainder, isCredit: true });
  } else if (remainder > 0) {
    payments.push({ paymentMethodId: cash.id, amountCents: remainder });
  }
  const payload: OfflineSalePayload = {
    offlineSaleId: `layaway-${deposit.id}`,
    branchId: deposit.branch_id,
    cashRegisterSessionId: input.cashRegisterSessionId,
    documentType: input.documentType,
    series: input.series,
    clientDocumentType: customer?.document_type_code ?? '0',
    clientDocumentNumber: customer?.document_number ?? '0',
    clientName: customer?.name ?? 'Cliente apartado',
    items: aggregated,
    payments,
    creditOverrideTokenHash: input.creditOverrideTokenHash ?? null,
  };
  const sale = await processOfflineSaleAtomic(db, tenantId, userId, payload, {
    ...(input.saleOpts ?? {}),
    catalogUomEnabled: options.catalogUomEnabled === true,
    ledgerChartOfAccountsEnabled: options.chartOfAccountsEnabled === true,
    skipStockDeduction: true,
    serialAssignments: (layawaySerials.results ?? []).map((serial) => ({
      productId: serial.product_id,
      serialId: serial.id,
    })),
    afterSaleStatements: async (builder, saleId, auditPrevHash) => {
      builder.add(
        db
          .prepare(
            `UPDATE sale_deposits SET status = 'CONVERTED', sale_id = ?
             WHERE tenant_id = ? AND id = ? AND status IN ('OPEN','OVERDUE')`,
          )
          .bind(saleId, tenantId, deposit.id),
      );
      const rowHash = await sha256HexOf({
        action: 'LAYAWAY_CONVERT',
        entity_id: deposit.id,
        sale_id: saleId,
        prev: auditPrevHash,
      });
      builder.add(
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'LAYAWAY_CONVERT', 'sale_deposit', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            deposit.branch_id,
            userId,
            deposit.id,
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
  if (sale.status !== 'SUCCESS') throw new Error('LAYAWAY_CONVERT_FAILED');
  return { saleId: sale.saleId, depositId: deposit.id };
}

export async function processLayawayCancelAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessLayawayCancelInput,
  options: ProcessLayawayOptions = {},
): Promise<{ refundCents: number; status: 'CANCELLED' | 'RETURNED' }> {
  const nowMs = options.nowMs ?? Date.now();
  const deposit = await db
    .prepare(
      `SELECT id, branch_id, status, sale_id, created_at FROM sale_deposits
       WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, input.depositId)
    .first<{
      id: string;
      branch_id: string;
      status: string;
      sale_id: string | null;
      created_at: string;
    }>();
  if (!deposit) throw new Error('LAYAWAY_NOT_FOUND');
  if (deposit.status === 'CONVERTED' && deposit.sale_id) {
    const items = await db
      .prepare(
        `SELECT si.id, si.quantity - COALESCE((
           SELECT SUM(sri.qty) FROM sale_return_items sri
           INNER JOIN sales_returns sr ON sr.tenant_id = sri.tenant_id AND sr.id = sri.return_id
           WHERE sri.original_sale_item_id = si.id
         ), 0) AS remaining
         FROM sale_items si WHERE si.tenant_id = ? AND si.sale_id = ?`,
      )
      .bind(tenantId, deposit.sale_id)
      .all<{ id: string; remaining: number }>();
    const lines = (items.results ?? [])
      .filter((row) => row.remaining > 0)
      .map((row) => ({ originalSaleItemId: row.id, qty: row.remaining }));
    await processReturnAtomic(
      db,
      tenantId,
      userId,
      {
        originSaleId: deposit.sale_id,
        lines,
        reason: input.reason || 'LAYAWAY_CANCEL',
        series: 'NVR1',
        cashRegisterSessionId: input.cashRegisterSessionId ?? null,
      },
      { ledgerArApEnabled: true, chartOfAccountsEnabled: options.chartOfAccountsEnabled === true },
    );
    return { refundCents: 0, status: 'RETURNED' };
  }
  const policyRow = await db
    .prepare(`SELECT * FROM return_policies WHERE tenant_id = ? LIMIT 1`)
    .bind(tenantId)
    .first<Record<string, unknown>>();
  const policy = parseReturnPolicyRow(policyRow);
  const createdAtMs = Date.parse(String(deposit.created_at).replace(' ', 'T'));
  assertLayawayCancelAllowed({
    status: deposit.status as 'OPEN' | 'OVERDUE' | 'CONVERTED' | 'CANCELLED',
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : nowMs,
    nowMs,
    paymentMethod: 'cash',
    policy,
  });
  const paid = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS paid FROM sale_deposit_payments
       WHERE tenant_id = ? AND sale_deposit_id = ?`,
    )
    .bind(tenantId, deposit.id)
    .first<{ paid: number }>();
  const refundCents = paid?.paid ?? 0;
  const reserved = await db
    .prepare(
      `SELECT product_id, batch_id, base_quantity_microunits
       FROM sale_deposit_items WHERE tenant_id = ? AND sale_deposit_id = ?`,
    )
    .bind(tenantId, deposit.id)
    .all<{ product_id: string; batch_id: string | null; base_quantity_microunits: number }>();
  const reservedSerials = await db
    .prepare(
      `SELECT sn.id, sn.product_id, sn.branch_id, sn.location_id, sn.version
       FROM serial_numbers sn
       INNER JOIN serial_manifest_items smi
         ON smi.tenant_id = sn.tenant_id AND smi.serial_id = sn.id
       INNER JOIN serial_manifests sm
         ON sm.tenant_id = smi.tenant_id AND sm.id = smi.manifest_id
       WHERE sn.tenant_id = ? AND sm.operation_type = 'LAYAWAY'
         AND sm.operation_id = ? AND sn.status = 'RESERVED'`,
    )
    .bind(tenantId, deposit.id)
    .all<{
      id: string;
      product_id: string;
      branch_id: string;
      location_id: string;
      version: number;
    }>();
  const journalOn = options.chartOfAccountsEnabled === true;
  const accounts = journalOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const prevHash = await previousAuditHash(db, tenantId);
  const auditId = crypto.randomUUID();
  const rowHash = await sha256HexOf({
    action: 'LAYAWAY_CANCEL',
    entity_id: deposit.id,
    prev: prevHash,
  });
  const sessionId =
    input.cashRegisterSessionId ??
    (
      await db
        .prepare(
          `SELECT id FROM cash_register_sessions
           WHERE tenant_id = ? AND branch_id = ? AND status = 'OPEN' LIMIT 1`,
        )
        .bind(tenantId, deposit.branch_id)
        .first<{ id: string }>()
    )?.id;
  if (refundCents > 0 && !sessionId) throw new Error('SESSION_NOT_FOUND');
  await runD1AtomicPlan(db, async (builder) => {
    builder.add(
      db
        .prepare(
          `UPDATE sale_deposits SET status = 'CANCELLED'
           WHERE tenant_id = ? AND id = ? AND status IN ('OPEN','OVERDUE')`,
        )
        .bind(tenantId, deposit.id),
    );
    for (const row of reserved.results ?? []) {
      builder.add(
        db
          .prepare(
            `UPDATE branch_product_stock
               SET stock_microunits = stock_microunits + ?,
                   stock = (stock_microunits + ?) * 0.000001,
                   updated_at = CURRENT_TIMESTAMP, version = version + 1
             WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
          )
          .bind(
            row.base_quantity_microunits,
            row.base_quantity_microunits,
            tenantId,
            deposit.branch_id,
            row.product_id,
          ),
      );
      appendLocationStockDeltaToPlan(builder, db, {
        tenantId,
        branchId: deposit.branch_id,
        productId: row.product_id,
        deltaMicrounits: row.base_quantity_microunits,
        batchId: row.batch_id,
      });
      if (row.batch_id) {
        builder.add(
          db
            .prepare(
              `UPDATE inventory_batches
                 SET stock_microunits = stock_microunits + ?,
                     stock = (stock_microunits + ?) * 0.000001
               WHERE id = ? AND tenant_id = ?`,
            )
            .bind(
              row.base_quantity_microunits,
              row.base_quantity_microunits,
              row.batch_id,
              tenantId,
            ),
        );
      }
      builder.add(
        db
          .prepare(
            `INSERT INTO inventory_movements (
                 id, tenant_id, branch_id, product_id, batch_id, movement_type, quantity_delta,
                 quantity_delta_microunits, unit_cost_cents, stock_after, stock_after_microunits,
                 user_id, reference_id
               ) VALUES (?, ?, ?, ?, ?, 'LIBERA_APARTADO', ?, ?, 0,
                 (SELECT stock FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 (SELECT stock_microunits FROM branch_product_stock
                  WHERE tenant_id = ? AND branch_id = ? AND product_id = ?),
                 ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            deposit.branch_id,
            row.product_id,
            row.batch_id,
            row.base_quantity_microunits / QUANTITY_SCALE,
            row.base_quantity_microunits,
            tenantId,
            deposit.branch_id,
            row.product_id,
            tenantId,
            deposit.branch_id,
            row.product_id,
            userId,
            deposit.id,
          ),
      );
    }
    for (const serial of reservedSerials.results ?? []) {
      await appendSerialTransitionToPlan(builder, db, {
        tenantId,
        serialId: serial.id,
        branchId: serial.branch_id,
        locationId: serial.location_id,
        productId: serial.product_id,
        expectedStatus: 'RESERVED',
        nextStatus: 'AVAILABLE',
        expectedVersion: serial.version,
        eventType: 'LAYAWAY_CANCEL',
        operationType: 'LAYAWAY_CANCEL',
        operationId: deposit.id,
        idempotencyKey: `layaway-cancel:${deposit.id}:${serial.id}`,
        actorUserId: userId,
      });
    }
    if (refundCents > 0 && sessionId) {
      builder.add(
        db
          .prepare(
            `INSERT INTO cash_register_cash_movements (
                 id, tenant_id, branch_id, cash_register_session_id, movement_type,
                 amount_cents, counterparty_ref, reason, created_by_user_id
               ) VALUES (?, ?, ?, ?, 'LAYAWAY_REFUND', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            deposit.branch_id,
            sessionId,
            refundCents,
            deposit.id,
            input.reason,
            userId,
          ),
      );
      if (journalOn) {
        await appendJournalToPlan(builder, db, {
          tenantId,
          branchId: deposit.branch_id,
          userId,
          accountsByCode: accounts,
          prevAuditHash: prevHash,
          entry: planLayawayRefundJournal({
            sourceId: deposit.id,
            postDate: limaDate(nowMs),
            amountCents: refundCents,
          }),
        });
      }
    }
    builder.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'LAYAWAY_CANCEL', 'sale_deposit', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          deposit.branch_id,
          userId,
          deposit.id,
          JSON.stringify({ refundCents, reason: input.reason }),
          prevHash,
          rowHash,
        ),
    );
  });
  return { refundCents, status: 'CANCELLED' };
}
