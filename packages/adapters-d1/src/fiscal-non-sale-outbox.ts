/**
 * Encola GRE/02/20 en fiscal_non_sale_outbox (FASE FL-5). No es sale.
 */
import { FACTURA_SUBMIT_DAYS } from '@kipuspay/domain-fiscal-pe';
import type { AtomicPlanBuilder, D1DatabaseLike } from './index.js';

export type NonSaleDocumentType = '31' | '02' | '20';

export function nonSaleMustSubmitByIso(
  documentType: NonSaleDocumentType,
  transferStartedAt?: string,
): string {
  if (documentType === '31' && transferStartedAt) return transferStartedAt;
  return new Date(Date.now() + FACTURA_SUBMIT_DAYS * 24 * 3600 * 1000).toISOString();
}

export function enqueueNonSaleOutbox(
  db: D1DatabaseLike,
  plan: AtomicPlanBuilder,
  input: {
    readonly tenantId: string;
    readonly documentType: NonSaleDocumentType;
    readonly entityId: string;
    readonly mustSubmitByIso: string;
  },
): void {
  plan.add(
    db
      .prepare(
        `INSERT INTO fiscal_non_sale_outbox (
           id, tenant_id, document_type, entity_id, status, must_submit_by
         ) VALUES (?, ?, ?, ?, 'PENDING', ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.tenantId,
        input.documentType,
        input.entityId,
        input.mustSubmitByIso,
      ),
  );
}
