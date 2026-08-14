import type { D1DatabaseLike } from './index.js';
import {
  createCustomerOrderAtomic,
  fulfillCustomerOrderAtomic,
  mintCustomerOrderLeaseAtomic,
} from './process-customer-order-atomic.js';

let fixtureSequence = 0;

async function scalar(db: D1DatabaseLike, sql: string, params: unknown[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<{ value: number }>();
  return row?.value ?? 0;
}

export async function seedCustomerOrderFixture(
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    otherTenantId?: string;
    quantityMicrounits: number;
    withBatchLocationSerialUom?: boolean;
  },
) {
  fixtureSequence += 1;
  const suffix = `${fixtureSequence}-${crypto.randomUUID()}`;
  const tenantId = input.tenantId;
  const otherTenantId = input.otherTenantId ?? `${tenantId}-other`;
  const branchId = `branch-${suffix}`;
  const otherBranchId = `other-branch-${suffix}`;
  const actorUserId = `user-${suffix}`;
  const otherUserId = `other-user-${suffix}`;
  const customerId = `customer-${suffix}`;
  const productId = `product-${suffix}`;
  const uomId = `uom-${suffix}`;
  const locationId = `location-${suffix}`;
  const batchId = input.withBatchLocationSerialUom ? `batch-${suffix}` : null;
  const terminalId = `terminal-${suffix}`;
  const otherTenantTerminalId = `other-terminal-${suffix}`;
  const registerId = `register-${suffix}`;
  const sessionId = `session-${suffix}`;
  const terminalSessionId = `terminal-session-${suffix}`;
  const paymentMethodId = `payment-${suffix}`;
  const initialStock = input.quantityMicrounits + 5_000_000;

  await db.batch([
    db
      .prepare(`INSERT INTO tenants (id, business_name, vertical_type) VALUES (?, ?, 'retail')`)
      .bind(tenantId, `Tenant ${suffix}`),
    db
      .prepare(`INSERT INTO tenants (id, business_name, vertical_type) VALUES (?, ?, 'retail')`)
      .bind(otherTenantId, `Other ${suffix}`),
  ]);
  await db.batch([
    db
      .prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, ?, ?, 'Lima')`,
      )
      .bind(branchId, tenantId, `B${fixtureSequence}`, 'Principal'),
    db
      .prepare(
        `INSERT INTO branches (id, tenant_id, code, name, address)
         VALUES (?, ?, ?, ?, 'Lima')`,
      )
      .bind(otherBranchId, otherTenantId, `O${fixtureSequence}`, 'Otra'),
  ]);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, ?, 'supervisor')`,
      )
      .bind(actorUserId, tenantId, branchId, `${actorUserId}@example.test`),
    db
      .prepare(
        `INSERT INTO users (id, tenant_id, branch_id, email, role)
         VALUES (?, ?, ?, ?, 'cashier')`,
      )
      .bind(otherUserId, otherTenantId, otherBranchId, `${otherUserId}@example.test`),
    db
      .prepare(
        `INSERT INTO customers (
           id, tenant_id, document_type_code, document_number, name
         ) VALUES (?, ?, '1', ?, 'Cliente pedido')`,
      )
      .bind(customerId, tenantId, `43${String(fixtureSequence).padStart(6, '0')}`),
    db
      .prepare(
        `INSERT INTO products (
           id, tenant_id, sku, name, unit_code, product_type, price_cents, cost_cents
         ) VALUES (?, ?, ?, 'Producto pedido', 'NIU', 'physical', 1000, 400)`,
      )
      .bind(productId, tenantId, `SKU-${suffix}`),
  ]);
  await db.batch([
    db
      .prepare(
        `INSERT INTO product_uoms (
           id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
         ) VALUES (?, ?, ?, 'NIU', 1, 1, 1)`,
      )
      .bind(uomId, tenantId, productId),
    db
      .prepare(
        `INSERT INTO branch_product_stock (
           tenant_id, branch_id, product_id, stock, stock_microunits, pmp_unit_cost_cents
         ) VALUES (?, ?, ?, ? / 1000000.0, ?, 400)`,
      )
      .bind(tenantId, branchId, productId, initialStock, initialStock),
    db
      .prepare(
        `INSERT INTO inventory_locations (id, tenant_id, branch_id, code, name)
         VALUES (?, ?, ?, ?, 'Picking')`,
      )
      .bind(locationId, tenantId, branchId, `L${fixtureSequence}`),
    db
      .prepare(
        `INSERT INTO inventory_location_stock (
           tenant_id, branch_id, location_id, product_id, quantity_microunits
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(tenantId, branchId, locationId, productId, initialStock),
  ]);
  if (batchId) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO inventory_batches (
             id, tenant_id, branch_id, product_id, batch_number, expiration_date,
             stock, stock_microunits
           ) VALUES (?, ?, ?, ?, ?, date('now', '+30 days'), ? / 1000000.0, ?)`,
        )
        .bind(
          batchId,
          tenantId,
          branchId,
          productId,
          `LOT-${fixtureSequence}`,
          initialStock,
          initialStock,
        ),
      db
        .prepare(
          `INSERT INTO inventory_location_batch_stock (
             tenant_id, branch_id, location_id, product_id, batch_id, quantity_microunits
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(tenantId, branchId, locationId, productId, batchId, initialStock),
    ]);
  }
  await db.batch([
    db
      .prepare(
        `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, 'Caja')`,
      )
      .bind(registerId, tenantId, branchId),
    db
      .prepare(
        `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
         VALUES (?, ?, ?, 'Terminal')`,
      )
      .bind(terminalId, tenantId, branchId),
    db
      .prepare(
        `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
         VALUES (?, ?, ?, 'Otra terminal')`,
      )
      .bind(otherTenantTerminalId, otherTenantId, otherBranchId),
    db
      .prepare(
        `INSERT INTO payment_methods (id, tenant_id, code, name)
         VALUES (?, ?, 'cash', 'Efectivo')`,
      )
      .bind(paymentMethodId, tenantId),
    db
      .prepare(
        `INSERT INTO branch_document_series (
           id, tenant_id, branch_id, document_type_code, series, current_number,
           authorization_status, is_active
         ) VALUES (?, ?, ?, '03', ?, 0, 'AUTHORIZED', 1)`,
      )
      .bind(`series-${suffix}`, tenantId, branchId, `B${String(fixtureSequence).padStart(3, '0')}`),
  ]);
  await db
    .prepare(
      `INSERT INTO cash_register_sessions (
         id, tenant_id, branch_id, cash_register_id, user_id, status
       ) VALUES (?, ?, ?, ?, ?, 'OPEN')`,
    )
    .bind(sessionId, tenantId, branchId, registerId, actorUserId)
    .run();
  await db
    .prepare(
      `INSERT INTO pos_terminal_sessions (
         id, tenant_id, terminal_id, cash_register_session_id, user_id, branch_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    )
    .bind(terminalSessionId, tenantId, terminalId, sessionId, actorUserId, branchId)
    .run();

  const created = await createCustomerOrderAtomic(db, {
    tenantId,
    branchId,
    customerId,
    actorUserId,
    idempotencyKey: `create-${suffix}`,
    reservedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    items: [
      {
        productId,
        productUomId: uomId,
        enteredQuantityMicrounits: input.quantityMicrounits,
        locationId,
        ...(batchId ? { batchId } : {}),
      },
    ],
  });
  const item = await db
    .prepare(
      `SELECT id FROM customer_order_items
       WHERE tenant_id = ? AND customer_order_id = ? LIMIT 1`,
    )
    .bind(tenantId, created.orderId)
    .first<{ id: string }>();
  if (!item) throw new Error('FIXTURE_ORDER_ITEM_MISSING');

  let leaseSequence = 0;
  async function fulfillPartial(quantityMicrounits: number, key: string) {
    leaseSequence += 1;
    const lease = await mintCustomerOrderLeaseAtomic(db, {
      tenantId,
      orderId: created.orderId,
      itemId: item!.id,
      terminalId,
      terminalSessionId,
      actorUserId,
      quantityMicrounits,
      idempotencyKey: `lease-${suffix}-${leaseSequence}`,
    });
    return fulfillCustomerOrderAtomic(db, {
      tenantId,
      orderId: created.orderId,
      terminalId,
      terminalSessionId,
      actorUserId,
      envelope: lease.envelope,
      idempotencyKey: key,
      cashRegisterSessionId: sessionId,
      documentType: '03',
      series: `B${String(fixtureSequence).padStart(3, '0')}`,
      paymentMethodId,
    });
  }
  const initialLease = input.withBatchLocationSerialUom
    ? null
    : await mintCustomerOrderLeaseAtomic(db, {
        tenantId,
        orderId: created.orderId,
        itemId: item.id,
        terminalId,
        terminalSessionId,
        actorUserId,
        quantityMicrounits: input.quantityMicrounits,
        idempotencyKey: `lease-${suffix}-initial`,
      });

  return {
    tenantId,
    otherTenantId,
    branchId,
    actorUserId,
    customerId,
    productId,
    uomId,
    locationId,
    batchId,
    terminalId,
    terminalSessionId,
    sessionId,
    paymentMethodId,
    series: `B${String(fixtureSequence).padStart(3, '0')}`,
    otherTenantTerminalId,
    orderId: created.orderId,
    envelope: initialLease?.envelope ?? '',
    fulfillPartial,
    async readOrder() {
      return db
        .prepare(
          `SELECT o.status,
                  SUM(i.requested_quantity_microunits) AS requested_quantity_microunits,
                  SUM(i.reserved_quantity_microunits) AS reserved_quantity_microunits,
                  SUM(i.fulfilled_quantity_microunits) AS fulfilled_quantity_microunits,
                  SUM(i.released_quantity_microunits) AS released_quantity_microunits
           FROM customer_orders o JOIN customer_order_items i
             ON i.tenant_id = o.tenant_id AND i.customer_order_id = o.id
           WHERE o.tenant_id = ? AND o.id = ? GROUP BY o.id`,
        )
        .bind(tenantId, created.orderId)
        .first<Record<string, number | string>>();
    },
    countSales: () =>
      scalar(
        db,
        `SELECT COUNT(DISTINCT sale_id) AS value FROM customer_order_fulfillments
         WHERE tenant_id = ? AND customer_order_id = ? AND status = 'CONSUMED'`,
        [tenantId, created.orderId],
      ),
    countFiscalOutbox: () =>
      scalar(
        db,
        `SELECT COUNT(*) AS value FROM fiscal_outbox f
         JOIN customer_order_fulfillments c
           ON c.tenant_id = f.tenant_id AND c.sale_id = f.sale_id
         WHERE c.tenant_id = ? AND c.customer_order_id = ?`,
        [tenantId, created.orderId],
      ),
    async stockConservationDelta() {
      const current = await scalar(
        db,
        `SELECT stock_microunits AS value FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
        [tenantId, branchId, productId],
      );
      const fulfilled = await scalar(
        db,
        `SELECT SUM(fulfilled_quantity_microunits) AS value FROM customer_order_items
         WHERE tenant_id = ? AND customer_order_id = ?`,
        [tenantId, created.orderId],
      );
      return initialStock - current - fulfilled;
    },
    async auditChainIsLinear() {
      const rows = await db
        .prepare(
          `SELECT prev_hash, row_hash FROM audit_events
           WHERE tenant_id = ?`,
        )
        .bind(tenantId)
        .all<{ prev_hash: string | null; row_hash: string }>();
      const events = rows.results ?? [];
      if (events.length === 0) return false;
      const hashes = new Set(events.map((event) => event.row_hash));
      return (
        events.filter((event) => event.prev_hash === null).length === 1 &&
        events.every((event) => event.prev_hash === null || hashes.has(event.prev_hash))
      );
    },
    async inventoryDimensionsRemainConsistent() {
      const branch = await scalar(
        db,
        `SELECT stock_microunits AS value FROM branch_product_stock
         WHERE tenant_id = ? AND branch_id = ? AND product_id = ?`,
        [tenantId, branchId, productId],
      );
      const location = await scalar(
        db,
        `SELECT quantity_microunits AS value FROM inventory_location_stock
         WHERE tenant_id = ? AND branch_id = ? AND location_id = ? AND product_id = ?`,
        [tenantId, branchId, locationId, productId],
      );
      if (branch !== location) return false;
      if (!batchId) return true;
      const batch = await scalar(
        db,
        `SELECT stock_microunits AS value FROM inventory_batches
         WHERE tenant_id = ? AND id = ?`,
        [tenantId, batchId],
      );
      const locationBatch = await scalar(
        db,
        `SELECT quantity_microunits AS value FROM inventory_location_batch_stock
         WHERE tenant_id = ? AND batch_id = ?`,
        [tenantId, batchId],
      );
      return batch === locationBatch && branch === batch;
    },
  };
}
