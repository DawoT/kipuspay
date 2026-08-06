import { describe, expect, it } from 'vitest';
import type { NormalizedCustomerRow, NormalizedProductRow } from '@kipuspay/domain-integrations';
import { parseBsaleCustomers, parseBsaleProducts } from './bsale.js';

describe('parseBsaleProducts', () => {
  it('transforma productos Bsale en filas normalizadas con precios en cents', () => {
    const rows = parseBsaleProducts([
      { id: 1, name: 'Café', sku: 'CAF-1', prices: [{ grossPrice: 12.5 }], taxNames: ['IGV'] },
    ]);
    expect(rows[0] as NormalizedProductRow).toMatchObject({
      entityType: 'product',
      externalId: '1',
      sku: 'CAF-1',
      name: 'Café',
      priceCents: 1250,
      taxName: 'IGV',
      unitCode: 'NIU',
    });
  });

  it('genera sku fallback y precio 0 cuando faltan datos', () => {
    const rows = parseBsaleProducts([{ id: 42 }]);
    expect((rows[0] as NormalizedProductRow).sku).toBe('BSALE-42');
    expect((rows[0] as NormalizedProductRow).priceCents).toBe(0);
    expect((rows[0] as NormalizedProductRow).name).toBe('BSALE-42');
  });

  it('usa netPrice cuando no hay grossPrice', () => {
    const rows = parseBsaleProducts([{ id: 3, prices: [{ netPrice: 8 }] }]);
    expect((rows[0] as NormalizedProductRow).priceCents).toBe(800);
  });

  it('no fuerza IGV cuando el producto no trae impuesto (taxName null)', () => {
    const rows = parseBsaleProducts([{ id: 4, name: 'Exportación', prices: [{ grossPrice: 10 }] }]);
    expect((rows[0] as NormalizedProductRow).taxName).toBeNull();
  });
});

describe('parseBsaleCustomers', () => {
  it('transforma clientes Bsale con razón social', () => {
    const rows = parseBsaleCustomers([{ id: 7, code: '20100047218', company: 'Cliente S.A.C.' }]);
    expect(rows[0] as NormalizedCustomerRow).toMatchObject({
      entityType: 'customer',
      externalId: '7',
      documentTypeCode: '6',
      documentNumber: '20100047218',
      name: 'Cliente S.A.C.',
      creditLimitCents: 0,
    });
  });

  it('compone nombre desde firstName/lastName; sin code el documento queda vacío', () => {
    const rows = parseBsaleCustomers([{ id: 9, firstName: 'Ana', lastName: 'Luz' }]);
    expect((rows[0] as NormalizedCustomerRow).name).toBe('Ana Luz');
    expect((rows[0] as NormalizedCustomerRow).documentNumber).toBe('');
    expect((rows[0] as NormalizedCustomerRow).documentTypeCode).toBe('');
  });

  it('no fabrica documento fiscal cuando falta code (vacío → conflicto en dominio)', () => {
    const rows = parseBsaleCustomers([{ id: 11, firstName: 'Luis' }]);
    expect((rows[0] as NormalizedCustomerRow).documentNumber).toBe('');
    expect((rows[0] as NormalizedCustomerRow).documentTypeCode).toBe('');
  });
});
