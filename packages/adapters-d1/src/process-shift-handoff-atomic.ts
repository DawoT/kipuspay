/* eslint-disable no-secrets/no-secrets -- nombres canónicos de dominio y SQL */
/**
 * processShiftHandoffAtomic — handoff de turno y equipo (Arquitectura §5.3
 * reglas 35-36). Preflight fuera del batch; una sola db.batch vía
 * runD1AtomicPlan: el PIN se consume con guard SQL (single-use) y la sesión
 * sigue OPEN. Audit SHIFT_TRANSFER / TEAM_INVITE con cadena de hashes.
 */
import {
  buildShiftTransfer,
  generateCashierPin,
  generatePin,
  generateBadgeBarcode,
  hashPin,
  isValidInviteEmail,
  normalizeInviteEmail,
  TRANSFER_PIN_LENGTH,
  TRANSFER_PIN_TTL_MS,
  verifyTransferPin,
  type ShiftTransferCommand,
} from '@kipuspay/domain-ops';
import { computeExpectedCashCents } from '@kipuspay/domain-cash';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { sha256Hex } from './crypto.js';

export interface ShiftTransferResultOk {
  ok: true;
  shiftId: string;
  incomingUserId: string;
  startedAtIso: string;
  cashDiffCents: number | null;
  interimCountCents: number | null;
  interimRequired: boolean;
}

export interface ShiftErrorBody {
  status: number;
  body: { error: string; code: string };
}

export type ShiftTransferResult = ShiftTransferResultOk | ({ ok: false } & ShiftErrorBody);

async function computeAuditHash(event: Record<string, unknown>): Promise<string> {
  return sha256Hex(JSON.stringify(event));
}

async function previousAuditHash(db: D1DatabaseLike, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT row_hash FROM audit_events
       WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  return row?.row_hash ?? null;
}

async function loadSession(
  db: D1DatabaseLike,
  tenantId: string,
  sessionId: string,
): Promise<{
  id: string;
  branch_id: string;
  opened_at: string;
  status: string;
  opening_balance_cents: number;
} | null> {
  return db
    .prepare(
      `SELECT id, branch_id, opened_at, status, opening_balance_cents
       FROM cash_register_sessions WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(sessionId, tenantId)
    .first<{
      id: string;
      branch_id: string;
      opened_at: string;
      status: string;
      opening_balance_cents: number;
    }>();
}

export type IssueShiftPinResult =
  | { ok: true; shiftId: string; pin: string; pinHash: string; expiresAtIso: string }
  | { ok: false; status: number; body: { error: string; code: string } };

/**
 * Emite el PIN temporal de un solo uso para el handoff. El tramo del saliente
 * nace en la primera emisión (started_at = apertura de la sesión para que el
 * desglose Z arranque del inicio del turno); re-emitir invalida el anterior.
 */
export async function issueShiftPinAtomic(
  db: D1DatabaseLike,
  input: { tenantId: string; userId: string; sessionId: string; nowIso?: string },
): Promise<IssueShiftPinResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const session = await loadSession(db, input.tenantId, input.sessionId);
  if (!session)
    return { ok: false, status: 404, body: { error: 'Session not found', code: 'NOT_FOUND' } };
  if (session.status !== 'OPEN') {
    return { ok: false, status: 422, body: { error: 'Session not open', code: 'SESSION_CLOSED' } };
  }

  const activeShift = await db
    .prepare(
      `SELECT id FROM cash_register_shifts
       WHERE tenant_id = ? AND cash_register_session_id = ? AND ended_at IS NULL AND user_id = ? LIMIT 1`,
    )
    .bind(input.tenantId, input.sessionId, input.userId)
    .first<{ id: string }>();

  const pin = generatePin(TRANSFER_PIN_LENGTH);
  const pinHash = await hashPin(pin);
  const expiresAtMs = Date.parse(nowIso) + TRANSFER_PIN_TTL_MS;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  const build = (plan: AtomicPlanBuilder): void => {
    if (activeShift) {
      plan.add(
        db
          .prepare(
            `UPDATE cash_register_shifts
             SET transfer_pin_hash = ?, transfer_pin_expires_at = ?
             WHERE id = ? AND tenant_id = ? AND ended_at IS NULL`,
          )
          .bind(pinHash, expiresAtIso, activeShift.id, input.tenantId),
      );
    } else {
      const shiftId = crypto.randomUUID();
      plan.add(
        db
          .prepare(
            `INSERT INTO cash_register_shifts (
               id, tenant_id, branch_id, cash_register_session_id, user_id,
               started_at, transfer_pin_hash, transfer_pin_expires_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            shiftId,
            input.tenantId,
            session.branch_id,
            input.sessionId,
            input.userId,
            session.opened_at,
            pinHash,
            expiresAtIso,
          ),
      );
    }
  };
  await runD1AtomicPlan(db, build);
  const shiftId = activeShift?.id ?? '';
  return { ok: true, shiftId, pin, pinHash, expiresAtIso };
}

async function loadInterimExpectedCashCents(
  db: D1DatabaseLike,
  tenantId: string,
  sessionId: string,
  openingBalanceCents: number,
): Promise<number> {
  const cashSales = await db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount_cents), 0) AS cash_cents
       FROM sale_payments sp
       INNER JOIN sales s ON s.id = sp.sale_id AND s.tenant_id = sp.tenant_id
       INNER JOIN payment_methods pm ON pm.id = sp.payment_method_id AND pm.tenant_id = sp.tenant_id
       WHERE s.tenant_id = ? AND s.cash_register_session_id = ?
         AND pm.code = 'cash'
         AND NOT EXISTS (
           SELECT 1 FROM accounts_receivable ar
           WHERE ar.tenant_id = s.tenant_id AND ar.sale_id = s.id
         )`,
    )
    .bind(tenantId, sessionId)
    .first<{ cash_cents: number }>();
  const movements = await db
    .prepare(
      `SELECT movement_type, amount_cents FROM cash_register_cash_movements
       WHERE tenant_id = ? AND cash_register_session_id = ?`,
    )
    .bind(tenantId, sessionId)
    .all<{ movement_type: string; amount_cents: number }>();
  const legacy = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS expense_cents
       FROM cash_register_expenses WHERE tenant_id = ? AND cash_register_session_id = ?`,
    )
    .bind(tenantId, sessionId)
    .first<{ expense_cents: number }>();
  return computeExpectedCashCents({
    openingBalanceCents,
    cashSalesCents: cashSales?.cash_cents ?? 0,
    movements: (movements.results ?? []).map((m) => ({
      movementType: m.movement_type as
        'DEPOSIT_VALUES' | 'CHANGE_FUND_IN' | 'CHANGE_FUND_OUT' | 'SUPPLIER_PAYMENT' | 'ADJUSTMENT',
      amountCents: m.amount_cents,
    })),
    legacyExpenseCents: legacy?.expense_cents ?? 0,
  });
}

/**
 * Transfiere la sesión OPEN del operador saliente al entrante con el PIN
 * temporal. El PIN se consume dentro del batch (guard `ended_at IS NULL` +
 * hash + TTL): dos usos concurrentes no pueden consumir el mismo PIN. La
 * diferencia del conteo intermedio se audita pero no bloquea.
 */
export async function processShiftTransferAtomic(
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    sessionId: string;
    outgoingUserId: string;
    incomingUserId: string;
    pin: string;
    branchId?: string;
    interimCountCents?: number | null;
    nowIso?: string;
  },
): Promise<ShiftTransferResult> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const session = await loadSession(db, input.tenantId, input.sessionId);
  if (!session)
    return { ok: false, status: 404, body: { error: 'Session not found', code: 'NOT_FOUND' } };
  if (session.status !== 'OPEN') {
    return { ok: false, status: 422, body: { error: 'Session not open', code: 'SESSION_CLOSED' } };
  }

  const outgoingShift = await db
    .prepare(
      `SELECT id, transfer_pin_hash, transfer_pin_expires_at
       FROM cash_register_shifts
       WHERE tenant_id = ? AND cash_register_session_id = ? AND user_id = ?
         AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(input.tenantId, input.sessionId, input.outgoingUserId)
    .first<{
      id: string;
      transfer_pin_hash: string | null;
      transfer_pin_expires_at: string | null;
    }>();
  if (
    !outgoingShift ||
    !outgoingShift.transfer_pin_hash ||
    !outgoingShift.transfer_pin_expires_at
  ) {
    return {
      ok: false,
      status: 401,
      body: { error: 'No transfer PIN issued for this operator', code: 'PIN_NOT_ISSUED' },
    };
  }

  const pinResult = await verifyTransferPin(
    input.pin,
    outgoingShift.transfer_pin_hash,
    outgoingShift.transfer_pin_expires_at,
    nowMs,
  );
  if (pinResult !== 'OK') {
    return {
      ok: false,
      status: 401,
      body: {
        error: pinResult === 'PIN_EXPIRED' ? 'Transfer PIN expired' : 'Invalid transfer PIN',
        code: pinResult,
      },
    };
  }

  const policyRow = await db
    .prepare(`SELECT interim_required FROM tenant_discount_policies WHERE tenant_id = ? LIMIT 1`)
    .bind(input.tenantId)
    .first<{ interim_required: number }>();
  const interimRequired = (policyRow?.interim_required ?? 0) === 1;

  let expectedInterimCashCents: number | null = null;
  if (interimRequired) {
    expectedInterimCashCents = await loadInterimExpectedCashCents(
      db,
      input.tenantId,
      input.sessionId,
      session.opening_balance_cents,
    );
  }

  const built = buildShiftTransfer({
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    branchId: input.branchId ?? session.branch_id,
    outgoingUserId: input.outgoingUserId,
    incomingUserId: input.incomingUserId,
    pin: input.pin,
    pinHash: outgoingShift.transfer_pin_hash,
    pinExpiresAtIso: outgoingShift.transfer_pin_expires_at,
    nowIso,
    policy: { interimRequired },
    interimCountCents: input.interimCountCents ?? null,
    expectedInterimCashCents,
  });
  if (!built.ok) {
    const code = built.code;
    return {
      ok: false,
      status: code === 'SAME_OPERATOR' ? 422 : 422,
      body: { error: code.replaceAll('_', ' ').toLowerCase(), code },
    };
  }
  const command: ShiftTransferCommand = built.command;

  const auditTail = await previousAuditHash(db, input.tenantId);
  const rowHash = await computeAuditHash({
    action: 'SHIFT_TRANSFER',
    entity_id: outgoingShift.id,
    session_id: input.sessionId,
    outgoing_user_id: input.outgoingUserId,
    incoming_user_id: input.incomingUserId,
    cash_diff_cents: command.cashDiffCents,
    interim_count_cents: command.interimCountCents,
    prev_hash: auditTail,
  });
  const incomingShiftId = crypto.randomUUID();
  const auditId = crypto.randomUUID();

  const build = (plan: AtomicPlanBuilder): void => {
    // Guard optimista (Arquitectura §6): el PIN se consume DENTRO del batch;
    // si otro handoff ya lo consumió (ended_at set) o expiró, ok=0 → CHECK
    // aborta y revierte toda la secuencia (single-use atómico).
    plan.guardState(
      `SELECT 1 FROM cash_register_shifts
       WHERE id = ? AND tenant_id = ? AND ended_at IS NULL
         AND transfer_pin_hash = ? AND transfer_pin_expires_at > ?`,
      [outgoingShift.id, input.tenantId, outgoingShift.transfer_pin_hash, nowIso],
    );
    plan.add(
      db
        .prepare(
          `UPDATE cash_register_shifts SET
             ended_at = ?,
             interim_count_cents = ?,
             cash_diff_cents = ?
           WHERE id = ? AND tenant_id = ?`,
        )
        .bind(
          nowIso,
          command.interimCountCents,
          command.cashDiffCents,
          outgoingShift.id,
          input.tenantId,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO cash_register_shifts (
             id, tenant_id, branch_id, cash_register_session_id, user_id, started_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          incomingShiftId,
          input.tenantId,
          command.branchId,
          input.sessionId,
          input.incomingUserId,
          command.startedAtIso,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'SHIFT_TRANSFER', 'cash_register_shift', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          input.tenantId,
          command.branchId,
          input.outgoingUserId,
          outgoingShift.id,
          JSON.stringify({
            outgoingUserId: input.outgoingUserId,
            incomingUserId: input.incomingUserId,
            cashDiffCents: command.cashDiffCents,
            interimCountCents: command.interimCountCents,
            interimRequired,
          }),
          auditTail,
          rowHash,
        ),
    );
  };

  try {
    await runD1AtomicPlan(db, build);
  } catch {
    // El guard no consumió el PIN: reuso o expiración concurrente.
    return {
      ok: false,
      status: 409,
      body: { error: 'Transfer PIN already used', code: 'PIN_USED' },
    };
  }

  return {
    ok: true,
    shiftId: incomingShiftId,
    incomingUserId: input.incomingUserId,
    startedAtIso: command.startedAtIso,
    cashDiffCents: command.cashDiffCents,
    interimCountCents: command.interimCountCents,
    interimRequired,
  };
}

export interface TeamInviteInput {
  tenantId: string;
  branchId?: string | null;
  actorUserId: string;
  email: string;
  role: 'cashier' | 'supervisor' | 'admin';
  nowIso?: string;
}

export interface TeamInviteResultOk {
  ok: true;
  userId: string;
  badgeBarcode: string;
  cashierPin: string;
  alreadyExists: boolean;
}

export type TeamInviteResult =
  TeamInviteResultOk | { ok: false; status: number; body: { error: string; code: string } };

const ALLOWED_INVITE_ROLES = new Set(['cashier', 'supervisor', 'admin']);

/**
 * Invita a un cajero/vendedor: único por email (409 si ya existe activo),
 * emite PIN de caja y badge EMP- únicos del tenant; audit TEAM_INVITE.
 */
export async function processTeamInviteAtomic(
  db: D1DatabaseLike,
  input: TeamInviteInput,
): Promise<TeamInviteResult> {
  const email = normalizeInviteEmail(input.email);
  if (!isValidInviteEmail(email)) {
    return {
      ok: false,
      status: 422,
      body: { error: 'Invalid email', code: 'INVITE_INVALID_EMAIL' },
    };
  }
  if (!ALLOWED_INVITE_ROLES.has(input.role)) {
    return { ok: false, status: 422, body: { error: 'Invalid role', code: 'INVITE_INVALID_ROLE' } };
  }
  const existing = await db
    .prepare(
      `SELECT id FROM users WHERE tenant_id = ? AND email = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(input.tenantId, email)
    .first<{ id: string }>();
  if (existing) {
    return {
      ok: false,
      status: 409,
      body: { error: 'User already invited', code: 'USER_ALREADY_INVITED' },
    };
  }

  const badges = await db
    .prepare(`SELECT badge_barcode FROM users WHERE tenant_id = ? AND badge_barcode IS NOT NULL`)
    .bind(input.tenantId)
    .all<{ badge_barcode: string }>();
  const badgeBarcode = generateBadgeBarcode(
    new Set((badges.results ?? []).map((row) => row.badge_barcode)),
  );
  const cashierPin = generateCashierPin();
  const pinHash = await hashPin(cashierPin);
  const userId = crypto.randomUUID();
  const nowIso = input.nowIso ?? new Date().toISOString();

  const auditTail = await previousAuditHash(db, input.tenantId);
  const rowHash = await computeAuditHash({
    action: 'TEAM_INVITE',
    entity_id: userId,
    email,
    role: input.role,
    prev_hash: auditTail,
  });
  const auditId = crypto.randomUUID();

  const build = (plan: AtomicPlanBuilder): void => {
    plan.add(
      db
        .prepare(
          `INSERT INTO users (
             id, tenant_id, branch_id, email, role, permissions, is_active,
             pin_hash, badge_barcode, created_at
           ) VALUES (?, ?, ?, ?, ?, '[]', 1, ?, ?, ?)`,
        )
        .bind(
          userId,
          input.tenantId,
          input.branchId ?? null,
          email,
          input.role,
          pinHash,
          badgeBarcode,
          nowIso,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'TEAM_INVITE', 'user', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          input.tenantId,
          input.branchId ?? null,
          input.actorUserId,
          userId,
          JSON.stringify({ email, role: input.role, badgeBarcode }),
          auditTail,
          rowHash,
        ),
    );
  };
  await runD1AtomicPlan(db, build);

  return { ok: true, userId, badgeBarcode, cashierPin, alreadyExists: false };
}

export interface ResolvedSeller {
  userId: string;
  email: string;
  role: string;
  badgeBarcode: string | null;
  resolvedBy: 'badge' | 'pin';
}

/**
 * Resuelve la identidad del vendedor para la atribución <1 s en el carrito:
 * badge EMP- (reusa el namespace del lector, edge 1A) o PIN de caja de 4
 * dígitos (hash server-side). Fail-closed: cualquier otra cosa ⇒ 404.
 */
export async function resolveSellerIdentifier(
  db: D1DatabaseLike,
  tenantId: string,
  identifier: string,
): Promise<
  | { ok: true; seller: ResolvedSeller }
  | { ok: false; status: number; body: { error: string; code: string } }
> {
  const raw = identifier.trim();
  if (raw.startsWith('EMP-')) {
    const seller = await db
      .prepare(
        `SELECT id, email, role, badge_barcode FROM users
         WHERE tenant_id = ? AND badge_barcode = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(tenantId, raw)
      .first<{ id: string; email: string; role: string; badge_barcode: string }>();
    if (!seller) {
      return {
        ok: false,
        status: 404,
        body: { error: 'Unknown seller badge', code: 'UNKNOWN_IDENTIFIER' },
      };
    }
    return {
      ok: true,
      seller: {
        userId: seller.id,
        email: seller.email,
        role: seller.role,
        badgeBarcode: seller.badge_barcode,
        resolvedBy: 'badge',
      },
    };
  }
  if (/^\d{4}$/.test(raw)) {
    const pinHash = await hashPin(raw);
    const seller = await db
      .prepare(
        `SELECT id, email, role, badge_barcode FROM users
         WHERE tenant_id = ? AND pin_hash = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(tenantId, pinHash)
      .first<{ id: string; email: string; role: string; badge_barcode: string | null }>();
    if (!seller) {
      return {
        ok: false,
        status: 404,
        body: { error: 'Unknown seller PIN', code: 'UNKNOWN_IDENTIFIER' },
      };
    }
    return {
      ok: true,
      seller: {
        userId: seller.id,
        email: seller.email,
        role: seller.role,
        badgeBarcode: seller.badge_barcode,
        resolvedBy: 'pin',
      },
    };
  }
  return {
    ok: false,
    status: 404,
    body: { error: 'Unknown identifier', code: 'UNKNOWN_IDENTIFIER' },
  };
}
