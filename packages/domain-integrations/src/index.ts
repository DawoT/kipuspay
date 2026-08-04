import type { Cents } from '@kipuspay/domain-sales';

export interface PaymentChargeRequest {
  readonly chargeId: string;
  readonly amountCents: Cents;
  readonly currency: 'PEN';
}

export interface PaymentChargeResult {
  readonly chargeId: string;
  readonly approved: boolean;
  readonly reference: string | null;
}

export interface PaymentAcquirerPort {
  charge(request: PaymentChargeRequest): Promise<PaymentChargeResult>;
}

export interface PriceLookupPort {
  priceCentsFor(productId: string): Promise<Cents>;
}

export interface AccountingExportPort {
  exportMovements(movements: readonly object[]): Promise<{ exportedCount: number }>;
}

export function aggregateImportsPerSource(
  entries: readonly { readonly source: string }[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  }
  return counts;
}
