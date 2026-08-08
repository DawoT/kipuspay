/**
 * Caja dura Sprint 17 — blind Z, movimientos, reimpresión COPIA (ADR-0012).
 * Flags default off → 404 FEATURE_OFF.
 */
/* eslint-disable complexity -- HTTP Z/movimientos: print-outbox + journal S32 */
import {
  computeExpectedCashCents,
  planBlindClose,
  planCashCountJournal,
  planSaleReprint,
  printOutboxPendingCount,
  shouldBlockZForPrintOutbox,
  type CashMovementType,
} from '@kipuspay/domain-cash';
import { appendJournalToPlan, loadChartAccountsByCode } from '@kipuspay/adapters-d1';
import type { WorkerEnv } from '../auth/control-plane.js';
import { isLedgerChartOfAccountsEnabled } from '../auth/features.js';

export function isCashBlindZEnabled(env: WorkerEnv | undefined): boolean {
  return env?.FEATURE_CASH_BLIND_Z === '1' || env?.FEATURE_CASH_BLIND_Z === 'true';
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function previousAuditHash(db: D1Database, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

async function insertAudit(
  db: D1Database,
  input: {
    tenantId: string;
    branchId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const prev = await previousAuditHash(db, input.tenantId);
  const id = crypto.randomUUID();
  const rowHash = await sha256Hex(
    JSON.stringify({
      action: input.action,
      entity_id: input.entityId,
      prev_hash: prev,
      payload: input.payload,
    }),
  );
  await db
    .prepare(
      `INSERT INTO audit_events (
           id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
           payload_json, prev_hash, row_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.tenantId,
      input.branchId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payload),
      prev,
      rowHash,
    )
    .run();
}

const MOVEMENT_TYPES: ReadonlySet<CashMovementType> = new Set([
  'DEPOSIT_VALUES',
  'CHANGE_FUND_IN',
  'CHANGE_FUND_OUT',
  'SUPPLIER_PAYMENT',
  'ADJUSTMENT',
  'SALE_REFUND',
  'LAYAWAY_DEPOSIT',
  'LAYAWAY_REFUND',
]);

interface BlindCloseSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  opening_balance_cents: number;
  status: string;
}

async function loadBlindCloseContext(
  db: D1Database,
  sessionId: string,
  tenantId: string,
): Promise<
  | {
      ok: true;
      session: BlindCloseSession;
      expectedCents: number;
      electronicSalesCents: number;
    }
  | { ok: false; status: number; body: { error: string; code: string } }
> {
  const session = await db
    .prepare(
      `SELECT id, tenant_id, branch_id, opening_balance_cents, status
       FROM cash_register_sessions
       WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(sessionId, tenantId)
    .first<BlindCloseSession>();
  if (!session) {
    return { ok: false, status: 404, body: { error: 'Session not found', code: 'NOT_FOUND' } };
  }
  if (session.status !== 'OPEN') {
    return { ok: false, status: 422, body: { error: 'Session not open', code: 'SESSION_CLOSED' } };
  }

  const cashSales = await db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_cents), 0) AS cash_cents
       FROM sale_payments sp
       INNER JOIN sales s ON s.id = sp.sale_id AND s.tenant_id = sp.tenant_id
       INNER JOIN payment_methods pm
         ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
       WHERE s.tenant_id = ? AND s.cash_register_session_id = ?
         AND pm.code = 'cash'
         AND NOT EXISTS (
           SELECT 1 FROM accounts_receivable ar
           WHERE ar.tenant_id = s.tenant_id AND ar.sale_id = s.id
         )`,
    )
    .bind(tenantId, sessionId)
    .first<{ cash_cents: number }>();

  const electronicSales = await db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_cents), 0) AS electronic_cents
       FROM sale_payments sp
       INNER JOIN sales s ON s.id = sp.sale_id AND s.tenant_id = sp.tenant_id
       INNER JOIN payment_methods pm
         ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
       WHERE s.tenant_id = ? AND s.cash_register_session_id = ?
         AND pm.code IN ('yape','plin','mercadopago_qr','culqi','niubiz','card_manual')
         AND NOT EXISTS (
           SELECT 1 FROM accounts_receivable ar
           WHERE ar.tenant_id = s.tenant_id AND ar.sale_id = s.id
         )`,
    )
    .bind(tenantId, sessionId)
    .first<{ electronic_cents: number }>();

  const movements = await db
    .prepare(
      `SELECT movement_type, amount_cents
       FROM cash_register_cash_movements
       WHERE tenant_id = ? AND cash_register_session_id = ?`,
    )
    .bind(tenantId, sessionId)
    .all<{ movement_type: CashMovementType; amount_cents: number }>();

  const legacy = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS expense_cents
       FROM cash_register_expenses
       WHERE tenant_id = ? AND cash_register_session_id = ?`,
    )
    .bind(tenantId, sessionId)
    .first<{ expense_cents: number }>();

  const expectedCents = computeExpectedCashCents({
    openingBalanceCents: session.opening_balance_cents,
    cashSalesCents: cashSales?.cash_cents ?? 0,
    movements: (movements.results ?? []).map((m) => ({
      movementType: m.movement_type,
      amountCents: m.amount_cents,
    })),
    legacyExpenseCents: legacy?.expense_cents ?? 0,
  });

  return {
    ok: true,
    session,
    expectedCents,
    electronicSalesCents: electronicSales?.electronic_cents ?? 0,
  };
}

type CashMovementParseResult =
  | {
      ok: true;
      movementType: CashMovementType;
      amountCents: number;
      sessionId: string;
      branchId: string;
      authorizedByUserId: string | null;
    }
  | { ok: false; status: number; body: { error: string; code: string } };

function requiresAuthz(
  amountCents: number,
  threshold: number,
  authorizedByUserId: string | null,
): boolean {
  return amountCents > threshold && authorizedByUserId === null;
}

function parseCashMovementBody(body: {
  branchId?: string;
  sessionId?: string;
  movementType?: string;
  amountCents?: number;
  authThresholdCents?: number;
  authorizedByUserId?: string | null;
}): CashMovementParseResult {
  const movementType = body.movementType as CashMovementType | undefined;
  if (!movementType || !MOVEMENT_TYPES.has(movementType)) {
    return { ok: false, status: 400, body: { error: 'Invalid movementType', code: 'BAD_REQUEST' } };
  }
  const amountCents = body.amountCents ?? 0;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return {
      ok: false,
      status: 422,
      body: { error: 'INVALID_MOVEMENT_AMOUNT', code: 'INVALID_MOVEMENT_AMOUNT' },
    };
  }
  const sessionId = body.sessionId?.trim() ?? '';
  const branchId = body.branchId?.trim() ?? '';
  if (!sessionId || !branchId) {
    return {
      ok: false,
      status: 400,
      body: { error: 'sessionId and branchId required', code: 'BAD_REQUEST' },
    };
  }
  const threshold = body.authThresholdCents ?? 10_000;
  const authorizedByUserId = body.authorizedByUserId ? body.authorizedByUserId.trim() : null;
  if (requiresAuthz(amountCents, threshold, authorizedByUserId)) {
    return {
      ok: false,
      status: 403,
      body: { error: 'Authz required over threshold', code: 'AUTH_TOKEN_REQUIRED' },
    };
  }
  return { ok: true, movementType, amountCents, sessionId, branchId, authorizedByUserId };
}

interface NormalizedCountLine {
  denominationCents: number;
  quantity: number;
}

function normalizeCountLines(
  countLines: readonly { denominationCents?: number; quantity?: number }[] | undefined,
): NormalizedCountLine[] {
  return (countLines ?? []).map((l) => ({
    denominationCents: l.denominationCents ?? 0,
    quantity: l.quantity ?? 0,
  }));
}

export async function runBlindCloseHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    sessionId?: string;
    countLines?: readonly { denominationCents?: number; quantity?: number }[];
    differenceReason?: string | null;
    differenceThresholdCents?: number;
    strictMode?: boolean;
    /** PENDING+FAILED del print outbox cliente (edge 2D S25). */
    outboxPendingCount?: number;
  },
): Promise<HttpResult> {
  if (!isCashBlindZEnabled(env)) return featureOff('FEATURE_CASH_BLIND_Z');
  if (!env?.DB) return dbUnavailable();

  const sessionId = body.sessionId?.trim() ?? '';
  if (!sessionId) {
    return { status: 400, body: { error: 'sessionId required', code: 'BAD_REQUEST' } };
  }

  const pending = printOutboxPendingCount(body.outboxPendingCount ?? 0);
  if (shouldBlockZForPrintOutbox(pending)) {
    return {
      status: 409,
      body: {
        error: 'Print outbox has pending tickets',
        code: 'PRINT_OUTBOX_BLOCK',
        pendingCount: pending,
      },
    };
  }

  const ctx = await loadBlindCloseContext(env.DB, sessionId, tenantId);
  if (!ctx.ok) {
    return { status: ctx.status, body: ctx.body };
  }

  const countLines = normalizeCountLines(body.countLines);

  let plan;
  try {
    plan = planBlindClose({
      expectedCents: ctx.expectedCents,
      countLines,
      differenceThresholdCents: body.differenceThresholdCents ?? 0,
      differenceReason: body.differenceReason ?? null,
      strictMode: body.strictMode !== false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { error: msg, code: msg } };
  }

  const stmts = [
    env.DB.prepare(
      `UPDATE cash_register_sessions SET
           status = 'CLOSED',
           counted_total_cents = ?,
           expected_total_cents = ?,
           difference_amount_cents = ?,
           difference_reason = ?,
           closed_blind = 1,
           closed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ? AND status = 'OPEN'`,
    ).bind(
      plan.countedTotalCents,
      plan.expectedTotalCents,
      plan.differenceAmountCents,
      body.differenceReason ?? null,
      sessionId,
      tenantId,
    ),
    ...countLines.map((line) =>
      env
        .DB!.prepare(
          `INSERT INTO cash_count_lines (
             id, tenant_id, cash_register_session_id, denomination_cents, quantity
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), tenantId, sessionId, line.denominationCents, line.quantity),
    ),
  ];

  if (isLedgerChartOfAccountsEnabled(env)) {
    const cashJournal = planCashCountJournal({
      sourceId: sessionId,
      postDate: new Date().toISOString().slice(0, 10),
      differenceCents: plan.differenceAmountCents,
    });
    if (cashJournal) {
      const accounts = await loadChartAccountsByCode(env.DB, tenantId);
      const sink = { add: (stmt: (typeof stmts)[number]) => stmts.push(stmt) };
      await appendJournalToPlan(sink, env.DB, {
        tenantId,
        branchId: ctx.session.branch_id,
        userId,
        accountsByCode: accounts,
        prevAuditHash: null,
        entry: cashJournal,
      });
    }
  }

  await env.DB.batch(stmts);

  await insertAudit(env.DB, {
    tenantId,
    branchId: ctx.session.branch_id,
    actorUserId: userId,
    action: 'CASH_SESSION_CLOSE',
    entityType: 'cash_register_session',
    entityId: sessionId,
    payload: {
      countedTotalCents: plan.countedTotalCents,
      expectedTotalCents: plan.expectedTotalCents,
      differenceAmountCents: plan.differenceAmountCents,
      closedBlind: true,
    },
  });

  // Expected solo se revela DESPUÉS del conteo (cierre ciego).
  return {
    status: 200,
    body: {
      sessionId,
      countedTotalCents: plan.countedTotalCents,
      expectedTotalCents: plan.expectedTotalCents,
      differenceAmountCents: plan.differenceAmountCents,
      electronicSalesCents: ctx.electronicSalesCents,
      closedBlind: true,
      attributedTo: 'cash_register_session',
    },
  };
}

export async function runCashMovementHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    branchId?: string;
    sessionId?: string;
    movementType?: string;
    amountCents?: number;
    counterpartyRef?: string | null;
    reason?: string | null;
    authThresholdCents?: number;
    authorizedByUserId?: string | null;
  },
): Promise<HttpResult> {
  if (!isCashBlindZEnabled(env)) return featureOff('FEATURE_CASH_BLIND_Z');
  if (!env?.DB) return dbUnavailable();

  const parsed = parseCashMovementBody(body);
  if (!parsed.ok) {
    return { status: parsed.status, body: parsed.body };
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO cash_register_cash_movements (
         id, tenant_id, branch_id, cash_register_session_id, movement_type,
         amount_cents, counterparty_ref, reason, created_by_user_id, authorized_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      tenantId,
      parsed.branchId,
      parsed.sessionId,
      parsed.movementType,
      parsed.amountCents,
      body.counterpartyRef ?? null,
      body.reason ?? null,
      userId,
      parsed.authorizedByUserId,
    )
    .run();

  await insertAudit(env.DB, {
    tenantId,
    branchId: parsed.branchId,
    actorUserId: userId,
    action: 'CASH_MOVEMENT',
    entityType: 'cash_register_cash_movement',
    entityId: id,
    payload: { movementType: parsed.movementType, amountCents: parsed.amountCents },
  });

  return {
    status: 200,
    body: { id, movementType: parsed.movementType, amountCents: parsed.amountCents },
  };
}

export async function runSaleReprintHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  userId: string,
  body: {
    saleId?: string;
    branchId?: string;
    reason?: string | null;
  },
): Promise<HttpResult> {
  if (!isCashBlindZEnabled(env)) return featureOff('FEATURE_CASH_BLIND_Z');
  if (!env?.DB) return dbUnavailable();

  const saleId = body.saleId?.trim() ?? '';
  const branchId = body.branchId?.trim() ?? '';
  if (!saleId || !branchId) {
    return { status: 400, body: { error: 'saleId and branchId required', code: 'BAD_REQUEST' } };
  }

  const sale = await env.DB.prepare(`SELECT id FROM sales WHERE id = ? AND tenant_id = ? LIMIT 1`)
    .bind(saleId, tenantId)
    .first<{ id: string }>();
  if (!sale) {
    return { status: 404, body: { error: 'Sale not found', code: 'NOT_FOUND' } };
  }

  let plan;
  try {
    plan = planSaleReprint({
      id: crypto.randomUUID(),
      tenantId,
      saleId,
      branchId,
      printedByUserId: userId,
      reason: body.reason ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 422, body: { error: msg, code: msg } };
  }

  await env.DB.prepare(
    `INSERT INTO sale_reprints (
         id, tenant_id, sale_id, branch_id, printed_by_user_id, copied_watermark, reason
       ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(plan.id, plan.tenantId, plan.saleId, plan.branchId, plan.printedByUserId, plan.reason)
    .run();

  await insertAudit(env.DB, {
    tenantId,
    branchId,
    actorUserId: userId,
    action: 'REPRINT',
    entityType: 'sale',
    entityId: saleId,
    payload: { reprintId: plan.id, copiedWatermark: 1 },
  });

  return {
    status: 200,
    body: {
      id: plan.id,
      saleId,
      copiedWatermark: true,
      watermarkLabel: 'COPIA',
    },
  };
}
