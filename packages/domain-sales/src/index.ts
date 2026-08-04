export type Cents = number;

export const IGV_RATE_PER_MILLE = 180;

export interface SaleLine {
  readonly productId: string;
  readonly priceCents: Cents;
  readonly qty: number;
}

export interface SaleTotals {
  readonly subtotalCents: Cents;
  readonly igvCents: Cents;
  readonly totalCents: Cents;
}

export function computeSubtotalCents(lines: readonly SaleLine[]): Cents {
  let subtotal: Cents = 0;
  for (const line of lines) {
    subtotal += line.priceCents * line.qty;
  }
  return subtotal;
}

export function applyIgvCents(baseCents: Cents, ratePerMille: number): Cents {
  return Math.round((baseCents * ratePerMille) / 1000);
}

export function buildSaleTotals(lines: readonly SaleLine[]): SaleTotals {
  const subtotalCents = computeSubtotalCents(lines);
  const igvCents = applyIgvCents(subtotalCents, IGV_RATE_PER_MILLE);
  return {
    subtotalCents,
    igvCents,
    totalCents: subtotalCents + igvCents,
  };
}

export {
  assertOfflineSaleShape,
  computeNvLineTotals,
  InsufficientStockError,
  resolveIssuedAtMs,
  toLimaTimestamp,
  type NvLineCents,
  type NvTotals,
  type OfflinePaymentPayload,
  type OfflineSaleItemPayload,
  type OfflineSalePayload,
} from './offline-sale.js';
