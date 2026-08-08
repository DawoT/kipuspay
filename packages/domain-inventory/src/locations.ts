/** Sprint 38 / ADR-0022 — dominio puro de stock por ubicación. */

export const LOCATION_INVALID_QUANTITY = 'LOCATION_INVALID_QUANTITY';
export const LOCATION_INSUFFICIENT_STOCK = 'LOCATION_INSUFFICIENT_STOCK';
export const LOCATION_RECONCILIATION_DRIFT = 'LOCATION_RECONCILIATION_DRIFT';
export const LOCATION_NONEMPTY = 'LOCATION_NONEMPTY';
export const LOCATION_EXPIRED_BATCH = 'LOCATION_EXPIRED_BATCH';

function assertMicrounits(value: number, allowNegative = false): void {
  if (!Number.isSafeInteger(value) || (!allowNegative && value < 0)) {
    throw new Error(LOCATION_INVALID_QUANTITY);
  }
}

export interface ActiveLocationStock {
  readonly locationId: string;
  readonly active: boolean;
  readonly quantityMicrounits: number;
}

export function sumActiveLocationStockMicrounits(rows: readonly ActiveLocationStock[]): number {
  let total = 0;
  for (const row of rows) {
    assertMicrounits(row.quantityMicrounits, true);
    if (row.active) total += row.quantityMicrounits;
    if (!Number.isSafeInteger(total)) throw new Error(LOCATION_INVALID_QUANTITY);
  }
  return total;
}

export function reconcileLocationTotal(
  branchQuantityMicrounits: number,
  activeLocationQuantityMicrounits: number,
): number {
  assertMicrounits(branchQuantityMicrounits, true);
  assertMicrounits(activeLocationQuantityMicrounits, true);
  const drift = activeLocationQuantityMicrounits - branchQuantityMicrounits;
  if (drift !== 0) throw new Error(LOCATION_RECONCILIATION_DRIFT);
  return drift;
}

export function planLocationTransfer(input: {
  readonly sourceQuantityMicrounits: number;
  readonly destinationQuantityMicrounits: number;
  readonly transferQuantityMicrounits: number;
}): {
  readonly sourceAfterMicrounits: number;
  readonly destinationAfterMicrounits: number;
  readonly branchDeltaMicrounits: 0;
} {
  assertMicrounits(input.sourceQuantityMicrounits);
  assertMicrounits(input.destinationQuantityMicrounits);
  assertMicrounits(input.transferQuantityMicrounits);
  if (input.transferQuantityMicrounits <= 0) throw new Error(LOCATION_INVALID_QUANTITY);
  if (input.sourceQuantityMicrounits < input.transferQuantityMicrounits) {
    throw new Error(LOCATION_INSUFFICIENT_STOCK);
  }
  const sourceAfterMicrounits = input.sourceQuantityMicrounits - input.transferQuantityMicrounits;
  const destinationAfterMicrounits =
    input.destinationQuantityMicrounits + input.transferQuantityMicrounits;
  assertMicrounits(destinationAfterMicrounits);
  return { sourceAfterMicrounits, destinationAfterMicrounits, branchDeltaMicrounits: 0 };
}

export interface LocationBatchStock {
  readonly locationId: string;
  readonly locationCode: string;
  readonly batchId: string;
  readonly expiresAtIso: string | null;
  readonly quantityMicrounits: number;
}

export interface LocationAllocation {
  readonly locationId: string;
  readonly batchId: string;
  readonly quantityMicrounits: number;
}

export function allocateStockByLocation(
  rows: readonly LocationBatchStock[],
  requestedMicrounits: number,
  nowIso: string,
): LocationAllocation[] {
  assertMicrounits(requestedMicrounits);
  if (requestedMicrounits <= 0) throw new Error(LOCATION_INVALID_QUANTITY);
  const candidates = rows
    .filter((row) => {
      assertMicrounits(row.quantityMicrounits);
      return row.quantityMicrounits > 0;
    })
    .sort(
      (a, b) =>
        (a.expiresAtIso ?? '9999-12-31').localeCompare(b.expiresAtIso ?? '9999-12-31') ||
        a.locationCode.localeCompare(b.locationCode) ||
        a.locationId.localeCompare(b.locationId) ||
        a.batchId.localeCompare(b.batchId),
    );
  let remaining = requestedMicrounits;
  const allocations: LocationAllocation[] = [];
  for (const row of candidates) {
    if (row.expiresAtIso && row.expiresAtIso < nowIso) {
      throw new Error(LOCATION_EXPIRED_BATCH);
    }
    const quantityMicrounits = Math.min(row.quantityMicrounits, remaining);
    allocations.push({ locationId: row.locationId, batchId: row.batchId, quantityMicrounits });
    remaining -= quantityMicrounits;
    if (remaining === 0) break;
  }
  if (remaining > 0) throw new Error(LOCATION_INSUFFICIENT_STOCK);
  return allocations;
}

export function planLocationCountAdjustment(input: {
  readonly systemQuantityMicrounits: number;
  readonly countedQuantityMicrounits: number;
}): { readonly differenceMicrounits: number; readonly nextQuantityMicrounits: number } {
  assertMicrounits(input.systemQuantityMicrounits, true);
  assertMicrounits(input.countedQuantityMicrounits);
  return {
    differenceMicrounits: input.countedQuantityMicrounits - input.systemQuantityMicrounits,
    nextQuantityMicrounits: input.countedQuantityMicrounits,
  };
}

export function assertLocationCanDeactivate(quantityMicrounits: number): void {
  assertMicrounits(quantityMicrounits, true);
  if (quantityMicrounits !== 0) throw new Error(LOCATION_NONEMPTY);
}
