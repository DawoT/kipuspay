/**
 * processWithholdingAtomic — Percepción `02` y Retención `20` (Arquitectura
 * §5.2c, ADR-FISCAL-005). Correlativo server-side en branch_document_series
 * ('02'/'20') con guardState anti-doble; montos en cents calculados en el
 * servidor; audit PERCEPTION/RETENTION con hash-chain. 0 stock: solo ajusta
 * el flujo de pago.
 */
import {
  assertPerceptionCategory,
  assertRetentionCategory,
  computePerceptionCents,
  computeRetentionCents,
} from '@kipuspay/domain-fiscal-pe';
import { runD1AtomicPlan, type AtomicPlanBuilder, type D1DatabaseLike } from './index.js';

export interface PerceptionResult {
  readonly perceptionId: string;
  readonly series: string;
  readonly number: number;
  readonly baseAmountCents: number;
  readonly amountCents: number;
  readonly ratePercentage: number;
  readonly sunatStatus: 'PENDING';
}

export interface RetentionResult {
  readonly retentionId: string;
  readonly series: string;
  readonly number: number;
  readonly baseAmountCents: number;
  readonly amountCents: number;
  readonly ratePercentage: number;
  readonly sunatStatus: 'PENDING';
}

async function nextSeriesNumber(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  docCode: string,
  series: string,
): Promise<{ id: string; series: string; current_number: number }> {
  const row = await db
    .prepare(
      `SELECT id, series, current_number FROM branch_document_series
       WHERE tenant_id = ? AND branch_id = ? AND document_type_code = ?
         AND series = ? AND is_active = 1`,
    )
    .bind(tenantId, branchId, docCode, series)
    .first<{ id: string; series: string; current_number: number }>();
  if (!row) throw new Error('WITHHOLDING_SERIES_NOT_FOUND');
  return row;
}

async function auditTail(
  db: D1DatabaseLike,
  tenantId: string,
  action: string,
  entityId: string,
): Promise<{ prev: string | null; id: string; hash: string }> {
  const prev = await db
    .prepare(
      `SELECT row_hash FROM audit_events WHERE tenant_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ row_hash: string }>();
  const id = crypto.randomUUID();
  const hash = await crypto.subtle
    .digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify({ action, entity_id: entityId, prev: prev?.row_hash ?? null }),
      ),
    )
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));
  return { prev: prev?.row_hash ?? null, id, hash };
}

/** Emite el documento de percepción `02` al cobrar una venta a cliente agente. */
export async function processPerceptionAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  userId: string,
  originSaleId: string,
  series: string,
  baseAmountCents: number,
  category: string,
): Promise<PerceptionResult> {
  const cat = assertPerceptionCategory(category);
  const amountCents = computePerceptionCents(baseAmountCents, cat);
  const ratePercentage = PERCEPTION_RATE_BPS[cat];

  const origin = await db
    .prepare(`SELECT id FROM sales WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`)
    .bind(originSaleId, tenantId)
    .first<{ id: string }>();
  if (!origin) throw new Error('ORIGIN_SALE_NOT_FOUND');

  const seriesRow = await nextSeriesNumber(db, tenantId, branchId, '02', series);
  const perceptionId = crypto.randomUUID();
  const tail = await auditTail(db, tenantId, 'PERCEPTION', perceptionId);

  const build = (plan: AtomicPlanBuilder): void => {
    plan.guardState(
      `SELECT 1 FROM branch_document_series WHERE id = ? AND tenant_id = ? AND current_number = ?`,
      [seriesRow.id, tenantId, seriesRow.current_number],
    );
    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series SET current_number = current_number + 1 WHERE id = ? AND tenant_id = ?`,
        )
        .bind(seriesRow.id, tenantId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO perceptions (
             id, tenant_id, branch_id, series, number, origin_sale_id,
             base_amount_cents, rate_percentage, amount_cents, sunat_status, created_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        )
        .bind(
          perceptionId,
          tenantId,
          branchId,
          seriesRow.series,
          seriesRow.current_number + 1,
          originSaleId,
          baseAmountCents,
          ratePercentage,
          amountCents,
          userId,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'PERCEPTION', 'perception', ?, ?, ?, ?)`,
        )
        .bind(
          tail.id,
          tenantId,
          branchId,
          userId,
          perceptionId,
          JSON.stringify({ originSaleId, baseAmountCents, ratePercentage, amountCents }),
          tail.prev,
          tail.hash,
        ),
    );
  };
  await runD1AtomicPlan(db, build);

  return {
    perceptionId,
    series: seriesRow.series,
    number: seriesRow.current_number + 1,
    baseAmountCents,
    amountCents,
    ratePercentage,
    sunatStatus: 'PENDING',
  };
}

/** Emite el documento de retención `20` al pagar a un proveedor sujeto. */
export async function processRetentionAtomic(
  db: D1DatabaseLike,
  tenantId: string,
  branchId: string,
  userId: string,
  originSupplierInvoiceId: string,
  series: string,
  baseAmountCents: number,
  category: string,
): Promise<RetentionResult> {
  const cat = assertRetentionCategory(category);
  const amountCents = computeRetentionCents(baseAmountCents, cat);
  const ratePercentage = RETENTION_RATE_BPS[cat];

  const origin = await db
    .prepare(`SELECT id FROM supplier_invoices WHERE id = ? AND tenant_id = ?`)
    .bind(originSupplierInvoiceId, tenantId)
    .first<{ id: string }>();
  if (!origin) throw new Error('ORIGIN_SUPPLIER_INVOICE_NOT_FOUND');

  const seriesRow = await nextSeriesNumber(db, tenantId, branchId, '20', series);
  const retentionId = crypto.randomUUID();
  const tail = await auditTail(db, tenantId, 'RETENTION', retentionId);

  const build = (plan: AtomicPlanBuilder): void => {
    plan.guardState(
      `SELECT 1 FROM branch_document_series WHERE id = ? AND tenant_id = ? AND current_number = ?`,
      [seriesRow.id, tenantId, seriesRow.current_number],
    );
    plan.add(
      db
        .prepare(
          `UPDATE branch_document_series SET current_number = current_number + 1 WHERE id = ? AND tenant_id = ?`,
        )
        .bind(seriesRow.id, tenantId),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO retentions (
             id, tenant_id, branch_id, series, number, origin_supplier_invoice_id,
             base_amount_cents, rate_percentage, amount_cents, sunat_status, created_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
        )
        .bind(
          retentionId,
          tenantId,
          branchId,
          seriesRow.series,
          seriesRow.current_number + 1,
          originSupplierInvoiceId,
          baseAmountCents,
          ratePercentage,
          amountCents,
          userId,
        ),
    );
    plan.add(
      db
        .prepare(
          `INSERT INTO audit_events (
             id, tenant_id, branch_id, actor_user_id, action, entity_type, entity_id,
             payload_json, prev_hash, row_hash
           ) VALUES (?, ?, ?, ?, 'RETENTION', 'retention', ?, ?, ?, ?)`,
        )
        .bind(
          tail.id,
          tenantId,
          branchId,
          userId,
          retentionId,
          JSON.stringify({ originSupplierInvoiceId, baseAmountCents, ratePercentage, amountCents }),
          tail.prev,
          tail.hash,
        ),
    );
  };
  await runD1AtomicPlan(db, build);

  return {
    retentionId,
    series: seriesRow.series,
    number: seriesRow.current_number + 1,
    baseAmountCents,
    amountCents,
    ratePercentage,
    sunatStatus: 'PENDING',
  };
}

const PERCEPTION_RATE_BPS = { goods: 200, other: 50 } as const;
const RETENTION_RATE_BPS = { goods: 300, services: 600, commissions: 1200 } as const;
