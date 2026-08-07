export function formatTicketCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error('INVALID_TICKET_CENTS');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
