export function formatTicketCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error('INVALID_TICKET_CENTS');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
