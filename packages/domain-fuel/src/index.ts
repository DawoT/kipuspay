/** Pure Grifos domain contracts. No D1, UI or fiscal-provider dependencies. */

export const FUEL_VOLUME_SCALE = 1_000_000;

export interface FuelDispatchCommand {
  readonly fuelCode: string;
  readonly volumeMicrounits: number;
  /** Snapshot read from the authoritative server catalog. */
  readonly priceCentsPerGallon: number;
  readonly igvRateBps: number;
  /** Zero means this product/document is not subject to a detracción. */
  readonly detractionRateBps: number;
  readonly businessInvoice: boolean;
  readonly documentType: string;
}

export interface FuelDispatchResult {
  readonly fuelCode: string;
  readonly volumeMicrounits: number;
  readonly priceCentsPerGallon: number;
  readonly subtotalCents: number;
  readonly igvCents: number;
  readonly totalCents: number;
  readonly detractionCents: number;
  readonly netPayableCents: number;
}

export interface IslandDispatchFact {
  readonly islandId: string;
  readonly nozzleId: string;
  readonly volumeMicrounits: number;
  readonly totalCents: number;
  readonly paymentMethod: string;
}

export interface IslandShiftReport {
  readonly islandId: string;
  readonly dispatchCount: number;
  readonly volumeMicrounits: number;
  readonly totalCents: number;
  readonly byPayment: Readonly<Record<string, number>>;
}

interface MutableIslandShiftReport {
  islandId: string;
  dispatchCount: number;
  volumeMicrounits: number;
  totalCents: number;
  byPayment: Record<string, number>;
}

function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
}

function nonNegativeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

export function calculateFuelDispatch(command: FuelDispatchCommand): FuelDispatchResult {
  const volume = positiveInteger(command.volumeMicrounits, 'INVALID_VOLUME_MICROUNITS');
  const price = positiveInteger(command.priceCentsPerGallon, 'INVALID_PRICE_CENTS');
  const igvRate = nonNegativeInteger(command.igvRateBps, 'INVALID_IGV_RATE_BPS');
  const detractionRate = nonNegativeInteger(
    command.detractionRateBps,
    'INVALID_DETRACTION_RATE_BPS',
  );
  if (igvRate > 10_000) throw new Error('INVALID_IGV_RATE_BPS');
  if (detractionRate > 10_000) throw new Error('INVALID_DETRACTION_RATE_BPS');
  // Use integer arithmetic end-to-end: a high-volume tanker must not lose
  // cents because IEEE-754 multiplication crossed the safe-integer boundary.
  const subtotalCents = Number(
    (BigInt(volume) * BigInt(price) + BigInt(FUEL_VOLUME_SCALE / 2)) / BigInt(FUEL_VOLUME_SCALE),
  );
  const igvCents = Number((BigInt(subtotalCents) * BigInt(igvRate) + 5_000n) / 10_000n);
  const totalCents = subtotalCents + igvCents;
  const detractionCents =
    command.businessInvoice && command.documentType === '01'
      ? Number((BigInt(totalCents) * BigInt(detractionRate) + 5_000n) / 10_000n)
      : 0;
  if (![subtotalCents, igvCents, totalCents, detractionCents].every(Number.isSafeInteger)) {
    throw new Error('FUEL_AMOUNT_OVERFLOW');
  }
  return {
    fuelCode: command.fuelCode,
    volumeMicrounits: volume,
    priceCentsPerGallon: price,
    subtotalCents,
    igvCents,
    totalCents,
    detractionCents,
    // Detracción is deposited separately; it does not silently alter checkout total.
    netPayableCents: totalCents,
  };
}

export function buildIslandShiftReport(
  dispatches: readonly IslandDispatchFact[],
): readonly IslandShiftReport[] {
  const grouped = new Map<string, MutableIslandShiftReport>();
  for (const dispatch of dispatches) {
    const current = grouped.get(dispatch.islandId) ?? {
      islandId: dispatch.islandId,
      dispatchCount: 0,
      volumeMicrounits: 0,
      totalCents: 0,
      byPayment: {},
    };
    current.dispatchCount += 1;
    current.volumeMicrounits += positiveInteger(
      dispatch.volumeMicrounits,
      'INVALID_VOLUME_MICROUNITS',
    );
    current.totalCents += nonNegativeInteger(dispatch.totalCents, 'INVALID_TOTAL_CENTS');
    current.byPayment[dispatch.paymentMethod] =
      (current.byPayment[dispatch.paymentMethod] ?? 0) + dispatch.totalCents;
    grouped.set(dispatch.islandId, current);
  }
  return [...grouped.values()]
    .sort((left, right) => left.islandId.localeCompare(right.islandId))
    .map((report) => ({ ...report, byPayment: { ...report.byPayment } }));
}
