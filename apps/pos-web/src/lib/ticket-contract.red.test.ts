import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pos = readFileSync(new URL('../../src/routes/+page.svelte', import.meta.url), 'utf8');

/**
 * F-7/F-8 (auditoría browser) — el ticket impreso debe mostrar el total con
 * IGV (S/ 22.30, no la base S/ 18.90) y el RUC del tenant, nunca un RUC de
 * ejemplo hardcodeado.
 */
describe('F-7/F-8 contrato: ticket con total IGV y RUC del tenant', () => {
  it('el ticket usa el total pagadero (IGV incluido), no la base', () => {
    const ticketSection = pos.slice(pos.indexOf('const mockTicket: TicketData'));
    expect(ticketSection.length, 'mockTicket presente').toBeGreaterThan(0);
    expect(ticketSection).toContain('cartPayableCents');
  });

  it('no hardcodea el RUC en el ticket', () => {
    expect(pos).not.toMatch(/ruc:\s*['"]2\d{10}['"]/);
  });
});