/**
 * Diario automático — Sprint 32 / ADR-0016.
 * Append-only en el mismo db.batch que el hecho operativo. UI nunca muta.
 */
import {
  SEED_CHART_OF_ACCOUNTS,
  type JournalEntryPlan,
  type JournalSourceType,
} from '@kipuspay/domain-cash';
import type { D1Bound, D1DatabaseLike } from './index.js';

export interface JournalPlanSink {
  add(statement: D1Bound): unknown;
}

async function sha256Hex(payload: Record<string, unknown>): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function ensureChartSeeded(db: D1DatabaseLike, tenantId: string): Promise<void> {
  for (const acc of SEED_CHART_OF_ACCOUNTS) {
    await db
      .prepare(
        `INSERT INTO chart_of_accounts (id, tenant_id, code, name, type)
         SELECT ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM chart_of_accounts WHERE tenant_id = ? AND code = ?
         )`,
      )
      .bind(
        `coa-${tenantId}-${acc.code}`,
        tenantId,
        acc.code,
        acc.name,
        acc.type,
        tenantId,
        acc.code,
      )
      .run();
  }
}

export async function loadChartAccountsByCode(
  db: D1DatabaseLike,
  tenantId: string,
): Promise<Map<string, string>> {
  let rows = await db
    .prepare(`SELECT id, code FROM chart_of_accounts WHERE tenant_id = ?`)
    .bind(tenantId)
    .all<{ id: string; code: string }>();
  if ((rows.results ?? []).length < SEED_CHART_OF_ACCOUNTS.length) {
    await ensureChartSeeded(db, tenantId);
    rows = await db
      .prepare(`SELECT id, code FROM chart_of_accounts WHERE tenant_id = ?`)
      .bind(tenantId)
      .all<{ id: string; code: string }>();
  }
  return new Map((rows.results ?? []).map((row) => [row.code, row.id]));
}

export async function appendJournalToPlan(
  plan: JournalPlanSink,
  db: D1DatabaseLike,
  input: {
    readonly tenantId: string;
    readonly branchId: string;
    readonly userId: string;
    readonly entry: JournalEntryPlan;
    readonly accountsByCode: ReadonlyMap<string, string>;
    readonly prevAuditHash: string | null;
  },
): Promise<{ auditId: string; rowHash: string; journalEntryId: string }> {
  const journalEntryId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const rowHash = await sha256Hex({
    action: 'JOURNAL_POST',
    entity_id: journalEntryId,
    source_type: input.entry.sourceType,
    source_id: input.entry.sourceId,
    prev: input.prevAuditHash,
  });
  plan.add(
    db
      .prepare(
        `INSERT INTO journal_entries (
             id, tenant_id, branch_id, source_type, source_id, post_date,
             balanced_cents, posted_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .bind(
        journalEntryId,
        input.tenantId,
        input.branchId,
        input.entry.sourceType,
        input.entry.sourceId,
        input.entry.postDate,
        input.userId,
      ),
  );
  for (const line of input.entry.lines) {
    const accountId = input.accountsByCode.get(line.code);
    if (!accountId) throw new Error(`JOURNAL_ACCOUNT_MISSING:${line.code}`);
    plan.add(
      db
        .prepare(
          `INSERT INTO journal_lines (
               id, tenant_id, journal_entry_id, account_id, debit_cents, credit_cents, memo
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          journalEntryId,
          accountId,
          line.debitCents,
          line.creditCents,
          line.memo,
        ),
    );
  }
  plan.add(
    db
      .prepare(
        `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'JOURNAL_POST', 'journal_entry', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        input.tenantId,
        input.branchId,
        input.userId,
        journalEntryId,
        JSON.stringify({
          sourceType: input.entry.sourceType,
          sourceId: input.entry.sourceId,
          lines: input.entry.lines,
        }),
        input.prevAuditHash,
        rowHash,
      ),
  );
  return { auditId, rowHash, journalEntryId };
}

export type { JournalSourceType };
