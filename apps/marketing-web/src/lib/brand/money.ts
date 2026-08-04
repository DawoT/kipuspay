/**
 * Formato de dinero para las superficies de producto de marca.
 * Entero en centimos siempre; nunca coma flotante (AGENTS §2.1).
 */

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const whole = Math.abs(Math.trunc(cents / 100));
  const rest = Math.abs(cents % 100);
  return `${sign}${whole}.${String(rest).padStart(2, '0')}`;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
