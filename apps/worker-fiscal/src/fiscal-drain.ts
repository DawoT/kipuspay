/**
 * Drain FIFO fiscal_outbox por must_submit_by — XML desde R2 (§8.1).
 * B4 (47b): cada fila se reclama atómicamente (PENDING/FAILED → PROCESSING con
 * next_attempt_at como marca de claim); dos drains concurrentes nunca envían el
 * mismo XML (el segundo no ve PENDING/FAILED). Las filas PROCESSING huérfanas
 * (crash del drain) se reclaman tras 10 minutos.
 */
import {
  classifyFiscalError,
  type FiscalErrorClass,
  createMockPseTransport,
  SunatChannelError,
  type FiscalTransport,
  type FiscalTransportMode,
} from '@kipuspay/adapters-sunat';
import {
  classifyUnitaryXmlTarget,
  type CdrEnvelope,
  type FiscalDeliveryChannel,
} from '@kipuspay/domain-fiscal-pe';
import { TenantSolChannelError } from './select-transport.js';

export const POISON_RETRY_THRESHOLD = 5;
export const CLAIM_STALE_AFTER_MINUTES = 10;

/** SHA-256 hex del XML fiscal (F5-3): el hash real viaja al transporte. */
export async function hashFiscalXml(xml: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
  /** C6: tipo del documento referenciado (para NC/ND 07/08). */
  readonly referenced_document_type?: string | null;
}

export interface DrainResult {
  readonly processed: number;
  readonly quarantined: number;
  readonly skippedOpenBreaker: number;
  /** C6: filas cuyo canal de envío NO es UNIT_XML (boletas/RC → summary). */
  readonly skippedRc: number;
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
 * H3 (auditoría 0031) — clave R2 del receipt JSON del CDR unitario.
 * Patrón consistente con fiscal-xml/<tenant>/<sale>.xml; el receipt conserva
 * el envelope del CDR (código/descripción/accepted) que hoy es lo único que
 * el PSE HTTP entrega. Retención mínima legal: 5 años (Código de Comercio
 * art. 190 / Reglamento SUNAT — fuente de verdad en domain-fiscal-pe,
 * FISCAL_ARCHIVE_RETENTION_*); un job futuro aplica la purga.
 */
export function unitaryCdrReceiptKey(tenantId: string, saleId: string): string {
  return `fiscal-cdr/${tenantId}/${saleId}.json`;
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
      `SELECT f.id, f.tenant_id, f.sale_id, f.attempt_count, f.must_submit_by,
              f.r2_xml_key, f.status, s.document_type, ref.document_type AS referenced_document_type
       FROM fiscal_outbox f
       INNER JOIN sales s ON s.tenant_id = f.tenant_id AND s.id = f.sale_id
       LEFT JOIN sales ref ON ref.tenant_id = s.tenant_id AND ref.id = s.referenced_sale_id
       WHERE f.status = 'PROCESSING'`,
    )
    .all<OutboxRow>();
  return res.results ?? [];
}

/**
 * C6: canal de envío de una fila del outbox (spec §5.2). Las boletas (RC)
 * jamás se envían como XML unitario — las cubre buildDailySummary.
 */
export function outboxDeliveryChannel(
  row: Pick<OutboxRow, 'document_type' | 'referenced_document_type'>,
): FiscalDeliveryChannel {
  return classifyUnitaryXmlTarget(
    (row.document_type as '01' | '03' | '07' | '08' | '12' | 'NV' | 'NV_RETURN') ?? 'NV',
    row.referenced_document_type ?? undefined,
  );
}

/**
 * C6: intenta producir el XML que falta (post-commit best-effort). Inyectable
 * para tests; en producción lo provee worker-api vía `produceFiscalXmlForSale`.
 * Nunca lanza: cualquier fallo se reporta como `null` y el drain re-intenta.
 */
export interface ProduceMissingXml {
  (input: { readonly tenantId: string; readonly saleId: string }): Promise<unknown>;
}

const LIVE_XML_ROOT = /<(Invoice|CreditNote|DebitNote|DespatchAdvice|Perception|Retention)\b/;

/**
 * Canal live (no MOCK): XML unitario sin firma no se envía ni se marca ACCEPTED.
 * Mock local sigue aceptando XML no vacío.
 */
export function xmlReadyForLiveSubmit(xml: string, mode: FiscalTransportMode): boolean {
  if (mode === 'MOCK_STAGING') return xml.trim().length > 0;
  if (mode === 'MISCONFIGURED') return false;
  return xml.includes('<ds:Signature') && LIVE_XML_ROOT.test(xml);
}

type RowOutcome =
  | 'SKIP_RC'
  | 'QUARANTINED'
  | 'FAILED_MISSING_XML'
  | 'FAILED_R2_MISS'
  | 'FAILED_INFRA'
  | 'REJECTED'
  | 'SENT';

/** Clasifica el error del transporte: INFRA / BUSINESS / OK. */
function classifySubmitOutcome(
  outcome: Awaited<ReturnType<FiscalTransport['submit']>>,
): FiscalErrorClass {
  if (outcome.kind === 'accepted') {
    return classifyFiscalError({ httpStatus: 200, cdrAccepted: true });
  }
  return outcome.kind === 'rejected'
    ? classifyFiscalError({ httpStatus: 400 })
    : classifyFiscalError({ httpStatus: 503 });
}

/** Devuelve a PENDING una fila RC reclamada por error (nunca XML unitario). */
async function releaseSkippedRc(db: FiscalDrainDb, row: OutboxRow): Promise<void> {
  await db
    .prepare(
      `UPDATE fiscal_outbox SET status = 'PENDING'
       WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
    )
    .bind(row.id, row.tenant_id)
    .run();
}

/** Marca FAILED sobre la fila actual (infra o XML ausente). */
async function markRowFailed(db: FiscalDrainDb, row: OutboxRow, reason: string): Promise<void> {
  await db
    .prepare(
      `UPDATE fiscal_outbox SET status = 'FAILED', last_error = ?, attempt_count = attempt_count + 1
       WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
    )
    .bind(reason, row.id, row.tenant_id)
    .run();
}

/** Marca QUARANTINED con motivo (poison, business 4xx). */
async function markRowQuarantined(
  db: FiscalDrainDb,
  row: OutboxRow,
  reason: string,
  lastError: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE fiscal_outbox SET status = 'QUARANTINED', quarantine_reason = ?, last_error = ?
       WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
    )
    .bind(reason, lastError, row.id, row.tenant_id)
    .run();
}

/** Marca sunat_status de la venta como QUARANTINED/REJECTED/ACCEPTED. */
async function markSaleStatus(
  db: FiscalDrainDb,
  row: OutboxRow,
  status: 'QUARANTINED' | 'REJECTED' | 'ACCEPTED',
): Promise<void> {
  await db
    .prepare(
      `UPDATE sales SET sunat_status = ?
       WHERE id = ? AND tenant_id = ?
         AND EXISTS (SELECT 1 FROM fiscal_outbox WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING')`,
    )
    .bind(status, row.sale_id, row.tenant_id, row.id, row.tenant_id)
    .run();
}

/**
 * C6: self-healing — resuelve la clave R2 del XML, intentando producirlo si
 * falta. Devuelve null si no hay clave producible (→ MISSING_R2_XML).
 */
async function ensureR2XmlKey(
  input: {
    readonly db: FiscalDrainDb;
    readonly produceMissingXml?: ProduceMissingXml;
  },
  row: OutboxRow,
): Promise<string | null> {
  if (row.r2_xml_key) return row.r2_xml_key;
  if (!input.produceMissingXml) return null;
  try {
    await input.produceMissingXml({ tenantId: row.tenant_id, saleId: row.sale_id });
    const retried = await selectClaimedRows(input.db);
    const fresh = retried.find(
      (r) => r.id === row.id && r.r2_xml_key !== null && r.r2_xml_key !== undefined,
    );
    if (fresh?.r2_xml_key) return fresh.r2_xml_key;
  } catch {
    // fall-through → retry via FAILED
  }
  return null;
}

/**
 * H3 (auditoría 0031) — archiva el receipt JSON del CDR unitario ANTES del
 * UPDATE que marca SENT, para que la referencia sea honesta (clave en D1 ⇒
 * objeto en R2). BEST-EFFORT: el CDR ya es válido ante SUNAT; un fallo de R2
 * jamás revierte el ACCEPTED — warn + null (r2_cdr_key NULL).
 */
async function archiveUnitaryCdrReceipt(
  r2: FiscalXmlR2,
  row: OutboxRow,
  cdr: CdrEnvelope,
): Promise<string | null> {
  const key = unitaryCdrReceiptKey(row.tenant_id, row.sale_id);
  try {
    await r2.put(
      key,
      JSON.stringify({
        kind: 'UNITARY_CDR_RECEIPT',
        saleId: row.sale_id,
        tenantId: row.tenant_id,
        accepted: cdr.accepted,
        cdrCode: cdr.cdrCode,
        cdrDescription: cdr.cdrDescription,
        archivedAt: new Date().toISOString(),
      }),
    );
    return key;
  } catch (err) {
    console.warn('UNITARY_CDR_ARCHIVE_FAILED', row.tenant_id, row.sale_id, String(err));
    return null;
  }
}

type TransportOutcome = Awaited<ReturnType<FiscalTransport['submit']>>;

type SubmitResult =
  | { readonly quarantined: true }
  | { readonly quarantined: false; readonly outcome: TransportOutcome };

/**
 * Envío al transporte con aislamiento de error de canal (SOL de tenant
 * ausente/corrupta, allowlist): la fila queda cuarentenada con motivo visible
 * — no INFRA silenciosa que inflara el breaker, ni un throw que abortara el
 * drain de los demás tenants.
 */
async function submitWithChannelIsolation(
  db: FiscalDrainDb,
  row: OutboxRow,
  transport: FiscalTransport,
  xml: string,
  xmlHash: string,
): Promise<SubmitResult> {
  try {
    const outcome = await transport.submit({
      tenantId: row.tenant_id,
      saleId: row.sale_id,
      xml,
      xmlHash,
      documentType: (row.document_type as '01' | '03' | '07' | '08' | '31' | '02' | '20') || '01',
    });
    return { quarantined: false, outcome };
  } catch (err) {
    if (err instanceof SunatChannelError || err instanceof TenantSolChannelError) {
      await markSaleStatus(db, row, 'QUARANTINED');
      await markRowQuarantined(db, row, 'CHANNEL_ERROR', err.code);
      return { quarantined: true };
    }
    throw err;
  }
}

/** Procesa una fila reclamada; devuelve el desenlace para contabilidad. */
async function processClaimedRow(
  input: {
    readonly db: FiscalDrainDb;
    readonly r2: FiscalXmlR2;
    readonly transport: FiscalTransport;
    /** Routing SOL por tenant: resuelve transporte por fila (el caller cachea). */
    readonly transportFor?: (row: OutboxRow) => Promise<FiscalTransport>;
    readonly onInfraFailure: () => Promise<void>;
    readonly produceMissingXml?: ProduceMissingXml;
  },
  row: OutboxRow,
): Promise<RowOutcome> {
  const { db, r2 } = input;
  const transport = input.transportFor ? await input.transportFor(row) : input.transport;
  const channel = outboxDeliveryChannel(row);
  // C6: boletas/RC nunca viajan como XML unitario (spec §5.2).
  // Liberar a PENDING para que el cron RC las reclame; no dejar PROCESSING.
  if (channel !== 'UNIT_XML') {
    await releaseSkippedRc(db, row);
    return 'SKIP_RC';
  }

  if (row.attempt_count >= POISON_RETRY_THRESHOLD) {
    await markSaleStatus(db, row, 'QUARANTINED');
    await markRowQuarantined(db, row, 'POISON_RETRY', 'retry_count_exceeded');
    return 'QUARANTINED';
  }

  const r2XmlKey = await ensureR2XmlKey(input, row);
  if (!r2XmlKey) {
    await markRowFailed(db, row, 'MISSING_R2_XML');
    return 'FAILED_MISSING_XML';
  }

  const obj = await r2.get(r2XmlKey);
  if (!obj) {
    await markRowFailed(db, row, 'R2_MISS');
    return 'FAILED_R2_MISS';
  }
  const xml = await obj.text();
  if (!xmlReadyForLiveSubmit(xml, transport.mode)) {
    await markRowQuarantined(db, row, 'MISSING_XADES', 'unsigned_or_invalid_ubl');
    await markSaleStatus(db, row, 'QUARANTINED');
    return 'QUARANTINED';
  }
  // F5-3: el hash que viaja al transporte es el SHA-256 REAL del XML
  // (antes literal 'drain'); integridad verificable por el PSE/OSE.
  const xmlHash = await hashFiscalXml(xml);
  const submitted = await submitWithChannelIsolation(db, row, transport, xml, xmlHash);
  if (submitted.quarantined) return 'QUARANTINED';
  const outcome = submitted.outcome;

  const errorClass = classifySubmitOutcome(outcome);

  if (errorClass === 'INFRA') {
    await input.onInfraFailure();
    await markRowFailed(db, row, 'INFRA');
    return 'FAILED_INFRA';
  }

  if (errorClass === 'BUSINESS' || outcome.kind === 'rejected') {
    const rejectDetail =
      outcome.kind === 'rejected'
        ? `${outcome.cdr.cdrCode}:${outcome.cdr.cdrDescription}`
        : 'business_reject';
    await markSaleStatus(db, row, 'REJECTED');
    await markRowQuarantined(db, row, 'BUSINESS_4XX', rejectDetail);
    return 'REJECTED';
  }

  // H3 (auditoría 0031): conservación SUNAT del CDR unitario — receipt JSON
  // a R2 y referencia r2_cdr_key en el MISMO UPDATE que marca SENT.
  const cdrArchiveKey =
    outcome.kind === 'accepted' ? await archiveUnitaryCdrReceipt(r2, row, outcome.cdr) : null;

  await markSaleStatus(db, row, 'ACCEPTED');
  await db
    .prepare(
      `UPDATE fiscal_outbox SET status = 'SENT', attempt_count = attempt_count + 1, r2_cdr_key = ?
       WHERE id = ? AND tenant_id = ? AND status = 'PROCESSING'`,
    )
    .bind(cdrArchiveKey, row.id, row.tenant_id)
    .run();
  return 'SENT';
}

export async function drainFiscalOutbox(input: {
  readonly db: FiscalDrainDb;
  readonly r2: FiscalXmlR2;
  readonly transport?: FiscalTransport;
  /** Routing SOL por tenant: transporte resuelto POR FILA (caché en el caller). */
  readonly transportFor?: (row: OutboxRow) => Promise<FiscalTransport>;
  readonly isBreakerOpen: () => Promise<boolean>;
  readonly onInfraFailure: () => Promise<void>;
  readonly limit?: number;
  /** C6: produce el XML unitario que falta (best-effort, nunca lanza). */
  readonly produceMissingXml?: ProduceMissingXml;
}): Promise<DrainResult> {
  const transport = input.transport ?? createMockPseTransport();
  const claimed = await claimFiscalRows(input.db, input.limit ?? 20);
  const rows = claimed > 0 ? await selectClaimedRows(input.db) : [];
  let processed = 0;
  let quarantined = 0;
  let skippedOpenBreaker = 0;
  let skippedRc = 0;
  let accepted = 0;
  let rejected = 0;

  for (const row of rows) {
    if (await input.isBreakerOpen()) {
      skippedOpenBreaker += 1;
      continue;
    }
    const outcome = await processClaimedRow(
      {
        db: input.db,
        r2: input.r2,
        transport,
        ...(input.transportFor ? { transportFor: input.transportFor } : {}),
        onInfraFailure: input.onInfraFailure,
        ...(input.produceMissingXml ? { produceMissingXml: input.produceMissingXml } : {}),
      },
      row,
    );
    processed += 1;
    if (outcome === 'SKIP_RC') {
      skippedRc += 1;
    } else if (outcome === 'QUARANTINED' || outcome === 'REJECTED') {
      quarantined += 1;
      if (outcome === 'REJECTED') rejected += 1;
    } else if (outcome === 'SENT') {
      accepted += 1;
    }
  }

  return { processed, quarantined, skippedOpenBreaker, skippedRc, accepted, rejected };
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
