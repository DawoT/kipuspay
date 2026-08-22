/**
 * Drain de fiscal_non_sale_outbox (GRE/02/20). Misma taxonomía CDR que CPE:
 * sin firma en canal live → QUARANTINED; jamás ACCEPTED desde mock de plugins.
 */
import type { FiscalTransport } from '@kipuspay/adapters-sunat';
import {
  CLAIM_STALE_AFTER_MINUTES,
  hashFiscalXml,
  xmlReadyForLiveSubmit,
  type FiscalDrainDb,
  type FiscalXmlR2,
} from './fiscal-drain.js';

export interface NonSaleOutboxRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly document_type: '31' | '02' | '20';
  readonly entity_id: string;
  readonly attempt_count: number;
  readonly r2_xml_key: string | null;
  readonly status: string;
}

const ENTITY_ACCEPTED_SQL = {
  '31': `UPDATE remission_guides SET sunat_status = 'ACCEPTED' WHERE id = ? AND tenant_id = ?`,
  '02': `UPDATE perceptions SET sunat_status = 'ACCEPTED' WHERE id = ? AND tenant_id = ?`,
  '20': `UPDATE retentions SET sunat_status = 'ACCEPTED' WHERE id = ? AND tenant_id = ?`,
} as const;

export async function drainFiscalNonSaleOutbox(input: {
  readonly db: FiscalDrainDb;
  readonly r2: FiscalXmlR2;
  readonly transport: FiscalTransport;
  readonly isBreakerOpen: () => Promise<boolean>;
  readonly onInfraFailure: () => Promise<void>;
  readonly limit?: number;
  readonly produceMissingXml?: (row: {
    readonly tenantId: string;
    readonly outboxId: string;
  }) => Promise<unknown>;
}): Promise<{ readonly processed: number; readonly accepted: number }> {
  await input.db
    .prepare(
      `UPDATE fiscal_non_sale_outbox
       SET status = 'PROCESSING', next_attempt_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT id FROM fiscal_non_sale_outbox
         WHERE (status IN ('PENDING','FAILED')
                OR (status = 'PROCESSING' AND next_attempt_at < datetime('now', ?)))
         ORDER BY must_submit_by IS NULL, must_submit_by ASC
         LIMIT ?
       )`,
    )
    .bind(`-${CLAIM_STALE_AFTER_MINUTES} minutes`, input.limit ?? 20)
    .run();
  const claimed = await input.db
    .prepare(
      `SELECT id, tenant_id, document_type, entity_id, attempt_count, r2_xml_key, status
       FROM fiscal_non_sale_outbox WHERE status = 'PROCESSING'`,
    )
    .all<NonSaleOutboxRow>();
  const rows = claimed.results ?? [];
  let processed = 0;
  let accepted = 0;
  for (const row of rows) {
    if (await input.isBreakerOpen()) continue;
    const outcome = await processNonSaleRow(input, row);
    processed += 1;
    if (outcome === 'SENT') accepted += 1;
  }
  return { processed, accepted };
}

async function processNonSaleRow(
  input: {
    readonly db: FiscalDrainDb;
    readonly r2: FiscalXmlR2;
    readonly transport: FiscalTransport;
    readonly onInfraFailure: () => Promise<void>;
    readonly produceMissingXml?: (row: {
      readonly tenantId: string;
      readonly outboxId: string;
    }) => Promise<unknown>;
  },
  row: NonSaleOutboxRow,
): Promise<'SENT' | 'SKIP'> {
  let r2Key = row.r2_xml_key;
  if (!r2Key && input.produceMissingXml) {
    try {
      await input.produceMissingXml({ tenantId: row.tenant_id, outboxId: row.id });
      const fresh = await input.db
        .prepare(`SELECT r2_xml_key FROM fiscal_non_sale_outbox WHERE id = ? AND tenant_id = ?`)
        .bind(row.id, row.tenant_id)
        .all<{ r2_xml_key: string | null }>();
      r2Key = fresh.results?.[0]?.r2_xml_key ?? null;
    } catch {
      r2Key = null;
    }
  }
  if (!r2Key) {
    await input.db
      .prepare(
        `UPDATE fiscal_non_sale_outbox SET status = 'FAILED', last_error = 'MISSING_R2_XML',
         attempt_count = attempt_count + 1 WHERE id = ? AND tenant_id = ?`,
      )
      .bind(row.id, row.tenant_id)
      .run();
    return 'SKIP';
  }
  const obj = await input.r2.get(r2Key);
  const xml = obj ? await obj.text() : '';
  if (!xml || !xmlReadyForLiveSubmit(xml, input.transport.mode)) {
    await input.db
      .prepare(
        `UPDATE fiscal_non_sale_outbox SET status = 'QUARANTINED', quarantine_reason = 'MISSING_XADES'
         WHERE id = ? AND tenant_id = ?`,
      )
      .bind(row.id, row.tenant_id)
      .run();
    return 'SKIP';
  }
  const xmlHash = await hashFiscalXml(xml);
  const outcome = await input.transport.submit({
    tenantId: row.tenant_id,
    saleId: row.entity_id,
    xml,
    xmlHash,
    documentType: row.document_type,
  });
  if (outcome.kind === 'rejected') {
    await input.db
      .prepare(
        `UPDATE fiscal_non_sale_outbox SET status = 'QUARANTINED', quarantine_reason = 'BUSINESS_4XX'
         WHERE id = ? AND tenant_id = ?`,
      )
      .bind(row.id, row.tenant_id)
      .run();
    return 'SKIP';
  }
  if (outcome.kind !== 'accepted') {
    await input.onInfraFailure();
    await input.db
      .prepare(
        `UPDATE fiscal_non_sale_outbox SET status = 'FAILED', last_error = ?,
         attempt_count = attempt_count + 1 WHERE id = ? AND tenant_id = ?`,
      )
      .bind(outcome.kind, row.id, row.tenant_id)
      .run();
    return 'SKIP';
  }
  await input.db
    .prepare(`UPDATE fiscal_non_sale_outbox SET status = 'SENT' WHERE id = ? AND tenant_id = ?`)
    .bind(row.id, row.tenant_id)
    .run();
  await input.db
    .prepare(ENTITY_ACCEPTED_SQL[row.document_type])
    .bind(row.entity_id, row.tenant_id)
    .run();
  return 'SENT';
}
