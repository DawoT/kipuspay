import { describe, expect, it } from 'vitest';
import {
  computeFuelDispatchByAmountWithCatalog,
  computeFuelDispatchByGallonsWithCatalog,
  gallonsToMicrounits,
  getFuelByCode,
  isValidFuelCode,
  type FuelProduct,
} from './dispatch.js';

const SERVER_CATALOG: readonly FuelProduct[] = [
  {
    code: 'GASOHOL_95',
    name: 'Gasohol 95',
    priceCentsPerGallon: 1780,
    unit: 'gal',
    subjectToDetraction: false,
    detractionRateBps: 0,
    igvRateBps: 1800,
  },
  {
    code: 'DIESEL_B5',
    name: 'Diésel B5',
    priceCentsPerGallon: 1620,
    unit: 'gal',
    subjectToDetraction: true,
    detractionRateBps: 1000,
    igvRateBps: 1800,
  },
];

describe('fuel dispatch con snapshot fiscal del servidor', () => {
  it('acepta códigos y políticas definidos por el servidor', () => {
    expect(isValidFuelCode('DIESEL_B5', SERVER_CATALOG)).toBe(true);
    expect(getFuelByCode('DIESEL_B5', SERVER_CATALOG)?.detractionRateBps).toBe(1000);
    expect(isValidFuelCode('INVENTED', SERVER_CATALOG)).toBe(false);
  });

  it('calcula galones con IGV y detracción del snapshot', () => {
    const result = computeFuelDispatchByGallonsWithCatalog(
      { fuelCode: 'DIESEL_B5', gallons: 10, isBusinessInvoice: true, documentType: '01' },
      SERVER_CATALOG,
    );
    expect(result.subtotalCents).toBe(16200);
    expect(result.igvCents).toBe(2916);
    expect(result.totalCents).toBe(19116);
    expect(result.detractionCents).toBe(1912);
    expect(result.detractionRateBps).toBe(1000);
    expect(result.igvRateBps).toBe(1800);
  });

  it('calcula monto y rechaza catálogo ausente', () => {
    const result = computeFuelDispatchByAmountWithCatalog(
      { fuelCode: 'GASOHOL_95', amountCents: 10_000, isBusinessInvoice: false, documentType: '03' },
      SERVER_CATALOG,
    );
    expect(result.subtotalCents).toBe(10_000);
    expect(() =>
      computeFuelDispatchByGallonsWithCatalog(
        { fuelCode: 'UNKNOWN', gallons: 1, isBusinessInvoice: false, documentType: '03' },
        SERVER_CATALOG,
      ),
    ).toThrow('INVALID_FUEL_CODE');
  });

  it('mantiene precisión en microunidades', () => {
    expect(gallonsToMicrounits(1.123456)).toBe(1_123_456);
  });
});
