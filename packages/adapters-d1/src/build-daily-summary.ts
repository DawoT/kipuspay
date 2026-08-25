/**
 * buildDailySummaryCron — RC PRIMARY por (tenant_id, summary_date) FIS-03.
 * CDR vía puerto inyectable (mock PSE en worker). No se dispara desde arqueo Z.
 * H1 (auditoría 0031): el sobre lleva boletas/tickets (03/12) y las NC/ND
 * (07/08) vinculadas a boletas — regla SUNAT §5.2 (nunca XML unitario).
 */
import {
  buildUblSummaryDocumentsXml,
  createMockRcCdrPort,
  markVoidedAfterRc,
  nextRcCorrelative,
  planDailySummary,
  planNrusDailyConsolidation,
  canOmitUnitaryNrus,
  rcSummaryId,
  FISCAL_ARCHIVE_RETENTION_YEARS,
  type BoletaForRc,
  type RcCdrPort,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import type { FiscalXmlSigner } from './fiscal-xml-producer.js';

export type { RcCdrPort } from '@kipuspay/domain-fiscal-pe';
export { createMockRcCdrPort } from '@kipuspay/domain-fiscal-pe';

/**
 * H3 (auditoría 0031) — política de retención del archivo fiscal (fuente de
 * verdad en domain-fiscal-pe): mínimo legal 5 años (Código de Comercio art.
 * 190 / Reglamento SUNAT). Un job futuro la aplica; aquí se expone para ese
 * consumidor. NO hay borrador automático en este módulo.
 */
export {
  FISCAL_ARCHIVE_RETENTION_MS,
  FISCAL_ARCHIVE_RETENTION_YEARS,
} from '@kipuspay/domain-fiscal-pe';

/** Puerto R2 del archivo fiscal (patrón FiscalXmlR2Like de fiscal-xml-producer). */
export interface FiscalArchiveR2 {
  put(key: string, value: string | Uint8Array): Promise<void>;
}

/** Clave R2 del sobre RC firmado — patrón consistente con fiscal-xml/<t>/<id>.xml. */
export function rcXmlArchiveKey(tenantId: string, summaryId: string): string {
  return `rc/${tenantId}/${summaryId}.xml`;
}

/** Clave R2 del CDR completo (zip) del RC. */
export function rcCdrArchiveKey(tenantId: string, summaryId: string): string {
  return `rc/${tenantId}/${summaryId}-cdr.zip`;
}

/** Clave R2 del receipt JSON del CDR cuando el PSE aún no entrega zip. */
export function rcCdrReceiptArchiveKey(tenantId: string, summaryId: string): string {
  return `rc/${tenantId}/${summaryId}-cdr.json`;
}

function cdrZipBytes(cdrZipB64: string): Uint8Array {
  const bin = atob(cdrZipB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * H3 (auditoría 0031) — archivo post-commit del sobre firmado + CDR.
 * BEST-EFFORT: el SUCCESS del CDR ya es válido ante SUNAT; un fallo de R2
 * jamás revierte la tx ni el estado ACCEPTED (warn + claves NULL). Referencia
 * honesta: clave en D1 ⇒ objeto en R2 — la referencia se escribe en UNA sola
 * sentencia UPDATE DESPUÉS de que ambos objetos existen; si cualquier put
 * falla, no se escribe ninguna clave (sin referencias colgantes).
 */
async function archiveRcEnvelope(input: {
  readonly db: D1DatabaseLike;
  readonly archive: FiscalArchiveR2;
  readonly tenantId: string;
  readonly summaryId: string;
  readonly xml: string;
  readonly cdr: Awaited<ReturnType<RcCdrPort['submit']>>;
}): Promise<void> {
  const { db, archive, tenantId, summaryId, xml, cdr } = input;
  try {
    await archive.put(rcXmlArchiveKey(tenantId, summaryId), xml);
    if (cdr.cdrZipB64 !== undefined) {
      await archive.put(rcCdrArchiveKey(tenantId, summaryId), cdrZipBytes(cdr.cdrZipB64));
    } else {
      const receipt = JSON.stringify({
        kind: 'RC_CDR_RECEIPT',
        summaryId,
        tenantId,
        accepted: cdr.accepted,
        cdrCode: cdr.cdrCode,
        cdrMessage: cdr.cdrMessage,
        archivedAt: new Date().toISOString(),
        retentionYears: FISCAL_ARCHIVE_RETENTION_YEARS,
      });
      await archive.put(rcCdrReceiptArchiveKey(tenantId, summaryId), receipt);
    }
    await db
      .prepare(
        `UPDATE sunat_daily_summaries SET r2_rc_xml_key = ?, r2_cdr_key = ?
         WHERE id = ? AND tenant_id = ?`,
      )
      .bind(
        rcXmlArchiveKey(tenantId, summaryId),
        cdr.cdrZipB64 !== undefined
          ? rcCdrArchiveKey(tenantId, summaryId)
          : rcCdrReceiptArchiveKey(tenantId, summaryId),
        summaryId,
        tenantId,
      )
      .run();
  } catch (err) {
    console.warn('RC_ARCHIVE_FAILED', tenantId, summaryId, String(err));
  }
}

export interface BuildDailySummaryInput {
  readonly tenantId: string;
  readonly summaryDate: string;
  readonly nowMs: number;
  readonly cdr?: RcCdrPort;
  readonly signer?: FiscalXmlSigner;
  /**
   * H3 (auditoría 0031): archivo R2 del sobre RC firmado + CDR (conservación
   * SUNAT). Best-effort post-commit — ver archiveRcEnvelope.
   */
  readonly archive?: FiscalArchiveR2;
}

export interface BuildDailySummaryResult {
  readonly status: 'SUCCESS' | 'NOOP_EMPTY' | 'ALREADY_EXISTS' | 'MISSING_SIGNER';
  readonly dailySummaryId?: string;
  readonly sunatStatus?: string;
  readonly ticketCount?: number;
  readonly nrusOmittedCount?: number;
  /** FIS-03 — tipo de sobre RC emitido (solo en SUCCESS). */
  readonly rcType?: 'PRIMARY' | 'COMPLEMENTARY';
  /** ID UBL del sobre `RC-YYYYMMDD-NNN` (solo en SUCCESS). */
  readonly rcUblId?: string;
}

/** Fail-closed §5.2 (ADR-FISCAL-008): ¿emisor TENANT_CERT sin material de firma? */
function isTenantCertWithoutSigner(
  tenant: { readonly pse_mode: string | null } | null | undefined,
  signer: FiscalXmlSigner | undefined,
): boolean {
  return tenant?.pse_mode === 'TENANT_CERT' && !signer;
}

interface RcXmlRow {
  readonly document_type: string;
  readonly series: string;
  readonly number: number;
  readonly client_document_type: string;
  readonly client_document_number: string;
  readonly void_status: string;
  readonly total_taxable_cents: number;
  readonly total_igv_cents: number;
  readonly total_amount_cents: number;
  /** H1: motivo cat. 09/10 de la nota (07/08) — define la condición cat. 19. */
  readonly credit_note_motive_code: string | null;
}

/**
 * H1 (auditoría 0031): condición de línea del RC (catálogo 19 — 1=adición,
 * 3=baja). Boletas: baja solo con anulación pendiente de RC. Notas (07/08)
 * sobre boleta: primera inclusión → adición; la NC de anulación (motivo '01'
 * cat. 09, "Anulacion de la operacion") reporta la baja de la operación.
 */
function rcLineConditionCode(r: RcXmlRow): '1' | '3' {
  if (r.document_type === '07') return r.credit_note_motive_code === '01' ? '3' : '1';
  if (r.document_type === '08') return '1';
  return r.void_status === 'VOID_PENDING_RC' ? '3' : '1';
}

interface RcXmlTenant {
  readonly ruc: string | null;
  readonly business_name: string;
}

/**
 * Sobre del RC: UBL SummaryDocuments real cuando el emisor tiene RUC válido
 * (firmado si hay signer); placeholder staging-only para PSE sin RUC (el mock
 * CDR lo acepta — jamás llega a SUNAT real).
 */
async function buildRcEnvelopeXml(input: {
  readonly tenantId: string;
  readonly summaryDate: string;
  readonly ticketCount: number;
  readonly nrusOmitted: number;
  readonly sunatTicket: string;
  readonly tenant: RcXmlTenant | null;
  readonly rows: readonly RcXmlRow[];
  readonly signer?: FiscalXmlSigner | undefined;
}): Promise<string> {
  const tenant = input.tenant;
  const ruc = tenant?.ruc ?? null;
  if (!(tenant && ruc && /^\d{11}$/.test(ruc))) {
    return `<DailySummary tenant="${input.tenantId}" date="${input.summaryDate}" tickets="${input.ticketCount}" nrusOmit="${input.nrusOmitted}"/>`;
  }
  let xml = buildUblSummaryDocumentsXml({
    id: input.sunatTicket,
    referenceDate: input.summaryDate,
    issueDate: input.summaryDate,
    issuerRuc: ruc,
    issuerName: tenant.business_name,
    lines: input.rows.map((r, i) => ({
      lineId: i + 1,
      // H1: tipo real por línea — boleta (03), ticket (12) y notas sobre
      // boleta (07/08). Jamás se colapsan: SUNAT valida el tipo del CPE.
      documentType:
        r.document_type === '12'
          ? '12'
          : r.document_type === '07'
            ? '07'
            : r.document_type === '08'
              ? '08'
              : '03',
      documentId: `${r.series}-${String(r.number).padStart(8, '0')}`,
      customerDocType: r.client_document_type || '1',
      customerDocNumber: r.client_document_number || '00000000',
      conditionCode: rcLineConditionCode(r),
      totalTaxableCents: r.total_taxable_cents,
      totalIgvCents: r.total_igv_cents,
      totalAmountCents: r.total_amount_cents,
    })),
  });
  if (input.signer) xml = await input.signer.sign(xml, input.tenantId);
  return xml;
}

export async function buildDailySummary(
  db: D1DatabaseLike,
  input: BuildDailySummaryInput,
): Promise<BuildDailySummaryResult> {
  const existing = await db
    .prepare(
      `SELECT id, status FROM sunat_daily_summaries
       WHERE tenant_id = ? AND summary_date = ? AND rc_type = 'PRIMARY'`,
    )
    .bind(input.tenantId, input.summaryDate)
    .first<{ id: string; status: string }>();
  const complementaryExisting = await db
    .prepare(
      `SELECT id, status FROM sunat_daily_summaries
       WHERE tenant_id = ? AND summary_date = ? AND rc_type = 'COMPLEMENTARY'`,
    )
    .bind(input.tenantId, input.summaryDate)
    .first<{ id: string; status: string }>();
  if (existing && complementaryExisting) {
    return {
      status: 'ALREADY_EXISTS',
      dailySummaryId: complementaryExisting.id,
      sunatStatus: complementaryExisting.status,
    };
  }

  const tenant = await db
    .prepare(`SELECT tax_regime, ruc, business_name, pse_mode FROM tenants WHERE id = ?`)
    .bind(input.tenantId)
    .first<{
      tax_regime: string;
      ruc: string | null;
      business_name: string;
      pse_mode: string | null;
    }>();

  // H1 (auditoría 0031): el RC lleva boletas/tickets (03/12) Y las notas
  // (07/08) cuyo documento afectado es boleta/ticket — regla SUNAT §5.2.
  // Las notas sobre facturas viajan UNIT_XML y jamás entran aquí.
  const boletas = await db
    .prepare(
      `SELECT id, branch_id, document_type, series, number, client_document_type,
              client_document_number, total_amount_cents, total_taxable_cents,
              total_igv_cents, void_status, issued_at_lima, sunat_status,
              credit_note_motive_code
       FROM sales
       WHERE tenant_id = ?
         AND deleted_at IS NULL
         AND (
           document_type IN ('03','12')
           OR (
             document_type IN ('07','08')
             AND EXISTS (
               SELECT 1 FROM sales orig
               WHERE orig.tenant_id = sales.tenant_id
                 AND orig.id = sales.referenced_sale_id
                 AND orig.document_type IN ('03','12')
             )
           )
         )
         AND sunat_status IN ('PENDING','PROCESSING','ACCEPTED','DEADLINE_EXCEEDED')
         AND daily_summary_id IS NULL
         AND date(issued_at_lima) = ?`,
    )
    .bind(input.tenantId, input.summaryDate)
    .all<{
      id: string;
      branch_id: string;
      document_type: string;
      series: string;
      number: number;
      client_document_type: string;
      client_document_number: string;
      total_amount_cents: number;
      total_taxable_cents: number;
      total_igv_cents: number;
      void_status: string;
      issued_at_lima: string;
      sunat_status: string;
      credit_note_motive_code: string | null;
    }>();

  const rcType = existing ? 'COMPLEMENTARY' : 'PRIMARY';
  const rows = (boletas.results ?? []).filter((r) => r.sunat_status !== 'ACCEPTED');
  if (rows.length === 0) {
    if (existing) {
      return {
        status: 'ALREADY_EXISTS',
        dailySummaryId: existing.id,
        sunatStatus: existing.status,
      };
    }
    return { status: 'NOOP_EMPTY' };
  }

  // Fail-closed §5.2 (ADR-FISCAL-008): un emisor TENANT_CERT sin material de
  // firma jamás emite RC — ni placeholder ni SummaryDocuments unsigned llegan
  // al puerto CDR. Con boletas pendientes el resultado es MISSING_SIGNER;
  // sin boletas no había nada que emitir (NOOP_EMPTY ya retornó arriba).
  if (isTenantCertWithoutSigner(tenant, input.signer)) {
    return { status: 'MISSING_SIGNER' };
  }

  const forRc: BoletaForRc[] = rows.map((r) => ({
    saleId: r.id,
    branchId: r.branch_id,
    documentType: r.document_type,
    totalAmountCents: r.total_amount_cents,
    voidStatus: r.void_status,
    issuedAtMs: Date.parse(r.issued_at_lima),
  }));

  const plan = planDailySummary(input.tenantId, input.summaryDate, forRc);

  const regime = (tenant?.tax_regime ?? 'UNKNOWN') as 'UNKNOWN' | 'NRUS' | 'RER' | 'RMT' | 'RG';
  const nrusLines = rows
    .filter((r) =>
      canOmitUnitaryNrus({
        taxRegime: regime,
        totalAmountCents: r.total_amount_cents,
        documentType: r.document_type,
      }),
    )
    .map((r) => ({ saleId: r.id, totalAmountCents: r.total_amount_cents }));
  const nrusPlan = planNrusDailyConsolidation(nrusLines);

  const summaryId = crypto.randomUUID();
  const mustSubmitBy = new Date(
    Date.parse(`${input.summaryDate}T23:59:59.999-05:00`) + 6 * 24 * 3600 * 1000,
  ).toISOString();

  const tickets = await db
    .prepare(
      `SELECT sunat_ticket FROM sunat_daily_summaries
       WHERE tenant_id = ? AND summary_date = ?`,
    )
    .bind(input.tenantId, input.summaryDate)
    .all<{ sunat_ticket: string | null }>();
  const correlative = nextRcCorrelative(
    input.summaryDate,
    (tickets.results ?? []).map((t) => t.sunat_ticket ?? ''),
    existing ? 1 : 0,
  );
  const sunatTicket = rcSummaryId(input.summaryDate, correlative);

  const xml = await buildRcEnvelopeXml({
    tenantId: input.tenantId,
    summaryDate: input.summaryDate,
    ticketCount: plan.ticketCount,
    nrusOmitted: nrusPlan.omittedSaleIds.length,
    sunatTicket,
    tenant,
    rows,
    signer: input.signer,
  });
  const cdrPort = input.cdr ?? createMockRcCdrPort();
  const cdr = await cdrPort.submit({
    tenantId: input.tenantId,
    summaryId,
    xml,
  });
  const rcStatus = cdr.accepted ? 'ACCEPTED' : 'REJECTED';
  const saleStatus = cdr.accepted ? 'ACCEPTED' : 'REJECTED';

  await runD1AtomicPlan(db, (planBuilder) => {
    planBuilder.add(
      db
        .prepare(
          `INSERT INTO sunat_daily_summaries
             (id, tenant_id, branch_id, summary_date, status, must_submit_by, rc_type, ticket_count,
              sunat_ticket, cdr_code, cdr_message, submitted_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(
          summaryId,
          input.tenantId,
          input.summaryDate,
          rcStatus,
          mustSubmitBy,
          rcType,
          plan.ticketCount,
          sunatTicket,
          cdr.cdrCode,
          cdr.cdrMessage,
        ),
    );
    for (const saleId of plan.saleIds) {
      const voidNext = plan.voidSaleIds.includes(saleId)
        ? markVoidedAfterRc('VOID_PENDING_RC')
        : null;
      if (voidNext) {
        planBuilder.add(
          db
            .prepare(
              `UPDATE sales SET daily_summary_id = ?, sunat_status = ?, void_status = ?
               WHERE id = ? AND tenant_id = ?`,
            )
            .bind(summaryId, saleStatus, voidNext, saleId, input.tenantId),
        );
      } else {
        planBuilder.add(
          db
            .prepare(
              `UPDATE sales SET daily_summary_id = ?, sunat_status = ?
               WHERE id = ? AND tenant_id = ?`,
            )
            .bind(summaryId, saleStatus, saleId, input.tenantId),
        );
      }
    }
  });

  // H3 (auditoría 0031): conservación SUNAT — sobre firmado + CDR a R2,
  // DESPUÉS del commit de la tx (best-effort; nunca revierte el SUCCESS).
  if (input.archive) {
    await archiveRcEnvelope({
      db,
      archive: input.archive,
      tenantId: input.tenantId,
      summaryId,
      xml,
      cdr,
    });
  }

  return {
    status: 'SUCCESS',
    dailySummaryId: summaryId,
    sunatStatus: rcStatus,
    ticketCount: plan.ticketCount,
    nrusOmittedCount: nrusPlan.omittedSaleIds.length,
    rcType,
    rcUblId: sunatTicket,
  };
}

/** Arqueo Z no dispara RC (banner Z≠RC). */
export function triggerRcFromCashClose(): never {
  throw new Error('CASH_CLOSE_MUST_NOT_TRIGGER_RC');
}

export interface DailySummarySweepResult {
  readonly summaryDate: string;
  readonly tenantsWithPending: number;
  readonly results: readonly {
    readonly tenantId: string;
    readonly status: BuildDailySummaryResult['status'];
    readonly ticketCount?: number;
  }[];
}

/**
 * F5b-1: sweep multi-tenant del RC diario — lista tenants con boletas del día
 * aún sin RC (PENDING/PROCESSING/ACCEPTED/DEADLINE_EXCEEDED, daily_summary_id
 * NULL) y construye su RC. El cron llama esto con summaryDate = día Lima previo.
 */
export async function runDailySummarySweep(
  db: D1DatabaseLike,
  input: {
    readonly summaryDate: string;
    readonly nowMs: number;
    readonly limit?: number;
    /** C6: puerto RC real; sin él el sweep usa el mock (staging only). */
    readonly cdr?: RcCdrPort;
    /**
     * Fail-closed §5.2: signer para emisores TENANT_CERT. Sin él, esos
     * emisores reportan MISSING_SIGNER (nunca RC unsigned).
     */
    readonly signer?: FiscalXmlSigner;
  },
): Promise<DailySummarySweepResult> {
  const limit = input.limit ?? 500;
  // H1: mismo criterio de elegibilidad que buildDailySummary — boletas/tickets
  // y notas (07/08) sobre boleta. Sin esto, un tenant cuya única deuda fiscal
  // del día es una nota jamás sería descubierto por el barrido.
  const pending = await db
    .prepare(
      `SELECT DISTINCT tenant_id
       FROM sales
       WHERE deleted_at IS NULL
         AND (
           document_type IN ('03','12')
           OR (
             document_type IN ('07','08')
             AND EXISTS (
               SELECT 1 FROM sales orig
               WHERE orig.tenant_id = sales.tenant_id
                 AND orig.id = sales.referenced_sale_id
                 AND orig.document_type IN ('03','12')
             )
           )
         )
         AND sunat_status IN ('PENDING','PROCESSING','ACCEPTED','DEADLINE_EXCEEDED')
         AND daily_summary_id IS NULL
         AND date(issued_at_lima) = ?
       ORDER BY tenant_id
       LIMIT ?`,
    )
    .bind(input.summaryDate, limit)
    .all<{ tenant_id: string }>();

  const tenants = pending.results ?? [];
  const results: DailySummarySweepResult['results'][number][] = [];
  for (const row of tenants) {
    const r = await buildDailySummary(db, {
      tenantId: row.tenant_id,
      summaryDate: input.summaryDate,
      nowMs: input.nowMs,
      ...(input.cdr ? { cdr: input.cdr } : {}),
      ...(input.signer ? { signer: input.signer } : {}),
    });
    results.push({
      tenantId: row.tenant_id,
      status: r.status,
      ...(r.ticketCount !== undefined ? { ticketCount: r.ticketCount } : {}),
    });
  }
  return { summaryDate: input.summaryDate, tenantsWithPending: tenants.length, results };
}
