/**
 * Statements de cupo para el mismo db.batch de emisión (§4.1).
 * SQLite: INSERT … ON CONFLICT DO UPDATE (nunca literal UPSERT INTO).
 */
import { countsTowardCupo, periodYmLima, usageKey } from '@kipuspay/domain-billing';
import type { AtomicPlanBuilder, D1DatabaseLike } from './index.js';

export function appendUsageMeterToPlan(
  plan: AtomicPlanBuilder,
  db: D1DatabaseLike,
  input: {
    tenantId: string;
    documentId: string;
    documentType: string;
    eventId?: string;
    nowMs?: number;
  },
): boolean {
  if (!countsTowardCupo(input.documentType)) return false;
  const periodYm = periodYmLima(input.nowMs ?? Date.now());
  const key = usageKey(input.documentId);
  const eventId = input.eventId ?? crypto.randomUUID();

  plan.add(
    db
      .prepare(
        `INSERT INTO usage_events (id, tenant_id, usage_key, period_ym, document_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(eventId, input.tenantId, key, periodYm, input.documentId),
  );
  plan.add(
    db
      .prepare(
        `INSERT INTO usage_counters (tenant_id, period_ym, doc_count, overage_reported_thru)
         VALUES (?, ?, 1, 0)
         ON CONFLICT(tenant_id, period_ym) DO UPDATE SET
           doc_count = doc_count + 1,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(input.tenantId, periodYm),
  );
  return true;
}
