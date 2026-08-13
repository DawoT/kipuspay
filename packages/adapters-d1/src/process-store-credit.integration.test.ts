import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  loadExistingStoreCreditTxn,
  loadStoreCreditAccount,
  processStoreCreditAdjustAtomic,
  processStoreCreditIssueAtomic,
} from './process-store-credit-atomic.js';

async function seedStoreCreditFixture(tenantId: string): Promise<{
  branchId: string;
  userId: string;
  customerId: string;
}> {
  const branchId = `b-${tenantId}`;
  const userId = `u-${tenantId}`;
  const customerId = `c-${tenantId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId, 'StoreCredit SAC'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, 'C01', 'Centro', 'Lima')`,
    ).bind(branchId, tenantId),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role) VALUES (?, ?, ?, ?, 'admin')`,
    ).bind(userId, tenantId, branchId, `${tenantId}@example.com`),
    env.DB.prepare(
      `INSERT INTO customers (
           id, tenant_id, document_type_code, document_number, name, profile_updated_at, is_active
         ) VALUES (?, ?, '1', '12345678', 'Cliente Tienda', '2026-08-01T00:00:00.000Z', 1)`,
    ).bind(customerId, tenantId),
  ]);
  return { branchId, userId, customerId };
}

async function openBalanceCents(tenantId: string, customerId: string): Promise<number> {
  const acc = await loadStoreCreditAccount(env.DB, tenantId, customerId);
  return acc?.balance_cents ?? -1;
}

describe('store-credit idempotencia (47b / B3)', () => {
  it('ADJUST con idempotencyKey: retry devuelve ALREADY_ADJUSTED y NO doble débito', async () => {
    const tenantId = 't-sc-idem';
    const { branchId, userId, customerId } = await seedStoreCreditFixture(tenantId);
    await processStoreCreditIssueAtomic(
      env.DB,
      tenantId,
      userId,
      {
        branchId,
        customerId,
        amountCents: 10000,
        sourceRef: 'issue:seed:1',
      },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
    );

    const key = 'adj-key-001';
    const input = {
      customerId,
      branchId,
      amountCents: 2000,
      adjustSign: 'DEBIT' as const,
      authorizedByUserId: userId,
      idempotencyKey: key,
    };
    const first = await processStoreCreditAdjustAtomic(env.DB, tenantId, userId, input, {
      nowMs: Date.parse('2026-08-04T16:00:00.000Z'),
    });
    expect(first.status).toBe('SUCCESS');
    expect(await openBalanceCents(tenantId, customerId)).toBe(8000);

    // Retry del mismo ajuste (timeout de red → reintento): nowMs distinto.
    const retry = await processStoreCreditAdjustAtomic(env.DB, tenantId, userId, input, {
      nowMs: Date.parse('2026-08-04T16:00:05.000Z'),
    });
    expect(retry.status).toBe('ALREADY_ADJUSTED');
    expect(retry.txnId).toBe(first.txnId);
    expect(await openBalanceCents(tenantId, customerId)).toBe(8000);

    const txns = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM store_credit_transactions
         WHERE tenant_id = ? AND type = 'ADJUST'`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(txns?.n).toBe(1);
  });

  it('ADJUST concurrente con la misma idempotencyKey: exactamente un asiento', async () => {
    const tenantId = 't-sc-race';
    const { branchId, userId, customerId } = await seedStoreCreditFixture(tenantId);
    await processStoreCreditIssueAtomic(
      env.DB,
      tenantId,
      userId,
      { branchId, customerId, amountCents: 10000, sourceRef: 'issue:seed:2' },
      { nowMs: Date.parse('2026-08-04T15:00:00.000Z') },
    );

    const key = 'adj-key-race';
    const input = {
      customerId,
      branchId,
      amountCents: 3000,
      adjustSign: 'DEBIT' as const,
      authorizedByUserId: userId,
      idempotencyKey: key,
    };
    const results = await Promise.allSettled([
      processStoreCreditAdjustAtomic(env.DB, tenantId, userId, input, {
        nowMs: Date.parse('2026-08-04T16:00:00.000Z'),
      }),
      processStoreCreditAdjustAtomic(env.DB, tenantId, userId, input, {
        nowMs: Date.parse('2026-08-04T16:00:00.000Z'),
      }),
    ]);
    const successes = results.filter((r) => r.status === 'fulfilled').length;
    expect(successes).toBeGreaterThanOrEqual(1);
    expect(await openBalanceCents(tenantId, customerId)).toBe(7000);

    const txns = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM store_credit_transactions
         WHERE tenant_id = ? AND type = 'ADJUST'`,
    )
      .bind(tenantId)
      .first<{ n: number }>();
    expect(txns?.n).toBe(1);
    const sourceRef = await loadExistingStoreCreditTxn(env.DB, tenantId, `adjust:${key}`);
    expect(sourceRef).not.toBeNull();
  });
});

describe('S35-H2: audit del ajuste con action correcta', () => {
  it('ADJUST audita STORE_CREDIT_ADJUST (no ISSUE)', async () => {
    const tenantId = 't-s35-adjust-audit';
    const { branchId, userId, customerId } = await seedStoreCreditFixture(tenantId);
    const result = await processStoreCreditAdjustAtomic(
      env.DB,
      tenantId,
      userId,
      {
        customerId,
        branchId,
        amountCents: 500,
        adjustSign: 'CREDIT',
        idempotencyKey: 'adjust-s35-audit',
        authorizedByUserId: userId,
      },
      { nowMs: Date.parse('2026-08-04T16:00:00.000Z') },
    );
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') return;

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_events
       WHERE tenant_id = ? AND action LIKE 'STORE_CREDIT%'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
      .bind(tenantId)
      .first<{ action: string }>();
    expect(audit?.action).toBe('STORE_CREDIT_ADJUST');
  });
});
