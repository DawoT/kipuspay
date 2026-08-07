/**
 * Devoluciones con política N días — Arquitectura §5.3 regla 13 / Sprint 28.
 */

export const RETURN_OUTSIDE_WINDOW = 'OUTSIDE_WINDOW';
export const RETURN_QTY_EXCEEDED = 'RETURN_QTY_EXCEEDED';
export const RETURN_REASON_REQUIRED = 'RETURN_REASON_REQUIRED';
export const RETURN_NO_LINES = 'RETURN_NO_LINES';

export type ReturnDocType = '07' | 'NV_RETURN';

export interface ReturnPolicy {
  readonly windowDays: number;
  /** Override por método: cash|card|credit → días. Ausente → windowDays. */
  readonly byPaymentMethod: Readonly<Record<string, number>>;
  readonly refundToOriginalMethod: boolean;
  readonly allowTurnClosedWithAuth: boolean;
}

export const DEFAULT_RETURN_POLICY: ReturnPolicy = {
  windowDays: 7,
  byPaymentMethod: {},
  refundToOriginalMethod: true,
  allowTurnClosedWithAuth: false,
};

export function windowDaysForMethod(policy: ReturnPolicy, paymentMethod: string): number {
  const override = policy.byPaymentMethod[paymentMethod];
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return policy.windowDays;
}

/** Días civiles entre emisión y ahora (floor). */
export function daysSinceIssued(issuedAtMs: number, nowMs: number): number {
  if (nowMs < issuedAtMs) return 0;
  return Math.floor((nowMs - issuedAtMs) / (24 * 60 * 60 * 1000));
}

export function assertReturnWithinWindow(input: {
  readonly issuedAtMs: number;
  readonly nowMs: number;
  readonly policy: ReturnPolicy;
  readonly paymentMethod: string;
}): void {
  const allowed = windowDaysForMethod(input.policy, input.paymentMethod);
  if (allowed <= 0) {
    throw new Error(RETURN_OUTSIDE_WINDOW);
  }
  const elapsed = daysSinceIssued(input.issuedAtMs, input.nowMs);
  if (elapsed > allowed) {
    throw new Error(RETURN_OUTSIDE_WINDOW);
  }
}

export interface ReturnLineRequest {
  readonly originalSaleItemId: string;
  readonly qty: number;
}

export interface OriginalSaleItem {
  readonly id: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly unitCostCents: number;
  readonly batchId: string | null;
  readonly isUncatalogued: boolean;
  readonly igvAffectationCode: string;
  readonly igvAmountCents: number;
  readonly icbperAmountCents: number;
  readonly totalAmountCents: number;
  /** Qty already returned against this line. */
  readonly alreadyReturnedQty: number;
}

export interface PlannedReturnLine {
  readonly originalSaleItemId: string;
  readonly productId: string;
  readonly qty: number;
  readonly unitPriceCents: number;
  readonly unitCostCents: number;
  readonly batchId: string | null;
  readonly isUncatalogued: boolean;
  readonly igvAffectationCode: string;
  readonly igvAmountCents: number;
  readonly icbperAmountCents: number;
  readonly lineTotalCents: number;
  readonly unitPriceWithoutTaxCents: number;
  readonly restoreStock: boolean;
}

export function planReturnLines(
  requests: readonly ReturnLineRequest[],
  originals: readonly OriginalSaleItem[],
): readonly PlannedReturnLine[] {
  if (requests.length === 0) throw new Error(RETURN_NO_LINES);
  const byId = new Map(originals.map((o) => [o.id, o]));
  const planned: PlannedReturnLine[] = [];
  for (const req of requests) {
    if (!(req.qty > 0) || !Number.isFinite(req.qty)) {
      throw new Error(RETURN_QTY_EXCEEDED);
    }
    const orig = byId.get(req.originalSaleItemId);
    if (!orig) throw new Error('RETURN_ITEM_NOT_FOUND');
    const remaining = orig.quantity - orig.alreadyReturnedQty;
    if (req.qty > remaining + 1e-9) throw new Error(RETURN_QTY_EXCEEDED);
    const ratio = orig.quantity > 0 ? req.qty / orig.quantity : 0;
    const lineTotalCents = Math.round(orig.totalAmountCents * ratio);
    const igvAmountCents = Math.round(orig.igvAmountCents * ratio);
    const icbperAmountCents = Math.round(orig.icbperAmountCents * ratio);
    planned.push({
      originalSaleItemId: orig.id,
      productId: orig.productId,
      qty: req.qty,
      unitPriceCents: orig.unitPriceCents,
      unitCostCents: orig.unitCostCents,
      batchId: orig.batchId,
      isUncatalogued: orig.isUncatalogued,
      igvAffectationCode: orig.igvAffectationCode,
      igvAmountCents,
      icbperAmountCents,
      lineTotalCents,
      unitPriceWithoutTaxCents: Math.max(
        0,
        orig.unitPriceCents - Math.round(igvAmountCents / req.qty),
      ),
      restoreStock: !orig.isUncatalogued,
    });
  }
  return planned;
}

export function sumReturnRefundCents(lines: readonly PlannedReturnLine[]): number {
  return lines.reduce((acc, l) => acc + l.lineTotalCents, 0);
}

export function assertReturnReason(reason: string): void {
  if (!reason || reason.trim().length === 0) throw new Error(RETURN_REASON_REQUIRED);
}

/** Doc type según formalización (§5.3 / ADR-FISCAL-001). */
export function resolveReturnDocType(formalizationMode: string): ReturnDocType {
  if (formalizationMode === 'ELECTRONIC_ISSUER' || formalizationMode === 'FORMALIZING') {
    return '07';
  }
  return 'NV_RETURN';
}

export function parseReturnPolicyRow(
  row: {
    window_days: number;
    by_payment_method_json: string;
    refund_to_original_method: number | boolean;
    allow_turn_closed_with_auth: number | boolean;
  } | null,
): ReturnPolicy {
  if (!row) return DEFAULT_RETURN_POLICY;
  let byPaymentMethod: Record<string, number> = {};
  try {
    const parsed: unknown = JSON.parse(row.by_payment_method_json || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) byPaymentMethod[k] = v;
      }
    }
  } catch {
    byPaymentMethod = {};
  }
  return {
    windowDays: row.window_days,
    byPaymentMethod,
    refundToOriginalMethod: Boolean(row.refund_to_original_method),
    allowTurnClosedWithAuth: Boolean(row.allow_turn_closed_with_auth),
  };
}
