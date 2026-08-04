import { describe, expect, it } from 'vitest';
import { buildEscPosPayload } from './build-escpos.js';
import { buildTicketHtml } from './build-html.js';
import { CPE_TICKET_LEGEND, NV_TICKET_LEGEND, legendForDocument } from './legends.js';
import { resolveLineWidth } from './line-width.js';
import { printTicket } from './system-print.js';
import type { TicketData } from './ticket-data.js';

function ticket(over: Partial<TicketData> = {}): TicketData {
  return {
    enterprise: 'Demo SAC',
    ruc: '20123456789',
    documentType: 'NV',
    series: 'NV01',
    number: 1,
    totalCents: 1180,
    items: [{ name: 'Producto largo de prueba', qty: 1, totalCents: 1180 }],
    lineWidth: 32,
    ...over,
  };
}

describe('print-templates', () => {
  it('resolveLineWidth 58/80', () => {
    expect(resolveLineWidth(58)).toBe(32);
    expect(resolveLineWidth(80)).toBe(48);
    expect(resolveLineWidth(0)).toBe(32);
  });

  it('leyendas CPE vs NV', () => {
    expect(legendForDocument('NV')).toBe(NV_TICKET_LEGEND);
    expect(legendForDocument('03')).toBe(CPE_TICKET_LEGEND);
  });

  it('ESC/POS incluye leyenda NV y anchos distintos', () => {
    const narrow = new TextDecoder().decode(buildEscPosPayload(ticket({ lineWidth: 32 })));
    const wide = new TextDecoder().decode(
      buildEscPosPayload(
        ticket({ lineWidth: 48, documentType: '03', digestValue: 'abc', qrPayload: 'qr1' }),
      ),
    );
    expect(narrow).toContain('control interno');
    expect(wide).toContain('comprobante electrónico');
    expect(wide).toContain('Hash: abc');
    expect(wide).toContain('QR: qr1');
    expect(narrow.length).toBeLessThan(wide.length);
  });

  it('HTML ticket + system print stub', async () => {
    const html = buildTicketHtml(ticket());
    expect(html).toContain('TOTAL: S/ 11.80');
    expect(html).toContain(NV_TICKET_LEGEND);
    let printed = '';
    await printTicket(ticket(), {
      printHtml: (h) => {
        printed = h;
        return Promise.resolve();
      },
    });
    expect(printed).toContain('Demo SAC');

    const cpeHtml = buildTicketHtml(
      ticket({ documentType: '01', digestValue: 'd1', qrPayload: 'q1', lineWidth: 48 }),
    );
    expect(cpeHtml).toContain('Hash: d1');
    expect(cpeHtml).toContain(CPE_TICKET_LEGEND);

    await expect(
      printTicket(ticket(), { printHtml: () => Promise.resolve() }, 'escpos'),
    ).rejects.toThrow(/ESCPOS_TRANSPORT_UNAVAILABLE/);

    let esc = 0;
    await printTicket(
      ticket(),
      {
        printHtml: () => Promise.resolve(),
        sendEscPos: () => {
          esc += 1;
          return Promise.resolve();
        },
      },
      'escpos',
    );
    expect(esc).toBe(1);
  });

  it('formatTicketCents rechaza no-enteros', async () => {
    const { formatTicketCents } = await import('./format-cents.js');
    expect(() => formatTicketCents(1.5)).toThrow(/INVALID_TICKET_CENTS/);
    expect(resolveLineWidth(99, 48)).toBe(48);
  });
});
