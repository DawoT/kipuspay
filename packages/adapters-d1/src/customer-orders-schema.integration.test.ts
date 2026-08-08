import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertBackupRegistryComplete } from './data-backup.js';
import { DOWN_0036_SPRINT43_CUSTOMER_ORDERS } from './migrations-down.js';

const tenantA = 'customer-order-schema-a';
const tenantB = 'customer-order-schema-b';
const branchA = 'customer-order-branch-a';
const branchB = 'customer-order-branch-b';
const userA = 'customer-order-user-a';
const userB = 'customer-order-user-b';
const orderId = 'customer-order-a';
const itemId = 'customer-order-item-a';

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type)
       VALUES (?, 'Pedidos A', 'retail')`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type)
       VALUES (?, 'Pedidos B', 'retail')`,
    ).bind(tenantB),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'A', 'Sucursal A', 'Lima')`,
    ).bind(branchA, tenantA),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address)
       VALUES (?, ?, 'B', 'Sucursal B', 'Lima')`,
    ).bind(branchB, tenantB),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, 'orders-a@example.test', 'supervisor')`,
    ).bind(userA, tenantA, branchA),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, 'orders-b@example.test', 'supervisor')`,
    ).bind(userB, tenantB, branchB),
    env.DB.prepare(
      `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name)
       VALUES ('customer-order-customer-a', ?, '1', '43000001', 'Cliente A')`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name)
       VALUES ('customer-order-customer-b', ?, '1', '43000002', 'Cliente B')`,
    ).bind(tenantB),
    env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, name, unit_code, price_cents)
       VALUES ('customer-order-product-a', ?, 'ORDER-A', 'Producto A', 'NIU', 1180)`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO products (id, tenant_id, sku, name, unit_code, price_cents)
       VALUES ('customer-order-product-b', ?, 'ORDER-B', 'Producto B', 'NIU', 1500)`,
    ).bind(tenantB),
    env.DB.prepare(
      `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
       VALUES ('customer-order-terminal-a', ?, ?, 'Caja A')`,
    ).bind(tenantA, branchA),
    env.DB.prepare(
      `INSERT INTO pos_terminals (id, tenant_id, branch_id, label)
       VALUES ('customer-order-terminal-b', ?, ?, 'Caja B')`,
    ).bind(tenantB, branchB),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name)
       VALUES ('customer-order-register-a', ?, ?, 'Caja A')`,
    ).bind(tenantA, branchA),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions (
         id, tenant_id, branch_id, cash_register_id, user_id, status
       ) VALUES (
         'customer-order-cash-session-a', ?, ?, 'customer-order-register-a', ?, 'OPEN'
       )`,
    ).bind(tenantA, branchA, userA),
  ]);
  await env.DB.prepare(
    `INSERT INTO pos_terminal_sessions (
       id, tenant_id, terminal_id, cash_register_session_id, user_id, branch_id, status
     ) VALUES (
       'customer-order-terminal-session-a', ?, 'customer-order-terminal-a',
       'customer-order-cash-session-a', ?, ?, 'ACTIVE'
     )`,
  )
    .bind(tenantA, userA, branchA)
    .run();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO product_uoms (
         id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
       ) VALUES ('customer-order-uom-a', ?, 'customer-order-product-a', 'NIU', 1, 1, 1)`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO product_uoms (
         id, tenant_id, product_id, uom_code, factor_numerator, factor_denominator, is_base
       ) VALUES ('customer-order-uom-b', ?, 'customer-order-product-b', 'NIU', 1, 1, 1)`,
    ).bind(tenantB),
  ]);
});

async function insertOrder(id: string = orderId, item: string = itemId): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO customer_orders (
       id, tenant_id, branch_id, customer_id, reserved_until,
       idempotency_key, created_by_user_id
     ) VALUES (?, ?, ?, 'customer-order-customer-a', '2026-08-09T12:00:00.000Z', ?, ?)`,
  )
    .bind(id, tenantA, branchA, `idem-${id}`, userA)
    .run();
  await env.DB.prepare(
    `INSERT INTO customer_order_items (
       id, tenant_id, branch_id, customer_order_id, product_id, product_uom_id,
       uom_code_snapshot, entered_quantity_microunits, factor_numerator,
       factor_denominator, requested_quantity_microunits,
       reserved_quantity_microunits, unit_price_cents
     ) VALUES (?, ?, ?, ?, 'customer-order-product-a', 'customer-order-uom-a',
       'NIU', 2000000, 1, 1, 2000000, 2000000, 1180)`,
  )
    .bind(item, tenantA, branchA, id)
    .run();
}

describe('Sprint 43 customer-order D1 constraints', () => {
  it('keeps the backup registry complete and bumps tenant epoch', async () => {
    await expect(assertBackupRegistryComplete(env.DB)).resolves.toBeUndefined();
    const before = await env.DB.prepare(`SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?`)
      .bind(tenantA)
      .first<{ epoch: number }>();
    await insertOrder();
    const after = await env.DB.prepare(`SELECT epoch FROM tenant_data_epochs WHERE tenant_id = ?`)
      .bind(tenantA)
      .first<{ epoch: number }>();
    expect(after?.epoch).toBe((before?.epoch ?? 0) + 2);
  });

  it('rejects cross-tenant parent references opaquely at storage level', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO customer_orders (
           id, tenant_id, branch_id, customer_id, reserved_until,
           idempotency_key, created_by_user_id
         ) VALUES ('cross-tenant-order', ?, ?, 'customer-order-customer-b',
           '2026-08-09T12:00:00.000Z', 'cross-tenant-order', ?)`,
      )
        .bind(tenantB, branchA, userB)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      env.DB.prepare(
        `INSERT INTO customer_order_items (
           id, tenant_id, branch_id, customer_order_id, product_id, product_uom_id,
           uom_code_snapshot, entered_quantity_microunits, factor_numerator,
           factor_denominator, requested_quantity_microunits,
           reserved_quantity_microunits, unit_price_cents
         ) VALUES ('cross-tenant-item', ?, ?, ?, 'customer-order-product-b',
           'customer-order-uom-b', 'NIU', 1000000, 1, 1, 1000000, 1000000, 1500)`,
      )
        .bind(tenantB, branchB, orderId)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('enforces conservation and prevents over-leasing or token reuse', async () => {
    await expect(
      env.DB.prepare(
        `UPDATE customer_order_items
         SET fulfilled_quantity_microunits = 1
         WHERE tenant_id = ? AND id = ?`,
      )
        .bind(tenantA, itemId)
        .run(),
    ).rejects.toThrow(/CHECK/);

    const leaseSql = `INSERT INTO customer_order_fulfillments (
      id, tenant_id, branch_id, customer_order_id, customer_order_item_id,
      terminal_id, terminal_session_id, quantity_microunits, envelope_id, token_hash,
      idempotency_key, request_id, lease_expires_at
    ) VALUES (?, ?, ?, ?, ?, 'customer-order-terminal-a',
      'customer-order-terminal-session-a', ?, ?, ?, ?, ?,
      '2026-08-09T11:00:00.000Z')`;
    await env.DB.prepare(leaseSql)
      .bind(
        'customer-order-lease-1',
        tenantA,
        branchA,
        orderId,
        itemId,
        1_500_000,
        'envelope-1',
        'token-1',
        'lease-1',
        'request-1',
      )
      .run();
    await expect(
      env.DB.prepare(leaseSql)
        .bind(
          'customer-order-lease-2',
          tenantA,
          branchA,
          orderId,
          itemId,
          1_000_000,
          'envelope-2',
          'token-2',
          'lease-2',
          'request-2',
        )
        .run(),
    ).rejects.toThrow(/CUSTOMER_ORDER_FULFILLMENT_EXCEEDS_ITEM/);
    await expect(
      env.DB.prepare(leaseSql)
        .bind(
          'customer-order-lease-3',
          tenantA,
          branchA,
          orderId,
          itemId,
          1,
          'envelope-3',
          'token-1',
          'lease-3',
          'request-3',
        )
        .run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('requires durable notice before expiry and only releases the remainder', async () => {
    const expiryOrder = 'customer-order-expiry';
    const expiryItem = 'customer-order-expiry-item';
    await insertOrder(expiryOrder, expiryItem);
    await env.DB.prepare(
      `UPDATE customer_order_items
       SET fulfilled_quantity_microunits = 500000,
           reserved_quantity_microunits = 1500000
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantA, expiryItem)
      .run();
    await expect(
      env.DB.prepare(
        `UPDATE customer_orders
         SET status = 'EXPIRED', closed_at = CURRENT_TIMESTAMP
         WHERE tenant_id = ? AND id = ?`,
      )
        .bind(tenantA, expiryOrder)
        .run(),
    ).rejects.toThrow(/CUSTOMER_ORDER_EXPIRY_NOTICE_REQUIRED/);
    await env.DB.prepare(
      `INSERT INTO customer_order_notifications (
         id, tenant_id, branch_id, customer_order_id, event_type, channel,
         idempotency_key, provider_send_key
       ) VALUES (
         'customer-order-notice', ?, ?, ?, 'EXPIRY_WARNING', 'IN_APP',
         'notice-1', 'expiry-schema-notice-1'
       )`,
    )
      .bind(tenantA, branchA, expiryOrder)
      .run();
    await env.DB.prepare(
      `UPDATE customer_order_items
       SET released_quantity_microunits = reserved_quantity_microunits,
           reserved_quantity_microunits = 0
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantA, expiryItem)
      .run();
    await env.DB.prepare(
      `UPDATE customer_orders
       SET status = 'EXPIRED', closed_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantA, expiryOrder)
      .run();
    const item = await env.DB.prepare(
      `SELECT fulfilled_quantity_microunits, released_quantity_microunits,
              reserved_quantity_microunits
       FROM customer_order_items WHERE tenant_id = ? AND id = ?`,
    )
      .bind(tenantA, expiryItem)
      .first<{
        fulfilled_quantity_microunits: number;
        released_quantity_microunits: number;
        reserved_quantity_microunits: number;
      }>();
    expect(item).toEqual({
      fulfilled_quantity_microunits: 500_000,
      released_quantity_microunits: 1_500_000,
      reserved_quantity_microunits: 0,
    });
  });

  it('refuses a destructive down while customer-order data exists', async () => {
    await expect(env.DB.exec(DOWN_0036_SPRINT43_CUSTOMER_ORDERS)).rejects.toThrow(
      /CHECK constraint failed/,
    );
    const table = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customer_orders'`,
    ).first<{ name: string }>();
    expect(table?.name).toBe('customer_orders');
  });
});
