import { describe, expect, it } from 'vitest';
import {
  buildWeightSyncDto,
  createWeightedCartLine,
  decodeScaleFrame,
  evaluateScaleHeartbeat,
} from './scale-client.js';

describe('scale checkout client contract', () => {
  it.each([
    ['WEBHID', { reportId: 3, magnitude: 750, unit: 'GRAM', stable: true }, 750_000],
    ['WEB_SERIAL', { frame: 'ST,GS,+000750 g\r\n', checksumValid: true }, 750_000],
    ['WEBUSB', { endpoint: 1, magnitude: 750_000, unit: 'MILLIGRAM', stable: true }, 750_000],
  ] as const)('normalizes %s into the same stable reading', (protocol, frame, expectedWeight) => {
    expect(
      decodeScaleFrame({
        protocol,
        deviceId: 'scale-1',
        sequence: 12,
        observedAtEpochMs: 10_000,
        frame,
      }),
    ).toMatchObject({
      protocol,
      deviceId: 'scale-1',
      sequence: 12,
      stable: true,
      weightMicrounits: expectedWeight,
    });
  });

  it('marks heartbeat stale at two seconds and never substitutes zero', () => {
    const reading = {
      protocol: 'WEBHID',
      deviceId: 'scale-1',
      sequence: 12,
      observedAtEpochMs: 10_000,
      stable: true,
      weightMicrounits: 750_000,
    } as const;
    expect(evaluateScaleHeartbeat({ connected: true, reading, nowEpochMs: 11_999 })).toEqual({
      status: 'READY',
      reading,
    });
    expect(evaluateScaleHeartbeat({ connected: true, reading, nowEpochMs: 12_000 })).toEqual({
      status: 'MANUAL_REQUIRED',
      reason: 'HEARTBEAT_STALE',
      reading: null,
    });
    expect(evaluateScaleHeartbeat({ connected: false, reading, nowEpochMs: 10_001 })).toEqual({
      status: 'MANUAL_REQUIRED',
      reason: 'DEVICE_DISCONNECTED',
      reading: null,
    });
    expect(
      JSON.stringify(evaluateScaleHeartbeat({ connected: false, reading, nowEpochMs: 10_001 })),
    ).not.toContain('"weightMicrounits":0');
  });

  it('assigns different measurement identity to repeated lines of the same product', () => {
    const ids = ['measure-1', 'measure-2'];
    const idFactory = () => ids.shift() ?? 'unexpected';
    const first = createWeightedCartLine({
      productId: 'product-a',
      productName: 'Manzana',
      weightMicrounits: 500_000,
      idFactory,
    });
    const second = createWeightedCartLine({
      productId: 'product-a',
      productName: 'Manzana',
      weightMicrounits: 500_000,
      idFactory,
    });
    expect(first.productId).toBe(second.productId);
    expect(first.measurementId).toBe('measure-1');
    expect(second.measurementId).toBe('measure-2');
  });

  it('queues only normalized identity facts and no client money or raw hardware bytes', () => {
    const dto = buildWeightSyncDto({
      measurementId: 'measure-1',
      saleItemId: 'line-1',
      productId: 'product-a',
      weightMicrounits: 500_000,
      measurementSource: 'DEVICE',
      reading: {
        protocol: 'WEBUSB',
        deviceId: 'scale-1',
        sequence: 4,
        observedAtEpochMs: 10_000,
        stable: true,
        weightMicrounits: 500_000,
      },
      rawFrame: new Uint8Array([1, 2, 3]),
      projectedSubtotalCents: 1,
    });
    expect(dto).toEqual({
      measurementId: 'measure-1',
      saleItemId: 'line-1',
      productId: 'product-a',
      weightMicrounits: 500_000,
      measurementSource: 'DEVICE',
      scaleProtocol: 'WEBUSB',
      scaleDeviceId: 'scale-1',
      heartbeatSequence: 4,
      observedAt: '1970-01-01T00:00:10.000Z',
    });
    expect(dto).not.toHaveProperty('rawFrame');
    expect(dto).not.toHaveProperty('projectedSubtotalCents');
  });
});
