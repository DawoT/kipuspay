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
  readonly qty?: number;
  /** WEIGH uses this integer source of truth; HTTP decimal qty is ignored. */
  readonly qtyMicrounits?: number;
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
  readonly productType?: string;
  readonly baseQuantityMicrounits?: number;
  readonly alreadyReturnedMicrounits?: number;
}

export interface PlannedReturnLine {
  readonly originalSaleItemId: string;
  readonly productId: string;
  readonly qty: number;
  readonly qtyMicrounits: number;
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
  readonly reversesWeightMeasurement: boolean;
}

// eslint-disable-next-line complexity -- legacy unit and exact WEIGH return reconciliation
export function planReturnLines(
  requests: readonly ReturnLineRequest[],
  originals: readonly OriginalSaleItem[],
): readonly PlannedReturnLine[] {
  if (requests.length === 0) throw new Error(RETURN_NO_LINES);
  const byId = new Map(originals.map((o) => [o.id, o]));
  const planned: PlannedReturnLine[] = [];
  for (const req of requests) {
    const orig = byId.get(req.originalSaleItemId);
    if (!orig) throw new Error('RETURN_ITEM_NOT_FOUND');
    const weighted = orig.productType === 'WEIGH';
    const originalMicrounits = orig.baseQuantityMicrounits ?? Math.round(orig.quantity * 1_000_000);
    const returnedMicrounits =
      orig.alreadyReturnedMicrounits ?? Math.round(orig.alreadyReturnedQty * 1_000_000);
    const qtyMicrounits = weighted
      ? req.qtyMicrounits
      : (req.qtyMicrounits ?? Math.round((req.qty ?? 0) * 1_000_000));
    if (
      !Number.isSafeInteger(qtyMicrounits) ||
      (qtyMicrounits ?? 0) <= 0 ||
      (weighted && req.qtyMicrounits === undefined)
    ) {
      throw new Error(RETURN_QTY_EXCEEDED);
    }
    if (qtyMicrounits! > originalMicrounits - returnedMicrounits) {
      throw new Error(RETURN_QTY_EXCEEDED);
    }
    const qty = qtyMicrounits! / 1_000_000;
    const ratio = originalMicrounits > 0 ? qtyMicrounits! / originalMicrounits : 0;
    const lineTotalCents = Math.round(orig.totalAmountCents * ratio);
    const igvAmountCents = Math.round(orig.igvAmountCents * ratio);
    const icbperAmountCents = Math.round(orig.icbperAmountCents * ratio);
    planned.push({
      originalSaleItemId: orig.id,
      productId: orig.productId,
      qty,
      qtyMicrounits: qtyMicrounits!,
      unitPriceCents: orig.unitPriceCents,
      unitCostCents: orig.unitCostCents,
      batchId: orig.batchId,
      isUncatalogued: orig.isUncatalogued,
      igvAffectationCode: orig.igvAffectationCode,
      igvAmountCents,
      icbperAmountCents,
      lineTotalCents,
      unitPriceWithoutTaxCents: Math.max(0, orig.unitPriceCents - Math.round(igvAmountCents / qty)),
      restoreStock: !orig.isUncatalogued,
      reversesWeightMeasurement: weighted,
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
    window_days?: unknown;
    by_payment_method_json?: unknown;
    refund_to_original_method?: unknown;
    allow_turn_closed_with_auth?: unknown;
  } | null,
): ReturnPolicy {
  if (!row || typeof row.window_days !== 'number') return DEFAULT_RETURN_POLICY;
  let byPaymentMethod: Record<string, number> = {};
  try {
    const rawJson =
      typeof row.by_payment_method_json === 'string' && row.by_payment_method_json.trim()
        ? row.by_payment_method_json
        : '{}';
    const parsed: unknown = JSON.parse(rawJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) byPaymentMethod[k] = v;
      }
    }
  } catch {
    byPaymentMethod = {};
  }
  return {
    windowDays: Number(row.window_days),
    byPaymentMethod,
    refundToOriginalMethod: Boolean(row.refund_to_original_method),
    allowTurnClosedWithAuth: Boolean(row.allow_turn_closed_with_auth),
  };
}
