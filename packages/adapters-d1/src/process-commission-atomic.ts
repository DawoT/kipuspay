/**
 * Comisiones ACID — Sprint 37 / ADR-0021 / §5.3 regla 22 / COM-07.
 * Un db.batch por rate upsert / payout. Accrue/reverse se enganchan al sale/NC.
 */
import {
  planCommissionAccrueJournal,
  planCommissionPayJournal,
  planCommissionReverseJournal,
} from '@kipuspay/domain-cash';
import {
  assertCommissionPayable,
  assertCommissionVoidable,
  planCommissionAccrual,
  planCommissionPayout,
  planCommissionReverse,
  type CommissionLineInput,
  type CommissionRateRow,
} from '@kipuspay/domain-sales';
import { runD1AtomicPlan, type D1Bound, type D1DatabaseLike } from './index.js';
import { readAuditChainHead } from './audit-chain.js';
import { sha256HexOf } from './crypto.js';
import {
  appendJournalToPlan,
  loadChartAccountsByCode,
  type JournalPlanSink,
} from './journal-post.js';

export interface ProcessCommissionOptions {
  readonly ledgerChartOfAccountsEnabled?: boolean;
  readonly nowMs?: number;
}

export async function previousCommissionAuditHash(
  db: D1DatabaseLike,
  tenantId: string,
): Promise<string | null> {
  return readAuditChainHead(db, tenantId);
}

export async function loadCommissionRates(
  db: D1DatabaseLike,
  tenantId: string,
  sellerId: string,
): Promise<CommissionRateRow[]> {
  const rows = await db
    .prepare(
      `SELECT seller_id, product_id, category_id, rate_percent, rate_amount_cents
       FROM commission_rates WHERE tenant_id = ? AND seller_id = ?`,
    )
    .bind(tenantId, sellerId)
    .all<{
      seller_id: string;
      product_id: string | null;
      category_id: string | null;
      rate_percent: number;
      rate_amount_cents: number | null;
    }>();
  return (rows.results ?? []).map((r) => ({
    sellerId: r.seller_id,
    productId: r.product_id,
    categoryId: r.category_id,
    ratePercent: r.rate_percent,
    rateAmountCents: r.rate_amount_cents,
  }));
}

export async function appendCommissionAccrualToBatch(
  plan: JournalPlanSink,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly branchId: string;
    readonly saleId: string;
    readonly sellerId: string;
    readonly lines: readonly CommissionLineInput[];
    readonly prevAuditHash: string | null;
    readonly chartOn: boolean;
    readonly accountsByCode: ReadonlyMap<string, string>;
    readonly postDate: string;
  },
): Promise<{ accrualId: string | null; rowHash: string | null }> {
  const rates = await loadCommissionRates(db, input.tenantId, input.sellerId);
  const accrual = planCommissionAccrual({
    sellerId: input.sellerId,
    lines: input.lines,
    rates,
  });
  if (!accrual) return { accrualId: null, rowHash: null };

  const existing = await db
    .prepare(
      `SELECT id FROM commission_accruals
       WHERE tenant_id = ? AND sale_id = ? AND seller_id = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.saleId, accrual.sellerId)
    .first<{ id: string }>();
  if (existing) return { accrualId: existing.id, rowHash: input.prevAuditHash };

  const accrualId = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO commission_accruals (
             id, tenant_id, sale_id, seller_id, amount_cents
           ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(accrualId, input.tenantId, input.saleId, accrual.sellerId, accrual.amountCents),
  );
  const auditId = crypto.randomUUID();
  const rowHash = await sha256HexOf({
    action: 'COMMISSION',
    entity_id: accrualId,
    sale_id: input.saleId,
    amount: accrual.amountCents,
    prev: input.prevAuditHash,
  });
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'COMMISSION', 'commission_accrual', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        input.tenantId,
        input.branchId,
        input.userId,
        accrualId,
        JSON.stringify({
          saleId: input.saleId,
          sellerId: accrual.sellerId,
          amountCents: accrual.amountCents,
          kind: 'ACCRUE',
        }),
        input.prevAuditHash,
        rowHash,
      ),
  );
  let tipRowHash = rowHash;
  if (input.chartOn) {
    const jr = await appendJournalToPlan(plan, db, {
      tenantId: input.tenantId,
      branchId: input.branchId,
      userId: input.userId,
      accountsByCode: input.accountsByCode,
      prevAuditHash: rowHash,
      entry: planCommissionAccrueJournal({
        sourceId: accrualId,
        postDate: input.postDate,
        amountCents: accrual.amountCents,
      }),
    });
    tipRowHash = jr.rowHash;
  }
  return { accrualId, rowHash: tipRowHash };
}

export function appendCommissionReverseOnSale(
  plan: { add(statement: D1Bound): unknown },
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly saleId: string;
    readonly nowIso: string;
  },
): void {
  plan.add(
    db
      .prepare(
        `UPDATE commission_accruals
         SET reversed_at = ?
         WHERE tenant_id = ? AND sale_id = ? AND reversed_at IS NULL`,
      )
      .bind(input.nowIso.slice(0, 19).replace('T', ' '), input.tenantId, input.saleId),
  );
}

export async function appendCommissionReverseWithJournal(
  plan: JournalPlanSink,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly branchId: string;
    readonly saleId: string;
    readonly nowIso: string;
    readonly prevAuditHash: string | null;
    readonly chartOn: boolean;
    readonly accountsByCode: ReadonlyMap<string, string>;
    readonly postDate: string;
  },
): Promise<string | null> {
  const open = await db
    .prepare(
      `SELECT id, amount_cents FROM commission_accruals
       WHERE tenant_id = ? AND sale_id = ? AND reversed_at IS NULL`,
    )
    .bind(input.tenantId, input.saleId)
    .all<{ id: string; amount_cents: number }>();
  const rows = open.results ?? [];
  if (rows.length === 0) return null;

  appendCommissionReverseOnSale(plan, db, {
    tenantId: input.tenantId,
    saleId: input.saleId,
    nowIso: input.nowIso,
  });

  let prev = input.prevAuditHash;
  for (const row of rows) {
    const rev = planCommissionReverse({
      amountCents: row.amount_cents,
      alreadyReversed: false,
    });
    if (!rev.reverse) continue;
    const auditId = crypto.randomUUID();
    const rowHash = await sha256HexOf({
      action: 'COMMISSION',
      entity_id: row.id,
      kind: 'REVERSE',
      amount: rev.amountCents,
      prev,
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'COMMISSION', 'commission_accrual', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          input.tenantId,
          input.branchId,
          input.userId,
          row.id,
          JSON.stringify({
            saleId: input.saleId,
            amountCents: rev.amountCents,
            kind: 'REVERSE',
          }),
          prev,
          rowHash,
        ),
    );
    if (input.chartOn) {
      const jr = await appendJournalToPlan(plan, db, {
        tenantId: input.tenantId,
        branchId: input.branchId,
        userId: input.userId,
        accountsByCode: input.accountsByCode,
        prevAuditHash: rowHash,
        entry: planCommissionReverseJournal({
          sourceId: row.id,
          postDate: input.postDate,
          amountCents: rev.amountCents,
        }),
      });
      prev = jr.rowHash;
    } else {
      prev = rowHash;
    }
  }
  return prev;
}

export async function processCommissionRateUpsertAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly sellerId: string;
    readonly productId?: string | null;
    readonly categoryId?: string | null;
    readonly ratePercent: number;
    readonly rateAmountCents?: number | null;
    readonly branchId: string;
    readonly actorIsAdminOrOwner: boolean;
  },
): Promise<{ rateId: string }> {
  if (!input.actorIsAdminOrOwner) throw new Error('COMMISSION_FORBIDDEN');
  if (!input.sellerId.trim()) throw new Error('COMMISSION_SELLER_REQUIRED');
  if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0) {
    throw new Error('COMMISSION_INVALID_RATE');
  }
  const productId = input.productId?.trim() || null;
  const categoryId = input.categoryId?.trim() || null;
  const rateAmount = input.rateAmountCents == null ? null : Math.trunc(input.rateAmountCents);

  const existing = await db
    .prepare(
      `SELECT id FROM commission_rates
       WHERE tenant_id = ? AND seller_id = ?
         AND IFNULL(product_id,'') = IFNULL(?, '')
         AND IFNULL(category_id,'') = IFNULL(?, '')
       LIMIT 1`,
    )
    .bind(tenantId, input.sellerId, productId, categoryId)
    .first<{ id: string }>();

  const rateId = existing?.id ?? crypto.randomUUID();
  const prevHash = await previousCommissionAuditHash(db, tenantId);
  await runD1AtomicPlan(db, async (plan) => {
    if (existing) {
      plan.add(
        db
          .prepare(
            `UPDATE commission_rates
             SET rate_percent = ?, rate_amount_cents = ?
             WHERE tenant_id = ? AND id = ?`,
          )
          .bind(input.ratePercent, rateAmount, tenantId, rateId),
      );
    } else {
      plan.add(
        db
          .prepare(
            `INSERT INTO commission_rates (
                 id, tenant_id, seller_id, product_id, category_id,
                 rate_percent, rate_amount_cents
               ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            rateId,
            tenantId,
            input.sellerId,
            productId,
            categoryId,
            input.ratePercent,
            rateAmount,
          ),
      );
    }
    const rowHash = await sha256HexOf({
      action: 'COMMISSION',
      entity_id: rateId,
      kind: 'RATE',
      prev: prevHash,
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'COMMISSION', 'commission_rate', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          userId,
          rateId,
          JSON.stringify({
            sellerId: input.sellerId,
            productId,
            categoryId,
            ratePercent: input.ratePercent,
            rateAmountCents: rateAmount,
          }),
          prevHash,
          rowHash,
        ),
    );
    plan.claimAuditChain(tenantId, prevHash, [rowHash]);
  });
  return { rateId };
}

export async function processCommissionPayoutAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly sellerId: string;
    readonly periodStartIso: string;
    readonly periodEndIso: string;
    readonly branchId: string;
    readonly actorIsAdminOrOwner: boolean;
    readonly clientGrossCents?: number;
  },
  options: ProcessCommissionOptions = {},
): Promise<{ payoutId: string; grossCents: number; status: 'OPEN' }> {
  const open = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS cents
       FROM commission_accruals
       WHERE tenant_id = ? AND seller_id = ? AND reversed_at IS NULL
         AND date(created_at) >= ? AND date(created_at) <= ?`,
    )
    .bind(
      tenantId,
      input.sellerId,
      input.periodStartIso.slice(0, 10),
      input.periodEndIso.slice(0, 10),
    )
    .first<{ cents: number }>();

  // openAccrualCents = SUM non-reversed in period minus SUM gross of PAID payouts overlapping.
  const paid = await db
    .prepare(
      `SELECT COALESCE(SUM(gross_cents), 0) AS cents
       FROM commission_payouts
       WHERE tenant_id = ? AND seller_id = ? AND status IN ('PAID','OPEN')
         AND period_start <= ? AND period_end >= ?`,
    )
    .bind(
      tenantId,
      input.sellerId,
      input.periodEndIso.slice(0, 10),
      input.periodStartIso.slice(0, 10),
    )
    .first<{ cents: number }>();

  const openAccrualCents = Math.max(0, (open?.cents ?? 0) - (paid?.cents ?? 0));
  const payoutPlan = planCommissionPayout({
    sellerId: input.sellerId,
    periodStartIso: input.periodStartIso,
    periodEndIso: input.periodEndIso,
    openAccrualCents,
    actorIsAdminOrOwner: input.actorIsAdminOrOwner,
    ...(input.clientGrossCents !== undefined ? { clientGrossCents: input.clientGrossCents } : {}),
  });

  const payoutId = crypto.randomUUID();
  const prevHash = await previousCommissionAuditHash(db, tenantId);
  await runD1AtomicPlan(db, async (plan) => {
    plan.add(
      db
        .prepare(
          `INSERT INTO commission_payouts (
               id, tenant_id, seller_id, period_start, period_end, gross_cents, status
             ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`,
        )
        .bind(
          payoutId,
          tenantId,
          payoutPlan.sellerId,
          payoutPlan.periodStartIso,
          payoutPlan.periodEndIso,
          payoutPlan.grossCents,
        ),
    );
    const rowHash = await sha256HexOf({
      action: 'COMMISSION',
      entity_id: payoutId,
      kind: 'PAYOUT_OPEN',
      amount: payoutPlan.grossCents,
      prev: prevHash,
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'COMMISSION', 'commission_payout', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          userId,
          payoutId,
          JSON.stringify({
            sellerId: payoutPlan.sellerId,
            grossCents: payoutPlan.grossCents,
            kind: 'OPEN',
          }),
          prevHash,
          rowHash,
        ),
    );
    plan.claimAuditChain(tenantId, prevHash, [rowHash]);
  });
  void options.nowMs;
  return { payoutId, grossCents: payoutPlan.grossCents, status: 'OPEN' };
}

export async function processCommissionPayoutPayAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly payoutId: string;
    readonly branchId: string;
    readonly actorIsAdminOrOwner: boolean;
  },
  options: ProcessCommissionOptions = {},
): Promise<{ payoutId: string; status: 'PAID'; grossCents: number }> {
  const chartOn = options.ledgerChartOfAccountsEnabled === true;
  const row = await db
    .prepare(
      `SELECT id, status, gross_cents FROM commission_payouts
       WHERE tenant_id = ? AND id = ? LIMIT 1`,
    )
    .bind(tenantId, input.payoutId)
    .first<{ id: string; status: string; gross_cents: number }>();
  if (!row) throw new Error('COMMISSION_NOT_FOUND');
  assertCommissionPayable({
    status: row.status as 'OPEN' | 'PAID' | 'VOID',
    actorIsAdminOrOwner: input.actorIsAdminOrOwner,
  });

  const prevHash = await previousCommissionAuditHash(db, tenantId);
  const accounts = chartOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const postDate = new Date(options.nowMs ?? Date.now()).toISOString().slice(0, 10);

  await runD1AtomicPlan(db, async (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE commission_payouts SET status = 'PAID'
           WHERE tenant_id = ? AND id = ? AND status = 'OPEN'`,
        )
        .bind(tenantId, row.id),
    );
    const rowHash = await sha256HexOf({
      action: 'COMMISSION',
      entity_id: row.id,
      kind: 'PAID',
      amount: row.gross_cents,
      prev: prevHash,
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'COMMISSION', 'commission_payout', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          userId,
          row.id,
          JSON.stringify({ grossCents: row.gross_cents, kind: 'PAID' }),
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
        entry: planCommissionPayJournal({
          sourceId: row.id,
          postDate,
          amountCents: row.gross_cents,
        }),
      });
    }
    plan.claimAuditChain(tenantId, prevHash, [rowHash]);
  });
  return { payoutId: row.id, status: 'PAID', grossCents: row.gross_cents };
}

export async function processCommissionPayoutVoidAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: {
    readonly payoutId: string;
    readonly branchId: string;
    readonly actorIsAdminOrOwner: boolean;
  },
): Promise<{ payoutId: string; status: 'VOID' }> {
  const row = await db
    .prepare(`SELECT id, status FROM commission_payouts WHERE tenant_id = ? AND id = ? LIMIT 1`)
    .bind(tenantId, input.payoutId)
    .first<{ id: string; status: string }>();
  if (!row) throw new Error('COMMISSION_NOT_FOUND');
  assertCommissionVoidable({
    status: row.status as 'OPEN' | 'PAID' | 'VOID',
    actorIsAdminOrOwner: input.actorIsAdminOrOwner,
  });
  const prevHash = await previousCommissionAuditHash(db, tenantId);
  await runD1AtomicPlan(db, async (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE commission_payouts SET status = 'VOID'
           WHERE tenant_id = ? AND id = ? AND status = 'OPEN'`,
        )
        .bind(tenantId, row.id),
    );
    const rowHash = await sha256HexOf({
      action: 'COMMISSION',
      entity_id: row.id,
      kind: 'VOID',
      prev: prevHash,
    });
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'COMMISSION', 'commission_payout', ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          input.branchId,
          userId,
          row.id,
          JSON.stringify({ kind: 'VOID' }),
          prevHash,
          rowHash,
        ),
    );
    plan.claimAuditChain(tenantId, prevHash, [rowHash]);
  });
  return { payoutId: row.id, status: 'VOID' };
}

export async function listOwnerCommissions(
  db: D1DatabaseLike,
  tenantId: string,
): Promise<{
  pendingAccrualCents: number;
  openPayoutCents: number;
  paidPayoutCents: number;
  items: readonly {
    id: string;
    sellerId: string;
    saleId: string;
    amountCents: number;
    createdAt: string;
  }[];
}> {
  const pending = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS cents FROM commission_accruals
       WHERE tenant_id = ? AND reversed_at IS NULL`,
    )
    .bind(tenantId)
    .first<{ cents: number }>();
  const openP = await db
    .prepare(
      `SELECT COALESCE(SUM(gross_cents), 0) AS cents FROM commission_payouts
       WHERE tenant_id = ? AND status = 'OPEN'`,
    )
    .bind(tenantId)
    .first<{ cents: number }>();
  const paidP = await db
    .prepare(
      `SELECT COALESCE(SUM(gross_cents), 0) AS cents FROM commission_payouts
       WHERE tenant_id = ? AND status = 'PAID'`,
    )
    .bind(tenantId)
    .first<{ cents: number }>();
  const rows = await db
    .prepare(
      `SELECT id, seller_id, sale_id, amount_cents, created_at
       FROM commission_accruals
       WHERE tenant_id = ? AND reversed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 500`,
    )
    .bind(tenantId)
    .all<{
      id: string;
      seller_id: string;
      sale_id: string;
      amount_cents: number;
      created_at: string;
    }>();
  return {
    pendingAccrualCents: pending?.cents ?? 0,
    openPayoutCents: openP?.cents ?? 0,
    paidPayoutCents: paidP?.cents ?? 0,
    items: (rows.results ?? []).map((r) => ({
      id: r.id,
      sellerId: r.seller_id,
      saleId: r.sale_id,
      amountCents: r.amount_cents,
      createdAt: r.created_at,
    })),
  };
}

export async function listCommissionRates(
  db: D1DatabaseLike,
  tenantId: string,
): Promise<
  readonly {
    id: string;
    sellerId: string;
    productId: string | null;
    categoryId: string | null;
    ratePercent: number;
    rateAmountCents: number | null;
  }[]
> {
  const rows = await db
    .prepare(
      `SELECT id, seller_id, product_id, category_id, rate_percent, rate_amount_cents
       FROM commission_rates WHERE tenant_id = ?
       ORDER BY seller_id, product_id, category_id`,
    )
    .bind(tenantId)
    .all<{
      id: string;
      seller_id: string;
      product_id: string | null;
      category_id: string | null;
      rate_percent: number;
      rate_amount_cents: number | null;
    }>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    sellerId: r.seller_id,
    productId: r.product_id,
    categoryId: r.category_id,
    ratePercent: r.rate_percent,
    rateAmountCents: r.rate_amount_cents,
  }));
}
