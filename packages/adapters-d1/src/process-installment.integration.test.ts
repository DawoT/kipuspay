import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  processInstallmentPayAtomic,
  processInstallmentPlanAtomic,
} from './process-installment-atomic.js';

async function seedInstallmentFixture(tenantId: string): Promise<{
  branchId: string;
  sessionId: string;
  userId: string;
  supervisorId: string;
  customerId: string;
  saleId: string;
  arId: string;
  paymentMethodId: string;
}> {
  const branchId = `b-${tenantId}`;
  const registerId = `cr-${tenantId}`;
  const userId = `u-${tenantId}`;
  const supervisorId = `super-${tenantId}`;
  const sessionId = `s-${tenantId}`;
  const customerId = `c-${tenantId}`;
  const saleId = `sale-${tenantId}`;
  const arId = `ar-${tenantId}`;
  const paymentMethodId = `pm-${tenantId}`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tenants (id, business_name, vertical_type, shard_id, formalization_mode)
       VALUES (?, ?, 'retail', 'shard-1', 'INTERNAL_CONTROL')`,
    ).bind(tenantId, 'Cuotas SAC'),
    env.DB.prepare(
      `INSERT INTO branches (id, tenant_id, code, name, address) VALUES (?, ?, 'C01', 'Centro', 'Lima')`,
    ).bind(branchId, tenantId),
    env.DB.prepare(
      `INSERT INTO cash_registers (id, tenant_id, branch_id, name) VALUES (?, ?, ?, 'Caja 1')`,
    ).bind(registerId, tenantId, branchId),
    env.DB.prepare(
      `INSERT INTO users (id, tenant_id, branch_id, email, role)
       VALUES (?, ?, ?, ?, 'cashier'), (?, ?, ?, ?, 'admin')`,
    ).bind(
      userId,
      tenantId,
      branchId,
      `${tenantId}@example.com`,
      supervisorId,
      tenantId,
      branchId,
      `super-${tenantId}@example.com`,
    ),
    env.DB.prepare(
      `INSERT INTO cash_register_sessions
         (id, tenant_id, branch_id, cash_register_id, user_id, opening_balance_cents, status)
       VALUES (?, ?, ?, ?, ?, 0, 'OPEN')`,
    ).bind(sessionId, tenantId, branchId, registerId, userId),
    env.DB.prepare(
      `INSERT INTO customers (id, tenant_id, document_type_code, document_number, name, credit_limit_cents)
       VALUES (?, ?, '1', '12345678', 'Cliente Cuotas', 2000000)`,
    ).bind(customerId, tenantId),
    env.DB.prepare(
      `INSERT INTO sales (
         id, tenant_id, branch_id, cash_register_session_id, user_id, customer_id,
         client_document_type, client_document_number, client_name,
         document_type, series, number, currency, exchange_rate,
         total_taxable_cents, total_exempt_cents, total_igv_cents, total_icbper_cents,
         total_discount_cents, total_cogs_cents, total_amount_cents,
         issued_at_lima, sunat_status, must_submit_by
       ) VALUES (?, ?, ?, ?, ?, ?, '1', '12345678', 'Cliente Cuotas',
         '03', 'B001', 1, 'PEN', 1.0, 8475, 0, 1525, 0, 0, 0, 10000,
         '2026-08-08T15:00:00', 'PENDING', '2026-08-08T16:00:00')`,
    ).bind(saleId, tenantId, branchId, sessionId, userId, customerId),
    env.DB.prepare(
      `INSERT INTO accounts_receivable (
         id, tenant_id, customer_id, sale_id, original_amount_cents,
         balance_due_cents, due_date, status, created_at
       ) VALUES (?, ?, ?, ?, 10000, 10000, '2026-09-08', 'OPEN', '2026-08-08T15:00:00')`,
    ).bind(arId, tenantId, customerId, saleId),
    env.DB.prepare(
      `INSERT INTO payment_methods (id, tenant_id, code, name) VALUES (?, ?, 'CASH', 'Efectivo')`,
    ).bind(paymentMethodId, tenantId),
  ]);

  return { branchId, sessionId, userId, supervisorId, customerId, saleId, arId, paymentMethodId };
}

describe('processInstallmentPlanAtomic / processInstallmentPayAtomic (Sprint 36)', () => {
  it('planifica el schedule y paga la primera cuota con solo principal en AR', async () => {
    const fixture = await seedInstallmentFixture('t-inst-ok');
    const plan = await processInstallmentPlanAtomic(env.DB, 't-inst-ok', fixture.supervisorId, {
      saleId: fixture.saleId,
      branchId: fixture.branchId,
      downPaymentCents: 0,
      items: [
        {
          installmentNumber: 1,
          principalCents: 5000,
          interestCents: 100,
          dueDateIso: '2026-08-22',
        },
        {
          installmentNumber: 2,
          principalCents: 5000,
          interestCents: 0,
          dueDateIso: '2026-09-08',
        },
      ],
      actorIsSupervisorOrAbove: true,
    });

    expect(plan.schedulePrincipalCents).toBe(10000);
    expect(plan.installmentIds).toHaveLength(2);

    const rows = await env.DB.prepare(
      `SELECT installment_number, principal_cents, interest_cents, status
       FROM sale_installments WHERE tenant_id = ? AND sale_id = ? ORDER BY installment_number`,
    )
      .bind('t-inst-ok', fixture.saleId)
      .all<{
        installment_number: number;
        principal_cents: number;
        interest_cents: number;
        status: string;
      }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]?.status).toBe('PENDING');

    const pay = await processInstallmentPayAtomic(env.DB, 't-inst-ok', fixture.userId, {
      installmentId: plan.installmentIds[0]!,
      branchId: fixture.branchId,
      cashRegisterSessionId: fixture.sessionId,
      paymentMethod: 'cash',
      idempotencyKey: 'idem-inst-ok',
      actorIsSupervisorOrAbove: true,
    });

    expect(pay.alreadyPaid).toBe(false);
    expect(pay.appliedToArCents).toBe(5000);
    expect(pay.interestCents).toBe(100);

    const paid = await env.DB.prepare(
      `SELECT status FROM sale_installments WHERE tenant_id = ? AND id = ?`,
    )
      .bind('t-inst-ok', plan.installmentIds[0])
      .first<{ status: string }>();
    expect(paid?.status).toBe('PAID');

    const ar = await env.DB.prepare(
      `SELECT balance_due_cents FROM accounts_receivable WHERE tenant_id = ? AND id = ?`,
    )
      .bind('t-inst-ok', fixture.arId)
      .first<{ balance_due_cents: number }>();
    expect(ar?.balance_due_cents).toBe(5000);
  });

  it('reintento con misma idempotency_key es idempotente (no doble efecto)', async () => {
    const fixture = await seedInstallmentFixture('t-inst-idem');
    const plan = await processInstallmentPlanAtomic(env.DB, 't-inst-idem', fixture.supervisorId, {
      saleId: fixture.saleId,
      branchId: fixture.branchId,
      downPaymentCents: 0,
      items: [
        {
          installmentNumber: 1,
          principalCents: 10000,
          interestCents: 0,
          dueDateIso: '2026-09-08',
        },
      ],
      actorIsSupervisorOrAbove: true,
    });

    const input = {
      installmentId: plan.installmentIds[0]!,
      branchId: fixture.branchId,
      cashRegisterSessionId: fixture.sessionId,
      paymentMethod: 'cash',
      idempotencyKey: 'idem-inst-dup',
      actorIsSupervisorOrAbove: true,
    };
    const first = await processInstallmentPayAtomic(env.DB, 't-inst-idem', fixture.userId, input);
    const second = await processInstallmentPayAtomic(env.DB, 't-inst-idem', fixture.userId, input);

    expect(second.alreadyPaid).toBe(true);
    expect(second.paymentId).toBe(first.paymentId);

    const n = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM sale_installment_payments WHERE tenant_id = ?`,
    )
      .bind('t-inst-idem')
      .first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('rechaza plan con schedule de cajero (no supervisor)', async () => {
    const fixture = await seedInstallmentFixture('t-inst-forbid');
    await expect(
      processInstallmentPlanAtomic(env.DB, 't-inst-forbid', fixture.userId, {
        saleId: fixture.saleId,
        branchId: fixture.branchId,
        downPaymentCents: 0,
        items: [
          {
            installmentNumber: 1,
            principalCents: 10000,
            interestCents: 0,
            dueDateIso: '2026-09-08',
          },
        ],
        actorIsSupervisorOrAbove: false,
      }),
    ).rejects.toThrow('INSTALLMENT_FORBIDDEN');
  });

  it('rechaza plan duplicado sobre la misma venta', async () => {
    const fixture = await seedInstallmentFixture('t-inst-dup');
    const input = {
      saleId: fixture.saleId,
      branchId: fixture.branchId,
      downPaymentCents: 0,
      items: [
        {
          installmentNumber: 1,
          principalCents: 10000,
          interestCents: 0,
          dueDateIso: '2026-09-08',
        },
      ],
      actorIsSupervisorOrAbove: true,
    };
    await processInstallmentPlanAtomic(env.DB, 't-inst-dup', fixture.supervisorId, input);
    await expect(
      processInstallmentPlanAtomic(env.DB, 't-inst-dup', fixture.supervisorId, input),
    ).rejects.toThrow('INSTALLMENT_PLAN_EXISTS');
  });
});
