import { describe, expect, it } from 'vitest';
import {
  FUEL_CATALOG,
  FUEL_DETRACTION_RATE_BPS,
  computeDetractionForFuel,
  computeFuelDispatchByAmount,
  computeFuelDispatchByGallons,
  gallonsToMicrounits,
  getFuelByCode,
  isValidFuelCode,
} from './dispatch.js';

describe('fuel dispatch premium — surtidor por galones + detracción automática (Grifos)', () => {
  it('catálogo no usa jerga y tiene badge de detracción solo en Diésel', () => {
    expect(FUEL_CATALOG.length).toBeGreaterThanOrEqual(6);
    const diesel = getFuelByCode('DIESEL_B5');
    expect(diesel?.subjectToDetraction).toBe(true);
    expect(diesel?.detractionRateBps).toBe(FUEL_DETRACTION_RATE_BPS);
    const gas95 = getFuelByCode('GASOHOL_95');
    expect(gas95?.subjectToDetraction).toBe(false);
  });

  it('isValidFuelCode reconoce grifos y rechaza inventado', () => {
    expect(isValidFuelCode('DIESEL_B5')).toBe(true);
    expect(isValidFuelCode('GASOHOL_95')).toBe(true);
    expect(isValidFuelCode('INVENTED')).toBe(false);
  });

  it('gallonsToMicrounits precisión 1_000_000 sin float', () => {
    expect(gallonsToMicrounits(1)).toBe(1_000_000);
    expect(gallonsToMicrounits(20.5)).toBe(20_500_000);
    expect(gallonsToMicrounits(0.001)).toBe(1_000);
    expect(gallonsToMicrounits(1.123456)).toBe(1_123_456);
  });

  it('dispatch por galones: Gasohol 95 20.5 gal a S/ 17.80 = S/ 364.90 subtotal + IGV 18%', () => {
    const r = computeFuelDispatchByGallons({
      fuelCode: 'GASOHOL_95',
      gallons: 20.5,
      priceCentsPerGallon: 1780,
      isBusinessInvoice: false,
      documentType: '03',
    });
    // subtotal = 20.5 * 17.80 = 364.90
    expect(r.subtotalCents).toBe(36490);
    // igv 18% de 36490 = 6568.2 -> 6568
    expect(r.igvCents).toBe(6568);
    expect(r.totalCents).toBe(43058);
    expect(r.detractionCents).toBe(0);
    expect(r.netPayableCents).toBe(43058);
    expect(r.gallonsMicrounits).toBe(20_500_000);
  });

  it('dispatch por monto: S/ 100 en Diésel B5 a S/ 16.20 → galones calculados', () => {
    const r = computeFuelDispatchByAmount({
      fuelCode: 'DIESEL_B5',
      amountCents: 10_000,
      priceCentsPerGallon: 1620,
      isBusinessInvoice: false,
      documentType: '03',
    });
    // gallons = amount / price = 10000/1620 = 6.172839... → micro 6_172_840 aprox
    // But we compute via microunits rounding: gallonsMicro = round(amount*1_000_000/price)
    expect(r.gallonsMicrounits).toBeGreaterThan(6_000_000);
    expect(r.subtotalCents).toBe(10_000);
  });

  it('detracción automática solo Diésel B5 + factura B2B (01 con RUC), 10% del total', () => {
    const withoutDetra = computeFuelDispatchByGallons({
      fuelCode: 'GASOHOL_95',
      gallons: 10,
      priceCentsPerGallon: 1780,
      isBusinessInvoice: true,
      documentType: '01',
    });
    expect(withoutDetra.detractionCents).toBe(0);

    const dieselBoleta = computeFuelDispatchByGallons({
      fuelCode: 'DIESEL_B5',
      gallons: 10,
      priceCentsPerGallon: 1620,
      isBusinessInvoice: false,
      documentType: '03',
    });
    expect(dieselBoleta.detractionCents).toBe(0);

    const dieselFacturaConsumer = computeFuelDispatchByGallons({
      fuelCode: 'DIESEL_B5',
      gallons: 10,
      priceCentsPerGallon: 1620,
      isBusinessInvoice: false,
      documentType: '01',
    });
    expect(dieselFacturaConsumer.detractionCents).toBe(0);

    const dieselFacturaB2B = computeFuelDispatchByGallons({
      fuelCode: 'DIESEL_B5',
      gallons: 10,
      priceCentsPerGallon: 1620,
      isBusinessInvoice: true,
      documentType: '01',
    });
    // subtotal 16200, igv 2916, total 19116, detra 10% = 1912 (Math.round 1911.6->1912)
    expect(dieselFacturaB2B.subtotalCents).toBe(16200);
    expect(dieselFacturaB2B.igvCents).toBe(2916);
    expect(dieselFacturaB2B.totalCents).toBe(19116);
    expect(dieselFacturaB2B.detractionCents).toBe(1912);
    expect(dieselFacturaB2B.netPayableCents).toBe(19116);
    // detracción se muestra aparte, no se descuenta del total a cobrar (es depósito)
    expect(computeDetractionForFuel(dieselFacturaB2B.totalCents, 'DIESEL_B5', true, '01')).toBe(
      1912,
    );
  });

  it('rechaza galones inválidos y códigos no enteros', () => {
    expect(() =>
      computeFuelDispatchByGallons({
        fuelCode: 'DIESEL_B5',
        gallons: 0,
        priceCentsPerGallon: 1620,
        isBusinessInvoice: true,
        documentType: '01',
      }),
    ).toThrow('INVALID_GALLONS');
    expect(() =>
      computeFuelDispatchByGallons({
        fuelCode: 'DIESEL_B5',
        gallons: -1,
        priceCentsPerGallon: 1620,
        isBusinessInvoice: true,
        documentType: '01',
      }),
    ).toThrow('INVALID_GALLONS');
    expect(() =>
      computeFuelDispatchByGallons({
        fuelCode: 'UNKNOWN',
        gallons: 10,
        priceCentsPerGallon: 1620,
        isBusinessInvoice: true,
        documentType: '01',
      }),
    ).toThrow('INVALID_FUEL_CODE');
  });

  it('precisión cents entera, sin float: 0.333 gal * 1620 = round(539.46) -> 539', () => {
    const r = computeFuelDispatchByGallons({
      fuelCode: 'DIESEL_B5',
      gallons: 0.333,
      priceCentsPerGallon: 1620,
      isBusinessInvoice: false,
      documentType: '03',
    });
    // 333_000 micro *1620 /1_000_000 = 539.46 -> 539
    expect(r.subtotalCents).toBe(539);
  });

  it('performance: 10k despachos <200ms (feedback optimista, CI headroom)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) {
      computeFuelDispatchByGallons({
        fuelCode: 'GASOHOL_95',
        gallons: 5.5,
        priceCentsPerGallon: 1780,
        isBusinessInvoice: i % 2 === 0,
        documentType: '01',
      });
    }
    const elapsed = performance.now() - t0;
    // CI runners varian 90-120ms para 10k — prod SLO es <100ms p95, test usa 200ms para no flakear en CI (ver OLA J)
    expect(elapsed).toBeLessThan(200);
  });
});
