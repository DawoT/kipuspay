import { describe, expect, it } from 'vitest';
import { casesForRubro, publishedCases, type SuccessCase } from './cases.js';

describe('success cases', () => {
  it('no publica testimonios sin permiso (GTM-12)', () => {
    const raw: SuccessCase[] = [
      {
        id: 'c1',
        rubro: 'farmacias',
        businessName: 'Botica X',
        quote: 'Cuadramos caja sin pelearnos.',
        permissionGranted: false,
        published: true,
      },
      {
        id: 'c2',
        rubro: 'farmacias',
        businessName: 'Botica Y',
        quote: 'La primera venta fue el mismo dia.',
        permissionGranted: true,
        published: true,
      },
    ];
    expect(publishedCases(raw)).toHaveLength(1);
    expect(casesForRubro('farmacias', raw)[0]?.id).toBe('c2');
    expect(publishedCases()).toHaveLength(0);
  });
});
