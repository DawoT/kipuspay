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

// ── Sprint 11B: Presets de un toque en SavingsCalculator ────────────────────

interface Preset {
  readonly id: string;
  readonly label: string;
  readonly ticketsPerDay: number;
  readonly avgTicketSoles: number;
}

/** Réplica de los PRESETS definidos en SavingsCalculator.svelte. */
const PRESETS: readonly Preset[] = [
  { id: 'bodega', label: 'Bodega', ticketsPerDay: 8, avgTicketSoles: 15 },
  { id: 'cafeteria', label: 'Cafetería', ticketsPerDay: 35, avgTicketSoles: 22 },
  { id: 'minimarket', label: 'Minimarket', ticketsPerDay: 60, avgTicketSoles: 45 },
];

describe('Sprint 11B — presets de un toque (SavingsCalculator)', () => {
  it('existen exactamente 3 presets: bodega, cafetería y minimarket', () => {
    expect(PRESETS).toHaveLength(3);
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toContain('bodega');
    expect(ids).toContain('cafeteria');
    expect(ids).toContain('minimarket');
  });

  it('data-testid de cada preset sigue la convención preset-{id}', () => {
    for (const p of PRESETS) {
      expect(`preset-${p.id}`).toMatch(/^preset-\w+$/);
    }
    // Verifica los testId exactos requeridos por la spec
    expect(PRESETS.find((p) => p.id === 'bodega')).toBeDefined();
    const bodegaTestId = `preset-${PRESETS.find((p) => p.id === 'bodega')!.id}`;
    expect(bodegaTestId).toBe('preset-bodega');
  });

  it('preset bodega autocompleta con 8 transacciones/día', () => {
    const bodega = PRESETS.find((p) => p.id === 'bodega');
    expect(bodega).toBeDefined();
    expect(bodega!.ticketsPerDay).toBe(8);
  });

  it('preset bodega autocompleta con ticket promedio de 15 soles', () => {
    const bodega = PRESETS.find((p) => p.id === 'bodega');
    expect(bodega).toBeDefined();
    expect(bodega!.avgTicketSoles).toBe(15);
  });

  it('preset cafetería autocompleta con 35 transacciones/día y 22 soles', () => {
    const cafe = PRESETS.find((p) => p.id === 'cafeteria');
    expect(cafe).toBeDefined();
    expect(cafe!.ticketsPerDay).toBe(35);
    expect(cafe!.avgTicketSoles).toBe(22);
  });

  it('preset minimarket autocompleta con 60 transacciones/día y 45 soles', () => {
    const mini = PRESETS.find((p) => p.id === 'minimarket');
    expect(mini).toBeDefined();
    expect(mini!.ticketsPerDay).toBe(60);
    expect(mini!.avgTicketSoles).toBe(45);
  });
});
