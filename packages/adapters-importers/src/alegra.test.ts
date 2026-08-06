import { describe, expect, it } from 'vitest';
import type { NormalizedCustomerRow, NormalizedProductRow } from '@kipuspay/domain-integrations';
import { parseAlegraContacts, parseAlegraItems } from './alegra.js';

describe('parseAlegraItems', () => {
  it('transforma items Alegra en filas normalizadas', () => {
    const rows = parseAlegraItems([
      { id: 1, name: 'Arroz', reference: 'ARZ-1', price: 4.5, tax: [{ name: 'IGV' }] },
    ]);
    expect(rows[0] as NormalizedProductRow).toMatchObject({
      entityType: 'product',
      externalId: '1',
      sku: 'ARZ-1',
      name: 'Arroz',
      priceCents: 450,
      taxName: 'IGV',
    });
  });

  it('genera sku fallback y no fuerza IGV (taxName null)', () => {
    const rows = parseAlegraItems([{ id: 2 }]);
    expect((rows[0] as NormalizedProductRow).sku).toBe('ALEGRA-2');
    expect((rows[0] as NormalizedProductRow).taxName).toBeNull();
    expect((rows[0] as NormalizedProductRow).priceCents).toBe(0);
  });
});

describe('parseAlegraContacts', () => {
  it('detecta RUC (más de 8 dígitos) y conserva límite de crédito', () => {
    const rows = parseAlegraContacts([
      { id: 1, name: 'Minería S.A.C.', identification: '20601234567', creditLimit: 5000 },
    ]);
    expect(rows[0] as NormalizedCustomerRow).toMatchObject({
      entityType: 'customer',
      externalId: '1',
      documentTypeCode: '6',
      documentNumber: '20601234567',
      name: 'Minería S.A.C.',
      creditLimitCents: 500000,
    });
  });

  it('trata identificaciones de 8 dígitos como DNI', () => {
    const rows = parseAlegraContacts([{ id: 2, identification: '12345678' }]);
    expect((rows[0] as NormalizedCustomerRow).documentTypeCode).toBe('1');
    expect((rows[0] as NormalizedCustomerRow).documentNumber).toBe('12345678');
  });

  it('no fabrica documento fiscal cuando falta identification (vacío → conflicto)', () => {
    const rows = parseAlegraContacts([{ id: 3, name: 'Sin identificación' }]);
    expect((rows[0] as NormalizedCustomerRow).documentNumber).toBe('');
    expect((rows[0] as NormalizedCustomerRow).documentTypeCode).toBe('');
  });
});
