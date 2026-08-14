import { describe, expect, it } from 'vitest';
import { computeSavings, DEFAULT_ASSUMPTIONS } from './savings.js';

describe('calculadora de ahorro (M3 — supuestos honestos)', () => {
  it('calcula con los supuestos por defecto declarados', () => {
    const result = computeSavings(DEFAULT_ASSUMPTIONS);
    expect(result.hoursSavedPerMonth).toBe(Math.round((40 * 30 * 1.5) / 60));
    expect(result.monthlySavingsSoles).toBe(result.hoursSavedPerMonth * 15);
  });

  it('responde a supuestos editados (minutos y valor hora)', () => {
    const result = computeSavings({ ticketsPerDay: 100, minutesPerTicket: 3, hourlyRateSoles: 30 });
    expect(result.hoursSavedPerMonth).toBe(150);
    expect(result.monthlySavingsSoles).toBe(4500);
  });

  it('los supuestos por defecto quedan visibles en el modelo (no escondidos)', () => {
    expect(DEFAULT_ASSUMPTIONS.minutesPerTicket).toBe(1.5);
    expect(DEFAULT_ASSUMPTIONS.hourlyRateSoles).toBe(15);
  });
});
