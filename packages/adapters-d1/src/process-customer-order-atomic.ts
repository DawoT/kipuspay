import {
  planCustomerOrderCreate,
  planCustomerOrderFulfillment,
  planCustomerOrderNotification,
  type CustomerOrderStatus,
} from '@kipuspay/domain-sales';
import { auditChainClaimStatements, readAuditChainHead } from './audit-chain.js';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { sha256Hex } from './crypto.js';
import {
  resolveActiveTerminalSession,
  type ActiveTerminalSession,
} from './process-inventory-scale-atomic.js';

export { resolveActiveTerminalSession };

const LEASE_MAX_TTL_MS = 5 * 60 * 1000;
const MICROS = 1_000_000;

export class CustomerOrderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'CustomerOrderError';
    this.code = code;
  }
}

function fail(code: string): never {
  throw new CustomerOrderError(code);
}

function required(value: string | undefined, code: string): string {
  const clean = value?.trim() ?? '';
  if (!clean) fail(code);
  return clean;
}

function positiveInteger(value: number | undefined, code: string): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) fail(code);
  return value!;
}

async function requireCustomerOrderTerminalSession(
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    actorUserId: string;
    terminalId: string;
    terminalSessionId?: string | undefined;
    branchId?: string;
    cashRegisterSessionId?: string;
  },
): Promise<ActiveTerminalSession> {
  if (!input.terminalSessionId?.trim()) fail('CUSTOMER_ORDER_LEASE_INVALID');
  try {
    return await resolveActiveTerminalSession(db, {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      terminalId: input.terminalId,
      terminalSessionId: input.terminalSessionId,
      ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.cashRegisterSessionId
        ? { cashRegisterSessionId: input.cashRegisterSessionId }
        : {}),
    });
  } catch {
    fail('CUSTOMER_ORDER_LEASE_INVALID');
  }
}

function opaqueToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  return readAuditChainHead(db, tenantId);
}

async function auditHash(input: Record<string, unknown>): Promise<string> {
  return sha256Hex(JSON.stringify(input, Object.keys(input).sort()));
}

function appendAudit(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    branchId: string;
    actorUserId: string;
    action: string;
    entityId: string;
    payload: Record<string, unknown>;
    prevHash: string | null;
    rowHash: string;
  },
): void {
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action, entity_type,
           entity_id, payload_json, prev_hash, row_hash
         ) VALUES (?, ?, ?, ?, ?, 'customer_order', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        input.branchId,
        input.actorUserId,
        input.action,
        input.entityId,
        JSON.stringify(input.payload),
        input.prevHash,
        input.rowHash,
      ),
  );
  for (const c of auditChainClaimStatements(db, input.tenantId, input.prevHash, [input.rowHash])) {
    plan.add(c);
  }
}

interface CatalogRow {
  id: string;
  name: string;
  product_type: string;
  price_cents: number;
  cost_cents: number;
  stock_microunits: number;
  pmp_unit_cost_cents: number;
  product_uom_id: string;
  uom_code: string;
  factor_numerator: number;
  factor_denominator: number;
  list_price_cents: number | null;
  promotion_rule_json: string | null;
  batch_id: string | null;
  location_id: string | null;
  location_quantity_microunits: number | null;
  batch_quantity_microunits: number | null;
}

export interface CreateCustomerOrderItemInput {
  readonly productId: string;
  readonly productUomId?: string;
  readonly enteredQuantityMicrounits?: number;
  readonly quantityMicrounits?: number;
  readonly batchId?: string;
  readonly locationId?: string;
  readonly serialId?: string;
  readonly serialIds?: readonly string[];
}

export interface CreateCustomerOrderInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly reservedUntil: string;
  readonly pickupAt?: string | null;
  readonly priceListId?: string;
  readonly items: readonly CreateCustomerOrderItemInput[];
}

export interface CustomerOrderCreateResult {
  readonly orderId: string;
  readonly tenantId: string;
  readonly status: 'OPEN';
  readonly saleId: null;
  readonly paymentId: null;
  readonly fiscalDocumentId: null;
  readonly alreadyApplied: boolean;
}

function promotionPrice(base: number, rawRule: string | null): number {
  if (!rawRule) return base;
  try {
    const rule = JSON.parse(rawRule) as Record<string, unknown>;
    if (Number.isSafeInteger(rule.fixed_price_cents) && (rule.fixed_price_cents as number) >= 0) {
      return rule.fixed_price_cents as number;
    }
    if (
      typeof rule.percent_off === 'number' &&
      Number.isFinite(rule.percent_off) &&
      rule.percent_off >= 0 &&
      rule.percent_off <= 100
    ) {
      return Math.round((base * (100 - rule.percent_off)) / 100);
    }
  } catch {
    fail('CUSTOMER_ORDER_PROMOTION_INVALID');
  }
  return base;
}

// Catalog resolution deliberately keeps all stock dimensions in one server-authoritative preflight.
// eslint-disable-next-line complexity
async function resolveCreateItem(
  db: D1DatabaseLike,
  input: CreateCustomerOrderInput,
  item: CreateCustomerOrderItemInput,
): Promise<CatalogRow & { requested: number; entered: number; unitPrice: number }> {
  const productId = required(item.productId, 'CUSTOMER_ORDER_PRODUCT_REQUIRED');
  const entered = positiveInteger(
    item.enteredQuantityMicrounits ?? item.quantityMicrounits,
    'CUSTOMER_ORDER_INVALID_QUANTITY',
  );
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.product_type, p.price_cents, p.cost_cents,
              COALESCE(bs.stock_microunits, 0) AS stock_microunits,
              COALESCE(bs.pmp_unit_cost_cents, p.cost_cents) AS pmp_unit_cost_cents,
              u.id AS product_uom_id, u.uom_code, u.factor_numerator, u.factor_denominator,
              pp.price_cents AS list_price_cents, promo.rule_json AS promotion_rule_json,
              batches.id AS batch_id, locations.location_id,
              locations.quantity_microunits AS location_quantity_microunits,
              location_batches.quantity_microunits AS batch_quantity_microunits
       FROM products p
       JOIN product_uoms u ON u.tenant_id = p.tenant_id AND u.product_id = p.id
         AND u.id = COALESCE(?, (
           SELECT ub.id FROM product_uoms ub
           WHERE ub.tenant_id = p.tenant_id AND ub.product_id = p.id AND ub.is_base = 1 LIMIT 1
         ))
       LEFT JOIN branch_product_stock bs ON bs.tenant_id = p.tenant_id
         AND bs.branch_id = ? AND bs.product_id = p.id
       LEFT JOIN product_prices pp ON pp.tenant_id = p.tenant_id
         AND pp.product_id = p.id AND pp.price_list_id = ?
       LEFT JOIN inventory_location_stock locations ON locations.tenant_id = p.tenant_id
         AND locations.branch_id = ? AND locations.product_id = p.id
         AND locations.location_id = COALESCE(?, locations.location_id)
       LEFT JOIN inventory_batches batches ON batches.tenant_id = p.tenant_id
         AND batches.branch_id = ? AND batches.product_id = p.id AND batches.is_active = 1
         AND batches.deleted_at IS NULL
         AND batches.id = COALESCE(?, batches.id)
         AND (batches.expiration_date IS NULL OR batches.expiration_date >= date('now'))
       LEFT JOIN inventory_location_batch_stock location_batches
         ON location_batches.tenant_id = p.tenant_id
        AND location_batches.branch_id = ? AND location_batches.product_id = p.id
        AND location_batches.location_id = locations.location_id
        AND location_batches.batch_id = batches.id
       LEFT JOIN product_promotions pmap ON pmap.tenant_id = p.tenant_id
         AND pmap.product_id = p.id
         AND (pmap.price_list_id IS NULL OR pmap.price_list_id = ?)
       LEFT JOIN promotions promo ON promo.tenant_id = pmap.tenant_id
         AND promo.id = pmap.promotion_id AND promo.active = 1
         AND (promo.starts_at IS NULL OR promo.starts_at <= CURRENT_TIMESTAMP)
         AND (promo.ends_at IS NULL OR promo.ends_at > CURRENT_TIMESTAMP)
       WHERE p.tenant_id = ? AND p.id = ? AND p.is_active = 1
         AND p.deleted_at IS NULL AND p.is_sellable = 1
       ORDER BY CASE WHEN locations.location_id = ? THEN 0 ELSE 1 END,
                CASE WHEN batches.id = ? THEN 0 ELSE 1 END,
                batches.expiration_date IS NULL, batches.expiration_date, locations.location_id
       LIMIT 1`,
    )
    .bind(
      item.productUomId ?? null,
      input.branchId,
      input.priceListId ?? '',
      input.branchId,
      item.locationId ?? null,
      input.branchId,
      item.batchId ?? null,
      input.branchId,
      input.priceListId ?? '',
      input.tenantId,
      productId,
      item.locationId ?? '',
      item.batchId ?? '',
    )
    .first<CatalogRow>();
  if (!row) fail('CUSTOMER_ORDER_PRODUCT_NOT_FOUND');
  const scaled = entered * row.factor_numerator;
  if (!Number.isSafeInteger(scaled) || scaled % row.factor_denominator !== 0) {
    fail('CUSTOMER_ORDER_FACTOR_MISMATCH');
  }
  const requested = scaled / row.factor_denominator;
  if (row.product_type !== 'service') {
    if (row.stock_microunits < requested) fail('CUSTOMER_ORDER_INSUFFICIENT_STOCK');
    if (!row.location_id || (row.location_quantity_microunits ?? 0) < requested) {
      fail('CUSTOMER_ORDER_INSUFFICIENT_LOCATION_STOCK');
    }
    if ((item.batchId || row.batch_id) && (row.batch_quantity_microunits ?? 0) < requested) {
      fail('CUSTOMER_ORDER_INSUFFICIENT_BATCH_STOCK');
    }
  }
  const basePrice = row.list_price_cents ?? row.price_cents;
  return {
    ...row,
    entered,
    requested,
    unitPrice: promotionPrice(basePrice, row.promotion_rule_json),
  };
}

export async function createCustomerOrderAtomic(
  db: D1DatabaseLike,
  input: CreateCustomerOrderInput,
): Promise<CustomerOrderCreateResult> {
  const idempotencyKey = required(input.idempotencyKey, 'CUSTOMER_ORDER_IDEMPOTENCY_REQUIRED');
  const existing = await db
    .prepare(`SELECT id FROM customer_orders WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`)
    .bind(input.tenantId, idempotencyKey)
    .first<{ id: string }>();
  if (existing) {
    return {
      orderId: existing.id,
      tenantId: input.tenantId,
      status: 'OPEN',
      saleId: null,
      paymentId: null,
      fiscalDocumentId: null,
      alreadyApplied: true,
    };
  }
  if (Date.parse(input.reservedUntil) <= Date.now()) fail('CUSTOMER_ORDER_RESERVATION_EXPIRED');
  const initiallyResolved = await Promise.all(
    input.items.map((item) => resolveCreateItem(db, input, item)),
  );
  const expanded: Array<{
    item: (typeof initiallyResolved)[number];
    source: CreateCustomerOrderItemInput;
  }> = initiallyResolved.flatMap((item, index) => {
    const source = input.items[index]!;
    const serialIds = source.serialIds ?? (source.serialId ? [source.serialId] : []);
    if (source.serialId && source.serialIds) fail('CUSTOMER_ORDER_SERIAL_INVALID');
    if (serialIds.length === 0) return [{ item, source }];
    if (
      new Set(serialIds).size !== serialIds.length ||
      serialIds.length * MICROS !== item.requested
    ) {
      fail('CUSTOMER_ORDER_SERIAL_INVALID');
    }
    return serialIds.map((serialId) => ({
      item: {
        ...item,
        requested: MICROS,
        entered: Math.round((MICROS * item.factor_denominator) / item.factor_numerator),
      },
      source: { ...source, serialId },
    }));
  });
  const resolved = expanded.map((entry) => entry.item);
  const sources = expanded.map((entry) => entry.source);
  planCustomerOrderCreate({
    tenantId: input.tenantId,
    branchId: input.branchId,
    customerId: input.customerId,
    reservedUntil: input.reservedUntil,
    items: resolved.map((item, index) => {
      const serialId = sources[index]?.serialId;
      return {
        productId: item.id,
        productUomId: item.product_uom_id,
        uomCode: item.uom_code,
        enteredQuantityMicrounits: item.entered,
        factorNumerator: item.factor_numerator,
        factorDenominator: item.factor_denominator,
        requestedQuantityMicrounits: item.requested,
        unitPriceCents: item.unitPrice,
        batchId: item.batch_id,
        locationId: item.location_id,
        serialIds: serialId ? [serialId] : [],
      };
    }),
  });
  const orderId = crypto.randomUUID();
  const itemIds = resolved.map(() => crypto.randomUUID());
  const prevHash = await previousAuditHash(db, input.tenantId);
  const rowHash = await auditHash({
    action: 'CUSTOMER_ORDER_CREATED',
    entityId: orderId,
    prevHash,
  });
  await guardedBatch(db, 'CUSTOMER_ORDER_CONFLICT', (plan) => {
    let guardSql = `SELECT 1 WHERE EXISTS (
         SELECT 1 FROM branches WHERE tenant_id = ? AND id = ?
       ) AND EXISTS (
         SELECT 1 FROM customers WHERE tenant_id = ? AND id = ?
           AND is_active = 1 AND deleted_at IS NULL
       ) AND EXISTS (
         SELECT 1 FROM users WHERE tenant_id = ? AND id = ? AND branch_id = ?
           AND is_active = 1 AND deleted_at IS NULL
       ) AND NOT EXISTS (
         SELECT 1 FROM customer_orders WHERE tenant_id = ? AND idempotency_key = ?
       )`;
    const guardParams: unknown[] = [
      input.tenantId,
      input.branchId,
      input.tenantId,
      input.customerId,
      input.tenantId,
      input.actorUserId,
      input.branchId,
      input.tenantId,
      idempotencyKey,
    ];
    resolved.forEach((item, index) => {
      if (item.product_type === 'service') return;
      const source = sources[index]!;
      const locationId = source.locationId ?? item.location_id!;
      const batchId = source.batchId ?? item.batch_id;
      const branchRequested = resolved
        .filter((candidate) => candidate.id === item.id)
        .reduce((total, candidate) => total + candidate.requested, 0);
      const locationRequested = resolved.reduce((total, candidate, candidateIndex) => {
        const candidateSource = sources[candidateIndex]!;
        const candidateLocation = candidateSource.locationId ?? candidate.location_id;
        return candidate.id === item.id && candidateLocation === locationId
          ? total + candidate.requested
          : total;
      }, 0);
      guardSql += ` AND EXISTS (
        SELECT 1 FROM branch_product_stock
        WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
          AND stock_microunits >= ?
      ) AND EXISTS (
        SELECT 1 FROM inventory_location_stock
        WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
          AND quantity_microunits >= ?
      )`;
      guardParams.push(
        input.tenantId,
        input.branchId,
        item.id,
        branchRequested,
        input.tenantId,
        input.branchId,
        locationId,
        item.id,
        locationRequested,
      );
      if (batchId) {
        const batchRequested = resolved.reduce((total, candidate, candidateIndex) => {
          const candidateSource = sources[candidateIndex]!;
          const candidateLocation = candidateSource.locationId ?? candidate.location_id;
          const candidateBatch = candidateSource.batchId ?? candidate.batch_id;
          return candidate.id === item.id &&
            candidateLocation === locationId &&
            candidateBatch === batchId
            ? total + candidate.requested
            : total;
        }, 0);
        guardSql += ` AND EXISTS (
          SELECT 1 FROM inventory_batches
          WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND id = ?
            AND is_active = 1 AND deleted_at IS NULL
            AND (expiration_date IS NULL OR expiration_date >= date('now'))
            AND stock_microunits >= ?
        ) AND EXISTS (
          SELECT 1 FROM inventory_location_batch_stock
          WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
            AND product_id = ? AND batch_id = ? AND quantity_microunits >= ?
        )`;
        guardParams.push(
          input.tenantId,
          input.branchId,
          item.id,
          batchId,
          batchRequested,
          input.tenantId,
          input.branchId,
          locationId,
          item.id,
          batchId,
          batchRequested,
        );
      }
      if (source.serialId) {
        guardSql += ` AND EXISTS (
          SELECT 1 FROM serial_numbers
          WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
            AND product_id = ? AND id = ? AND status = 'AVAILABLE'
        )`;
        guardParams.push(input.tenantId, input.branchId, locationId, item.id, source.serialId);
      }
    });
    plan.guardState(guardSql, guardParams);
    plan.add(
      db
        .prepare(
          `INSERT INTO customer_orders (
             id, tenant_id, branch_id, customer_id, pickup_at, reserved_until,
             idempotency_key, created_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          orderId,
          input.tenantId,
          input.branchId,
          input.customerId,
          input.pickupAt ?? null,
          input.reservedUntil,
          idempotencyKey,
          input.actorUserId,
        ),
    );
    resolved.forEach((item, index) => {
      const source = sources[index]!;
      plan.add(
        db
          .prepare(
            `INSERT INTO customer_order_items (
               id, tenant_id, branch_id, customer_order_id, product_id, product_uom_id,
               uom_code_snapshot, entered_quantity_microunits, factor_numerator,
               factor_denominator, requested_quantity_microunits,
               reserved_quantity_microunits, unit_price_cents, batch_id, location_id, serial_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            itemIds[index],
            input.tenantId,
            input.branchId,
            orderId,
            item.id,
            item.product_uom_id,
            item.uom_code,
            item.entered,
            item.factor_numerator,
            item.factor_denominator,
            item.requested,
            item.requested,
            item.unitPrice,
            source.batchId ?? item.batch_id,
            source.locationId ?? item.location_id,
            source.serialId ?? null,
          ),
      );
      if (item.product_type !== 'service') {
        appendReservationDelta(plan, db, {
          tenantId: input.tenantId,
          branchId: input.branchId,
          productId: item.id,
          locationId: source.locationId ?? item.location_id!,
          batchId: source.batchId ?? item.batch_id,
          quantityMicrounits: -item.requested,
          orderId,
          actorUserId: input.actorUserId,
        });
        if (source.serialId) {
          plan.add(
            db
              .prepare(
                `UPDATE serial_numbers SET status = 'RESERVED', version = version + 1,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE tenant_id = ? AND id = ? AND branch_id = ? AND product_id = ?
                   AND location_id = ? AND status = 'AVAILABLE'`,
              )
              .bind(
                input.tenantId,
                source.serialId,
                input.branchId,
                item.id,
                source.locationId ?? item.location_id,
              ),
          );
        }
      }
    });
    appendAudit(plan, db, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      actorUserId: input.actorUserId,
      action: 'CUSTOMER_ORDER_CREATED',
      entityId: orderId,
      payload: { itemCount: resolved.length, reservedUntil: input.reservedUntil },
      prevHash,
      rowHash,
    });
  });
  return {
    orderId,
    tenantId: input.tenantId,
    status: 'OPEN',
    saleId: null,
    paymentId: null,
    fiscalDocumentId: null,
    alreadyApplied: false,
  };
}

function appendReservationDelta(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    branchId: string;
    productId: string;
    locationId: string;
    batchId: string | null;
    quantityMicrounits: number;
    orderId: string;
    actorUserId: string;
  },
): void {
  const delta = input.quantityMicrounits;
  plan.add(
    db
      .prepare(
        `UPDATE branch_product_stock
         SET stock_microunits = stock_microunits + ?, stock = (stock_microunits + ?) / 1000000.0,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?
           AND stock_microunits + ? >= 0`,
      )
      .bind(delta, delta, input.tenantId, input.branchId, input.productId, delta),
  );
  plan.add(
    db
      .prepare(
        `UPDATE inventory_location_stock
         SET quantity_microunits = quantity_microunits + ?, version = version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?
           AND quantity_microunits + ? >= 0`,
      )
      .bind(delta, input.tenantId, input.branchId, input.locationId, input.productId, delta),
  );
  if (input.batchId) {
    plan.add(
      db
        .prepare(
          `UPDATE inventory_batches
           SET stock_microunits = stock_microunits + ?, stock = (stock_microunits + ?) / 1000000.0
           WHERE tenant_id = ? AND branch_id = ? AND product_id = ? AND id = ?
             AND stock_microunits + ? >= 0`,
        )
        .bind(delta, delta, input.tenantId, input.branchId, input.productId, input.batchId, delta),
    );
    plan.add(
      db
        .prepare(
          `UPDATE inventory_location_batch_stock
           SET quantity_microunits = quantity_microunits + ?, version = version + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND branch_id = ? AND location_id = ?
             AND product_id = ? AND batch_id = ? AND quantity_microunits + ? >= 0`,
        )
        .bind(
          delta,
          input.tenantId,
          input.branchId,
          input.locationId,
          input.productId,
          input.batchId,
          delta,
        ),
    );
  }
  plan.add(
    db
      .prepare(
        `INSERT INTO inventory_movements (
           id, tenant_id, branch_id, product_id, batch_id, movement_type,
           quantity_delta, quantity_delta_microunits, unit_cost_cents,
           stock_after, stock_after_microunits, user_id, reference_id, location_id
         )
         SELECT ?, ?, ?, ?, ?, ?, ? / 1000000.0, ?, pmp_unit_cost_cents,
                stock, stock_microunits, ?, ?, ?
         FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        input.branchId,
        input.productId,
        input.batchId,
        delta < 0 ? 'CUSTOMER_ORDER_RESERVE' : 'CUSTOMER_ORDER_RELEASE',
        delta,
        delta,
        input.actorUserId,
        input.orderId,
        input.locationId,
        input.tenantId,
        input.branchId,
        input.productId,
      ),
  );
}

async function guardedBatch(
  db: D1DatabaseLike,
  conflictCode: string,
  build: (plan: AtomicPlanBuilder) => void | Promise<void>,
): Promise<void> {
  try {
    await runD1AtomicPlan(db, build);
  } catch (error) {
    if (error instanceof CustomerOrderError) throw error;
    throw new CustomerOrderError(conflictCode);
  }
}

interface OrderItemRow {
  order_id: string;
  branch_id: string;
  customer_id: string;
  status: CustomerOrderStatus;
  version: number;
  reserved_until: string;
  item_id: string;
  product_id: string;
  product_uom_id: string;
  uom_code_snapshot: string;
  entered_quantity_microunits: number;
  factor_numerator: number;
  factor_denominator: number;
  requested_quantity_microunits: number;
  reserved_quantity_microunits: number;
  fulfilled_quantity_microunits: number;
  unit_price_cents: number;
  batch_id: string | null;
  location_id: string | null;
  serial_id: string | null;
  product_name: string;
  product_type: string;
  pmp_unit_cost_cents: number;
}

async function loadOrderItem(
  db: D1DatabaseLike,
  tenantId: string,
  orderId: string,
  itemId?: string,
): Promise<OrderItemRow> {
  const row = await db
    .prepare(
      `SELECT o.id AS order_id, o.branch_id, o.customer_id, o.status, o.version,
              o.reserved_until, i.id AS item_id, i.product_id, i.product_uom_id,
              i.uom_code_snapshot, i.entered_quantity_microunits,
              i.factor_numerator, i.factor_denominator,
              i.requested_quantity_microunits, i.reserved_quantity_microunits,
              i.fulfilled_quantity_microunits, i.unit_price_cents,
              i.batch_id, i.location_id, i.serial_id,
              p.name AS product_name, p.product_type,
              COALESCE(bs.pmp_unit_cost_cents, p.cost_cents) AS pmp_unit_cost_cents
       FROM customer_orders o
       JOIN customer_order_items i ON i.tenant_id = o.tenant_id
         AND i.customer_order_id = o.id
       JOIN products p ON p.tenant_id = i.tenant_id AND p.id = i.product_id
       LEFT JOIN branch_product_stock bs ON bs.tenant_id = i.tenant_id
         AND bs.branch_id = i.branch_id AND bs.product_id = i.product_id
       WHERE o.tenant_id = ? AND o.id = ? AND i.id = COALESCE(?, i.id)
       ORDER BY i.id LIMIT 1`,
    )
    .bind(tenantId, orderId, itemId ?? null)
    .first<OrderItemRow>();
  if (!row) fail('CUSTOMER_ORDER_NOT_FOUND');
  return row;
}

export interface MintCustomerOrderLeaseInput {
  readonly tenantId: string;
  readonly orderId: string;
  readonly itemId?: string;
  readonly terminalId: string;
  readonly terminalSessionId?: string;
  readonly actorUserId: string;
  readonly quantityMicrounits?: number;
  readonly items?: readonly { readonly itemId: string; readonly quantityMicrounits: number }[];
  readonly requestedTtlSeconds?: number;
  readonly idempotencyKey: string;
}

export async function mintCustomerOrderLeaseAtomic(
  db: D1DatabaseLike,
  input: MintCustomerOrderLeaseInput,
): Promise<{
  readonly envelope: string;
  readonly envelopeId: string;
  readonly scope: 'CUSTOMER_ORDER_FULFILL';
  readonly oneShot: true;
  readonly ttlSeconds: number;
}> {
  const terminalSession = await requireCustomerOrderTerminalSession(db, input);
  if (input.items && input.items.length > 0) {
    return mintMultiItemCustomerOrderLeaseAtomic(db, input, terminalSession);
  }
  const existing = await db
    .prepare(
      `SELECT envelope_id FROM customer_order_fulfillments
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.idempotencyKey)
    .first<{ envelope_id: string }>();
  if (existing) fail('CUSTOMER_ORDER_LEASE_ALREADY_MINTED');
  const item = await loadOrderItem(db, input.tenantId, input.orderId, input.itemId);
  if (!['OPEN', 'PARTIAL'].includes(item.status) || Date.parse(item.reserved_until) <= Date.now()) {
    fail('CUSTOMER_ORDER_RESERVATION_EXPIRED');
  }
  const quantity = positiveInteger(
    input.quantityMicrounits ?? item.reserved_quantity_microunits,
    'CUSTOMER_ORDER_INVALID_QUANTITY',
  );
  if (quantity > item.reserved_quantity_microunits) {
    fail('CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_REMAINING');
  }
  const requestedTtl = Math.max(1, Math.floor((input.requestedTtlSeconds ?? 300) * 1000));
  const ttlMs = Math.min(
    LEASE_MAX_TTL_MS,
    requestedTtl,
    Date.parse(item.reserved_until) - Date.now(),
  );
  if (ttlMs <= 0) fail('CUSTOMER_ORDER_RESERVATION_EXPIRED');
  const token = opaqueToken();
  const tokenHash = await sha256Hex(token);
  const envelopeId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await guardedBatch(db, 'CUSTOMER_ORDER_LEASE_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_orders o
       JOIN customer_order_items i ON i.tenant_id = o.tenant_id
         AND i.customer_order_id = o.id
       JOIN pos_terminals t ON t.tenant_id = o.tenant_id AND t.id = ?
         AND t.branch_id = o.branch_id
       JOIN users u ON u.tenant_id = o.tenant_id AND u.id = ?
         AND u.branch_id = o.branch_id AND u.is_active = 1 AND u.deleted_at IS NULL
       JOIN pos_terminal_sessions pts ON pts.tenant_id = o.tenant_id
         AND pts.id = ? AND pts.terminal_id = t.id AND pts.user_id = u.id
         AND pts.branch_id = o.branch_id AND pts.status = 'ACTIVE'
       WHERE o.tenant_id = ? AND o.id = ? AND i.id = ? AND o.version = ?
         AND o.status IN ('OPEN','PARTIAL') AND o.reserved_until > CURRENT_TIMESTAMP
         AND i.reserved_quantity_microunits >= ?
         AND NOT EXISTS (
           SELECT 1 FROM customer_order_fulfillments f
           WHERE f.tenant_id = o.tenant_id AND f.customer_order_item_id = i.id
             AND f.status = 'LEASED' AND f.lease_expires_at > CURRENT_TIMESTAMP
         )`,
      [
        input.terminalId,
        input.actorUserId,
        terminalSession.terminalSessionId,
        input.tenantId,
        input.orderId,
        item.item_id,
        item.version,
        quantity,
      ],
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO customer_order_fulfillments (
             id, tenant_id, branch_id, customer_order_id, customer_order_item_id,
             terminal_id, actor_user_id, quantity_microunits, envelope_id, token_hash,
             idempotency_key, request_id, terminal_session_id, lease_expires_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          leaseId,
          input.tenantId,
          item.branch_id,
          input.orderId,
          item.item_id,
          input.terminalId,
          input.actorUserId,
          quantity,
          envelopeId,
          tokenHash,
          input.idempotencyKey,
          envelopeId,
          terminalSession.terminalSessionId,
          expiresAt,
        ),
    );
  });
  return {
    envelope: token,
    envelopeId,
    scope: 'CUSTOMER_ORDER_FULFILL',
    oneShot: true,
    ttlSeconds: Math.floor(ttlMs / 1000),
  };
}

async function mintMultiItemCustomerOrderLeaseAtomic(
  db: D1DatabaseLike,
  input: MintCustomerOrderLeaseInput & {
    readonly items?: readonly { readonly itemId: string; readonly quantityMicrounits: number }[];
  },
  terminalSession: ActiveTerminalSession,
): Promise<{
  readonly envelope: string;
  readonly envelopeId: string;
  readonly scope: 'CUSTOMER_ORDER_FULFILL';
  readonly oneShot: true;
  readonly ttlSeconds: number;
}> {
  const requested = input.items ?? [];
  if (new Set(requested.map((item) => item.itemId)).size !== requested.length) {
    fail('CUSTOMER_ORDER_DUPLICATE_ITEM');
  }
  const rows = await Promise.all(
    requested.map((item) => loadOrderItem(db, input.tenantId, input.orderId, item.itemId)),
  );
  if (rows.length === 0) fail('CUSTOMER_ORDER_ITEMS_REQUIRED');
  const version = rows[0]!.version;
  const branchId = rows[0]!.branch_id;
  const reservedUntil = rows[0]!.reserved_until;
  rows.forEach((row, index) => {
    const quantity = positiveInteger(
      requested[index]?.quantityMicrounits,
      'CUSTOMER_ORDER_INVALID_QUANTITY',
    );
    if (
      row.version !== version ||
      row.branch_id !== branchId ||
      !['OPEN', 'PARTIAL'].includes(row.status) ||
      quantity > row.reserved_quantity_microunits
    ) {
      fail('CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_REMAINING');
    }
  });
  const requestedTtl = Math.max(1, Math.floor((input.requestedTtlSeconds ?? 300) * 1000));
  const ttlMs = Math.min(LEASE_MAX_TTL_MS, requestedTtl, Date.parse(reservedUntil) - Date.now());
  if (ttlMs <= 0) fail('CUSTOMER_ORDER_RESERVATION_EXPIRED');
  const token = opaqueToken();
  const tokenHash = await sha256Hex(token);
  const requestId = crypto.randomUUID();
  const envelopeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await guardedBatch(db, 'CUSTOMER_ORDER_LEASE_CONFLICT', (plan) => {
    let guardSql = `SELECT 1 WHERE EXISTS (
      SELECT 1 FROM customer_orders o
      JOIN pos_terminals t ON t.tenant_id = o.tenant_id AND t.id = ?
        AND t.branch_id = o.branch_id
      JOIN users u ON u.tenant_id = o.tenant_id AND u.id = ?
        AND u.branch_id = o.branch_id AND u.is_active = 1 AND u.deleted_at IS NULL
      JOIN pos_terminal_sessions pts ON pts.tenant_id = o.tenant_id
        AND pts.id = ? AND pts.terminal_id = t.id AND pts.user_id = u.id
        AND pts.branch_id = o.branch_id AND pts.status = 'ACTIVE'
      WHERE o.tenant_id = ? AND o.id = ? AND o.version = ?
        AND o.status IN ('OPEN','PARTIAL') AND o.reserved_until > CURRENT_TIMESTAMP
    )`;
    const params: unknown[] = [
      input.terminalId,
      input.actorUserId,
      terminalSession.terminalSessionId,
      input.tenantId,
      input.orderId,
      version,
    ];
    rows.forEach((row, index) => {
      guardSql += ` AND EXISTS (
        SELECT 1 FROM customer_order_items i
        WHERE i.tenant_id = ? AND i.customer_order_id = ? AND i.id = ?
          AND i.reserved_quantity_microunits >= ?
          AND NOT EXISTS (
            SELECT 1 FROM customer_order_fulfillments f
            WHERE f.tenant_id = i.tenant_id AND f.customer_order_item_id = i.id
              AND f.status = 'LEASED' AND f.lease_expires_at > CURRENT_TIMESTAMP
          )
      )`;
      params.push(input.tenantId, input.orderId, row.item_id, requested[index]!.quantityMicrounits);
    });
    plan.guardState(guardSql, params);
    rows.forEach((row, index) => {
      plan.add(
        db
          .prepare(
            `INSERT INTO customer_order_fulfillments (
               id, tenant_id, branch_id, customer_order_id, customer_order_item_id,
               terminal_id, actor_user_id, quantity_microunits, envelope_id, token_hash,
               idempotency_key, request_id, terminal_session_id, lease_expires_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.tenantId,
            branchId,
            input.orderId,
            row.item_id,
            input.terminalId,
            input.actorUserId,
            requested[index]!.quantityMicrounits,
            envelopeId,
            tokenHash,
            `${input.idempotencyKey}:${row.item_id}`,
            requestId,
            terminalSession.terminalSessionId,
            expiresAt,
          ),
      );
    });
  });
  return {
    envelope: token,
    envelopeId,
    scope: 'CUSTOMER_ORDER_FULFILL',
    oneShot: true,
    ttlSeconds: Math.floor(ttlMs / 1000),
  };
}

interface LeaseRow {
  id: string;
  branch_id: string;
  customer_order_item_id: string;
  terminal_id: string;
  terminal_session_id: string;
  actor_user_id: string | null;
  quantity_microunits: number;
  status: string;
  lease_expires_at: string;
  sale_id: string | null;
  consume_idempotency_key: string | null;
  request_id: string;
}

export interface FulfillCustomerOrderInput {
  readonly tenantId: string;
  readonly orderId: string;
  readonly terminalId: string;
  readonly terminalSessionId?: string;
  readonly actorUserId?: string;
  readonly envelope: string;
  readonly idempotencyKey: string;
  readonly cashRegisterSessionId?: string;
  readonly documentType?: 'NV' | '01' | '03';
  readonly series?: string;
  readonly paymentMethodId?: string;
}

export interface CustomerOrderFulfillmentResult {
  readonly orderId: string;
  readonly saleId: string;
  readonly saleItemId: string;
  readonly saleItemIds?: readonly string[];
  readonly status: 'PARTIAL' | 'FULFILLED';
  readonly totalAmountCents: number;
  readonly alreadyApplied: boolean;
}

// Fulfillment coordinates lease, fiscal, payment, usage, audit and order state atomically.
// eslint-disable-next-line complexity
export async function fulfillCustomerOrderAtomic(
  db: D1DatabaseLike,
  input: FulfillCustomerOrderInput,
): Promise<CustomerOrderFulfillmentResult> {
  const tokenHash = await sha256Hex(required(input.envelope, 'CUSTOMER_ORDER_LEASE_REQUIRED'));
  const leaseRows = await db
    .prepare(
      `SELECT id, branch_id, customer_order_item_id, terminal_id, terminal_session_id, actor_user_id,
              quantity_microunits, status, lease_expires_at, sale_id,
              consume_idempotency_key, request_id
       FROM customer_order_fulfillments
       WHERE tenant_id = ? AND customer_order_id = ? AND token_hash = ?
       ORDER BY customer_order_item_id`,
    )
    .bind(input.tenantId, input.orderId, tokenHash)
    .all<LeaseRow>();
  const leases = [...(leaseRows.results ?? [])];
  const lease = leases[0];
  if (!lease) fail('CUSTOMER_ORDER_NOT_FOUND');
  const actorUserIdForSession = required(
    input.actorUserId ?? lease.actor_user_id ?? undefined,
    'CUSTOMER_ORDER_USER_REQUIRED',
  );
  const terminalSession = await requireCustomerOrderTerminalSession(db, {
    tenantId: input.tenantId,
    actorUserId: actorUserIdForSession,
    terminalId: input.terminalId,
    terminalSessionId: input.terminalSessionId,
    ...(input.cashRegisterSessionId ? { cashRegisterSessionId: input.cashRegisterSessionId } : {}),
  });
  if (leases.length > 1) {
    return fulfillMultiItemCustomerOrderAtomic(db, input, tokenHash, leases, terminalSession);
  }
  if (
    lease.status === 'CONSUMED' &&
    lease.consume_idempotency_key === input.idempotencyKey &&
    lease.sale_id
  ) {
    return loadFulfillmentResult(db, input.tenantId, input.orderId, lease.sale_id, false);
  }
  if (
    lease.status !== 'LEASED' ||
    lease.terminal_id !== input.terminalId ||
    lease.terminal_session_id !== terminalSession.terminalSessionId ||
    (input.actorUserId !== undefined &&
      lease.actor_user_id !== null &&
      lease.actor_user_id !== input.actorUserId) ||
    Date.parse(lease.lease_expires_at) <= Date.now()
  ) {
    fail('CUSTOMER_ORDER_LEASE_INVALID');
  }
  const item = await loadOrderItem(db, input.tenantId, input.orderId, lease.customer_order_item_id);
  if (Date.parse(item.reserved_until) <= Date.now()) fail('CUSTOMER_ORDER_RESERVATION_EXPIRED');
  const decision = planCustomerOrderFulfillment({
    status: item.status,
    requestedQuantityMicrounits: item.requested_quantity_microunits,
    reservedQuantityMicrounits: item.reserved_quantity_microunits,
    fulfillQuantityMicrounits: lease.quantity_microunits,
  });
  const actorUserId = actorUserIdForSession;
  const defaults = await db
    .prepare(
      `SELECT
         (SELECT id FROM cash_register_sessions
          WHERE tenant_id = ? AND branch_id = ? AND user_id = ? AND status = 'OPEN'
          ORDER BY opened_at DESC LIMIT 1) AS cash_session_id,
         (SELECT id FROM payment_methods
          WHERE tenant_id = ? AND is_active = 1 ORDER BY code, id LIMIT 1) AS payment_method_id`,
    )
    .bind(input.tenantId, item.branch_id, actorUserId, input.tenantId)
    .first<{ cash_session_id: string | null; payment_method_id: string | null }>();
  const cashSession = required(
    input.cashRegisterSessionId ?? defaults?.cash_session_id ?? undefined,
    'CUSTOMER_ORDER_CASH_SESSION_REQUIRED',
  );
  const documentType = input.documentType ?? '03';
  const paymentMethodId = required(
    input.paymentMethodId ?? defaults?.payment_method_id ?? undefined,
    'CUSTOMER_ORDER_PAYMENT_METHOD_REQUIRED',
  );
  const seriesDefault = await db
    .prepare(
      `SELECT series FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
         AND is_active = 1
         AND (authorization_status = 'AUTHORIZED' OR (? = 'NV' AND authorization_status = 'INTERNAL'))
       ORDER BY series LIMIT 1`,
    )
    .bind(input.tenantId, item.branch_id, documentType, documentType)
    .first<{ series: string }>();
  const series = required(input.series ?? seriesDefault?.series, 'CUSTOMER_ORDER_SERIES_REQUIRED');
  const numberRow = await db
    .prepare(
      `SELECT current_number + 1 AS next_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
         AND series = ? AND is_active = 1
         AND (authorization_status = 'AUTHORIZED' OR (? = 'NV' AND authorization_status = 'INTERNAL'))
       LIMIT 1`,
    )
    .bind(input.tenantId, item.branch_id, documentType, series, documentType)
    .first<{ next_number: number }>();
  if (!numberRow) fail('CUSTOMER_ORDER_SERIES_INVALID');
  const subtotal = Math.round((lease.quantity_microunits * item.unit_price_cents) / MICROS);
  const igv = documentType === 'NV' ? 0 : Math.round((subtotal * 18) / 100);
  const total = subtotal + igv;
  const saleId = crypto.randomUUID();
  const saleItemId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, input.tenantId);
  const rowHash = await auditHash({
    action: 'CUSTOMER_ORDER_FULFILLED',
    entityId: input.orderId,
    saleId,
    prevHash,
  });
  await guardedBatch(db, 'CUSTOMER_ORDER_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_orders o
       JOIN customer_order_items i ON i.tenant_id = o.tenant_id
         AND i.customer_order_id = o.id AND i.id = ?
       JOIN customer_order_fulfillments f ON f.tenant_id = o.tenant_id
         AND f.customer_order_id = o.id AND f.id = ?
       JOIN pos_terminals t ON t.tenant_id = o.tenant_id AND t.id = ?
         AND t.branch_id = o.branch_id
       JOIN cash_register_sessions c ON c.tenant_id = o.tenant_id
         AND c.id = ? AND c.branch_id = o.branch_id AND c.status = 'OPEN'
       JOIN users u ON u.tenant_id = o.tenant_id AND u.id = ?
         AND u.branch_id = o.branch_id AND u.is_active = 1 AND u.deleted_at IS NULL
       JOIN pos_terminal_sessions pts ON pts.tenant_id = o.tenant_id
         AND pts.id = ? AND pts.terminal_id = t.id AND pts.user_id = u.id
         AND pts.branch_id = o.branch_id AND pts.cash_register_session_id = c.id
         AND pts.status = 'ACTIVE'
       JOIN payment_methods pm ON pm.tenant_id = o.tenant_id
         AND pm.id = ? AND pm.is_active = 1
       WHERE o.tenant_id = ? AND o.id = ? AND o.version = ?
         AND o.status IN ('OPEN','PARTIAL') AND o.reserved_until > CURRENT_TIMESTAMP
         AND i.reserved_quantity_microunits >= ?
         AND f.status = 'LEASED' AND f.token_hash = ? AND f.terminal_id = ?
         AND (f.actor_user_id IS NULL OR f.actor_user_id = ?)
         AND f.lease_expires_at > CURRENT_TIMESTAMP
         AND NOT EXISTS (
           SELECT 1 FROM customer_order_fulfillments used
           WHERE used.tenant_id = o.tenant_id AND used.consume_idempotency_key = ?
         )`,
      [
        item.item_id,
        lease.id,
        input.terminalId,
        cashSession,
        actorUserId,
        terminalSession.terminalSessionId,
        paymentMethodId,
        input.tenantId,
        input.orderId,
        item.version,
        lease.quantity_microunits,
        tokenHash,
        input.terminalId,
        actorUserId,
        input.idempotencyKey,
      ],
    );
    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series SET current_number = current_number + 1
           WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
             AND series = ? AND current_number = ?`,
        )
        .bind(input.tenantId, item.branch_id, documentType, series, numberRow.next_number - 1),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO sales (
             id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
             offline_client_sale_id, client_document_type, client_document_number,
             client_name, document_type, series, number, currency, exchange_rate,
             total_taxable_cents, total_exempt_cents, total_igv_cents,
             total_icbper_cents, total_discount_cents, total_cogs_cents,
             total_amount_cents, issued_at_lima, must_submit_by, sunat_status
           )
           SELECT ?, ?, ?, ?, ?, o.customer_id, ?, c.document_type_code, c.document_number,
                  c.name, ?, ?, ?, 'PEN', 1, ?, 0, ?, 0, 0, ?, ?,
                  CURRENT_TIMESTAMP,
                  CASE WHEN ? = 'NV' THEN NULL
                       WHEN ? = '01' THEN datetime('now', '+3 days')
                       ELSE datetime('now', '+7 days') END,
                  CASE WHEN ? = 'NV' THEN 'NOT_APPLICABLE' ELSE 'PENDING' END
           FROM customer_orders o
           JOIN customers c ON c.tenant_id = o.tenant_id AND c.id = o.customer_id
           WHERE o.tenant_id = ? AND o.id = ?`,
        )
        .bind(
          saleId,
          input.tenantId,
          item.branch_id,
          cashSession,
          actorUserId,
          `customer-order:${input.orderId}:${input.idempotencyKey}`,
          documentType,
          series,
          numberRow.next_number,
          subtotal,
          igv,
          Math.round((lease.quantity_microunits * item.pmp_unit_cost_cents) / MICROS),
          total,
          documentType,
          documentType,
          documentType,
          input.tenantId,
          input.orderId,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO sale_items (
             id, tenant_id, sale_id, product_id, product_name, product_type, quantity,
             unit_price_cents, unit_cost_cents, discount_amount_cents, subtotal_cents,
             igv_amount_cents, icbper_amount_cents, total_amount_cents, batch_id,
             inventory_location_id, sold_uom_id, sold_uom_code,
             entered_quantity_microunits, factor_numerator, factor_denominator,
             base_quantity_microunits
           ) VALUES (?, ?, ?, ?, ?, ?, ? / 1000000.0, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          saleItemId,
          input.tenantId,
          saleId,
          item.product_id,
          item.product_name,
          item.product_type,
          lease.quantity_microunits,
          item.unit_price_cents,
          item.pmp_unit_cost_cents,
          subtotal,
          igv,
          total,
          item.batch_id,
          item.location_id,
          item.product_uom_id,
          item.uom_code_snapshot,
          Math.round((lease.quantity_microunits * item.factor_denominator) / item.factor_numerator),
          item.factor_numerator,
          item.factor_denominator,
          lease.quantity_microunits,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO sale_payments (
             id, tenant_id, sale_id, payment_method_id, amount_cents
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), input.tenantId, saleId, paymentMethodId, total),
    );
    if (documentType !== 'NV') {
      plan.add(
        db
          .prepare(
            `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, must_submit_by)
             SELECT ?, ?, ?, 'PENDING', must_submit_by FROM sales
             WHERE tenant_id = ? AND id = ?`,
          )
          .bind(crypto.randomUUID(), input.tenantId, saleId, input.tenantId, saleId),
      );
    }
    plan.add(
      db
        .prepare(
          `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
           VALUES (?, ?, ?, strftime('%Y-%m', 'now'), ?)`,
        )
        .bind(crypto.randomUUID(), input.tenantId, `usage:${saleId}`, saleId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO usage_counters (tenant_id, period_ym, doc_count, updated_at)
           VALUES (?, strftime('%Y-%m', 'now'), 1, CURRENT_TIMESTAMP)
           ON CONFLICT (tenant_id, period_ym) DO UPDATE
           SET doc_count = doc_count + 1, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(input.tenantId),
    );
    plan.add(
      db
        .prepare(
          `UPDATE customer_order_items
           SET reserved_quantity_microunits = reserved_quantity_microunits - ?,
               fulfilled_quantity_microunits = fulfilled_quantity_microunits + ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND customer_order_id = ? AND id = ?
             AND reserved_quantity_microunits >= ?`,
        )
        .bind(
          lease.quantity_microunits,
          lease.quantity_microunits,
          input.tenantId,
          input.orderId,
          item.item_id,
          lease.quantity_microunits,
        ),
    );
    plan.add(
      db
        .prepare(
          `UPDATE customer_order_fulfillments
           SET status = 'CONSUMED', consume_idempotency_key = ?, sale_id = ?,
               sale_item_id = ?, consumed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND status = 'LEASED'`,
        )
        .bind(input.idempotencyKey, saleId, saleItemId, input.tenantId, lease.id),
    );
    if (item.serial_id) {
      plan.add(
        db
          .prepare(
            `UPDATE serial_numbers SET status = 'SOLD', current_sale_item_id = ?,
               version = version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND id = ? AND status = 'RESERVED'`,
          )
          .bind(saleItemId, input.tenantId, item.serial_id),
      );
    }
    plan.add(
      db
        .prepare(
          `UPDATE customer_orders
           SET status = CASE WHEN EXISTS (
                 SELECT 1 FROM customer_order_items i
                 WHERE i.tenant_id = ? AND i.customer_order_id = ?
                   AND i.reserved_quantity_microunits > 0
               ) THEN 'PARTIAL' ELSE 'FULFILLED' END,
             version = version + 1, updated_at = CURRENT_TIMESTAMP,
             closed_at = CASE WHEN EXISTS (
               SELECT 1 FROM customer_order_items i
               WHERE i.tenant_id = ? AND i.customer_order_id = ?
                 AND i.reserved_quantity_microunits > 0
             ) THEN NULL ELSE CURRENT_TIMESTAMP END,
             closed_by_user_id = CASE WHEN EXISTS (
               SELECT 1 FROM customer_order_items i
               WHERE i.tenant_id = ? AND i.customer_order_id = ?
                 AND i.reserved_quantity_microunits > 0
             ) THEN NULL ELSE ? END
           WHERE tenant_id = ? AND id = ? AND version = ?
             AND status IN ('OPEN','PARTIAL')`,
        )
        .bind(
          input.tenantId,
          input.orderId,
          input.tenantId,
          input.orderId,
          input.tenantId,
          input.orderId,
          actorUserId,
          input.tenantId,
          input.orderId,
          item.version,
        ),
    );
    appendAudit(plan, db, {
      tenantId: input.tenantId,
      branchId: item.branch_id,
      actorUserId,
      action: 'CUSTOMER_ORDER_FULFILLED',
      entityId: input.orderId,
      payload: { saleId, saleItemId, quantityMicrounits: lease.quantity_microunits },
      prevHash,
      rowHash,
    });
  });
  return {
    orderId: input.orderId,
    saleId,
    saleItemId,
    status: decision.nextStatus,
    totalAmountCents: total,
    alreadyApplied: false,
  };
}

// A multi-line envelope is planned and consumed as one D1 batch; no line can win alone.
// eslint-disable-next-line complexity
async function fulfillMultiItemCustomerOrderAtomic(
  db: D1DatabaseLike,
  input: FulfillCustomerOrderInput,
  tokenHash: string,
  leases: readonly LeaseRow[],
  terminalSession: ActiveTerminalSession,
): Promise<CustomerOrderFulfillmentResult> {
  const replay = leases.every(
    (lease) =>
      lease.status === 'CONSUMED' &&
      lease.consume_idempotency_key === input.idempotencyKey &&
      lease.sale_id === leases[0]?.sale_id,
  );
  if (replay && leases[0]?.sale_id) {
    return loadFulfillmentResult(db, input.tenantId, input.orderId, leases[0].sale_id, true);
  }
  const actorUserId = required(
    input.actorUserId ?? leases[0]?.actor_user_id ?? undefined,
    'CUSTOMER_ORDER_USER_REQUIRED',
  );
  if (
    leases.some(
      (lease) =>
        lease.status !== 'LEASED' ||
        lease.terminal_id !== input.terminalId ||
        lease.terminal_session_id !== terminalSession.terminalSessionId ||
        (lease.actor_user_id !== null && lease.actor_user_id !== actorUserId) ||
        Date.parse(lease.lease_expires_at) <= Date.now(),
    )
  ) {
    fail('CUSTOMER_ORDER_LEASE_INVALID');
  }
  const items = await Promise.all(
    leases.map((lease) =>
      loadOrderItem(db, input.tenantId, input.orderId, lease.customer_order_item_id),
    ),
  );
  const version = items[0]!.version;
  if (
    items.some(
      (item, index) =>
        item.version !== version ||
        Date.parse(item.reserved_until) <= Date.now() ||
        leases[index]!.quantity_microunits > item.reserved_quantity_microunits,
    )
  ) {
    fail('CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_REMAINING');
  }
  const defaults = await db
    .prepare(
      `SELECT
         (SELECT id FROM cash_register_sessions
          WHERE tenant_id = ? AND branch_id = ? AND user_id = ? AND status = 'OPEN'
          ORDER BY opened_at DESC LIMIT 1) AS cash_session_id,
         (SELECT id FROM payment_methods
          WHERE tenant_id = ? AND is_active = 1 ORDER BY code, id LIMIT 1) AS payment_method_id`,
    )
    .bind(input.tenantId, items[0]!.branch_id, actorUserId, input.tenantId)
    .first<{ cash_session_id: string | null; payment_method_id: string | null }>();
  const cashSession = required(
    input.cashRegisterSessionId ?? defaults?.cash_session_id ?? undefined,
    'CUSTOMER_ORDER_CASH_SESSION_REQUIRED',
  );
  const paymentMethodId = required(
    input.paymentMethodId ?? defaults?.payment_method_id ?? undefined,
    'CUSTOMER_ORDER_PAYMENT_METHOD_REQUIRED',
  );
  const documentType = input.documentType ?? '03';
  const seriesRow = await db
    .prepare(
      `SELECT series, current_number + 1 AS next_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
         AND series = COALESCE(?, series) AND is_active = 1
         AND (authorization_status = 'AUTHORIZED'
           OR (? = 'NV' AND authorization_status = 'INTERNAL'))
       ORDER BY series LIMIT 1`,
    )
    .bind(input.tenantId, items[0]!.branch_id, documentType, input.series ?? null, documentType)
    .first<{ series: string; next_number: number }>();
  if (!seriesRow) fail('CUSTOMER_ORDER_SERIES_INVALID');
  const lines = items.map((item, index) => {
    const quantity = leases[index]!.quantity_microunits;
    const subtotal = Math.round((quantity * item.unit_price_cents) / MICROS);
    const igv = documentType === 'NV' ? 0 : Math.round((subtotal * 18) / 100);
    return {
      item,
      lease: leases[index]!,
      quantity,
      subtotal,
      igv,
      total: subtotal + igv,
      cogs: Math.round((quantity * item.pmp_unit_cost_cents) / MICROS),
      saleItemId: crypto.randomUUID(),
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const igv = lines.reduce((sum, line) => sum + line.igv, 0);
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const cogs = lines.reduce((sum, line) => sum + line.cogs, 0);
  const saleId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, input.tenantId);
  const rowHash = await auditHash({
    action: 'CUSTOMER_ORDER_FULFILLED',
    entityId: input.orderId,
    saleId,
    itemIds: lines.map((line) => line.item.item_id),
    prevHash,
  });
  await guardedBatch(db, 'CUSTOMER_ORDER_CONFLICT', (plan) => {
    let guardSql = `SELECT 1 FROM customer_orders o
      JOIN pos_terminals t ON t.tenant_id = o.tenant_id AND t.id = ?
        AND t.branch_id = o.branch_id
      JOIN cash_register_sessions c ON c.tenant_id = o.tenant_id
        AND c.id = ? AND c.branch_id = o.branch_id AND c.status = 'OPEN'
      JOIN users u ON u.tenant_id = o.tenant_id AND u.id = ?
        AND u.branch_id = o.branch_id AND u.is_active = 1 AND u.deleted_at IS NULL
      JOIN pos_terminal_sessions pts ON pts.tenant_id = o.tenant_id
        AND pts.id = ? AND pts.terminal_id = t.id AND pts.user_id = u.id
        AND pts.branch_id = o.branch_id AND pts.cash_register_session_id = c.id
        AND pts.status = 'ACTIVE'
      JOIN payment_methods pm ON pm.tenant_id = o.tenant_id
        AND pm.id = ? AND pm.is_active = 1
      WHERE o.tenant_id = ? AND o.id = ? AND o.version = ?
        AND o.status IN ('OPEN','PARTIAL') AND o.reserved_until > CURRENT_TIMESTAMP`;
    const params: unknown[] = [
      input.terminalId,
      cashSession,
      actorUserId,
      terminalSession.terminalSessionId,
      paymentMethodId,
      input.tenantId,
      input.orderId,
      version,
    ];
    lines.forEach((line) => {
      guardSql += ` AND EXISTS (
        SELECT 1 FROM customer_order_items i
        JOIN customer_order_fulfillments f ON f.tenant_id = i.tenant_id
          AND f.customer_order_item_id = i.id
        WHERE i.tenant_id = o.tenant_id AND i.customer_order_id = o.id
          AND i.id = ? AND i.reserved_quantity_microunits >= ?
          AND f.id = ? AND f.status = 'LEASED' AND f.token_hash = ?
          AND f.terminal_id = ? AND f.actor_user_id = ?
          AND f.lease_expires_at > CURRENT_TIMESTAMP
      )`;
      params.push(
        line.item.item_id,
        line.quantity,
        line.lease.id,
        tokenHash,
        input.terminalId,
        actorUserId,
      );
    });
    guardSql += ` AND NOT EXISTS (
      SELECT 1 FROM customer_order_fulfillments used
      WHERE used.tenant_id = o.tenant_id AND used.consume_idempotency_key = ?
    )`;
    params.push(input.idempotencyKey);
    plan.guardState(guardSql, params);
    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series SET current_number = current_number + 1
           WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
             AND series = ? AND current_number = ?`,
        )
        .bind(
          input.tenantId,
          items[0]!.branch_id,
          documentType,
          seriesRow.series,
          seriesRow.next_number - 1,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO sales (
             id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
             offline_client_sale_id, client_document_type, client_document_number,
             client_name, document_type, series, number, currency, exchange_rate,
             total_taxable_cents, total_exempt_cents, total_igv_cents,
             total_icbper_cents, total_discount_cents, total_cogs_cents,
             total_amount_cents, issued_at_lima, must_submit_by, sunat_status
           )
           SELECT ?, ?, ?, ?, ?, o.customer_id, ?, c.document_type_code, c.document_number,
                  c.name, ?, ?, ?, 'PEN', 1, ?, 0, ?, 0, 0, ?, ?,
                  CURRENT_TIMESTAMP,
                  CASE WHEN ? = 'NV' THEN NULL
                       WHEN ? = '01' THEN datetime('now', '+3 days')
                       ELSE datetime('now', '+7 days') END,
                  CASE WHEN ? = 'NV' THEN 'NOT_APPLICABLE' ELSE 'PENDING' END
           FROM customer_orders o
           JOIN customers c ON c.tenant_id = o.tenant_id AND c.id = o.customer_id
           WHERE o.tenant_id = ? AND o.id = ?`,
        )
        .bind(
          saleId,
          input.tenantId,
          items[0]!.branch_id,
          cashSession,
          actorUserId,
          `customer-order:${input.orderId}:${input.idempotencyKey}`,
          documentType,
          seriesRow.series,
          seriesRow.next_number,
          subtotal,
          igv,
          cogs,
          total,
          documentType,
          documentType,
          documentType,
          input.tenantId,
          input.orderId,
        ),
    );
    lines.forEach((line) => {
      plan.add(
        db
          .prepare(
            `INSERT INTO sale_items (
               id, tenant_id, sale_id, product_id, product_name, product_type, quantity,
               unit_price_cents, unit_cost_cents, discount_amount_cents, subtotal_cents,
               igv_amount_cents, icbper_amount_cents, total_amount_cents, batch_id,
               inventory_location_id, sold_uom_id, sold_uom_code,
               entered_quantity_microunits, factor_numerator, factor_denominator,
               base_quantity_microunits
             ) VALUES (?, ?, ?, ?, ?, ?, ? / 1000000.0, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            line.saleItemId,
            input.tenantId,
            saleId,
            line.item.product_id,
            line.item.product_name,
            line.item.product_type,
            line.quantity,
            line.item.unit_price_cents,
            line.item.pmp_unit_cost_cents,
            line.subtotal,
            line.igv,
            line.total,
            line.item.batch_id,
            line.item.location_id,
            line.item.product_uom_id,
            line.item.uom_code_snapshot,
            Math.round((line.quantity * line.item.factor_denominator) / line.item.factor_numerator),
            line.item.factor_numerator,
            line.item.factor_denominator,
            line.quantity,
          ),
      );
      plan.add(
        db
          .prepare(
            `UPDATE customer_order_items
             SET reserved_quantity_microunits = reserved_quantity_microunits - ?,
                 fulfilled_quantity_microunits = fulfilled_quantity_microunits + ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND customer_order_id = ? AND id = ?
               AND reserved_quantity_microunits >= ?`,
          )
          .bind(
            line.quantity,
            line.quantity,
            input.tenantId,
            input.orderId,
            line.item.item_id,
            line.quantity,
          ),
      );
      plan.add(
        db
          .prepare(
            `UPDATE customer_order_fulfillments
             SET status = 'CONSUMED', consume_idempotency_key = ?, sale_id = ?,
                 sale_item_id = ?, consumed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE tenant_id = ? AND id = ? AND status = 'LEASED'`,
          )
          .bind(input.idempotencyKey, saleId, line.saleItemId, input.tenantId, line.lease.id),
      );
      if (line.item.serial_id) {
        plan.add(
          db
            .prepare(
              `UPDATE serial_numbers SET status = 'SOLD', current_sale_item_id = ?,
                 version = version + 1, updated_at = CURRENT_TIMESTAMP
               WHERE tenant_id = ? AND id = ? AND status = 'RESERVED'`,
            )
            .bind(line.saleItemId, input.tenantId, line.item.serial_id),
        );
      }
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO sale_payments (
             id, tenant_id, sale_id, payment_method_id, amount_cents
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), input.tenantId, saleId, paymentMethodId, total),
    );
    if (documentType !== 'NV') {
      plan.add(
        db
          .prepare(
            `INSERT INTO fiscal_outbox (id, tenant_id, sale_id, status, must_submit_by)
             SELECT ?, ?, ?, 'PENDING', must_submit_by FROM sales
             WHERE tenant_id = ? AND id = ?`,
          )
          .bind(crypto.randomUUID(), input.tenantId, saleId, input.tenantId, saleId),
      );
    }
    plan.add(
      db
        .prepare(
          `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
           VALUES (?, ?, ?, strftime('%Y-%m', 'now'), ?)`,
        )
        .bind(crypto.randomUUID(), input.tenantId, `usage:${saleId}`, saleId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO usage_counters (tenant_id, period_ym, doc_count, updated_at)
           VALUES (?, strftime('%Y-%m', 'now'), 1, CURRENT_TIMESTAMP)
           ON CONFLICT (tenant_id, period_ym) DO UPDATE
           SET doc_count = doc_count + 1, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(input.tenantId),
    );
    plan.add(
      db
        .prepare(
          `UPDATE customer_orders
           SET status = CASE WHEN EXISTS (
             SELECT 1 FROM customer_order_items i
             WHERE i.tenant_id = ? AND i.customer_order_id = ?
               AND i.reserved_quantity_microunits > 0
           ) THEN 'PARTIAL' ELSE 'FULFILLED' END,
           version = version + 1, updated_at = CURRENT_TIMESTAMP,
           closed_at = CASE WHEN EXISTS (
             SELECT 1 FROM customer_order_items i
             WHERE i.tenant_id = ? AND i.customer_order_id = ?
               AND i.reserved_quantity_microunits > 0
           ) THEN NULL ELSE CURRENT_TIMESTAMP END,
           closed_by_user_id = CASE WHEN EXISTS (
             SELECT 1 FROM customer_order_items i
             WHERE i.tenant_id = ? AND i.customer_order_id = ?
               AND i.reserved_quantity_microunits > 0
           ) THEN NULL ELSE ? END
           WHERE tenant_id = ? AND id = ? AND version = ?
             AND status IN ('OPEN','PARTIAL')`,
        )
        .bind(
          input.tenantId,
          input.orderId,
          input.tenantId,
          input.orderId,
          input.tenantId,
          input.orderId,
          actorUserId,
          input.tenantId,
          input.orderId,
          version,
        ),
    );
    appendAudit(plan, db, {
      tenantId: input.tenantId,
      branchId: items[0]!.branch_id,
      actorUserId,
      action: 'CUSTOMER_ORDER_FULFILLED',
      entityId: input.orderId,
      payload: {
        saleId,
        lines: lines.map((line) => ({
          itemId: line.item.item_id,
          saleItemId: line.saleItemId,
          quantityMicrounits: line.quantity,
        })),
      },
      prevHash,
      rowHash,
    });
  });
  const remaining = items.reduce(
    (sum, item, index) =>
      sum + item.reserved_quantity_microunits - leases[index]!.quantity_microunits,
    0,
  );
  return {
    orderId: input.orderId,
    saleId,
    saleItemId: lines[0]!.saleItemId,
    saleItemIds: lines.map((line) => line.saleItemId),
    status: remaining === 0 ? 'FULFILLED' : 'PARTIAL',
    totalAmountCents: total,
    alreadyApplied: false,
  };
}

async function loadFulfillmentResult(
  db: D1DatabaseLike,
  tenantId: string,
  orderId: string,
  saleId: string,
  alreadyApplied: boolean,
): Promise<CustomerOrderFulfillmentResult> {
  const row = await db
    .prepare(
      `SELECT o.status, s.total_amount_cents, f.sale_item_id
       FROM customer_orders o
       JOIN customer_order_fulfillments f ON f.tenant_id = o.tenant_id
         AND f.customer_order_id = o.id AND f.sale_id = ?
       JOIN sales s ON s.tenant_id = f.tenant_id AND s.id = f.sale_id
       WHERE o.tenant_id = ? AND o.id = ? LIMIT 1`,
    )
    .bind(saleId, tenantId, orderId)
    .first<{ status: 'PARTIAL' | 'FULFILLED'; total_amount_cents: number; sale_item_id: string }>();
  if (!row) fail('CUSTOMER_ORDER_NOT_FOUND');
  return {
    orderId,
    saleId,
    saleItemId: row.sale_item_id,
    status: row.status,
    totalAmountCents: row.total_amount_cents,
    alreadyApplied,
  };
}

export interface CloseCustomerOrderInput {
  readonly tenantId: string;
  readonly orderId: string;
  readonly branchId?: string | undefined;
  readonly actorUserId?: string;
  readonly reason?: string;
  readonly idempotencyKey: string;
}

async function closeCustomerOrderAtomic(
  db: D1DatabaseLike,
  input: CloseCustomerOrderInput,
  target: 'CANCELLED' | 'EXPIRED',
): Promise<{ orderId: string; status: 'CANCELLED' | 'EXPIRED'; alreadyApplied: boolean }> {
  const order = await loadOrderDetail(db, input.tenantId, input.orderId, input.branchId);
  if (order.status === target)
    return { orderId: input.orderId, status: target, alreadyApplied: true };
  if (!['OPEN', 'PARTIAL'].includes(order.status)) fail('CUSTOMER_ORDER_TERMINAL');
  if (target === 'CANCELLED' && !input.reason?.trim())
    fail('CUSTOMER_ORDER_CANCEL_REASON_REQUIRED');
  const actor = required(
    input.actorUserId ?? order.created_by_user_id,
    'CUSTOMER_ORDER_USER_REQUIRED',
  );
  const prevHash = await previousAuditHash(db, input.tenantId);
  const action = target === 'EXPIRED' ? 'CUSTOMER_ORDER_EXPIRED' : 'CUSTOMER_ORDER_CANCELLED';
  const noticeHash =
    target === 'EXPIRED'
      ? await auditHash({
          action: 'CUSTOMER_ORDER_EXPIRY_NOTICE',
          entityId: input.orderId,
          prevHash,
        })
      : null;
  const rowHash = await auditHash({
    action,
    entityId: input.orderId,
    prevHash: noticeHash ?? prevHash,
  });
  await guardedBatch(db, 'CUSTOMER_ORDER_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_orders
       WHERE tenant_id = ? AND id = ? AND (? = '' OR branch_id = ?)
         AND version = ? AND status IN ('OPEN','PARTIAL')`,
      [input.tenantId, input.orderId, input.branchId ?? '', input.branchId ?? '', order.version],
    );
    if (target === 'EXPIRED') {
      plan.add(
        db
          .prepare(
            `INSERT INTO customer_order_notifications (
               id, tenant_id, branch_id, customer_order_id, event_type, channel,
               status, idempotency_key, provider_send_key
             ) SELECT ?, ?, ?, ?, 'EXPIRY_WARNING', 'IN_APP', 'PENDING', ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM customer_order_notifications
               WHERE tenant_id = ? AND customer_order_id = ?
                 AND event_type = 'EXPIRY_WARNING'
             )`,
          )
          .bind(
            crypto.randomUUID(),
            input.tenantId,
            order.branch_id,
            input.orderId,
            `expiry:${input.idempotencyKey}`,
            `expiry:${input.tenantId}:${input.orderId}:IN_APP`,
            input.tenantId,
            input.orderId,
          ),
      );
      appendAudit(plan, db, {
        tenantId: input.tenantId,
        branchId: order.branch_id,
        actorUserId: actor,
        action: 'CUSTOMER_ORDER_EXPIRY_NOTICE',
        entityId: input.orderId,
        payload: { channel: 'IN_APP', idempotencyKey: `expiry:${input.idempotencyKey}` },
        prevHash,
        rowHash: noticeHash!,
      });
    }
    for (const item of order.items) {
      if (item.reserved_quantity_microunits <= 0) continue;
      if (item.product_type !== 'service') {
        appendReservationDelta(plan, db, {
          tenantId: input.tenantId,
          branchId: order.branch_id,
          productId: item.product_id,
          locationId: item.location_id!,
          batchId: item.batch_id,
          quantityMicrounits: item.reserved_quantity_microunits,
          orderId: input.orderId,
          actorUserId: actor,
        });
        if (item.serial_id) {
          plan.add(
            db
              .prepare(
                `UPDATE serial_numbers SET status = 'AVAILABLE', version = version + 1,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE tenant_id = ? AND id = ? AND status = 'RESERVED'`,
              )
              .bind(input.tenantId, item.serial_id),
          );
        }
      }
    }
    plan.add(
      db
        .prepare(
          `UPDATE customer_order_items
           SET released_quantity_microunits =
                 released_quantity_microunits + reserved_quantity_microunits,
               reserved_quantity_microunits = 0, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND customer_order_id = ?
             AND reserved_quantity_microunits > 0`,
        )
        .bind(input.tenantId, input.orderId),
    );
    plan.add(
      db
        .prepare(
          `UPDATE customer_order_fulfillments
           SET status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND customer_order_id = ? AND status = 'LEASED'`,
        )
        .bind(target === 'EXPIRED' ? 'EXPIRED' : 'REJECTED', input.tenantId, input.orderId),
    );
    plan.add(
      db
        .prepare(
          `UPDATE customer_orders SET status = ?, version = version + 1,
             closed_at = CURRENT_TIMESTAMP, closed_by_user_id = ?, close_reason = ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND version = ?
             AND status IN ('OPEN','PARTIAL')`,
        )
        .bind(
          target,
          actor,
          input.reason?.trim() ?? 'RESERVATION_EXPIRED',
          input.tenantId,
          input.orderId,
          order.version,
        ),
    );
    appendAudit(plan, db, {
      tenantId: input.tenantId,
      branchId: order.branch_id,
      actorUserId: actor,
      action,
      entityId: input.orderId,
      payload: { reason: input.reason ?? 'RESERVATION_EXPIRED' },
      prevHash: noticeHash ?? prevHash,
      rowHash,
    });
  });
  return { orderId: input.orderId, status: target, alreadyApplied: false };
}

export function cancelCustomerOrderAtomic(db: D1DatabaseLike, input: CloseCustomerOrderInput) {
  return closeCustomerOrderAtomic(db, input, 'CANCELLED');
}

export function expireCustomerOrderAtomic(db: D1DatabaseLike, input: CloseCustomerOrderInput) {
  return closeCustomerOrderAtomic(db, input, 'EXPIRED');
}

interface DetailItem extends OrderItemRow {
  released_quantity_microunits: number;
}

interface OrderDetail {
  id: string;
  branch_id: string;
  customer_id: string;
  status: CustomerOrderStatus;
  version: number;
  reserved_until: string;
  created_by_user_id: string;
  items: DetailItem[];
}

async function loadOrderDetail(
  db: D1DatabaseLike,
  tenantId: string,
  orderId: string,
  branchId?: string,
): Promise<OrderDetail> {
  const order = await db
    .prepare(
      `SELECT id, branch_id, customer_id, status, version, reserved_until, created_by_user_id
       FROM customer_orders
       WHERE tenant_id = ? AND id = ? AND (? = '' OR branch_id = ?) LIMIT 1`,
    )
    .bind(tenantId, orderId, branchId ?? '', branchId ?? '')
    .first<Omit<OrderDetail, 'items'>>();
  if (!order) fail('CUSTOMER_ORDER_NOT_FOUND');
  const rows = await db
    .prepare(
      `SELECT i.*, p.product_type, p.name AS product_name,
              COALESCE(bs.pmp_unit_cost_cents, p.cost_cents) AS pmp_unit_cost_cents,
              i.id AS item_id, i.customer_order_id AS order_id
       FROM customer_order_items i
       JOIN products p ON p.tenant_id = i.tenant_id AND p.id = i.product_id
       LEFT JOIN branch_product_stock bs ON bs.tenant_id = i.tenant_id
         AND bs.branch_id = i.branch_id AND bs.product_id = i.product_id
       WHERE i.tenant_id = ? AND i.customer_order_id = ? ORDER BY i.id`,
    )
    .bind(tenantId, orderId)
    .all<DetailItem>();
  return { ...order, items: [...(rows.results ?? [])] };
}

export async function getCustomerOrderDetail(
  db: D1DatabaseLike,
  tenantId: string,
  orderId: string,
  branchId?: string,
): Promise<OrderDetail> {
  return loadOrderDetail(db, tenantId, orderId, branchId);
}

export async function listCustomerOrders(
  db: D1DatabaseLike,
  input: { tenantId: string; branchId?: string; status?: CustomerOrderStatus; limit?: number },
): Promise<readonly Record<string, unknown>[]> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const rows = await db
    .prepare(
      `SELECT id, branch_id, customer_id, status, pickup_at, reserved_until,
              version, created_at, updated_at, closed_at
       FROM customer_orders
       WHERE tenant_id = ? AND (? = '' OR branch_id = ?) AND (? = '' OR status = ?)
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(
      input.tenantId,
      input.branchId ?? '',
      input.branchId ?? '',
      input.status ?? '',
      input.status ?? '',
      limit,
    )
    .all<Record<string, unknown>>();
  return rows.results ?? [];
}

export async function ensureCustomerOrderExpiryNoticeAtomic(
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    orderId: string;
    actorUserId: string;
    idempotencyKey: string;
    whatsappCapabilityEnabled: boolean;
    whatsappOptInActive: boolean;
  },
): Promise<{ notificationId: string; channel: 'WHATSAPP' | 'IN_APP'; alreadyApplied: boolean }> {
  const existing = await db
    .prepare(
      `SELECT id, channel FROM customer_order_notifications
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.idempotencyKey)
    .first<{ id: string; channel: 'WHATSAPP' | 'IN_APP' }>();
  if (existing)
    return { notificationId: existing.id, channel: existing.channel, alreadyApplied: true };
  const order = await loadOrderDetail(db, input.tenantId, input.orderId);
  const notice = planCustomerOrderNotification(input);
  const notificationId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, input.tenantId);
  const rowHash = await auditHash({
    action: 'CUSTOMER_ORDER_EXPIRY_NOTICE_CREATED',
    entityId: input.orderId,
    prevHash,
  });
  await guardedBatch(db, 'CUSTOMER_ORDER_NOTICE_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_orders
       WHERE tenant_id = ? AND id = ? AND status IN ('OPEN','PARTIAL')`,
      [input.tenantId, input.orderId],
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO customer_order_notifications (
             id, tenant_id, branch_id, customer_order_id, event_type, channel,
             status, idempotency_key, provider_send_key
           ) VALUES (?, ?, ?, ?, 'EXPIRY_WARNING', ?, 'PENDING', ?, ?)`,
        )
        .bind(
          notificationId,
          input.tenantId,
          order.branch_id,
          input.orderId,
          notice.channel,
          input.idempotencyKey,
          `expiry:${input.tenantId}:${input.orderId}:${notice.channel}`,
        ),
    );
    appendAudit(plan, db, {
      tenantId: input.tenantId,
      branchId: order.branch_id,
      actorUserId: input.actorUserId,
      action: 'CUSTOMER_ORDER_EXPIRY_NOTICE_CREATED',
      entityId: input.orderId,
      payload: { notificationId, channel: notice.channel },
      prevHash,
      rowHash,
    });
  });
  return { notificationId, channel: notice.channel, alreadyApplied: false };
}

export interface CustomerOrderNoticeSender {
  sendExpiryWarning(input: {
    tenantId: string;
    orderId: string;
    notificationId: string;
  }): Promise<{ accepted: boolean }>;
}

export async function dispatchCustomerOrderNotice(
  db: D1DatabaseLike,
  input: { tenantId: string; notificationId: string },
  sender: CustomerOrderNoticeSender,
): Promise<{ status: 'SENT' | 'RETRY' | 'FAILED' }> {
  const notice = await db
    .prepare(
      `SELECT id, customer_order_id, channel, status, attempt_count
       FROM customer_order_notifications WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.notificationId)
    .first<{
      id: string;
      customer_order_id: string;
      channel: string;
      status: string;
      attempt_count: number;
    }>();
  if (!notice) fail('CUSTOMER_ORDER_NOTICE_NOT_FOUND');
  if (notice.status === 'SENT' || notice.status === 'DELIVERED') return { status: 'SENT' };
  if (notice.status === 'FAILED' || notice.attempt_count >= 5) return { status: 'FAILED' };
  if (notice.channel === 'IN_APP') return { status: 'RETRY' };
  await guardedBatch(db, 'CUSTOMER_ORDER_NOTICE_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_order_notifications
       WHERE tenant_id = ? AND id = ? AND status IN ('PENDING','RETRY')
         AND attempt_count = ? AND attempt_count < 5`,
      [input.tenantId, input.notificationId, notice.attempt_count],
    );
    plan.add(
      db
        .prepare(
          `UPDATE customer_order_notifications
           SET status = 'DISPATCHING', updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND status IN ('PENDING','RETRY')
             AND attempt_count = ?`,
        )
        .bind(input.tenantId, input.notificationId, notice.attempt_count),
    );
  });
  const accepted = await sender
    .sendExpiryWarning({
      tenantId: input.tenantId,
      orderId: notice.customer_order_id,
      notificationId: notice.id,
    })
    .then((sent) => sent.accepted)
    .catch(() => false);
  const nextAttempt = notice.attempt_count + 1;
  const status = accepted ? 'SENT' : nextAttempt >= 5 ? 'FAILED' : 'RETRY';
  await guardedBatch(db, 'CUSTOMER_ORDER_NOTICE_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_order_notifications
       WHERE tenant_id = ? AND id = ? AND status = 'DISPATCHING' AND attempt_count = ?`,
      [input.tenantId, input.notificationId, notice.attempt_count],
    );
    plan.add(
      db
        .prepare(
          `UPDATE customer_order_notifications
           SET status = ?, attempt_count = attempt_count + 1,
               delivered_at = CASE WHEN ? = 'SENT' THEN CURRENT_TIMESTAMP ELSE NULL END,
               next_attempt_at = CASE WHEN ? = 'RETRY' THEN datetime('now', '+5 minutes') ELSE NULL END,
               last_error_code = CASE WHEN ? = 'SENT' THEN NULL ELSE 'TRANSPORT_UNAVAILABLE' END,
               updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND status = 'DISPATCHING' AND attempt_count = ?`,
        )
        .bind(
          status,
          status,
          status,
          status,
          input.tenantId,
          input.notificationId,
          notice.attempt_count,
        ),
    );
  });
  return { status };
}

/** Persiste/actualiza el resultado observable del transporte en un solo batch. */
export async function recordCustomerOrderNoticeAtomic(
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    orderId: string;
    channel: 'WHATSAPP' | 'IN_APP';
    idempotencyKey: string;
    transportResult: { ok: boolean; code?: string };
  },
): Promise<{ status: 'DELIVERED' | 'RETRY' }> {
  const status = input.transportResult.ok ? 'DELIVERED' : 'RETRY';
  await guardedBatch(db, 'CUSTOMER_ORDER_NOTICE_CONFLICT', (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO customer_order_notifications (
             id, tenant_id, branch_id, customer_order_id, event_type, channel, status,
             idempotency_key, provider_send_key, attempt_count, next_attempt_at,
             delivered_at, last_error_code
           )
           SELECT ?, ?, branch_id, id, 'EXPIRY_WARNING', ?, ?, ?, ?, 1,
                  CASE WHEN ? = 'RETRY' THEN datetime('now', '+5 minutes') ELSE NULL END,
                  CASE WHEN ? = 'DELIVERED' THEN CURRENT_TIMESTAMP ELSE NULL END, ?
           FROM customer_orders WHERE tenant_id = ? AND id = ?
           ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET
             status = CASE WHEN customer_order_notifications.status = 'DELIVERED'
                       THEN 'DELIVERED' ELSE excluded.status END,
             attempt_count = customer_order_notifications.attempt_count + 1,
             next_attempt_at = CASE WHEN excluded.status = 'RETRY'
                               THEN datetime('now', '+5 minutes') ELSE NULL END,
             delivered_at = CASE WHEN excluded.status = 'DELIVERED'
                            THEN CURRENT_TIMESTAMP ELSE customer_order_notifications.delivered_at END,
             last_error_code = excluded.last_error_code,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          input.channel,
          status,
          input.idempotencyKey,
          `expiry:${input.tenantId}:${input.orderId}:${input.channel}`,
          status,
          status,
          input.transportResult.ok ? null : (input.transportResult.code ?? 'TRANSPORT_UNAVAILABLE'),
          input.tenantId,
          input.orderId,
        ),
    );
  });
  return { status };
}

export interface MintCustomerOrderRepriceAuthorizationInput {
  readonly tenantId: string;
  readonly orderId: string;
  readonly approvedByUserId: string;
  readonly actorUserId: string;
  readonly terminalId: string;
  readonly terminalSessionId?: string;
  readonly requestedTtlSeconds?: number;
}

export async function mintCustomerOrderRepriceAuthorizationAtomic(
  db: D1DatabaseLike,
  input: MintCustomerOrderRepriceAuthorizationInput,
): Promise<{ token: string; expiresAt: string; scope: 'CUSTOMER_ORDER_REPRICE' }> {
  const terminalSession = await requireCustomerOrderTerminalSession(db, {
    tenantId: input.tenantId,
    actorUserId: input.approvedByUserId,
    terminalId: input.terminalId,
    terminalSessionId: input.terminalSessionId,
  });
  const ttlSeconds = Math.min(300, Math.max(1, input.requestedTtlSeconds ?? 300));
  const token = opaqueToken();
  const tokenHash = await sha256Hex(token);
  const authorizationId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await guardedBatch(db, 'CUSTOMER_ORDER_REPRICE_AUTH_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_orders o
       JOIN users approver ON approver.tenant_id = o.tenant_id
         AND approver.id = ? AND approver.role IN ('supervisor','admin')
         AND approver.is_active = 1 AND approver.deleted_at IS NULL
       JOIN users actor ON actor.tenant_id = o.tenant_id
         AND actor.id = ? AND actor.branch_id = o.branch_id
         AND actor.role IN ('cashier','supervisor')
         AND actor.is_active = 1 AND actor.deleted_at IS NULL
       JOIN pos_terminals terminal ON terminal.tenant_id = o.tenant_id
         AND terminal.id = ? AND terminal.branch_id = o.branch_id
       JOIN pos_terminal_sessions terminal_session ON terminal_session.tenant_id = o.tenant_id
         AND terminal_session.id = ? AND terminal_session.terminal_id = terminal.id
         AND terminal_session.user_id = approver.id
         AND terminal_session.branch_id = o.branch_id AND terminal_session.status = 'ACTIVE'
       WHERE o.tenant_id = ? AND o.id = ? AND o.status = 'EXPIRED'
         AND NOT EXISTS (
           SELECT 1 FROM authorization_tokens active
           WHERE active.tenant_id = o.tenant_id
             AND active.action = 'CUSTOMER_ORDER_REPRICE'
             AND active.customer_order_id = o.id
             AND active.actor_user_id = actor.id
             AND active.terminal_id = terminal.id
             AND active.used_at IS NULL AND active.expires_at > CURRENT_TIMESTAMP
         )`,
      [
        input.approvedByUserId,
        input.actorUserId,
        input.terminalId,
        terminalSession.terminalSessionId,
        input.tenantId,
        input.orderId,
      ],
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO authorization_tokens (
             id, tenant_id, token_hash, approved_by_user_id, expires_at,
             action, actor_user_id, terminal_id, terminal_session_id, customer_order_id
           ) VALUES (?, ?, ?, ?, ?, 'CUSTOMER_ORDER_REPRICE', ?, ?, ?, ?)`,
        )
        .bind(
          authorizationId,
          input.tenantId,
          tokenHash,
          input.approvedByUserId,
          expiresAt,
          input.actorUserId,
          input.terminalId,
          terminalSession.terminalSessionId,
          input.orderId,
        ),
    );
  });
  return { token, expiresAt, scope: 'CUSTOMER_ORDER_REPRICE' };
}

export interface ExpiredCustomerOrderRepriceHandoffInput {
  readonly tenantId: string;
  readonly orderId: string;
  readonly actorUserId: string;
  readonly terminalId: string;
  readonly terminalSessionId?: string;
  readonly authorizationToken: string;
  readonly priceListId?: string;
  readonly idempotencyKey: string;
}

export async function processExpiredCustomerOrderRepriceHandoffAtomic(
  db: D1DatabaseLike,
  input: ExpiredCustomerOrderRepriceHandoffInput,
): Promise<{
  quoteId: string;
  source: 'CURRENT_SERVER_PRICING';
  requiresOrdinaryCheckout: true;
  lines: readonly {
    productId: string;
    quantityMicrounits: number;
    unitPriceCents: number;
    productUomId: string;
  }[];
}> {
  const terminalSession = await requireCustomerOrderTerminalSession(db, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    terminalId: input.terminalId,
    terminalSessionId: input.terminalSessionId,
  });
  const tokenHash = await sha256Hex(
    required(input.authorizationToken, 'CUSTOMER_ORDER_REPRICE_AUTH_REQUIRED'),
  );
  const order = await loadOrderDetail(db, input.tenantId, input.orderId);
  if (order.status !== 'EXPIRED') fail('CUSTOMER_ORDER_REPRICE_REQUIRES_EXPIRED');
  const authorization = await db
    .prepare(
      `SELECT id FROM authorization_tokens
       WHERE tenant_id = ? AND token_hash = ?
         AND action = 'CUSTOMER_ORDER_REPRICE' AND customer_order_id = ?
         AND actor_user_id = ? AND terminal_id = ? AND terminal_session_id = ?
         AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .bind(
      input.tenantId,
      tokenHash,
      input.orderId,
      input.actorUserId,
      input.terminalId,
      terminalSession.terminalSessionId,
    )
    .first<{ id: string }>();
  if (!authorization) fail('CUSTOMER_ORDER_REPRICE_AUTH_INVALID');
  const currentLines = await Promise.all(
    order.items
      .filter((item) => item.released_quantity_microunits > 0)
      .map(async (item) => {
        const entered = Math.round(
          (item.released_quantity_microunits * item.factor_denominator) / item.factor_numerator,
        );
        const current = await resolveCreateItem(
          db,
          {
            tenantId: input.tenantId,
            branchId: order.branch_id,
            customerId: order.customer_id,
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey,
            reservedUntil: new Date(Date.now() + 60_000).toISOString(),
            ...(input.priceListId ? { priceListId: input.priceListId } : {}),
            items: [],
          },
          {
            productId: item.product_id,
            productUomId: item.product_uom_id,
            enteredQuantityMicrounits: entered,
            ...(item.location_id ? { locationId: item.location_id } : {}),
            ...(item.batch_id ? { batchId: item.batch_id } : {}),
          },
        );
        return {
          productId: item.product_id,
          quantityMicrounits: item.released_quantity_microunits,
          unitPriceCents: current.unitPrice,
          productUomId: item.product_uom_id,
        };
      }),
  );
  if (currentLines.length === 0) fail('CUSTOMER_ORDER_REPRICE_EMPTY');
  const quoteId = crypto.randomUUID();
  const prevHash = await previousAuditHash(db, input.tenantId);
  const rowHash = await auditHash({
    action: 'CUSTOMER_ORDER_REPRICE_AUTH_CONSUMED',
    entityId: input.orderId,
    quoteId,
    prevHash,
  });
  await guardedBatch(db, 'CUSTOMER_ORDER_REPRICE_CONFLICT', (plan) => {
    plan.guardState(
      `SELECT 1 FROM customer_orders o
       JOIN authorization_tokens auth ON auth.tenant_id = o.tenant_id
         AND auth.id = ? AND auth.token_hash = ?
         AND auth.action = 'CUSTOMER_ORDER_REPRICE'
         AND auth.customer_order_id = o.id
         AND auth.actor_user_id = ? AND auth.terminal_id = ?
         AND auth.terminal_session_id = ?
         AND auth.used_at IS NULL AND auth.expires_at > CURRENT_TIMESTAMP
       JOIN pos_terminal_sessions pts ON pts.tenant_id = o.tenant_id
         AND pts.id = auth.terminal_session_id AND pts.terminal_id = auth.terminal_id
         AND pts.user_id = auth.actor_user_id AND pts.branch_id = o.branch_id
         AND pts.status = 'ACTIVE'
       WHERE o.tenant_id = ? AND o.id = ? AND o.status = 'EXPIRED'`,
      [
        authorization.id,
        tokenHash,
        input.actorUserId,
        input.terminalId,
        terminalSession.terminalSessionId,
        input.tenantId,
        input.orderId,
      ],
    );
    plan.add(
      db
        .prepare(
          `UPDATE authorization_tokens
           SET used_at = CURRENT_TIMESTAMP
           WHERE tenant_id = ? AND id = ? AND used_at IS NULL`,
        )
        .bind(input.tenantId, authorization.id),
    );
    appendAudit(plan, db, {
      tenantId: input.tenantId,
      branchId: order.branch_id,
      actorUserId: input.actorUserId,
      action: 'CUSTOMER_ORDER_REPRICE_AUTH_CONSUMED',
      entityId: input.orderId,
      payload: { quoteId, idempotencyKey: input.idempotencyKey, lines: currentLines },
      prevHash,
      rowHash,
    });
  });
  return {
    quoteId,
    source: 'CURRENT_SERVER_PRICING',
    requiresOrdinaryCheckout: true,
    lines: currentLines,
  };
}
