/* eslint-disable no-secrets/no-secrets -- canonical domain error identifiers */
/** Sprint 40 / ADR-0024 — exact variable-weight domain primitives. */
export const WEIGHT_SCALE = 1_000_000;

export type ScaleProtocol = 'WEBHID' | 'WEB_SERIAL' | 'WEBUSB';
export type ScaleInputUnit = 'KILOGRAM' | 'GRAM' | 'MILLIGRAM';

export interface RawScaleReading {
  readonly protocol: ScaleProtocol;
  readonly deviceId: string;
  readonly sequence: number;
  readonly magnitude: number;
  readonly unit: ScaleInputUnit;
  readonly stable: boolean;
  readonly observedAtEpochMs: number;
}

export interface ScaleReading {
  readonly protocol: ScaleProtocol;
  readonly deviceId: string;
  readonly sequence: number;
  readonly weightMicrounits: number;
  readonly stable: true;
  readonly observedAtEpochMs: number;
}

const MICROUNITS_BY_INPUT_UNIT: Readonly<Record<ScaleInputUnit, number>> = {
  KILOGRAM: WEIGHT_SCALE,
  GRAM: 1_000,
  MILLIGRAM: 1,
};

export function normalizeScaleReading(input: RawScaleReading): ScaleReading {
  if (!input.stable) throw new Error('SCALE_READING_UNSTABLE');
  const factor = MICROUNITS_BY_INPUT_UNIT[input.unit];
  if (
    !Number.isSafeInteger(input.magnitude) ||
    input.magnitude <= 0 ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 0 ||
    !Number.isSafeInteger(input.observedAtEpochMs) ||
    input.observedAtEpochMs < 0
  ) {
    throw new Error('SCALE_WEIGHT_INVALID');
  }
  const weightMicrounits = input.magnitude * factor;
  if (!Number.isSafeInteger(weightMicrounits) || weightMicrounits <= 0) {
    throw new Error('SCALE_WEIGHT_INVALID');
  }
  return {
    protocol: input.protocol,
    deviceId: input.deviceId,
    sequence: input.sequence,
    weightMicrounits,
    stable: true,
    observedAtEpochMs: input.observedAtEpochMs,
  };
}

export function calculateWeightedSubtotalCents(input: {
  readonly unitPricePerBaseCents: number;
  readonly weightMicrounits: number;
}): number {
  if (
    !Number.isSafeInteger(input.unitPricePerBaseCents) ||
    input.unitPricePerBaseCents < 0 ||
    !Number.isSafeInteger(input.weightMicrounits) ||
    input.weightMicrounits < 0
  ) {
    throw new Error('WEIGHTED_SUBTOTAL_INPUT_INVALID');
  }
  const subtotal =
    (BigInt(input.unitPricePerBaseCents) * BigInt(input.weightMicrounits) +
      BigInt(WEIGHT_SCALE / 2)) /
    BigInt(WEIGHT_SCALE);
  if (subtotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('WEIGHTED_SUBTOTAL_OVERFLOW');
  }
  return Number(subtotal);
}

export function requiresWeightOverride(input: {
  readonly manualWeightMicrounits: number;
  readonly thresholdMicrounits: number;
}): boolean {
  if (
    !Number.isSafeInteger(input.manualWeightMicrounits) ||
    input.manualWeightMicrounits < 0 ||
    !Number.isSafeInteger(input.thresholdMicrounits) ||
    input.thresholdMicrounits < 0
  ) {
    throw new Error('SCALE_WEIGHT_INVALID');
  }
  return input.manualWeightMicrounits > input.thresholdMicrounits;
}
