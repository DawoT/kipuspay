/** Dominio puro de identidad serial (Arquitectura §5.6 / ADR-0023). */

export const QUANTITY_SCALE = 1_000_000;

export const SERIAL_STATES = [
  'AVAILABLE',
  'RESERVED',
  'SOLD',
  'IN_TRANSIT',
  'RETURNED_INSPECTION',
  'LOST',
  'DAMAGED',
  'RETURNED_SUPPLIER',
] as const;

export type SerialState = (typeof SERIAL_STATES)[number];

export const SERIAL_TRANSITION_MATRIX: Readonly<Record<SerialState, readonly SerialState[]>> = {
  AVAILABLE: ['RESERVED', 'SOLD', 'IN_TRANSIT', 'LOST', 'DAMAGED', 'RETURNED_SUPPLIER'],
  RESERVED: ['AVAILABLE', 'SOLD'],
  SOLD: ['RETURNED_INSPECTION'],
  IN_TRANSIT: ['AVAILABLE', 'LOST', 'DAMAGED'],
  RETURNED_INSPECTION: ['AVAILABLE', 'LOST', 'DAMAGED', 'RETURNED_SUPPLIER'],
  LOST: ['RETURNED_INSPECTION'],
  DAMAGED: ['RETURNED_SUPPLIER'],
  RETURNED_SUPPLIER: [],
};

export function normalizeSerialNumber(serialNumber: string): string {
  const normalized = serialNumber.normalize('NFKC').trim().toUpperCase();
  if (normalized.length === 0 || /\p{Cc}/u.test(normalized)) {
    throw new Error('SERIAL_NUMBER_INVALID');
  }
  return normalized;
}

export function assertSerialCardinality(input: {
  readonly quantityMicrounits: number;
  readonly serialIds: readonly string[];
}): number {
  const expectedCount = input.quantityMicrounits / QUANTITY_SCALE;
  if (!Number.isInteger(expectedCount) || expectedCount !== input.serialIds.length) {
    throw new Error('SERIAL_CARDINALITY_MISMATCH');
  }
  if (new Set(input.serialIds).size !== input.serialIds.length) {
    throw new Error('SERIAL_DUPLICATE');
  }
  return expectedCount;
}

export function canTransitionSerial(from: SerialState, to: SerialState): boolean {
  return SERIAL_TRANSITION_MATRIX[from].includes(to);
}

export interface SerialLease {
  readonly serialId: string;
  readonly terminalId: string;
  readonly leaseToken: string;
  readonly expiresAtEpochMs: number;
}

export function claimSerialLease(input: {
  readonly serialId: string;
  readonly terminalId: string;
  readonly leaseToken: string;
  readonly nowEpochMs: number;
  readonly ttlMs: number;
  readonly currentLease: SerialLease | null;
}): SerialLease {
  const current = input.currentLease;
  if (current === null) {
    return {
      serialId: input.serialId,
      terminalId: input.terminalId,
      leaseToken: input.leaseToken,
      expiresAtEpochMs: input.nowEpochMs + input.ttlMs,
    };
  }
  if (
    current.serialId === input.serialId &&
    current.terminalId === input.terminalId &&
    current.leaseToken === input.leaseToken
  ) {
    return current;
  }
  if (current.expiresAtEpochMs < input.nowEpochMs) {
    throw new Error('SERIAL_LEASE_RELEASE_REQUIRED');
  }
  throw new Error('SERIAL_LEASE_CONFLICT');
}

export function releaseSerialLease(
  currentLease: SerialLease,
  claimant: Pick<SerialLease, 'terminalId' | 'leaseToken'>,
): null {
  if (
    currentLease.terminalId !== claimant.terminalId ||
    currentLease.leaseToken !== claimant.leaseToken
  ) {
    throw new Error('SERIAL_LEASE_CONFLICT');
  }
  return null;
}

function normalizeManifest(serialNumbers: readonly string[]): string[] {
  const normalized = serialNumbers.map(normalizeSerialNumber);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('SERIAL_MANIFEST_DUPLICATE');
  }
  return normalized;
}

export function reconcileSerialManifest(input: {
  readonly expectedSerialNumbers: readonly string[];
  readonly observedSerialNumbers: readonly string[];
}): {
  readonly matchedSerialNumbers: string[];
  readonly missingSerialNumbers: string[];
  readonly unexpectedSerialNumbers: string[];
  readonly reconciledQuantityMicrounits: number;
  readonly isExactMatch: boolean;
} {
  const expected = normalizeManifest(input.expectedSerialNumbers);
  const observed = normalizeManifest(input.observedSerialNumbers);
  const expectedSet = new Set(expected);
  const observedSet = new Set(observed);
  const matchedSerialNumbers = expected.filter((serial) => observedSet.has(serial)).sort();
  const missingSerialNumbers = expected.filter((serial) => !observedSet.has(serial)).sort();
  const unexpectedSerialNumbers = observed.filter((serial) => !expectedSet.has(serial)).sort();

  return {
    matchedSerialNumbers,
    missingSerialNumbers,
    unexpectedSerialNumbers,
    reconciledQuantityMicrounits: matchedSerialNumbers.length * QUANTITY_SCALE,
    isExactMatch: missingSerialNumbers.length === 0 && unexpectedSerialNumbers.length === 0,
  };
}
