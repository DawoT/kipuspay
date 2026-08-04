/**
 * processFiscalDeadlines — barre must_submit_by (Arquitectura §5.2).
 * Reloj inyectable (nowMs). Emite alertas Dueño; DEADLINE_EXCEEDED + sugerencia E-A.
 */
import {
  buildOwnerAlert,
  evaluateDeadline,
  type DeadlineCandidate,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type D1DatabaseLike } from './index.js';

export interface ProcessDeadlinesResult {
  readonly scanned: number;
  readonly actions: readonly {
    readonly saleId: string;
    readonly alert: string;
    readonly suggestCreditNoteEa: boolean;
  }[];
}

export async function processFiscalDeadlines(
  db: D1DatabaseLike,
  nowMs: number,
  options?: { readonly tenantId?: string; readonly limit?: number },
): Promise<ProcessDeadlinesResult> {
  const limit = options?.limit ?? 100;
  const rows = options?.tenantId
    ? await db
        .prepare(
          `SELECT id, document_type, sunat_status, must_submit_by,
                  COALESCE(alert_t24_sent, 0) AS alert_t24_sent,
                  COALESCE(alert_t6_sent, 0) AS alert_t6_sent
           FROM sales
           WHERE deleted_at IS NULL
             AND must_submit_by IS NOT NULL
             AND sunat_status IN ('PENDING','PROCESSING')
             AND tenant_id = ?
           ORDER BY must_submit_by ASC
           LIMIT ?`,
        )
        .bind(options.tenantId, limit)
        .all<{
          id: string;
          document_type: string;
          sunat_status: string;
          must_submit_by: string;
          alert_t24_sent: number;
          alert_t6_sent: number;
        }>()
    : await db
        .prepare(
          `SELECT id, document_type, sunat_status, must_submit_by,
                  COALESCE(alert_t24_sent, 0) AS alert_t24_sent,
                  COALESCE(alert_t6_sent, 0) AS alert_t6_sent
           FROM sales
           WHERE deleted_at IS NULL
             AND must_submit_by IS NOT NULL
             AND sunat_status IN ('PENDING','PROCESSING')
           ORDER BY must_submit_by ASC
           LIMIT ?`,
        )
        .bind(limit)
        .all<{
          id: string;
          document_type: string;
          sunat_status: string;
          must_submit_by: string;
          alert_t24_sent: number;
          alert_t6_sent: number;
        }>();

  const list = rows.results ?? [];
  const actions: ProcessDeadlinesResult['actions'][number][] = [];

  for (const row of list) {
    const candidate: DeadlineCandidate = {
      id: row.id,
      documentType: row.document_type,
      sunatStatus: row.sunat_status,
      mustSubmitByMs: Date.parse(row.must_submit_by),
      alertT24Sent: row.alert_t24_sent === 1,
      alertT6Sent: row.alert_t6_sent === 1,
    };
    const action = evaluateDeadline(candidate, nowMs);
    if (!action) continue;

    const saleMeta = await db
      .prepare(`SELECT tenant_id FROM sales WHERE id = ?`)
      .bind(row.id)
      .first<{ tenant_id: string }>();
    if (!saleMeta) continue;

    const payload = buildOwnerAlert({
      alertKind: action.alert,
      saleId: row.id,
      documentType: row.document_type,
      mustSubmitByIso: row.must_submit_by,
    });
    const alertId = crypto.randomUUID();

    await runD1AtomicPlan(db, (plan) => {
      plan.add(
        db
          .prepare(
            `INSERT INTO fiscal_owner_alerts
               (id, tenant_id, sale_id, alert_kind, suggest_credit_note_ea, payload_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            alertId,
            saleMeta.tenant_id,
            row.id,
            action.alert,
            action.suggestCreditNoteEa ? 1 : 0,
            JSON.stringify(payload),
          ),
      );
      if (action.alert === 'T24H') {
        plan.add(
          db
            .prepare(`UPDATE sales SET alert_t24_sent = 1 WHERE id = ? AND tenant_id = ?`)
            .bind(row.id, saleMeta.tenant_id),
        );
      } else if (action.alert === 'T6H') {
        plan.add(
          db
            .prepare(`UPDATE sales SET alert_t6_sent = 1 WHERE id = ? AND tenant_id = ?`)
            .bind(row.id, saleMeta.tenant_id),
        );
      } else if (action.alert === 'DEADLINE_EXCEEDED') {
        plan.add(
          db
            .prepare(
              `UPDATE sales SET sunat_status = 'DEADLINE_EXCEEDED', alert_t24_sent = 1, alert_t6_sent = 1
               WHERE id = ? AND tenant_id = ? AND sunat_status IN ('PENDING','PROCESSING')`,
            )
            .bind(row.id, saleMeta.tenant_id),
        );
        plan.add(
          db
            .prepare(
              `UPDATE fiscal_outbox SET status = 'FAILED', last_error = 'DEADLINE_EXCEEDED'
               WHERE sale_id = ? AND tenant_id = ? AND status IN ('PENDING','PROCESSING')`,
            )
            .bind(row.id, saleMeta.tenant_id),
        );
      }
    });

    actions.push({
      saleId: row.id,
      alert: action.alert,
      suggestCreditNoteEa: action.suggestCreditNoteEa,
    });
  }

  return { scanned: list.length, actions };
}
