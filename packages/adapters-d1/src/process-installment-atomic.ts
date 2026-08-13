/**
 * Cuotas ACID — Sprint 36 / ADR-0020 / §5.3 regla 21 / COM-06.
 * Un db.batch por plan/pay. Solo principal reduce AR.
 */
import { requireLiveAuthToken } from './auth-tokens.js';
import {
  assertCreditWithinLimit,
  planInstallmentPayJournal,
  planPayAr,
} from '@kipuspay/domain-cash';
import {
  markInstallmentOverdue,
  planInstallmentPay,
  planInstallmentSchedule,
  shouldCancelInstallmentsOnArClosed,
  type InstallmentScheduleItemInput,
  type InstallmentStatus,
} from '@kipuspay/domain-sales';
import { runD1AtomicPlan, type D1Bound, type D1DatabaseLike } from './index.js';
import { sha256HexOf } from './crypto.js';
import {
  appendJournalToPlan,
  loadChartAccountsByCode,
  type JournalPlanSink,
} from './journal-post.js';

export interface ProcessInstallmentOptions {
  readonly ledgerChartOfAccountsEnabled?: boolean;
  readonly nowMs?: number;
}

export interface InstallmentPlanItemInput {
  readonly installmentNumber: number;
  readonly principalCents: number;
  readonly interestCents: number;
  readonly dueDateIso: string;
}

export interface ProcessInstallmentPlanInput {
  readonly saleId: string;
  readonly branchId: string;
  readonly downPaymentCents: number;
  readonly items: readonly InstallmentPlanItemInput[];
  readonly creditOverrideTokenHash?: string | null;
  readonly actorIsSupervisorOrAbove: boolean;
}

export interface ProcessInstallmentPayInput {
  readonly installmentId: string;
  readonly branchId: string;
  readonly cashRegisterSessionId: string;
  readonly paymentMethod: string;
  readonly idempotencyKey: string;
  readonly actorIsSupervisorOrAbove: boolean;
  readonly clientPrincipalCents?: number;
  readonly clientInterestCents?: number;
}

export async function previousInstallmentAuditHash(
  db: D1DatabaseLike,
  tenantId: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

export function appendCancelPendingInstallmentsOnArClosed(
  plan: { add(statement: D1Bound): unknown },
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly saleId: string;
    readonly nextArBalanceCents: number;
  },
): void {
  if (!shouldCancelInstallmentsOnArClosed({ nextArBalanceCents: input.nextArBalanceCents })) {
    return;
  }
  plan.add(
    db
      .prepare(
        `UPDATE sale_installments
         SET status = 'CANCELLED'
         WHERE tenant_id = ? AND sale_id = ? AND status IN ('PENDING','OVERDUE')`,
      )
      .bind(input.tenantId, input.saleId),
  );
}

export async function appendInstallmentPlanToBatch(
  plan: JournalPlanSink,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly branchId: string;
    readonly saleId: string;
    readonly saleTotalCents: number;
    readonly downPaymentCents: number;
    readonly items: readonly InstallmentScheduleItemInput[];
    readonly prevAuditHash: string | null;
  },
): Promise<{ installmentIds: string[]; rowHash: string }> {
  const schedule = planInstallmentSchedule({
    saleTotalCents: input.saleTotalCents,
    downPaymentCents: input.downPaymentCents,
    items: input.items,
  });
  const installmentIds: string[] = [];
  for (const item of schedule.items) {
    const id = crypto.randomUUID();
    installmentIds.push(id);
    plan.add(
      db
        .prepare(
          `INSERT INTO sale_installments (
               id, tenant_id, sale_id, installment_number, principal_cents, interest_cents,
               amount_cents, due_date, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        )
        .bind(
          id,
          input.tenantId,
          input.saleId,
          item.installmentNumber,
          item.principalCents,
          item.interestCents,
          item.amountCents,
          item.dueDateIso,
        ),
    );
  }
  const auditId = crypto.randomUUID();
  const rowHash = await sha256HexOf({
    action: 'INSTALLMENT',
    entity_id: input.saleId,
    count: installmentIds.length,
    principal: schedule.schedulePrincipalCents,
    prev: input.prevAuditHash,
  });
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'INSTALLMENT', 'sale_installments', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        input.tenantId,
        input.branchId,
        input.userId,
        input.saleId,
        JSON.stringify({
          saleId: input.saleId,
          downPaymentCents: schedule.downPaymentCents,
          schedulePrincipalCents: schedule.schedulePrincipalCents,
          installmentIds,
        }),
        input.prevAuditHash,
        rowHash,
      ),
  );
  return { installmentIds, rowHash };
}

export async function processInstallmentPlanAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessInstallmentPlanInput,
  options: ProcessInstallmentOptions = {},
): Promise<{ saleId: string; installmentIds: string[]; schedulePrincipalCents: number }> {
  if (!input.actorIsSupervisorOrAbove) throw new Error('INSTALLMENT_FORBIDDEN');
  const sale = await db
    .prepare(
      `SELECT id, total_amount_cents, customer_id, branch_id
       FROM sales WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(tenantId, input.saleId)
    .first<{
      id: string;
      total_amount_cents: number;
      customer_id: string | null;
      branch_id: string;
    }>();
  if (!sale) throw new Error('INSTALLMENT_SALE_NOT_FOUND');
  if (!sale.customer_id) throw new Error('INSTALLMENT_CUSTOMER_REQUIRED');

  const existing = await db
    .prepare(`SELECT id FROM sale_installments WHERE tenant_id = ? AND sale_id = ? LIMIT 1`)
    .bind(tenantId, input.saleId)
    .first<{ id: string }>();
  if (existing) throw new Error('INSTALLMENT_PLAN_EXISTS');

  const ar = await db
    .prepare(
      `SELECT id, balance_due_cents FROM accounts_receivable
       WHERE tenant_id = ? AND sale_id = ? LIMIT 1`,
    )
    .bind(tenantId, input.saleId)
    .first<{ id: string; balance_due_cents: number }>();
  if (!ar || ar.balance_due_cents <= 0) throw new Error('INSTALLMENT_AR_CLOSED');

  const openAr = await db
    .prepare(
      `SELECT COALESCE(SUM(balance_due_cents), 0) AS open_cents
       FROM accounts_receivable
       WHERE tenant_id = ? AND customer_id = ? AND id != ? AND balance_due_cents > 0`,
    )
    .bind(tenantId, sale.customer_id, ar.id)
    .first<{ open_cents: number }>();
  const cust = await db
    .prepare(`SELECT credit_limit_cents FROM customers WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, sale.customer_id)
    .first<{ credit_limit_cents: number | null }>();
  // S36-H1: el override de límite de crédito exige token REAL verificado y
  // consumido server-side (mismo mecanismo que la venta offline, SEC-09).
  // Nunca un string libre del cliente reutilizable.
  const creditTokenHash = input.creditOverrideTokenHash?.trim() ?? null;
  if (creditTokenHash) {
    const tokenId = await requireLiveAuthToken(db, tenantId, creditTokenHash);
    await db
      .prepare(`UPDATE authorization_tokens SET used_at = datetime('now') WHERE id = ?`)
      .bind(tokenId)
      .run();
  }

  assertCreditWithinLimit({
    creditLimitCents: cust?.credit_limit_cents ?? 0,
    openArBalanceCents: openAr?.open_cents ?? 0,
    saleAmountCents: ar.balance_due_cents,
    creditOverrideTokenHash: creditTokenHash,
  });

  const schedule = planInstallmentSchedule({
    saleTotalCents: sale.total_amount_cents,
    downPaymentCents: input.downPaymentCents,
    items: input.items,
  });
  if (schedule.schedulePrincipalCents !== ar.balance_due_cents) {
    throw new Error('INSTALLMENT_PRINCIPAL_MISMATCH');
  }

  const prevHash = await previousInstallmentAuditHash(db, tenantId);
  let installmentIds: string[] = [];
  await runD1AtomicPlan(db, async (plan) => {
    const posted = await appendInstallmentPlanToBatch(plan, db, {
      tenantId,
      userId,
      branchId: input.branchId || sale.branch_id,
      saleId: input.saleId,
      saleTotalCents: sale.total_amount_cents,
      downPaymentCents: input.downPaymentCents,
      items: input.items,
      prevAuditHash: prevHash,
    });
    installmentIds = posted.installmentIds;
  });
  void options.nowMs;
  return {
    saleId: input.saleId,
    installmentIds,
    schedulePrincipalCents: schedule.schedulePrincipalCents,
  };
}

export async function processInstallmentPayAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessInstallmentPayInput,
  options: ProcessInstallmentOptions = {},
): Promise<{
  paymentId: string;
  installmentId: string;
  appliedToArCents: number;
  interestCents: number;
  alreadyPaid: boolean;
}> {
  const chartOn = options.ledgerChartOfAccountsEnabled === true;
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const existingPay = await db
    .prepare(
      `SELECT id, sale_installment_id, amount_cents FROM sale_installment_payments
       WHERE tenant_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(tenantId, input.idempotencyKey.trim())
    .first<{ id: string; sale_installment_id: string; amount_cents: number }>();
  if (existingPay) {
    const inst = await db
      .prepare(
        `SELECT principal_cents, interest_cents FROM sale_installments
         WHERE tenant_id = ? AND id = ? LIMIT 1`,
      )
      .bind(tenantId, existingPay.sale_installment_id)
      .first<{ principal_cents: number; interest_cents: number }>();
    return {
      paymentId: existingPay.id,
      installmentId: existingPay.sale_installment_id,
      appliedToArCents: inst?.principal_cents ?? 0,
      interestCents: inst?.interest_cents ?? 0,
      alreadyPaid: true,
    };
  }

  const row = await db
    .prepare(
      `SELECT id, sale_id, principal_cents, interest_cents, amount_cents, due_date, status
       FROM sale_installments WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, input.installmentId)
    .first<{
      id: string;
      sale_id: string;
      principal_cents: number;
      interest_cents: number;
      amount_cents: number;
      due_date: string;
      status: string;
    }>();
  if (!row) throw new Error('INSTALLMENT_NOT_FOUND');

  const overdueStatus = markInstallmentOverdue({
    status: row.status as InstallmentStatus,
    dueDateIso: row.due_date,
    nowIso,
  });

  const ar = await db
    .prepare(
      `SELECT id, balance_due_cents FROM accounts_receivable
       WHERE tenant_id = ? AND sale_id = ? LIMIT 1`,
    )
    .bind(tenantId, row.sale_id)
    .first<{ id: string; balance_due_cents: number }>();
  if (!ar) throw new Error('INSTALLMENT_AR_CLOSED');

  const payPlan = planInstallmentPay({
    status: overdueStatus,
    dueDateIso: row.due_date,
    nowIso,
    principalCents: row.principal_cents,
    interestCents: row.interest_cents,
    amountCents: row.amount_cents,
    arBalanceDueCents: ar.balance_due_cents,
    actorIsSupervisorOrAbove: input.actorIsSupervisorOrAbove,
    idempotencyKey: input.idempotencyKey,
    ...(input.clientPrincipalCents !== undefined
      ? { clientPrincipalCents: input.clientPrincipalCents }
      : {}),
    ...(input.clientInterestCents !== undefined
      ? { clientInterestCents: input.clientInterestCents }
      : {}),
  });

  const arPay = planPayAr({
    paymentId: crypto.randomUUID(),
    accountsReceivableId: ar.id,
    amountCents: payPlan.appliedToArCents,
    currentBalanceCents: ar.balance_due_cents,
    paymentMethod: input.paymentMethod,
    collectedByUserId: userId,
    cashRegisterSessionId: input.cashRegisterSessionId,
  });

  const paymentId = crypto.randomUUID();
  const prevHash = await previousInstallmentAuditHash(db, tenantId);
  const accounts = chartOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const postDate = nowIso.slice(0, 10);

  await runD1AtomicPlan(db, async (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE sale_installments
           SET status = 'PAID', paid_at = ?
           WHERE tenant_id = ? AND id = ? AND status IN ('PENDING','OVERDUE')`,
        )
        .bind(nowIso.slice(0, 19).replace('T', ' '), tenantId, row.id),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO sale_installment_payments (
               id, tenant_id, sale_installment_id, amount_cents, idempotency_key,
               payment_method, cash_register_session_id, collected_by_user_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          paymentId,
          tenantId,
          row.id,
          payPlan.amountCents,
          input.idempotencyKey.trim(),
          input.paymentMethod,
          input.cashRegisterSessionId,
          userId,
        ),
    );
    if (payPlan.appliedToArCents > 0) {
      plan.add(
        db
          .prepare(
            `INSERT INTO accounts_receivable_payments (
                 id, accounts_receivable_id, amount_cents, payment_method,
                 cash_register_session_id, collected_by_user_id
               ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            arPay.paymentId,
            arPay.accountsReceivableId,
            arPay.amountCents,
            arPay.paymentMethod,
            arPay.cashRegisterSessionId,
            arPay.collectedByUserId,
          ),
      );
      plan.add(
        db
          .prepare(
            `UPDATE accounts_receivable
             SET balance_due_cents = ?, status = ?
             WHERE id = ? AND tenant_id = ? AND balance_due_cents > 0`,
          )
          .bind(arPay.nextBalanceCents, arPay.nextStatus, arPay.accountsReceivableId, tenantId),
      );
    }
    if (input.paymentMethod === 'cash') {
      plan.add(
        db
          .prepare(
            `INSERT INTO cash_register_cash_movements (
                 id, tenant_id, branch_id, cash_register_session_id, movement_type,
                 amount_cents, counterparty_ref, reason, created_by_user_id
               ) VALUES (?, ?, ?, ?, 'CHANGE_FUND_IN', ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            input.branchId,
            input.cashRegisterSessionId,
            payPlan.amountCents,
            row.id,
            'pago cuota',
            userId,
          ),
      );
    }
    const auditId = crypto.randomUUID();
    const rowHash = await sha256HexOf({
      action: 'INSTALLMENT',
      entity_id: paymentId,
      installment_id: row.id,
      principal: payPlan.appliedToArCents,
      interest: payPlan.interestCents,
      prev: prevHash,
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'INSTALLMENT', 'sale_installment_payment', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          input.branchId,
          userId,
          paymentId,
          JSON.stringify({
            installmentId: row.id,
            appliedToArCents: payPlan.appliedToArCents,
            interestCents: payPlan.interestCents,
            idempotencyKey: input.idempotencyKey.trim(),
          }),
          prevHash,
          rowHash,
        ),
    );
    if (chartOn) {
      await appendJournalToPlan(plan, db, {
        tenantId,
        branchId: input.branchId,
        userId,
        accountsByCode: accounts,
        prevAuditHash: rowHash,
        entry: planInstallmentPayJournal({
          sourceId: paymentId,
          postDate,
          principalCents: payPlan.appliedToArCents,
          interestCents: payPlan.interestCents,
        }),
      });
    }
  });

  return {
    paymentId,
    installmentId: row.id,
    appliedToArCents: payPlan.appliedToArCents,
    interestCents: payPlan.interestCents,
    alreadyPaid: false,
  };
}

export async function listOverdueInstallments(
  db: D1DatabaseLike,
  tenantId: string,
  nowIso: string,
): Promise<
  readonly {
    id: string;
    saleId: string;
    installmentNumber: number;
    amountCents: number;
    dueDate: string;
    status: string;
  }[]
> {
  const today = nowIso.slice(0, 10);
  await db
    .prepare(
      `UPDATE sale_installments
       SET status = 'OVERDUE'
       WHERE tenant_id = ? AND status = 'PENDING' AND due_date < ?`,
    )
    .bind(tenantId, today)
    .run();
  const rows = await db
    .prepare(
      `SELECT id, sale_id, installment_number, amount_cents, due_date, status
       FROM sale_installments
       WHERE tenant_id = ? AND status = 'OVERDUE'
       ORDER BY due_date ASC, installment_number ASC
       LIMIT 100`,
    )
    .bind(tenantId)
    .all<{
      id: string;
      sale_id: string;
      installment_number: number;
      amount_cents: number;
      due_date: string;
      status: string;
    }>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    saleId: r.sale_id,
    installmentNumber: r.installment_number,
    amountCents: r.amount_cents,
    dueDate: r.due_date,
    status: r.status,
  }));
}
