/**
 * API ledger CxC/CxP/OC/egresos + owner rollup read (Sprint 8).
 * Flags default off → 404 FEATURE_OFF. Cobro POS nunca gated aquí.
 */
import {
  assertPurchaseOrderTransition,
  planCreateAp,
  planCreateExpense,
  planPayAp,
  planPayAr,
  type ExpenseCategory,
  type PurchaseOrderStatus,
} from '@kipuspay/domain-cash';
import type { WorkerEnv } from '../auth/control-plane.js';

export function isLedgerArApEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_LEDGER_AR_AP === '1' || env?.FEATURE_LEDGER_AR_AP === 'true';
}

export function isPurchasingOrdersEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_PURCHASING_ORDERS === '1' || env?.FEATURE_PURCHASING_ORDERS === 'true';
}

export function isCashExpensesEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_CASH_EXPENSES === '1' || env?.FEATURE_CASH_EXPENSES === 'true';
}

export function isOwnerModeEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_OWNER_MODE === '1' || env?.FEATURE_OWNER_MODE === 'true';
}

export interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function featureOff(flag: string): HttpResult {
  return { status: 404, body: { error: `${flag} off`, code: 'FEATURE_OFF' } };
}

function dbUnavailable(): HttpResult {
  return { status: 503, body: { error: 'Database unavailable', code: 'DB_UNAVAILABLE' } };
}

export async function runListArHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isLedgerArApEnabled(env)) return featureOff('FEATURE_LEDGER_AR_AP');
  if (!env?.DB) return dbUnavailable();
  const rows = await env.DB.prepare(
    `SELECT id, customer_id, sale_id, original_amount_cents, balance_due_cents, status, due_date
     FROM accounts_receivable WHERE tenant_id = ? ORDER BY due_date ASC LIMIT 200`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      customer_id: string;
      sale_id: string;
      original_amount_cents: number;
      balance_due_cents: number;
      status: string;
      due_date: string;
    }>();
  return { status: 200, body: { items: rows.results ?? [] } };
}

export async function runPayArHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    accountsReceivableId?: string;
    amountCents?: number;
    paymentMethod?: string;
    cashRegisterSessionId?: string;
  },
): Promise<HttpResult> {
  if (!isLedgerArApEnabled(env)) return featureOff('FEATURE_LEDGER_AR_AP');
  if (!env?.DB) return dbUnavailable();
  const arId = body.accountsReceivableId ?? '';
  const amountCents = body.amountCents ?? 0;
  const paymentMethod = body.paymentMethod ?? 'cash';
  if (!arId || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { status: 400, body: { error: 'Invalid payment', code: 'BAD_REQUEST' } };
  }
  const ar = await env.DB.prepare(
    `SELECT id, balance_due_cents FROM accounts_receivable WHERE id = ? AND tenant_id = ?`,
  )
    .bind(arId, tenantId)
    .first<{ id: string; balance_due_cents: number }>();
  if (!ar) return { status: 404, body: { error: 'AR not found', code: 'NOT_FOUND' } };
  let plan;
  try {
    plan = planPayAr({
      paymentId: crypto.randomUUID(),
      accountsReceivableId: ar.id,
      currentBalanceCents: ar.balance_due_cents,
      amountCents,
      paymentMethod,
      collectedByUserId: userId,
      cashRegisterSessionId: body.cashRegisterSessionId,
    });
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'AR_PAY_REJECTED' },
    };
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO accounts_receivable_payments (
           id, accounts_receivable_id, amount_cents, payment_method,
           cash_register_session_id, collected_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      plan.paymentId,
      plan.accountsReceivableId,
      plan.amountCents,
      plan.paymentMethod,
      plan.cashRegisterSessionId,
      plan.collectedByUserId,
    ),
    env.DB.prepare(
      `UPDATE accounts_receivable SET balance_due_cents = ?, status = ?
       WHERE id = ? AND tenant_id = ? AND balance_due_cents > 0`,
    ).bind(plan.nextBalanceCents, plan.nextStatus, plan.accountsReceivableId, tenantId),
  ]);
  return {
    status: 200,
    body: {
      paymentId: plan.paymentId,
      nextBalanceCents: plan.nextBalanceCents,
      nextStatus: plan.nextStatus,
    },
  };
}

export async function runListApHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
): Promise<HttpResult> {
  if (!isLedgerArApEnabled(env)) return featureOff('FEATURE_LEDGER_AR_AP');
  if (!env?.DB) return dbUnavailable();
  const rows = await env.DB.prepare(
    `SELECT id, supplier_id, purchase_order_id, original_amount_cents, balance_due_cents, status, due_date
     FROM accounts_payable WHERE tenant_id = ? ORDER BY due_date ASC LIMIT 200`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      supplier_id: string;
      purchase_order_id: string | null;
      original_amount_cents: number;
      balance_due_cents: number;
      status: string;
      due_date: string;
    }>();
  return { status: 200, body: { items: rows.results ?? [] } };
}

export async function runPayApHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: {
    accountsPayableId?: string;
    amountCents?: number;
    paymentMethod?: string;
    cashRegisterSessionId?: string;
  },
): Promise<HttpResult> {
  if (!isLedgerArApEnabled(env)) return featureOff('FEATURE_LEDGER_AR_AP');
  if (!env?.DB) return dbUnavailable();
  const apId = body.accountsPayableId ?? '';
  const amountCents = body.amountCents ?? 0;
  const paymentMethod = body.paymentMethod ?? 'transfer';
  if (!apId || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { status: 400, body: { error: 'Invalid payment', code: 'BAD_REQUEST' } };
  }
  const ap = await env.DB.prepare(
    `SELECT id, balance_due_cents FROM accounts_payable WHERE id = ? AND tenant_id = ?`,
  )
    .bind(apId, tenantId)
    .first<{ id: string; balance_due_cents: number }>();
  if (!ap) return { status: 404, body: { error: 'AP not found', code: 'NOT_FOUND' } };
  let plan;
  try {
    plan = planPayAp({
      paymentId: crypto.randomUUID(),
      accountsPayableId: ap.id,
      currentBalanceCents: ap.balance_due_cents,
      amountCents,
      paymentMethod,
      cashRegisterSessionId: body.cashRegisterSessionId,
    });
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'AP_PAY_REJECTED' },
    };
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO accounts_payable_payments (
           id, accounts_payable_id, amount_cents, payment_method, cash_register_session_id
         ) VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      plan.paymentId,
      plan.accountsPayableId,
      plan.amountCents,
      plan.paymentMethod,
      plan.cashRegisterSessionId,
    ),
    env.DB.prepare(
      `UPDATE accounts_payable SET balance_due_cents = ?, status = ?
       WHERE id = ? AND tenant_id = ? AND balance_due_cents > 0`,
    ).bind(plan.nextBalanceCents, plan.nextStatus, plan.accountsPayableId, tenantId),
  ]);
  return {
    status: 200,
    body: {
      paymentId: plan.paymentId,
      nextBalanceCents: plan.nextBalanceCents,
      nextStatus: plan.nextStatus,
    },
  };
}

export async function runCreateApHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: {
    supplierId?: string;
    purchaseOrderId?: string | null;
    amountCents?: number;
    dueDateIso?: string;
  },
): Promise<HttpResult> {
  if (!isLedgerArApEnabled(env)) return featureOff('FEATURE_LEDGER_AR_AP');
  if (!env?.DB) return dbUnavailable();
  try {
    const plan = planCreateAp({
      id: crypto.randomUUID(),
      tenantId,
      supplierId: body.supplierId ?? '',
      purchaseOrderId: body.purchaseOrderId ?? null,
      amountCents: body.amountCents ?? 0,
      dueDateIso: body.dueDateIso ?? new Date().toISOString().replace('T', ' ').substring(0, 19),
    });
    await env.DB.prepare(
      `INSERT INTO accounts_payable (
           id, tenant_id, supplier_id, purchase_order_id, original_amount_cents,
           balance_due_cents, due_date, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
    )
      .bind(
        plan.apId,
        plan.tenantId,
        plan.supplierId,
        plan.purchaseOrderId,
        plan.originalAmountCents,
        plan.balanceDueCents,
        plan.dueDateIso,
      )
      .run();
    return { status: 200, body: { id: plan.apId, status: plan.status } };
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'AP_CREATE_REJECTED' },
    };
  }
}

interface PoLineInput {
  readonly productId?: string;
  readonly quantity?: number;
  readonly unitCostCents?: number;
}

function validatePoLines(lines: readonly PoLineInput[]): string | null {
  for (const line of lines) {
    const productId = typeof line.productId === 'string' ? line.productId.trim() : '';
    if (
      !productId ||
      !(typeof line.quantity === 'number' && line.quantity > 0 && Number.isFinite(line.quantity)) ||
      !(Number.isSafeInteger(line.unitCostCents) && (line.unitCostCents ?? 0) >= 0)
    ) {
      return 'Línea de OC inválida';
    }
  }
  return null;
}

function buildPoLineStatements(
  db: NonNullable<WorkerEnv['DB']>,
  purchaseOrderId: string,
  lines: readonly PoLineInput[],
): never[] {
  return lines.map(
    (line) =>
      db
        .prepare(
          `INSERT INTO purchase_order_items (
           id, purchase_order_id, product_id, quantity_ordered, quantity_received,
           unit_cost_cents, quantity_ordered_microunits, quantity_received_microunits
         ) VALUES (?, ?, ?, ?, 0, ?, ?, 0)`,
        )
        .bind(
          crypto.randomUUID(),
          purchaseOrderId,
          (line.productId as string).trim(),
          line.quantity as number,
          line.unitCostCents as number,
          Math.round((line.quantity as number) * 1_000_000),
        ) as never,
  );
}

export async function runCreatePoHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    branchId?: string;
    supplierId?: string;
    totalAmountCents?: number;
    lines?: readonly {
      productId?: string;
      quantity?: number;
      unitCostCents?: number;
    }[];
  },
): Promise<HttpResult> {
  if (!isPurchasingOrdersEnabled(env)) return featureOff('FEATURE_PURCHASING_ORDERS');
  if (!env?.DB) return dbUnavailable();
  const branchId = body.branchId ?? '';
  const supplierId = body.supplierId ?? '';
  const total = body.totalAmountCents ?? 0;
  if (!branchId || !supplierId || !Number.isInteger(total) || total < 0) {
    return { status: 400, body: { error: 'Invalid PO', code: 'BAD_REQUEST' } };
  }
  // Líneas de la OC: la recepción parcial valida contra quantity_ordered
  // (s20) y el 3-way contra las líneas; sin líneas el flujo standalone es
  // inalcanzable (RECEIVE_EXCEEDS_ORDERED para cualquier cantidad).
  const lines: readonly PoLineInput[] = Array.isArray(body.lines) ? body.lines : [];
  const invalid = validatePoLines(lines);
  if (invalid) {
    return { status: 422, body: { error: invalid, code: 'PO_LINE_INVALID' } };
  }
  const id = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      `INSERT INTO purchase_orders (
         id, tenant_id, branch_id, supplier_id, status, total_amount_cents, created_by_user_id
       ) VALUES (?, ?, ?, ?, 'DRAFT', ?, ?)`,
    ).bind(id, tenantId, branchId, supplierId, total, userId),
    ...buildPoLineStatements(env.DB, id, lines),
  ];
  await env.DB.batch(statements);
  return { status: 200, body: { id, status: 'DRAFT', lines: lines.length } };
}

export async function runTransitionPoHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  body: { purchaseOrderId?: string; toStatus?: PurchaseOrderStatus },
): Promise<HttpResult> {
  if (!isPurchasingOrdersEnabled(env)) return featureOff('FEATURE_PURCHASING_ORDERS');
  if (!env?.DB) return dbUnavailable();
  const poId = body.purchaseOrderId ?? '';
  const to = body.toStatus;
  if (!poId || !to)
    return { status: 400, body: { error: 'Invalid transition', code: 'BAD_REQUEST' } };
  const po = await env.DB.prepare(
    `SELECT id, status FROM purchase_orders WHERE id = ? AND tenant_id = ?`,
  )
    .bind(poId, tenantId)
    .first<{ id: string; status: PurchaseOrderStatus }>();
  if (!po) return { status: 404, body: { error: 'PO not found', code: 'NOT_FOUND' } };
  try {
    assertPurchaseOrderTransition(po.status, to);
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'PO_INVALID_TRANSITION' },
    };
  }
  await env.DB.prepare(`UPDATE purchase_orders SET status = ? WHERE id = ? AND tenant_id = ?`)
    .bind(to, poId, tenantId)
    .run();
  return { status: 200, body: { id: poId, status: to } };
}

export async function runCreateExpenseHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    branchId?: string;
    cashRegisterSessionId?: string;
    category?: ExpenseCategory;
    amountCents?: number;
    description?: string;
    accountsPayableId?: string;
  },
): Promise<HttpResult> {
  if (!isCashExpensesEnabled(env)) return featureOff('FEATURE_CASH_EXPENSES');
  if (!env?.DB) return dbUnavailable();
  try {
    const plan = planCreateExpense({
      id: crypto.randomUUID(),
      tenantId,
      branchId: body.branchId ?? '',
      cashRegisterSessionId: body.cashRegisterSessionId ?? '',
      category: body.category ?? 'OTHER',
      amountCents: body.amountCents ?? 0,
      description: body.description ?? '',
      authorizedByUserId: userId,
      accountsPayableId: body.accountsPayableId,
    });
    await env.DB.prepare(
      `INSERT INTO cash_register_expenses (
           id, cash_register_session_id, tenant_id, branch_id, category,
           accounts_payable_id, amount_cents, description, authorized_by_user_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        plan.id,
        plan.cashRegisterSessionId,
        plan.tenantId,
        plan.branchId,
        plan.category,
        plan.accountsPayableId,
        plan.amountCents,
        plan.description,
        plan.authorizedByUserId,
      )
      .run();
    return { status: 200, body: { id: plan.id, amountCents: plan.amountCents } };
  } catch (e) {
    return {
      status: 422,
      body: { error: String(e instanceof Error ? e.message : e), code: 'EXPENSE_REJECTED' },
    };
  }
}

/** Owner read: resumen día / ranking desde daily_financial_rollups (no catálogo S9). */
export async function runOwnerDaySummaryHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  reportDate: string,
): Promise<HttpResult> {
  if (!isOwnerModeEnabled(env)) return featureOff('FEATURE_OWNER_MODE');
  if (!env?.DB) return dbUnavailable();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return { status: 400, body: { error: 'Invalid reportDate', code: 'BAD_REQUEST' } };
  }
  const rows = await env.DB.prepare(
    `SELECT branch_id, report_date, gross_sales_cents, net_sales_cents, doc_count,
            discounts_cents, cogs_cents
     FROM daily_financial_rollups
     WHERE tenant_id = ? AND report_date = ?
     ORDER BY net_sales_cents DESC`,
  )
    .bind(tenantId, reportDate)
    .all<{
      branch_id: string;
      report_date: string;
      gross_sales_cents: number;
      net_sales_cents: number;
      doc_count: number;
      discounts_cents: number;
      cogs_cents: number;
    }>();
  const items = rows.results ?? [];
  const totals = items.reduce(
    (acc, r) => ({
      grossSalesCents: acc.grossSalesCents + r.gross_sales_cents,
      netSalesCents: acc.netSalesCents + r.net_sales_cents,
      docCount: acc.docCount + r.doc_count,
    }),
    { grossSalesCents: 0, netSalesCents: 0, docCount: 0 },
  );
  const catalogOn =
    env?.FEATURE_REPORTING_CATALOG === '1' || env?.FEATURE_REPORTING_CATALOG === 'true';
  return {
    status: 200,
    body: {
      reportDate,
      live: false,
      source: 'daily_financial_rollups',
      totals,
      branches: items,
      rankingClaimFrozen: !catalogOn,
      note: catalogOn
        ? 'GTM-03/GTM-11 unfrozen: ranking from daily_financial_rollups; offline banner still no-live'
        : 'GTM-03/GTM-11 frozen until FEATURE_REPORTING_CATALOG',
    },
  };
}
