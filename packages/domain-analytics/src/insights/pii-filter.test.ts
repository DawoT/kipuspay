import { describe, expect, it } from 'vitest';
import { assertNoPiiInFacts, PII_BLOCKED_KEY } from './pii-filter.js';

describe('insights PII filter (Sprint 49 / edge C)', () => {
  it('rechaza facts con claves PII (email/phone/address/document_number)', () => {
    expect(() => assertNoPiiInFacts({ email: 'x@y.com' })).toThrow(PII_BLOCKED_KEY);
    expect(() => assertNoPiiInFacts({ customer: { phone: '999' } })).toThrow(PII_BLOCKED_KEY);
    expect(() => assertNoPiiInFacts({ address: 'Lima' })).toThrow(PII_BLOCKED_KEY);
    expect(() => assertNoPiiInFacts({ document_number: '12345678' })).toThrow(PII_BLOCKED_KEY);
  });

  it('permite facts de negocio y customer_id sin PII', () => {
    expect(() =>
      assertNoPiiInFacts({
        gross_sales_cents: 118000,
        customer_id: 'c-1',
        alias: 'A.P.',
        items: [{ product_name: 'Café', qty: 2 }],
      }),
    ).not.toThrow();
  });

  it('escanea recursivamente listas y objetos anidados', () => {
    expect(() => assertNoPiiInFacts({ top: [{ sales: [{ phone: '999111222' }] }] })).toThrow(
      PII_BLOCKED_KEY,
    );
    expect(() =>
      assertNoPiiInFacts({ top: [{ sales: [{ total_amount_cents: 1180 }] }] }),
    ).not.toThrow();
  });

  it('la clave de error es estable para el mapa de la ruta', () => {
    expect(PII_BLOCKED_KEY).toBe('PII_BLOCKED');
  });

  it('valores primitivos y objetos vacíos pasan (sin claves PII)', () => {
    expect(() => assertNoPiiInFacts(null)).not.toThrow();
    expect(() => assertNoPiiInFacts('texto')).not.toThrow();
    expect(() => assertNoPiiInFacts({})).not.toThrow();
    expect(() => assertNoPiiInFacts([1, 2, 3])).not.toThrow();
  });
});
