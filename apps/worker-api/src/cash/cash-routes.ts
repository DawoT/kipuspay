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
import {
  appendAuditEvent,
  appendJournalToPlan,
  clearPinLockout,
  hashPinArgon2id,
  loadChartAccountsByCode,
  loadLiveAuthToken,
  readPinLockout,
  recordPinFailure,
  verifyPinHash,
} from '@kipuspay/adapters-d1';
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
  await appendAuditEvent(db, { tenantId: input.tenantId }, async (prev) => ({
    id: crypto.randomUUID(),
    branchId: input.branchId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payloadJson: JSON.stringify(input.payload),
    prevHash: prev,
    rowHash: await sha256Hex(
      JSON.stringify({
        action: input.action,
        entity_id: input.entityId,
        prev_hash: prev,
        payload: input.payload,
      }),
    ),
  }));
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
      requiresAuthz: boolean;
      authorizationTokenHash?: string;
      authorizedByUserId?: string | null;
    }
  | { ok: false; status: number; body: { error: string; code: string } };

function movementRequiresAuthz(amountCents: number, threshold: number): boolean {
  return amountCents > threshold;
}

/**
 * S17-H1: política de caja server-side. El umbral de authz de movimientos y de
 * justificación del arqueo viene de `tenant_discount_policies
 * .max_amount_without_auth_cents` (default S/20 = 2000 cents). El cliente NUNCA
 * define el umbral (bypass). La política es por tenant, no por sucursal.
 */
async function loadCashPolicyThresholdCents(db: D1Database, tenantId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT max_amount_without_auth_cents FROM tenant_discount_policies
       WHERE tenant_id = ? LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ max_amount_without_auth_cents: number }>();
  if (!row || !Number.isInteger(row.max_amount_without_auth_cents)) return 2000;
  return row.max_amount_without_auth_cents;
}

/** S17-H2: scopes de authz emisibles (descuento, crédito, movimiento de caja). */
const AUTHZ_SCOPES = new Set(['DISCOUNT_OVERRIDE', 'CREDIT_LIMIT_OVERRIDE', 'CASH_MOVEMENT']);

const AUTHZ_TOKEN_TTL_SECONDS = 90;

interface AuthzTokenBody {
  pin?: string;
  scope?: string;
}

/**
 * S17-H2: emite un authorization_token one-shot tras verificar el PIN del
 * supervisor (SEC-03, SEC-11): lockout 5 fallos / 15 min, TTL ≤ 90 s, el hash
 * almacenado en authorization_tokens.token_hash es SHA-256 del token emitido
 * (el motor lo consume con requireLiveAuthToken). El PIN viaja al servidor
 * (hasheado para comparación) y jamás se guarda.
 */
export async function runAuthzTokenMintHttp(
  env: WorkerEnv | undefined,
  tenantId: string,
  approverUserId: string,
  body: AuthzTokenBody,
): Promise<HttpResult> {
  if (!isCashBlindZEnabled(env)) return featureOff('FEATURE_CASH_BLIND_Z');
  if (!env?.DB) return dbUnavailable();

  const scope = body.scope?.trim() ?? '';
  if (!AUTHZ_SCOPES.has(scope)) {
    return { status: 422, body: { error: 'Invalid authz scope', code: 'INVALID_SCOPE' } };
  }

  const approver = await env.DB.prepare(
    `SELECT id, role, pin_hash FROM users
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
  )
    .bind(approverUserId, tenantId)
    .first<{ id: string; role: string; pin_hash: string | null }>();
  if (!approver?.pin_hash) {
    return { status: 403, body: { error: 'Approver without PIN', code: 'PIN_NOT_CONFIGURED' } };
  }

  // G4 (auditoría staff): 3-way — un cajero con PIN no se auto-aprueba
  // movimientos/descuentos; solo supervisor/admin/owner emiten authz.
  if (approver.role !== 'supervisor' && approver.role !== 'admin' && approver.role !== 'owner') {
    return { status: 403, body: { error: 'Approver role required', code: 'FORBIDDEN_APPROVER' } };
  }

  const nowMs = Date.now();
  const lockState = await readPinLockout(env.DB, tenantId, approverUserId, nowMs);
  if (lockState.locked) {
    return { status: 403, body: { error: 'PIN locked', code: 'PIN_LOCKED' } };
  }

  const verified = await verifyPinHash(body.pin?.trim() ?? '', approver.pin_hash);
  if (!verified.ok) {
    const after = await recordPinFailure(env.DB, tenantId, approverUserId, nowMs);
    if (after.locked) {
      return { status: 403, body: { error: 'PIN locked', code: 'PIN_LOCKED' } };
    }
    return { status: 403, body: { error: 'Invalid PIN', code: 'PIN_INVALID' } };
  }
  if (verified.needsRehash) {
    await env.DB.prepare('UPDATE users SET pin_hash = ? WHERE tenant_id = ? AND id = ?')
      .bind(await hashPinArgon2id(body.pin?.trim() ?? ''), tenantId, approverUserId)
      .run();
  }
  await clearPinLockout(env.DB, tenantId, approverUserId);

  const token = crypto.randomUUID().replace(/-/g, '');
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(nowMs + AUTHZ_TOKEN_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO authorization_tokens (id, tenant_id, token_hash, approved_by_user_id, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), tenantId, tokenHash, approverUserId, expiresAt)
    .run();

  return {
    status: 200,
    body: { tokenHash, ttlSeconds: AUTHZ_TOKEN_TTL_SECONDS, scope, expiresAt },
  };
}

function parseCashMovementBody(
  body: {
    branchId?: string;
    sessionId?: string;
    movementType?: string;
    amountCents?: number;
    authorizationTokenHash?: string;
    authorizedByUserId?: string | null;
  },
  serverThresholdCents: number,
): CashMovementParseResult {
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
  // S17-H1: umbral server-side (política del tenant), nunca del cliente.
  // La autorización SOLO se concede por un token vivo verificado server-side:
  // el campo authorizedByUserId del cliente se ignora para el gate (S17-H2).
  const requiresAuthz = movementRequiresAuthz(amountCents, serverThresholdCents);
  return {
    ok: true,
    movementType,
    amountCents,
    sessionId,
    branchId,
    requiresAuthz,
    ...(body.authorizationTokenHash !== undefined
      ? { authorizationTokenHash: body.authorizationTokenHash }
      : {}),
    ...(body.authorizedByUserId !== undefined
      ? { authorizedByUserId: body.authorizedByUserId }
      : {}),
  };
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

  // S17-H1: umbral de justificación server-side (política del tenant).
  // El cliente nunca define el umbral — un valor enorme no salta la justificación.
  const differenceThresholdCents = await loadCashPolicyThresholdCents(env.DB, tenantId);
  const countLines = normalizeCountLines(body.countLines);

  let plan;
  try {
    plan = planBlindClose({
      expectedCents: ctx.expectedCents,
      countLines,
      differenceThresholdCents,
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
    authorizationTokenHash?: string;
    authorizedByUserId?: string | null;
  },
): Promise<HttpResult> {
  if (!isCashBlindZEnabled(env)) return featureOff('FEATURE_CASH_BLIND_Z');
  if (!env?.DB) return dbUnavailable();

  const threshold = await loadCashPolicyThresholdCents(env.DB, tenantId);
  const parsed = parseCashMovementBody(body, threshold);
  if (!parsed.ok) {
    return { status: parsed.status, body: parsed.body };
  }

  // S17-H2: sobre el umbral, la autorización se verifica contra un token vivo
  // (PIN supervisor, TTL 90s, un solo uso). El aprobador lo impone el token.
  let authorizedByUserId: string | null = null;
  let liveToken: { id: string; approvedByUserId: string } | null = null;
  if (parsed.requiresAuthz) {
    liveToken = await loadLiveAuthToken(env.DB, tenantId, parsed.authorizationTokenHash);
    if (!liveToken) {
      return {
        status: 403,
        body: { error: 'Authz token required', code: 'AUTH_TOKEN_REQUIRED' },
      };
    }
    authorizedByUserId = liveToken.approvedByUserId;
  }

  const id = crypto.randomUUID();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO cash_register_cash_movements (
         id, tenant_id, branch_id, cash_register_session_id, movement_type,
         amount_cents, counterparty_ref, reason, created_by_user_id, authorized_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      tenantId,
      parsed.branchId,
      parsed.sessionId,
      parsed.movementType,
      parsed.amountCents,
      body.counterpartyRef ?? null,
      body.reason ?? null,
      userId,
      authorizedByUserId,
    ),
  ];
  if (liveToken) {
    stmts.push(
      env.DB.prepare(
        `UPDATE authorization_tokens SET used_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
      ).bind(liveToken.id, tenantId),
    );
  }
  await env.DB.batch(stmts);

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
