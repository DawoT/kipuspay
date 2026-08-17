/**
 * Crédito de tienda ACID — Sprint 35 / ADR-0019 / §5.3 regla 20.
 * Un db.batch por issue/redeem/expire/adjust. Saldo solo servidor.
 */
import {
  planStoreCreditAdjust,
  planStoreCreditAdjustJournal,
  planStoreCreditExpire,
  planStoreCreditExpireJournal,
  planStoreCreditIssue,
  redeemStoreCreditSourceRef,
} from '@kipuspay/domain-cash';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';
import { sha256HexOf } from './crypto.js';
import {
  appendJournalToPlan,
  loadChartAccountsByCode,
  type JournalPlanSink,
} from './journal-post.js';

export interface ProcessStoreCreditOptions {
  readonly ledgerChartOfAccountsEnabled?: boolean;
  readonly nowMs?: number;
}

export interface ProcessStoreCreditIssueInput {
  readonly branchId: string;
  readonly customerId: string;
  readonly amountCents: number;
  readonly sourceRef: string;
  readonly saleId?: string | null;
  readonly expiresAtIso?: string | null;
}

export interface ProcessStoreCreditRedeemInput {
  readonly branchId: string;
  readonly customerId: string;
  readonly remainingDueCents: number;
  readonly saleId: string;
  readonly online: boolean;
  readonly actorIsAdminOrOwner: boolean;
  readonly clientAmountCents?: number;
}

export interface ProcessStoreCreditExpireInput {
  readonly customerId: string;
  readonly branchId: string;
}

export interface ProcessStoreCreditAdjustInput {
  readonly customerId: string;
  readonly branchId: string;
  readonly amountCents: number;
  readonly adjustSign: 'CREDIT' | 'DEBIT';
  readonly authorizedByUserId: string;
  /**
   * Clave de idempotencia del request (B3, 47b): el sourceRef del ADJUST se
   * deriva de ella, de modo que un reintento por timeout de red NO genera un
   * segundo asiento. Null → se genera un UUID (comportamiento previo).
   */
  readonly idempotencyKey?: string | null;
}

export interface StoreCreditAccountRow {
  readonly id: string;
  readonly balance_cents: number;
  readonly expires_at: string | null;
}

export async function previousStoreCreditAuditHash(
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

function parseExpiresAtMs(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const iso = expiresAt.includes('T') ? expiresAt : expiresAt.replace(' ', 'T');
  const ms = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  return Number.isFinite(ms) ? ms : null;
}

export async function loadStoreCreditAccount(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
): Promise<StoreCreditAccountRow | null> {
  const row = await db
    .prepare(
      `SELECT id, balance_cents, expires_at FROM store_credit_accounts
       WHERE tenant_id = ? AND customer_id = ? LIMIT 1`,
    )
    .bind(tenantId, customerId)
    .first<StoreCreditAccountRow>();
  return row;
}

export async function ensureStoreCreditAccount(
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
  expiresAtIso?: string | null,
): Promise<StoreCreditAccountRow> {
  const existing = await loadStoreCreditAccount(db, tenantId, customerId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO store_credit_accounts (id, tenant_id, customer_id, balance_cents, expires_at)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .bind(id, tenantId, customerId, expiresAtIso ?? null)
    .run();
  const created = await loadStoreCreditAccount(db, tenantId, customerId);
  if (!created) throw new Error(STORE_CREDIT_CUSTOMER_REQUIRED_FALLBACK);
  return created;
}

/**
 * Variante dentro del plan atómico: si la cuenta no existe, el INSERT viaja
 * DENTRO del mismo `db.batch` (el cliente nuevo se crea en el plan; un `.run()`
 * fuera del batch violaría el FK customers→store_credit_accounts — gap real
 * detectado en el Sello QA Batch H). Devuelve el row planificado.
 */
export async function planEnsureStoreCreditAccount(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  tenantId: string,
  customerId: string,
  expiresAtIso?: string | null,
): Promise<StoreCreditAccountRow> {
  const existing = await loadStoreCreditAccount(db, tenantId, customerId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  plan.add(
    db
      .prepare(
        `INSERT INTO store_credit_accounts (id, tenant_id, customer_id, balance_cents, expires_at)
         VALUES (?, ?, ?, 0, ?)`,
      )
      .bind(id, tenantId, customerId, expiresAtIso ?? null),
  );
  return { id, balance_cents: 0, expires_at: expiresAtIso ?? null };
}

const STORE_CREDIT_CUSTOMER_REQUIRED_FALLBACK = 'STORE_CREDIT_CUSTOMER_REQUIRED';

export async function loadExistingStoreCreditTxn(
  db: D1DatabaseLike,
  tenantId: string,
  sourceRef: string,
): Promise<{ id: string; amount_cents: number; type: string } | null> {
  const row = await db
    .prepare(
      `SELECT id, amount_cents, type FROM store_credit_transactions
       WHERE tenant_id = ? AND source_ref = ? LIMIT 1`,
    )
    .bind(tenantId, sourceRef)
    .first<{ id: string; amount_cents: number; type: string }>();
  return row;
}

export async function appendStoreCreditIssueToPlan(
  plan: JournalPlanSink,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly branchId: string;
    readonly accountId: string;
    readonly customerId: string;
    readonly amountCents: number;
    readonly sourceRef: string;
    readonly saleId: string | null;
    readonly prevBalanceCents: number;
    readonly nextBalanceCents: number;
    readonly expiresAtIso?: string | null;
    readonly prevAuditHash: string | null;
    readonly chartOn: boolean;
    readonly accountsByCode: ReadonlyMap<string, string>;
    readonly postDate: string;
    readonly auditAction?: 'STORE_CREDIT_ISSUE';
  },
): Promise<{ txnId: string; rowHash: string }> {
  const existing = await loadExistingStoreCreditTxn(db, input.tenantId, input.sourceRef);
  if (existing) return { txnId: existing.id, rowHash: input.prevAuditHash ?? '' };
  const txnId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const rowHash = await sha256HexOf({
    action: input.auditAction ?? 'STORE_CREDIT_ISSUE',
    entity_id: txnId,
    source_ref: input.sourceRef,
    amount: input.amountCents,
    prev: input.prevAuditHash,
  });
  plan.add(
    db
      .prepare(
        `UPDATE store_credit_accounts
         SET balance_cents = ?, expires_at = COALESCE(?, expires_at)
         WHERE tenant_id = ? AND id = ? AND balance_cents = ?`,
      )
      .bind(
        input.nextBalanceCents,
        input.expiresAtIso ?? null,
        input.tenantId,
        input.accountId,
        input.prevBalanceCents,
      ),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO store_credit_transactions (
             id, tenant_id, store_credit_account_id, type, amount_cents, sale_id,
             source_ref, created_by_user_id
           ) VALUES (?, ?, ?, 'ISSUE', ?, ?, ?, ?)`,
      )
      .bind(
        txnId,
        input.tenantId,
        input.accountId,
        input.amountCents,
        input.saleId,
        input.sourceRef,
        input.userId,
      ),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'STORE_CREDIT_ISSUE', 'store_credit_transaction', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        input.tenantId,
        input.branchId,
        input.userId,
        txnId,
        JSON.stringify({
          customerId: input.customerId,
          amountCents: input.amountCents,
          sourceRef: input.sourceRef,
          saleId: input.saleId,
        }),
        input.prevAuditHash,
        rowHash,
      ),
  );
  return { txnId, rowHash };
}

export async function appendStoreCreditRedeemToPlan(
  plan: JournalPlanSink,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly branchId: string;
    readonly accountId: string;
    readonly customerId: string;
    readonly appliedCents: number;
    readonly prevBalanceCents: number;
    readonly nextBalanceCents: number;
    readonly saleId: string;
    readonly prevAuditHash: string | null;
  },
): Promise<{ txnId: string; rowHash: string }> {
  const sourceRef = redeemStoreCreditSourceRef(input.saleId);
  const existing = await loadExistingStoreCreditTxn(db, input.tenantId, sourceRef);
  if (existing) return { txnId: existing.id, rowHash: input.prevAuditHash ?? '' };
  const txnId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const guardId = crypto.randomUUID();
  const rowHash = await sha256HexOf({
    action: 'STORE_CREDIT_REDEEM',
    entity_id: txnId,
    sale_id: input.saleId,
    amount: input.appliedCents,
    prev: input.prevAuditHash,
  });
  plan.add(
    db
      .prepare(
        `INSERT INTO atomic_guards (id, ok)
         SELECT ?, CASE WHEN balance_cents >= ? THEN 1 ELSE 0 END
         FROM store_credit_accounts
         WHERE tenant_id = ? AND id = ?`,
      )
      .bind(guardId, input.appliedCents, input.tenantId, input.accountId),
  );
  plan.add(
    db
      .prepare(
        `UPDATE store_credit_accounts
         SET balance_cents = balance_cents - ?
         WHERE tenant_id = ? AND id = ? AND balance_cents >= ?`,
      )
      .bind(input.appliedCents, input.tenantId, input.accountId, input.appliedCents),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO store_credit_transactions (
             id, tenant_id, store_credit_account_id, type, amount_cents, sale_id,
             source_ref, created_by_user_id
           ) VALUES (?, ?, ?, 'REDEEM', ?, ?, ?, ?)`,
      )
      .bind(
        txnId,
        input.tenantId,
        input.accountId,
        input.appliedCents,
        input.saleId,
        sourceRef,
        input.userId,
      ),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'STORE_CREDIT_REDEEM', 'store_credit_transaction', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        input.tenantId,
        input.branchId,
        input.userId,
        txnId,
        JSON.stringify({
          customerId: input.customerId,
          appliedCents: input.appliedCents,
          saleId: input.saleId,
        }),
        input.prevAuditHash,
        rowHash,
      ),
  );
  plan.add(db.prepare(`DELETE FROM atomic_guards WHERE id = ?`).bind(guardId));
  return { txnId, rowHash };
}

export async function processStoreCreditIssueAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessStoreCreditIssueInput,
  options: ProcessStoreCreditOptions = {},
): Promise<{
  status: 'SUCCESS' | 'ALREADY_ISSUED';
  txnId: string;
  accountId: string;
  nextBalanceCents: number;
  amountCents: number;
}> {
  const existing = await loadExistingStoreCreditTxn(db, tenantId, input.sourceRef);
  if (existing) {
    const acc = await ensureStoreCreditAccount(db, tenantId, input.customerId);
    return {
      status: 'ALREADY_ISSUED',
      txnId: existing.id,
      accountId: acc.id,
      nextBalanceCents: acc.balance_cents,
      amountCents: existing.amount_cents,
    };
  }
  const planned = planStoreCreditIssue({
    customerId: input.customerId,
    currentBalanceCents: 0,
    amountCents: input.amountCents,
    sourceRef: input.sourceRef,
  });
  const account = await ensureStoreCreditAccount(
    db,
    tenantId,
    input.customerId,
    input.expiresAtIso,
  );
  const nextBalanceCents = account.balance_cents + planned.amountCents;
  const prevHash = await previousStoreCreditAuditHash(db, tenantId);
  const chartOn = options.ledgerChartOfAccountsEnabled === true;
  const accountsByCode = chartOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const nowMs = options.nowMs ?? Date.now();
  const postDate = new Date(nowMs).toISOString().slice(0, 10);
  let txnId = '';
  await runD1AtomicPlan(db, async (plan) => {
    const posted = await appendStoreCreditIssueToPlan(plan, db, {
      tenantId,
      userId,
      branchId: input.branchId,
      accountId: account.id,
      customerId: input.customerId,
      amountCents: planned.amountCents,
      sourceRef: input.sourceRef,
      saleId: input.saleId ?? null,
      prevBalanceCents: account.balance_cents,
      nextBalanceCents,
      expiresAtIso: input.expiresAtIso ?? null,
      prevAuditHash: prevHash,
      chartOn,
      accountsByCode,
      postDate,
    });
    txnId = posted.txnId;
  });
  return {
    status: 'SUCCESS',
    txnId,
    accountId: account.id,
    nextBalanceCents,
    amountCents: planned.amountCents,
  };
}

export async function processStoreCreditExpireAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessStoreCreditExpireInput,
  options: ProcessStoreCreditOptions = {},
): Promise<{ status: 'SUCCESS' | 'NOOP'; txnId: string | null; nextBalanceCents: number }> {
  const account = await loadStoreCreditAccount(db, tenantId, input.customerId);
  if (!account) throw new Error('STORE_CREDIT_ACCOUNT_NOT_FOUND');
  const nowMs = options.nowMs ?? Date.now();
  const planned = planStoreCreditExpire({
    balanceCents: account.balance_cents,
    expiresAtMs: parseExpiresAtMs(account.expires_at),
    nowMs,
  });
  const sourceRef = `expire:${account.id}:${new Date(nowMs).toISOString().slice(0, 10)}`;
  const existing = await loadExistingStoreCreditTxn(db, tenantId, sourceRef);
  if (existing) {
    return { status: 'SUCCESS', txnId: existing.id, nextBalanceCents: 0 };
  }
  const prevHash = await previousStoreCreditAuditHash(db, tenantId);
  const chartOn = options.ledgerChartOfAccountsEnabled === true;
  const accountsByCode = chartOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const postDate = new Date(nowMs).toISOString().slice(0, 10);
  const txnId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const rowHash = await sha256HexOf({
    action: 'STORE_CREDIT_EXPIRE',
    entity_id: txnId,
    amount: planned.amountCents,
    prev: prevHash,
  });
  await runD1AtomicPlan(db, async (plan) => {
    plan.add(
      db
        .prepare(
          `UPDATE store_credit_accounts SET balance_cents = 0
           WHERE tenant_id = ? AND id = ? AND balance_cents = ?`,
        )
        .bind(tenantId, account.id, account.balance_cents),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO store_credit_transactions (
               id, tenant_id, store_credit_account_id, type, amount_cents, source_ref,
               created_by_user_id
             ) VALUES (?, ?, ?, 'EXPIRE', ?, ?, ?)`,
        )
        .bind(txnId, tenantId, account.id, planned.amountCents, sourceRef, userId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'STORE_CREDIT_EXPIRE', 'store_credit_transaction', ?, ?, ?, ?)`,
        )
        .bind(
          auditId,
          tenantId,
          input.branchId,
          userId,
          txnId,
          JSON.stringify({ type: 'EXPIRE', amountCents: planned.amountCents }),
          prevHash,
          rowHash,
        ),
    );
    if (chartOn) {
      await appendJournalToPlan(plan, db, {
        tenantId,
        branchId: input.branchId,
        userId,
        accountsByCode,
        prevAuditHash: prevHash,
        entry: planStoreCreditExpireJournal({
          sourceId: txnId,
          postDate,
          amountCents: planned.amountCents,
        }),
      });
    }
  });
  return { status: 'SUCCESS', txnId, nextBalanceCents: 0 };
}

export async function processStoreCreditAdjustAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  userId: string,
  input: ProcessStoreCreditAdjustInput,
  options: ProcessStoreCreditOptions = {},
): Promise<{
  status: 'SUCCESS' | 'ALREADY_ADJUSTED';
  txnId: string;
  nextBalanceCents: number;
}> {
  const account = await ensureStoreCreditAccount(db, tenantId, input.customerId);
  const planned = planStoreCreditAdjust({
    currentBalanceCents: account.balance_cents,
    amountCents: input.amountCents,
    adjustSign: input.adjustSign,
    authorizedByUserId: input.authorizedByUserId,
  });
  const nowMs = options.nowMs ?? Date.now();
  // B3 (47b): sourceRef determinista por idempotencyKey — el reintento de un
  // ajuste (timeout de red) debe ser NO-OP, nunca un segundo débito/crédito.
  const sourceRef = `adjust:${input.idempotencyKey ?? crypto.randomUUID()}`;
  const existing = await loadExistingStoreCreditTxn(db, tenantId, sourceRef);
  if (existing) {
    return {
      status: 'ALREADY_ADJUSTED',
      txnId: existing.id,
      nextBalanceCents: account.balance_cents,
    };
  }
  const prevHash = await previousStoreCreditAuditHash(db, tenantId);
  const chartOn = options.ledgerChartOfAccountsEnabled === true;
  const accountsByCode = chartOn ? await loadChartAccountsByCode(db, tenantId) : new Map();
  const postDate = new Date(nowMs).toISOString().slice(0, 10);
  const txnId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const rowHash = await sha256HexOf({
    action: 'STORE_CREDIT_ADJUST',
    entity_id: txnId,
    adjust: input.adjustSign,
    amount: planned.amountCents,
    prev: prevHash,
  });
  try {
    await runD1AtomicPlan(db, async (plan) => {
      // Guard anti-carrera: aborta el batch si otra tx con el mismo source_ref
      // se commiteó entre el preflight y este batch (UNIQUE + CHECK ok=1).
      plan.guardState(
        `SELECT 1 WHERE NOT EXISTS (
           SELECT 1 FROM store_credit_transactions
           WHERE tenant_id = ? AND source_ref = ?
         )`,
        [tenantId, sourceRef],
      );
      plan.add(
        db
          .prepare(
            `UPDATE store_credit_accounts SET balance_cents = ?
           WHERE tenant_id = ? AND id = ? AND balance_cents = ?`,
          )
          .bind(planned.nextBalanceCents, tenantId, account.id, account.balance_cents),
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO store_credit_transactions (
               id, tenant_id, store_credit_account_id, type, amount_cents, source_ref,
               adjust_sign, created_by_user_id, authorized_by_user_id
             ) VALUES (?, ?, ?, 'ADJUST', ?, ?, ?, ?, ?)`,
          )
          .bind(
            txnId,
            tenantId,
            account.id,
            planned.amountCents,
            sourceRef,
            input.adjustSign,
            userId,
            input.authorizedByUserId,
          ),
      );
      plan.add(
        db
          .prepare(
            `INSERT INTO audit_events (
               id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
               payload_json, prev_hash, row_hash
             ) VALUES (?, ?, ?, ?, 'STORE_CREDIT_ADJUST', 'store_credit_transaction', ?, ?, ?, ?)`,
          )
          .bind(
            auditId,
            tenantId,
            input.branchId,
            userId,
            txnId,
            JSON.stringify({
              type: 'ADJUST',
              adjustSign: input.adjustSign,
              amountCents: planned.amountCents,
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
          accountsByCode,
          prevAuditHash: prevHash,
          entry: planStoreCreditAdjustJournal({
            sourceId: txnId,
            postDate,
            amountCents: planned.amountCents,
            adjustSign: input.adjustSign,
          }),
        });
      }
    });
  } catch {
    // Perdedor de la carrera de dedup: el batch fue abortado por el guard o por
    // el UNIQUE(source_ref); responder idempotente, no 500.
    const winner = await loadExistingStoreCreditTxn(db, tenantId, sourceRef);
    if (winner) {
      return {
        status: 'ALREADY_ADJUSTED',
        txnId: winner.id,
        nextBalanceCents: account.balance_cents,
      };
    }
    throw new Error('STORE_CREDIT_ADJUST_RACE_ABORTED');
  }
  return { status: 'SUCCESS', txnId, nextBalanceCents: planned.nextBalanceCents };
}

export { parseExpiresAtMs };
