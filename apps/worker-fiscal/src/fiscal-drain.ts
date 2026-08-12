/**
 * Drain FIFO fiscal_outbox por must_submit_by — XML desde R2 (§8.1).
 * B4 (47b): cada fila se reclama atómicamente (PENDING/FAILED → PROCESSING con
 * next_attempt_at como marca de claim); dos drains concurrentes nunca envían el
 * mismo XML (el segundo no ve PENDING/FAILED). Las filas PROCESSING huérfanas
 * (crash del drain) se reclaman tras 10 minutos.
 */
import {
  classifyFiscalError,
  createMockPseTransport,
  type FiscalTransport,
} from '@kipuspay/adapters-sunat';

export const POISON_RETRY_THRESHOLD = 5;
export const CLAIM_STALE_AFTER_MINUTES = 10;

export interface FiscalXmlR2 {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string): Promise<void>;
}

interface D1Bound {
  bind(...params: unknown[]): D1Bound;
  all<T = unknown>(): Promise<{ results?: readonly T[] }>;
  run(): Promise<unknown>;
}

interface D1Prepared {
  bind(...params: unknown[]): D1Bound;
  all<T = unknown>(): Promise<{ results?: readonly T[] }>;
  run(): Promise<unknown>;
}

export interface FiscalDrainDb {
  prepare(sql: string): D1Prepared;
}

export interface OutboxRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly sale_id: string;
  readonly attempt_count: number;
  readonly must_submit_by: string | null;
  readonly r2_xml_key: string | null;
  readonly status: string;
  readonly document_type?: string | null;
}

export interface DrainResult {
  readonly processed: number;
  readonly quarantined: number;
  readonly skippedOpenBreaker: number;
  readonly accepted: number;
  readonly rejected: number;
}

export async function putFiscalXml(
  r2: FiscalXmlR2,
  tenantId: string,
  saleId: string,
  xml: string,
): Promise<string> {
  const key = `fiscal-xml/${tenantId}/${saleId}.xml`;
  await r2.put(key, xml);
  return key;
}

/**
 * Reclama atómicamente hasta `limit` filas (PENDING/FAILED, o PROCESSING
 * huérfanas con más de CLAIM_STALE_AFTER_MINUTES). El UPDATE es una sola
 * sentencia: dos drains concurrentes no pueden reclamar la misma fila.
 */
export async function claimFiscalRows(db: FiscalDrainDb, limit: number): Promise<number> {
  const res = await db
    .prepare(
      `UPDATE fiscal_outbox
       SET status = 'PROCESSING', next_attempt_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT id FROM fiscal_outbox
         WHERE (status IN ('PENDING','FAILED')
                OR (status = 'PROCESSING' AND next_attempt_at < datetime('now', ?)))
         ORDER BY must_submit_by IS NULL, must_submit_by ASC
         LIMIT ?
       )`,
    )
    .bind(`-${CLAIM_STALE_AFTER_MINUTES} minutes`, limit)
    .run();
  return typeof res === 'object' && res !== null && 'meta' in res
    ? ((res as { meta?: { changes?: number } }).meta?.changes ?? 0)
    : 0;
}

/** Lee las filas reclamadas por este drain (status = PROCESSING). */
export async function selectClaimedRows(db: FiscalDrainDb): Promise<readonly OutboxRow[]> {
  const res = await db
    .prepare(
      `SELECT id, tenant_id, sale_id, attempt_count, must_submit_by, r2_xml_key, status, document_type
       FROM fiscal_outbox
       WHERE status = 'PROCESSING'`,
    )
    .all<OutboxRow>();
  return res.results ?? [];
}

export async function drainFiscalOutbox(input: {
  readonly db: FiscalDrainDb;
  readonly r2: FiscalXmlR2;
  readonly transport?: FiscalTransport;
  readonly isBreakerOpen: () => Promise<boolean>;
  readonly onInfraFailure: () => Promise<void>;
  readonly limit?: number;
}): Promise<DrainResult> {
  const transport = input.transport ?? createMockPseTransport();
  const claimed = await claimFiscalRows(input.db, input.limit ?? 20);
  const rows = claimed > 0 ? await selectClaimedRows(input.db) : [];
  let processed = 0;
  let quarantined = 0;
  let skippedOpenBreaker = 0;
  let accepted = 0;
  let rejected = 0;

  for (const row of rows) {
    if (await input.isBreakerOpen()) {
      skippedOpenBreaker += 1;
      continue;
    }
    if (row.attempt_count >= POISON_RETRY_THRESHOLD) {
      await input.db
        .prepare(
          `UPDATE fiscal_outbox SET status = 'QUARANTINED', quarantine_reason = ?, last_error = ?
           WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
        )
        .bind('POISON_RETRY', 'retry_count_exceeded', row.id, row.tenant_id)
        .run();
      await input.db
        .prepare(
          `UPDATE sales SET sunat_status = 'QUARANTINED'
           WHERE id = ? AND tenant_id = ?
             AND EXISTS (SELECT 1 FROM fiscal_outbox WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING')`,
        )
        .bind(row.sale_id, row.tenant_id, row.id, row.tenant_id)
        .run();
      quarantined += 1;
      processed += 1;
      continue;
    }

    if (!row.r2_xml_key) {
      await input.db
        .prepare(
          `UPDATE fiscal_outbox SET status = 'QUARANTINED', quarantine_reason = ?, attempt_count = attempt_count + 1
           WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
        )
        .bind('MISSING_R2_XML', row.id, row.tenant_id)
        .run();
      quarantined += 1;
      processed += 1;
      continue;
    }

    const obj = await input.r2.get(row.r2_xml_key);
    if (!obj) {
      await input.db
        .prepare(
          `UPDATE fiscal_outbox SET status = 'FAILED', last_error = ?, attempt_count = attempt_count + 1
           WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
        )
        .bind('R2_MISS', row.id, row.tenant_id)
        .run();
      processed += 1;
      continue;
    }
    const xml = await obj.text();
    const outcome = await transport.submit({
      tenantId: row.tenant_id,
      saleId: row.sale_id,
      xml,
      xmlHash: 'drain',
      documentType: (row.document_type as '01' | '03' | '07' | '08') || '01',
    });

    const errorClass =
      outcome.kind === 'accepted'
        ? classifyFiscalError({ httpStatus: 200, cdrAccepted: true })
        : outcome.kind === 'rejected'
          ? classifyFiscalError({ httpStatus: 400 })
          : classifyFiscalError({ httpStatus: 503 });

    if (errorClass === 'INFRA') {
      await input.onInfraFailure();
      await input.db
        .prepare(
          `UPDATE fiscal_outbox SET status = 'FAILED', last_error = ?, attempt_count = attempt_count + 1
           WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
        )
        .bind('INFRA', row.id, row.tenant_id)
        .run();
      processed += 1;
      continue;
    }

    if (errorClass === 'BUSINESS' || outcome.kind === 'rejected') {
      await input.db
        .prepare(
          `UPDATE fiscal_outbox SET status = 'QUARANTINED', quarantine_reason = ?, attempt_count = attempt_count + 1
           WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
        )
        .bind('BUSINESS_4XX', row.id, row.tenant_id)
        .run();
      await input.db
        .prepare(
          `UPDATE sales SET sunat_status = 'REJECTED'
           WHERE id = ? AND tenant_id = ?
             AND EXISTS (SELECT 1 FROM fiscal_outbox WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING')`,
        )
        .bind(row.sale_id, row.tenant_id, row.id, row.tenant_id)
        .run();
      quarantined += 1;
      rejected += 1;
      processed += 1;
      continue;
    }

    await input.db
      .prepare(
        `UPDATE fiscal_outbox SET status = 'SENT', attempt_count = attempt_count + 1
         WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
      )
      .bind(row.id, row.tenant_id)
      .run();
    await input.db
      .prepare(
        `UPDATE sales SET sunat_status = 'ACCEPTED'
         WHERE id = ? AND tenant_id = ?
           AND EXISTS (SELECT 1 FROM fiscal_outbox WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING')`,
      )
      .bind(row.sale_id, row.tenant_id, row.id, row.tenant_id)
      .run();
    accepted += 1;
    processed += 1;
  }

  return { processed, quarantined, skippedOpenBreaker, accepted, rejected };
}

/** Verifica que factura con deadline temprano sale antes que boletas masivas. */
export function assertFifoOrder(rows: readonly OutboxRow[]): void {
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1]?.must_submit_by;
    const b = rows[i]?.must_submit_by;
    if (a && b && a > b) {
      throw new Error('FIFO_DEADLINE_INVERSION');
    }
  }
}
