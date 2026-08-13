import { describe, expect, it } from 'vitest';
import { buildEscPosPayload, openDrawerBytes } from './build-escpos.js';
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
    const wideBytes = buildEscPosPayload(
      ticket({ lineWidth: 48, documentType: '03', digestValue: 'abc', qrPayload: 'qr1' }),
    );
    const hasGsK = [...wideBytes].some(
      (_, i, arr) => arr[i] === 0x1d && arr[i + 1] === 0x28 && arr[i + 2] === 0x6b,
    );
    expect(hasGsK).toBe(true);
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

  it('brand footer va DESPUES de leyenda fiscal; opt-out sin pie', () => {
    const withBrand = buildTicketHtml(
      ticket({
        brandFooter: {
          enabled: true,
          label: 'Emitido con KipusPay',
          shortUrl: 'https://kipuspay.pe/empezar?ref=KPABCD',
          qrPayload: 'https://kipuspay.pe/empezar?ref=KPABCD',
        },
      }),
    );
    const legendIdx = withBrand.indexOf(NV_TICKET_LEGEND);
    const brandIdx = withBrand.indexOf('Emitido con KipusPay');
    expect(legendIdx).toBeGreaterThan(-1);
    expect(brandIdx).toBeGreaterThan(legendIdx);

    const off = buildTicketHtml(
      ticket({
        brandFooter: {
          enabled: false,
          label: 'Emitido con KipusPay',
          shortUrl: 'x',
          qrPayload: 'x',
        },
      }),
    );
    expect(off).not.toContain('Emitido con KipusPay');

    const esc = new TextDecoder().decode(
      buildEscPosPayload(
        ticket({
          brandFooter: {
            enabled: true,
            label: 'Emitido con KipusPay',
            shortUrl: 'https://kipuspay.pe/empezar?ref=KP1',
            qrPayload: 'https://kipuspay.pe/empezar?ref=KP1',
          },
        }),
      ),
    );
    expect(esc.indexOf('control interno')).toBeLessThan(esc.indexOf('Emitido con KipusPay'));
  });
});

describe('Backlog v10 P2 — propina y cajón', () => {
  it('ticket con propina muestra la línea informativa (sin IGV)', () => {
    const text = new TextDecoder().decode(buildEscPosPayload({ ...ticket(), tipCents: 240 }));
    expect(text).toContain('PROPINA: S/ 2.40');
  });

  it('ticket sin propina no imprime la línea', () => {
    const text = new TextDecoder().decode(buildEscPosPayload(ticket()));
    expect(text).not.toContain('PROPINA');
  });

  it('openDrawerBytes emite ESC p con impulso estándar', () => {
    const bytes = openDrawerBytes();
    expect(Array.from(bytes)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });
});
