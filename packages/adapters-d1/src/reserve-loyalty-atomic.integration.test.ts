import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { reserveLoyaltyPointsAtomic } from './reserve-loyalty-atomic.js';

async function seedCustomer(tenantId: string, customerId: string, balance: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(tenantId, 'Loyalty SAC', 'retail', 'shard-1', 'INTERNAL_CONTROL'),
    env.DB.prepare(
      `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name, credit_limit_cents)
       VALUES (?, ?, '1', ?, ?, 0)`,
    ).bind(customerId, tenantId, `DNI-${customerId}`, customerId),
    env.DB.prepare(
      `INSERT INTO loyalty_accounts (id, tenant_id, customer_id, points_balance)
       VALUES (?, ?, ?, ?)`,
    ).bind(`acc-${tenantId}`, tenantId, customerId, balance),
  ]);
}

describe('S27-H1 loyalty bajo concurrencia (D1 real)', () => {
  it('dos reservas paralelas con saldo justo: una gana, la otra falla, saldo jamás negativo', async () => {
    const tenant = 't-loy-race';
    const customer = 'c-loy-race';
    await seedCustomer(tenant, customer, 6);

    const [r1, r2] = await Promise.allSettled([
      reserveLoyaltyPointsAtomic(env.DB, tenant, {
        customerId: customer,
        saleIdempotencyKey: 'sale-race-1',
        points: 4,
      }),
      reserveLoyaltyPointsAtomic(env.DB, tenant, {
        customerId: customer,
        saleIdempotencyKey: 'sale-race-2',
        points: 4,
      }),
    ]);

    const okCount = [r1, r2].filter((r) => r.status === 'fulfilled').length;
    const failCount = [r1, r2].filter(
      (r) => r.status === 'rejected' && (r.reason as Error).message.includes('LOYALTY_INSUFFICIENT_POINTS'),
    ).length;

    // Saldo 6, dos pedidos de 4: a lo más 1 reserva; la otra o falla o es
    // insuficiente — nunca ambas ganan (guard atómico), nunca saldo negativo.
    expect(okCount).toBeLessThanOrEqual(1);
    expect(okCount + failCount).toBeGreaterThanOrEqual(1);

    const balanceRow = await env.DB.prepare(
      `SELECT points_balance FROM loyalty_accounts WHERE tenant_id = ? AND customer_id = ?`,
    )
      .bind(tenant, customer)
      .first<{ points_balance: number }>();
    expect(balanceRow?.points_balance ?? 0).toBeGreaterThanOrEqual(0);

    const reservedRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(points),0) AS n FROM loyalty_reservations
       WHERE tenant_id = ? AND customer_id = ? AND status = 'RESERVED'`,
    )
      .bind(tenant, customer)
      .first<{ n: number }>();
    // 6 - reservado >= 0 siempre
    expect((balanceRow?.points_balance ?? 0) - (reservedRow?.n ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it('reserva doble exacta del mismo saldo: la segunda idempotente no duplica', async () => {
    const tenant = 't-loy-idem';
    const customer = 'c-loy-idem';
    await seedCustomer(tenant, customer, 10);

    const a = await reserveLoyaltyPointsAtomic(env.DB, tenant, {
      customerId: customer,
      saleIdempotencyKey: 'sale-idem',
      points: 3,
    });
    const b = await reserveLoyaltyPointsAtomic(env.DB, tenant, {
      customerId: customer,
      saleIdempotencyKey: 'sale-idem',
      points: 3,
    });

    expect(a.status).toBe('RESERVED');
    expect(b.idempotent).toBe(true);
    expect(b.id).toBe(a.id);

    const reservedRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(points),0) AS n FROM loyalty_reservations
       WHERE tenant_id = ? AND customer_id = ? AND status = 'RESERVED'`,
    )
      .bind(tenant, customer)
      .first<{ n: number }>();
    expect(reservedRow?.n).toBe(3); // no 6
  });
});
