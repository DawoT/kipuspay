import { describe, expect, it } from 'vitest';
import { buildZTicketData, PEN_DENOMS, sumLocalCount } from './blind-close.js';

describe('sumLocalCount', () => {
  it('suma denominaciones sin exponer expected', () => {
    expect(
      sumLocalCount([
        { denominationCents: 1000, quantity: 2 },
        { denominationCents: 100, quantity: 3 },
      ]),
    ).toBe(2300);
  });
});

describe('PEN_DENOMS', () => {
  it('incluye billetes y monedas en cents', () => {
    expect(PEN_DENOMS).toContain(20000);
    expect(PEN_DENOMS).toContain(10);
  });
});

describe('S17-H4: buildZTicketData (reporte Z imprimible)', () => {
  it('arma el snapshot del arqueo con esperado/contado/diferencia', () => {
    const z = buildZTicketData({
      enterprise: 'Mi Negocio',
      ruc: '20123456789',
      sessionId: 'sess-1',
      zNumber: 1,
      countedTotalCents: 16_000,
      expectedTotalCents: 16_000,
      differenceAmountCents: 0,
    });
    expect(z.documentType).toBe('Z');
    expect(z.series).toBe('Z');
    expect(z.totalCents).toBe(16_000);
    expect(z.items).toHaveLength(4);
    expect(z.items[0]).toMatchObject({ name: 'Arqueo esperado', totalCents: 16_000 });
    expect(z.items[2]).toMatchObject({ name: 'Diferencia', totalCents: 0 });
  });

  it('refleja la diferencia cuando hay descuadre', () => {
    const z = buildZTicketData({
      enterprise: 'Mi Negocio',
      ruc: '20123456789',
      sessionId: 'sess-1',
      zNumber: 2,
      countedTotalCents: 15_000,
      expectedTotalCents: 16_000,
      differenceAmountCents: -1000,
    });
    expect(z.items[2]?.totalCents).toBe(-1000);
  });
});
