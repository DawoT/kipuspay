/**
 * buildDailySummaryCron — RC PRIMARY por (tenant_id, summary_date) FIS-03.
 * CDR vía puerto inyectable (mock PSE en worker). No se dispara desde arqueo Z.
 */
import {
  markVoidedAfterRc,
  planDailySummary,
  planNrusDailyConsolidation,
  canOmitUnitaryNrus,
  type BoletaForRc,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export interface RcCdrPort {
  submit(input: {
    readonly tenantId: string;
    readonly summaryId: string;
    readonly xml: string;
  }): Promise<{
    readonly accepted: boolean;
    readonly cdrCode: string;
    readonly cdrMessage: string;
  }>;
}

export function createMockRcCdrPort(): RcCdrPort {
  return {
    submit(input) {
      if (!input.xml.trim()) {
        return Promise.resolve({
          accepted: false,
          cdrCode: '99',
          cdrMessage: 'empty RC xml',
        });
      }
      return Promise.resolve({
        accepted: true,
        cdrCode: '0',
        cdrMessage: 'Mock RC CDR accepted',
      });
    },
  };
}

export interface BuildDailySummaryInput {
  readonly tenantId: string;
  readonly summaryDate: string;
  readonly nowMs: number;
  readonly cdr?: RcCdrPort;
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
  if (existing) {
    return { status: 'ALREADY_EXISTS', dailySummaryId: existing.id, sunatStatus: existing.status };
  }

  const tenant = await db
    .prepare(`SELECT tax_regime FROM tenants WHERE id = ?`)
    .bind(input.tenantId)
    .first<{ tax_regime: string }>();

  const boletas = await db
    .prepare(
      `SELECT id, branch_id, document_type, total_amount_cents, void_status, issued_at_lima
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
      total_amount_cents: number;
      void_status: string;
      issued_at_lima: string;
    }>();

  const rows = boletas.results ?? [];
  if (rows.length === 0) return { status: 'NOOP_EMPTY' };

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

  const xml = `<DailySummary tenant="${input.tenantId}" date="${input.summaryDate}" tickets="${plan.ticketCount}" nrusOmit="${nrusPlan.omittedSaleIds.length}"/>`;
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
           VALUES (?, ?, NULL, ?, ?, ?, 'PRIMARY', ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(
          summaryId,
          input.tenantId,
          input.summaryDate,
          rcStatus,
          mustSubmitBy,
          plan.ticketCount,
          `RC-${summaryId.slice(0, 8)}`,
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
  input: { readonly summaryDate: string; readonly nowMs: number; readonly limit?: number },
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
    });
    results.push({
      tenantId: row.tenant_id,
      status: r.status,
      ...(r.ticketCount !== undefined ? { ticketCount: r.ticketCount } : {}),
    });
  }
  return { summaryDate: input.summaryDate, tenantsWithPending: tenants.length, results };
}
