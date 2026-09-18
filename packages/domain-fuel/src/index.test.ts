import { describe, expect, it } from 'vitest';
import {
  calculateFuelDispatch,
  buildIslandShiftReport,
  type FuelDispatchCommand,
} from './index.js';

const command: FuelDispatchCommand = {
  fuelCode: 'DIESEL_B5',
  volumeMicrounits: 2_000_000,
  priceCentsPerGallon: 1_620,
  igvRateBps: 1_800,
  detractionRateBps: 1_000,
  businessInvoice: true,
  documentType: '01',
};

describe('domain-fuel', () => {
  it('calculates an authoritative dispatch using integer cents and microunits', () => {
    expect(calculateFuelDispatch(command)).toMatchObject({
      volumeMicrounits: 2_000_000,
      subtotalCents: 3_240,
      igvCents: 583,
      totalCents: 3_823,
      detractionCents: 382,
      netPayableCents: 3_823,
    });
  });

  it('does not apply detraction to non-business documents', () => {
    expect(calculateFuelDispatch({ ...command, businessInvoice: false }).detractionCents).toBe(0);
  });

  it('rejects amounts that cannot be represented as safe integer cents', () => {
    expect(() =>
      calculateFuelDispatch({
        ...command,
        volumeMicrounits: Number.MAX_SAFE_INTEGER,
        priceCentsPerGallon: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow('FUEL_AMOUNT_OVERFLOW');
  });

  it('aggregates a reproducible island shift report by payment method', () => {
    const report = buildIslandShiftReport([
      {
        islandId: 'isla-2',
        nozzleId: 'm2',
        volumeMicrounits: 1_000_000,
        totalCents: 1_000,
        paymentMethod: 'cash',
      },
      {
        islandId: 'isla-2',
        nozzleId: 'm3',
        volumeMicrounits: 500_000,
        totalCents: 600,
        paymentMethod: 'card',
      },
    ]);

    expect(report).toEqual([
      {
        islandId: 'isla-2',
        dispatchCount: 2,
        volumeMicrounits: 1_500_000,
        totalCents: 1_600,
        byPayment: { cash: 1_000, card: 600 },
      },
    ]);
  });
});
