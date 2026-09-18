import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { runKdsPendingHttp } from '../../../apps/worker-api/src/orders/order-routes.js';
import type { WorkerEnv } from '../../../apps/worker-api/src/auth/control-plane.js';

const tenantA = 'kds-replay-tenant-a';
const tenantB = 'kds-replay-tenant-b';
const branchA = 'kds-replay-branch-a';
const branchAOther = 'kds-replay-branch-a-other';
const branchB = 'kds-replay-branch-b';

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type) VALUES (?, 'KDS A', 'restaurants')`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type) VALUES (?, 'KDS B', 'restaurants')`,
    ).bind(tenantB),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, 'KA', 'KDS A', 'Lima')`,
    ).bind(branchA, tenantA),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, 'KX', 'KDS A other', 'Lima')`,
    ).bind(branchAOther, tenantA),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, 'KB', 'KDS B', 'Lima')`,
    ).bind(branchB, tenantB),
    env.DB.prepare(
      `INSERT INTO tenant_capabilities (tenant_id, capability, enabled, config_json) VALUES (?, 'orders.kds', 1, '{}')`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO tenant_capabilities (tenant_id, capability, enabled, config_json) VALUES (?, 'orders.kds', 1, '{}')`,
    ).bind(tenantB),
  ]);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO orders (id, tenant_id, branch_id, table_label, status, opened_by_user_id) VALUES ('kds-order-ready', ?, ?, '4', 'READY', 'test-owner')`,
    ).bind(tenantA, branchA),
    env.DB.prepare(
      `INSERT INTO orders (id, tenant_id, branch_id, table_label, status, opened_by_user_id) VALUES ('kds-order-in-progress', ?, ?, '5', 'FIRED', 'test-owner')`,
    ).bind(tenantA, branchA),
    env.DB.prepare(
      `INSERT INTO orders (id, tenant_id, branch_id, table_label, status, opened_by_user_id) VALUES ('kds-order-other-tenant', ?, ?, '9', 'READY', 'test-owner')`,
    ).bind(tenantB, branchB),
    env.DB.prepare(
      `INSERT INTO orders (id, tenant_id, branch_id, table_label, status, opened_by_user_id) VALUES ('kds-order-other-branch', ?, ?, '8', 'READY', 'test-owner')`,
    ).bind(tenantA, branchAOther),
    env.DB.prepare(
      `INSERT INTO order_items (id, tenant_id, order_id, product_id, product_name, quantity, quantity_microunits, unit_price_cents, status) VALUES ('kds-item-ready', ?, 'kds-order-ready', 'product-ready', 'Plato listo', 1, 1000000, 2500, 'READY')`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO order_items (id, tenant_id, order_id, product_id, product_name, quantity, quantity_microunits, unit_price_cents, status) VALUES ('kds-item-preparing', ?, 'kds-order-in-progress', 'product-preparing', 'Plato en fuego', 1, 1000000, 3000, 'FIRED')`,
    ).bind(tenantA),
    env.DB.prepare(
      `INSERT INTO order_items (id, tenant_id, order_id, product_id, product_name, quantity, quantity_microunits, unit_price_cents, status) VALUES ('kds-item-other-tenant', ?, 'kds-order-other-tenant', 'product-secret', 'No filtrar', 1, 1000000, 9999, 'READY')`,
    ).bind(tenantB),
    env.DB.prepare(
      `INSERT INTO order_items (id, tenant_id, order_id, product_id, product_name, quantity, quantity_microunits, unit_price_cents, status) VALUES ('kds-item-other-branch', ?, 'kds-order-other-branch', 'product-other-branch', 'Otra sucursal', 1, 1000000, 9999, 'READY')`,
    ).bind(tenantA),
  ]);
});

describe('KDS pending replay in D1', () => {
  it('replays READY and FIRED work while preserving tenant and branch isolation', async () => {
    const result = await runKdsPendingHttp({ DB: env.DB } as WorkerEnv, tenantA, branchA, [
      branchA,
    ]);

    expect(result.status).toBe(200);
    const orders = result.body.orders as Array<{
      id: string;
      items: Array<{ id: string; status: string }>;
    }>;
    expect(orders).toHaveLength(2);
    expect(orders.find((order) => order.id === 'kds-order-ready')?.items).toEqual([
      expect.objectContaining({ id: 'kds-item-ready', status: 'READY' }),
    ]);
    expect(orders.find((order) => order.id === 'kds-order-in-progress')?.items).toEqual([
      expect.objectContaining({ id: 'kds-item-preparing', status: 'FIRED' }),
    ]);
    expect(JSON.stringify(result.body)).not.toContain('kds-order-other-tenant');
    expect(JSON.stringify(result.body)).not.toContain('No filtrar');
    expect(JSON.stringify(result.body)).not.toContain('kds-order-other-branch');
    expect(JSON.stringify(result.body)).not.toContain('Otra sucursal');
  });
});
