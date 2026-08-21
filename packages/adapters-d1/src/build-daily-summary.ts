/**
 * buildDailySummaryCron — RC PRIMARY por (tenant_id, summary_date) FIS-03.
 * CDR vía puerto inyectable (mock PSE en worker). No se dispara desde arqueo Z.
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
  type BoletaForRc,
  type RcCdrPort,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';
import type { FiscalXmlSigner } from './fiscal-xml-producer.js';

export type { RcCdrPort } from '@kipuspay/domain-fiscal-pe';
export { createMockRcCdrPort } from '@kipuspay/domain-fiscal-pe';

export interface BuildDailySummaryInput {
  readonly tenantId: string;
  readonly summaryDate: string;
  readonly nowMs: number;
  readonly cdr?: RcCdrPort;
  readonly signer?: FiscalXmlSigner;
}

export interface BuildDailySummaryResult {
  readonly status: 'SUCCESS' | 'NOOP_EMPTY' | 'ALREADY_EXISTS';
  readonly dailySummaryId?: string;
  readonly sunatStatus?: string;
  readonly ticketCount?: number;
  readonly nrusOmittedCount?: number;
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
    .prepare(`SELECT tax_regime, ruc, business_name FROM tenants WHERE id = ?`)
    .bind(input.tenantId)
    .first<{ tax_regime: string; ruc: string | null; business_name: string }>();

  const boletas = await db
    .prepare(
      `SELECT id, branch_id, document_type, series, number, client_document_type,
              client_document_number, total_amount_cents, total_taxable_cents,
              total_igv_cents, void_status, issued_at_lima, sunat_status
       FROM sales
       WHERE tenant_id = ?
         AND deleted_at IS NULL
         AND document_type IN ('03','12')
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
    }>();

  const rcType = existing ? 'COMPLEMENTARY' : 'PRIMARY';
  let rows = boletas.results ?? [];
  if (rcType === 'COMPLEMENTARY') {
    rows = rows.filter((r) => r.sunat_status !== 'ACCEPTED');
  }
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

  let xml = `<DailySummary tenant="${input.tenantId}" date="${input.summaryDate}" tickets="${plan.ticketCount}" nrusOmit="${nrusPlan.omittedSaleIds.length}"/>`;
  if (tenant?.ruc && /^\d{11}$/.test(tenant.ruc)) {
    xml = buildUblSummaryDocumentsXml({
      id: sunatTicket,
      referenceDate: input.summaryDate,
      issueDate: input.summaryDate,
      issuerRuc: tenant.ruc,
      issuerName: tenant.business_name,
      lines: rows.map((r, i) => ({
        lineId: i + 1,
        documentType: r.document_type === '12' ? '12' : '03',
        documentId: `${r.series}-${String(r.number).padStart(8, '0')}`,
        customerDocType: r.client_document_type || '1',
        customerDocNumber: r.client_document_number || '00000000',
        conditionCode: r.void_status === 'VOID_PENDING_RC' ? '3' : '1',
        totalTaxableCents: r.total_taxable_cents,
        totalIgvCents: r.total_igv_cents,
        totalAmountCents: r.total_amount_cents,
      })),
    });
    if (input.signer) xml = await input.signer.sign(xml, input.tenantId);
  }
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

  return {
    status: 'SUCCESS',
    dailySummaryId: summaryId,
    sunatStatus: rcStatus,
    ticketCount: plan.ticketCount,
    nrusOmittedCount: nrusPlan.omittedSaleIds.length,
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
  },
): Promise<DailySummarySweepResult> {
  const limit = input.limit ?? 500;
  const pending = await db
    .prepare(
      `SELECT DISTINCT tenant_id
       FROM sales
       WHERE deleted_at IS NULL
         AND document_type IN ('03','12')
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
    });
    results.push({
      tenantId: row.tenant_id,
      status: r.status,
      ...(r.ticketCount !== undefined ? { ticketCount: r.ticketCount } : {}),
    });
  }
  return { summaryDate: input.summaryDate, tenantsWithPending: tenants.length, results };
}
