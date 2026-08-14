import { describe, expect, it } from 'vitest';
import {
  WEIGHT_SCALE,
  calculateWeightedSubtotalCents,
  normalizeScaleReading,
  requiresWeightOverride,
} from './scale.js';

describe('inventory scale domain contract', () => {
  it('normalizes WebHID, Web Serial and WebUSB readings to physical microunits', () => {
    const common = {
      deviceId: 'scale-1',
      sequence: 7,
      stable: true,
      observedAtEpochMs: 10_000,
    } as const;

    expect(
      normalizeScaleReading({
        ...common,
        protocol: 'WEBHID',
        magnitude: 1_250,
        unit: 'GRAM',
      }),
    ).toMatchObject({ protocol: 'WEBHID', weightMicrounits: 1_250_000 });
    expect(
      normalizeScaleReading({
        ...common,
        protocol: 'WEB_SERIAL',
        magnitude: 1_250_000,
        unit: 'MILLIGRAM',
      }),
    ).toMatchObject({ protocol: 'WEB_SERIAL', weightMicrounits: 1_250_000 });
    expect(
      normalizeScaleReading({
        ...common,
        protocol: 'WEBUSB',
        magnitude: 1_250,
        unit: 'GRAM',
      }),
    ).toMatchObject({ protocol: 'WEBUSB', weightMicrounits: 1_250_000 });
  });

  it('normaliza KILOGRAM y rechaza peso inválido por overflow del producto magnitude*factor', () => {
    expect(
      normalizeScaleReading({
        protocol: 'WEBHID',
        deviceId: 'scale-1',
        sequence: 7,
        magnitude: 2,
        unit: 'KILOGRAM',
        stable: true,
        observedAtEpochMs: 10_000,
      }),
    ).toMatchObject({ weightMicrounits: 2_000_000 });

    expect(() =>
      normalizeScaleReading({
        protocol: 'WEBHID',
        deviceId: 'scale-1',
        sequence: 7,
        magnitude: Number.MAX_SAFE_INTEGER,
        unit: 'KILOGRAM',
        stable: true,
        observedAtEpochMs: 10_000,
      }),
    ).toThrow('SCALE_WEIGHT_INVALID');
  });

  it('uses exact integer half-up cents without a floating money path', () => {
    expect(WEIGHT_SCALE).toBe(1_000_000);
    expect(
      calculateWeightedSubtotalCents({
        unitPricePerBaseCents: 199,
        weightMicrounits: 500_000,
      }),
    ).toBe(100);
    expect(
      calculateWeightedSubtotalCents({
        unitPricePerBaseCents: 1,
        weightMicrounits: 499_999,
      }),
    ).toBe(0);
    expect(
      calculateWeightedSubtotalCents({
        unitPricePerBaseCents: 1,
        weightMicrounits: 500_000,
      }),
    ).toBe(1);
  });

  it('rechaza inputs inválidos y overflow del subtotal ponderado', () => {
    expect(() =>
      calculateWeightedSubtotalCents({
        unitPricePerBaseCents: -1,
        weightMicrounits: 500_000,
      }),
    ).toThrow('WEIGHTED_SUBTOTAL_INPUT_INVALID');
    expect(() =>
      calculateWeightedSubtotalCents({
        unitPricePerBaseCents: 1.5,
        weightMicrounits: 500_000,
      }),
    ).toThrow('WEIGHTED_SUBTOTAL_INPUT_INVALID');
    expect(() =>
      calculateWeightedSubtotalCents({
        unitPricePerBaseCents: 1,
        weightMicrounits: -1,
      }),
    ).toThrow('WEIGHTED_SUBTOTAL_INPUT_INVALID');
    expect(() =>
      calculateWeightedSubtotalCents({
        unitPricePerBaseCents: Number.MAX_SAFE_INTEGER,
        weightMicrounits: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow('WEIGHTED_SUBTOTAL_OVERFLOW');
  });

  it('rejects unstable and non-positive device readings', () => {
    expect(() =>
      normalizeScaleReading({
        protocol: 'WEBHID',
        deviceId: 'scale-1',
        sequence: 8,
        magnitude: 0,
        unit: 'GRAM',
        stable: true,
        observedAtEpochMs: 10_000,
      }),
    ).toThrow('SCALE_WEIGHT_INVALID');
    expect(() =>
      normalizeScaleReading({
        protocol: 'WEBUSB',
        deviceId: 'scale-1',
        sequence: 9,
        magnitude: 1_000,
        unit: 'GRAM',
        stable: false,
        observedAtEpochMs: 10_000,
      }),
    ).toThrow('SCALE_READING_UNSTABLE');
  });

  it('requires WEIGHT_OVERRIDE above the tenant threshold, whose default is zero', () => {
    expect(requiresWeightOverride({ manualWeightMicrounits: 1, thresholdMicrounits: 0 })).toBe(
      true,
    );
    expect(
      requiresWeightOverride({
        manualWeightMicrounits: 500_000,
        thresholdMicrounits: 500_000,
      }),
    ).toBe(false);
    expect(
      requiresWeightOverride({
        manualWeightMicrounits: 500_001,
        thresholdMicrounits: 500_000,
      }),
    ).toBe(true);
    expect(() =>
      requiresWeightOverride({
        manualWeightMicrounits: -1,
        thresholdMicrounits: 500_000,
      }),
    ).toThrow('SCALE_WEIGHT_INVALID');
    expect(() =>
      requiresWeightOverride({
        manualWeightMicrounits: 500_000,
        thresholdMicrounits: -1,
      }),
    ).toThrow('SCALE_WEIGHT_INVALID');
    expect(() =>
      requiresWeightOverride({
        manualWeightMicrounits: 1.5,
        thresholdMicrounits: 500_000,
      }),
    ).toThrow('SCALE_WEIGHT_INVALID');
  });
});
