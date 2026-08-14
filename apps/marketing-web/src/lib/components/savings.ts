/**
 * Lógica pura de la calculadora de ahorro (M3) — supuestos explícitos y
 * editables; el resultado siempre se etiqueta como estimación.
 */

export interface SavingsInput {
  readonly ticketsPerDay: number;
  readonly minutesPerTicket: number;
  readonly hourlyRateSoles: number;
}

export interface SavingsResult {
  readonly hoursSavedPerMonth: number;
  readonly monthlySavingsSoles: number;
}

export const DEFAULT_ASSUMPTIONS: SavingsInput = {
  ticketsPerDay: 40,
  minutesPerTicket: 1.5,
  hourlyRateSoles: 15,
};

export function computeSavings(input: SavingsInput): SavingsResult {
  const minutesSavedPerMonth = input.ticketsPerDay * 30 * input.minutesPerTicket;
  const hoursSavedPerMonth = Math.round(minutesSavedPerMonth / 60);
  const monthlySavingsSoles = Math.trunc(hoursSavedPerMonth * input.hourlyRateSoles);
  return { hoursSavedPerMonth, monthlySavingsSoles };
}
