import { describe, expect, it } from 'vitest';
import {
  daysUntilExpiry,
  expiryBadge,
  packToMicrounits,
  priceForPresentation,
  stockToDisplay,
  sortByExpiry,
} from './fefo.js';

describe('farmacia premium — FEFO semáforo + fraccionada exacta', () => {
  it('semáforo FEFO + conversión fraccionada exacta (caja/blíster/unidad) en microunits', () => {
    // FEFO semáforo: verde >90, ámbar 30-90, rojo <30, vencido ≤0
    const now = '2026-08-26T00:00:00.000Z';
    expect(daysUntilExpiry('2026-12-31', now)).toBeGreaterThan(90);
    expect(expiryBadge('2026-12-31', now).label).toBe('Vigente');
    expect(expiryBadge('2026-12-31', now).tone).toBe('success');

    expect(daysUntilExpiry('2026-10-10', now)).toBeGreaterThanOrEqual(30);
    expect(expiryBadge('2026-10-10', now).tone).toBe('warning');
    expect(expiryBadge('2026-10-10', now).label).toMatch(/Por vencer/);

    expect(daysUntilExpiry('2026-09-05', now)).toBeLessThan(30);
    expect(expiryBadge('2026-09-05', now).tone).toBe('danger');
    expect(expiryBadge('2026-09-05', now).label).toMatch(/Vence pronto|Vence/);

    expect(daysUntilExpiry('2026-08-20', now)).toBeLessThan(0);
    expect(expiryBadge('2026-08-20', now).label).toBe('Vencido');
    expect(expiryBadge('2026-08-20', now).tone).toBe('danger');

    expect(expiryBadge(null, now).label).toBe('Sin fecha');
    expect(expiryBadge(null, now).tone).toBe('neutral');

    // fraccionada exacta: 1 caja = 10 blíster = 100 unidades
    const spec = { unitsPerBlister: 10, blistersPerBox: 10 };
    expect(packToMicrounits('UNIDAD', 5, spec)).toBe(5_000_000);
    expect(packToMicrounits('BLISTER', 2, spec)).toBe(20_000_000);
    expect(packToMicrounits('CAJA', 1, spec)).toBe(100_000_000);
    expect(packToMicrounits('CAJA', 2, spec) + packToMicrounits('BLISTER', 1, spec)).toBe(210_000_000);

    // precio proporcional exacto en cents (sin float)
    expect(priceForPresentation(150, 'UNIDAD', 1, spec)).toBe(150);
    expect(priceForPresentation(150, 'BLISTER', 1, spec)).toBe(1500);
    expect(priceForPresentation(150, 'CAJA', 1, spec)).toBe(15_000);
    expect(priceForPresentation(199, 'BLISTER', 3, spec)).toBe(5970);

    // stock display humano, cero jerga microunits
    expect(stockToDisplay(0, spec)).toBe('Sin stock');
    expect(stockToDisplay(5_000_000, spec)).toBe('5 unidades');
    expect(stockToDisplay(20_000_000, spec)).toMatch(/2 blísters|2 blisters/);
    expect(stockToDisplay(125_000_000, spec)).toMatch(/1 caja/);

    // FEFO orden: más próximo vence primero
    const items = [
      { id: 'c', expiry: '2026-12-31' },
      { id: 'a', expiry: '2026-09-01' },
      { id: 'b', expiry: '2026-10-15' },
      { id: 'd', expiry: null },
    ];
    const sorted = sortByExpiry(items, (x) => x.expiry, now).map((x) => x.id);
    expect(sorted).toEqual(['a', 'b', 'c', 'd']);

    // stock vs vencido: no inventar jerga técnica en labels
    expect(expiryBadge('2026-09-01', now).label).not.toMatch(/FEFO|microunits|cents/i);
    expect(stockToDisplay(1_000_000, spec)).not.toMatch(/microunits|cents/i);
  });
});
