import { describe, expect, it } from 'vitest';
import {
  QUANTITY_SCALE,
  SERIAL_STATES,
  SERIAL_TRANSITION_MATRIX,
  assertSerialCardinality,
  canTransitionSerial,
  claimSerialLease,
  normalizeSerialNumber,
  reconcileSerialManifest,
  releaseSerialLease,
} from './serials.js';

describe('inventory serials', () => {
  it('normaliza identidad con Unicode NFKC, trim y mayúsculas', () => {
    expect(normalizeSerialNumber('  ab-００１  ')).toBe('AB-001');
    expect(normalizeSerialNumber('\tSn 42\n')).toBe('SN 42');
    expect(() => normalizeSerialNumber('   ')).toThrow('SERIAL_NUMBER_INVALID');
    expect(() => normalizeSerialNumber('SN\u0000-42')).toThrow('SERIAL_NUMBER_INVALID');
  });

  it('cada serie representa exactamente 1_000_000 microunidades', () => {
    expect(QUANTITY_SCALE).toBe(1_000_000);
    expect(
      assertSerialCardinality({
        quantityMicrounits: 2_000_000,
        serialIds: ['serial-1', 'serial-2'],
      }),
    ).toBe(2);

    expect(() =>
      assertSerialCardinality({
        quantityMicrounits: 1_500_000,
        serialIds: ['serial-1'],
      }),
    ).toThrow('SERIAL_CARDINALITY_MISMATCH');
    expect(() =>
      assertSerialCardinality({
        quantityMicrounits: 2_000_000,
        serialIds: ['serial-1', 'serial-1'],
      }),
    ).toThrow('SERIAL_DUPLICATE');
  });

  it('declara la matriz completa y cerrada de transiciones', () => {
    expect(SERIAL_STATES).toEqual([
      'AVAILABLE',
      'RESERVED',
      'SOLD',
      'IN_TRANSIT',
      'RETURNED_INSPECTION',
      'LOST',
      'DAMAGED',
      'RETURNED_SUPPLIER',
    ]);

    expect(SERIAL_TRANSITION_MATRIX).toEqual({
      AVAILABLE: ['RESERVED', 'SOLD', 'IN_TRANSIT', 'LOST', 'DAMAGED', 'RETURNED_SUPPLIER'],
      RESERVED: ['AVAILABLE', 'SOLD'],
      SOLD: ['RETURNED_INSPECTION'],
      IN_TRANSIT: ['AVAILABLE', 'LOST', 'DAMAGED'],
      RETURNED_INSPECTION: ['AVAILABLE', 'LOST', 'DAMAGED', 'RETURNED_SUPPLIER'],
      LOST: ['RETURNED_INSPECTION'],
      DAMAGED: ['RETURNED_SUPPLIER'],
      RETURNED_SUPPLIER: [],
    });

    for (const from of SERIAL_STATES) {
      const allowed = new Set(SERIAL_TRANSITION_MATRIX[from]);
      for (const to of SERIAL_STATES) {
        expect(canTransitionSerial(from, to), `${from} -> ${to}`).toBe(allowed.has(to));
      }
    }
  });

  it('mantiene un lease exclusivo por terminal y permite replay idempotente', () => {
    const lease = claimSerialLease({
      serialId: 'serial-1',
      terminalId: 'terminal-a',
      leaseToken: 'opaque-a',
      nowEpochMs: 1_000,
      ttlMs: 30_000,
      currentLease: null,
    });

    expect(lease).toEqual({
      serialId: 'serial-1',
      terminalId: 'terminal-a',
      leaseToken: 'opaque-a',
      expiresAtEpochMs: 31_000,
    });
    expect(
      claimSerialLease({
        serialId: 'serial-1',
        terminalId: 'terminal-a',
        leaseToken: 'opaque-a',
        nowEpochMs: 2_000,
        ttlMs: 30_000,
        currentLease: lease,
      }),
    ).toEqual(lease);

    expect(() =>
      claimSerialLease({
        serialId: 'serial-1',
        terminalId: 'terminal-b',
        leaseToken: 'opaque-b',
        nowEpochMs: 2_000,
        ttlMs: 30_000,
        currentLease: lease,
      }),
    ).toThrow('SERIAL_LEASE_CONFLICT');
  });

  it('un lease vencido no se reasigna automáticamente a otra terminal', () => {
    const expiredLease = {
      serialId: 'serial-1',
      terminalId: 'terminal-a',
      leaseToken: 'opaque-a',
      expiresAtEpochMs: 2_000,
    } as const;

    expect(() =>
      claimSerialLease({
        serialId: 'serial-1',
        terminalId: 'terminal-b',
        leaseToken: 'opaque-b',
        nowEpochMs: 2_001,
        ttlMs: 30_000,
        currentLease: expiredLease,
      }),
    ).toThrow('SERIAL_LEASE_RELEASE_REQUIRED');

    const released = releaseSerialLease(expiredLease, {
      terminalId: 'terminal-a',
      leaseToken: 'opaque-a',
    });
    expect(released).toBeNull();
    expect(
      claimSerialLease({
        serialId: 'serial-1',
        terminalId: 'terminal-b',
        leaseToken: 'opaque-b',
        nowEpochMs: 2_001,
        ttlMs: 30_000,
        currentLease: released,
      }),
    ).toMatchObject({ terminalId: 'terminal-b', leaseToken: 'opaque-b' });
  });

  it('reconcilia manifiestos por identidad normalizada, no solo por cantidad', () => {
    expect(
      reconcileSerialManifest({
        expectedSerialNumbers: [' sn-001 ', 'SN-002', 'ＳＮ-００３'],
        observedSerialNumbers: ['sn-003', 'SN-001', ' sn-002 '],
      }),
    ).toEqual({
      matchedSerialNumbers: ['SN-001', 'SN-002', 'SN-003'],
      missingSerialNumbers: [],
      unexpectedSerialNumbers: [],
      reconciledQuantityMicrounits: 3_000_000,
      isExactMatch: true,
    });

    expect(
      reconcileSerialManifest({
        expectedSerialNumbers: ['SN-001', 'SN-002'],
        observedSerialNumbers: ['SN-002', 'SN-999'],
      }),
    ).toEqual({
      matchedSerialNumbers: ['SN-002'],
      missingSerialNumbers: ['SN-001'],
      unexpectedSerialNumbers: ['SN-999'],
      reconciledQuantityMicrounits: 1_000_000,
      isExactMatch: false,
    });
  });

  it('rechaza duplicados normalizados dentro de un manifiesto', () => {
    expect(() =>
      reconcileSerialManifest({
        expectedSerialNumbers: ['SN-001'],
        observedSerialNumbers: ['sn-001', ' SN-001 '],
      }),
    ).toThrow('SERIAL_MANIFEST_DUPLICATE');
  });
});
