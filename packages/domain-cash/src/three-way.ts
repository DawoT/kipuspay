/**
 * Matching 3-way OC → recepción → factura — Arquitectura §5.3 regla 14 / Sprint 29.
 */
/* eslint-disable complexity -- matriz qty/precio/override; split diferido */
import type { Cents } from './index.js';

export const THREE_WAY_MISMATCH = 'THREE_WAY_MISMATCH';
export const THREE_WAY_OVERRIDE_REQUIRED = 'THREE_WAY_OVERRIDE_REQUIRED';
export const THREE_WAY_QTY_MISMATCH = 'THREE_WAY_QTY_MISMATCH';

export type SupplierInvoiceStatus = 'OPEN' | 'MATCHED' | 'PARTIAL' | 'CLOSED';

export interface ThreeWayLineInput {
  readonly productId: string;
  readonly orderedQty: number;
  readonly receivedQty: number;
  readonly invoicedQty: number;
  readonly poUnitCostCents: Cents;
  readonly invoiceUnitCostCents: Cents;
}

export interface ThreeWayMatchInput {
  readonly lines: readonly ThreeWayLineInput[];
  /** Override autorizado de diferencia de precio (SUPPLIER_PRICE_DIFF). */
  readonly priceDiffOverride: boolean;
  readonly invoiceTotalCents: Cents;
  readonly invoiceIgvCents: Cents;
}

export interface ThreeWayMatchPlan {
  readonly status: SupplierInvoiceStatus;
  readonly matchedQty: number;
  readonly matchedAmountCents: Cents;
  readonly apAmountCents: Cents;
  readonly requiresPriceDiffAudit: boolean;
  readonly costTrueUpByProduct: ReadonlyMap<string, Cents>;
}

function assertNonNegQty(qty: number, code: string): void {
  if (!(qty >= 0) || !Number.isFinite(qty)) throw new Error(code);
}

/**
 * Valida matching 3-way: qty OC ≥ recepción ≥ factura (o iguales según política estricta).
 * Política S29: invoicedQty debe igualar receivedQty (no facturar más de lo recibido);
 * receivedQty no puede exceder orderedQty (ya validado en recepción).
 * Precio: invoice unit cost ≠ PO → requiere override o THREE_WAY_MISMATCH.
 */
export function assertThreeWayMatch(input: ThreeWayMatchInput): ThreeWayMatchPlan {
  if (input.lines.length === 0) throw new Error('THREE_WAY_REQUIRES_LINES');
  if (!(input.invoiceTotalCents > 0) || !Number.isInteger(input.invoiceTotalCents)) {
    throw new Error('INVALID_INVOICE_TOTAL');
  }
  if (!(input.invoiceIgvCents >= 0) || !Number.isInteger(input.invoiceIgvCents)) {
    throw new Error('INVALID_INVOICE_IGV');
  }

  let matchedQty = 0;
  let matchedAmountCents = 0;
  let requiresPriceDiffAudit = false;
  const costTrueUp = new Map<string, Cents>();
  let allFullyMatched = true;

  for (const line of input.lines) {
    assertNonNegQty(line.orderedQty, 'INVALID_ORDERED_QTY');
    assertNonNegQty(line.receivedQty, 'INVALID_RECEIVED_QTY');
    assertNonNegQty(line.invoicedQty, 'INVALID_INVOICED_QTY');
    if (line.invoicedQty <= 0) continue;

    if (line.receivedQty > line.orderedQty + 1e-9) {
      throw new Error(THREE_WAY_QTY_MISMATCH);
    }
    if (line.invoicedQty > line.receivedQty + 1e-9) {
      throw new Error(THREE_WAY_QTY_MISMATCH);
    }
    if (line.receivedQty + 1e-9 < line.orderedQty) {
      allFullyMatched = false;
    }
    if (line.invoicedQty + 1e-9 < line.receivedQty) {
      allFullyMatched = false;
    }

    if (!Number.isInteger(line.poUnitCostCents) || line.poUnitCostCents < 0) {
      throw new Error('INVALID_PO_UNIT_COST');
    }
    if (!Number.isInteger(line.invoiceUnitCostCents) || line.invoiceUnitCostCents < 0) {
      throw new Error('INVALID_INVOICE_UNIT_COST');
    }

    if (line.invoiceUnitCostCents !== line.poUnitCostCents) {
      if (!input.priceDiffOverride) {
        throw new Error(THREE_WAY_MISMATCH);
      }
      requiresPriceDiffAudit = true;
      costTrueUp.set(line.productId, line.invoiceUnitCostCents - line.poUnitCostCents);
    }

    matchedQty += line.invoicedQty;
    matchedAmountCents += Math.round(line.invoicedQty * line.invoiceUnitCostCents);
  }

  if (matchedQty <= 0) throw new Error('THREE_WAY_REQUIRES_LINES');

  // Tolerancia: total factura debe coincidir con Σ líneas + IGV (mismo entero cents).
  const expectedTotalCents = matchedAmountCents + input.invoiceIgvCents;
  if (
    expectedTotalCents !== input.invoiceTotalCents &&
    matchedAmountCents !== input.invoiceTotalCents
  ) {
    if (!input.priceDiffOverride) throw new Error(THREE_WAY_MISMATCH);
    requiresPriceDiffAudit = true;
  }

  const status: SupplierInvoiceStatus = allFullyMatched ? 'CLOSED' : 'PARTIAL';

  return {
    status,
    matchedQty,
    matchedAmountCents: input.invoiceTotalCents,
    apAmountCents: input.invoiceTotalCents,
    requiresPriceDiffAudit,
    costTrueUpByProduct: costTrueUp,
  };
}
