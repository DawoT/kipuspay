export type StockQuantity = number;

export interface StockBatch {
  readonly batchId: string;
  readonly productId: string;
  readonly qty: StockQuantity;
  readonly expiresAtUtc: string;
}

export function sumQty(batches: readonly StockBatch[]): StockQuantity {
  let total = 0;
  for (const batch of batches) {
    total += batch.qty;
  }
  return total;
}

export function firstExpiringAtUtc(batches: readonly StockBatch[]): string | null {
  let earliest: string | null = null;
  for (const batch of batches) {
    if (earliest === null || batch.expiresAtUtc < earliest) {
      earliest = batch.expiresAtUtc;
    }
  }
  return earliest;
}
