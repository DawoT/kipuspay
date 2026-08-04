export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const whole = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return `${sign}${whole}.${String(rest).padStart(2, '0')}`;
}
