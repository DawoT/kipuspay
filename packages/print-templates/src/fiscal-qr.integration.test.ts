/**
 * Evidencia H2 (auditoría 0031) — simulación end-to-end en 2 modelos:
 *  Modelo A: térmica ESC/POS simulada, perfiles 58mm (32 col) y 80mm (48 col)
 *            — decodificamos los bytes y verificamos layout + GS ( k ) QR.
 *  Modelo B: SystemPrint HTML con matriz QR del generador vendorizado real
 *            (qrcode-generator MIT) — verifica estructura ISO 18004
 *            (finder patterns) sobre el payload fiscal exacto.
 * Sin hardware físico: ambos modelos son simuladores deterministas.
 */
import { describe, expect, it } from 'vitest';
import { buildEscPosPayload } from './build-escpos.js';
import { buildTicketHtml } from './build-html.js';
import { buildFiscalQrPayload } from './fiscal-qr.js';
import { qrMatrixToSvg } from './qr-svg.js';
import type { TicketData } from './ticket-data.js';

// Generador vendorizado real del POS (qrcode-generator MIT).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vendorQrcode = (async () => {
  // @ts-expect-error — el .mjs vendorizado solo declara tipos dentro de pos-web
  const mod = await import('../../../apps/pos-web/src/lib/vendor/qrcode.mjs');
  return mod.default as (
    typeNumber: number,
    ecc: 'L' | 'M' | 'Q' | 'H',
  ) => {
    addData(d: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(r: number, c: number): boolean;
  };
})();

function cpeTicket(lineWidth: 32 | 48): TicketData {
  return {
    enterprise: 'Bodega Kipus Demo',
    ruc: '20512345678',
    documentType: '01',
    series: 'F001',
    number: 123,
    totalCents: 70800,
    igvCents: 10800,
    issueDateIso: '2026-08-24',
    buyer: { name: 'Comercial Andina SAC', docType: '4', docNumber: '20600695771' },
    digestValue: 'digestvalue-fixture-0001',
    qrPayload: buildFiscalQrPayload({
      ruc: '20512345678',
      documentType: '01',
      series: 'F001',
      number: 123,
      igvCents: 10800,
      totalCents: 70800,
      issueDateIso: '2026-08-24',
      buyerDocType: '4',
      buyerDocNumber: '20600695771',
      digestValue: 'digestvalue-fixture-0001',
    }),
    items: [{ name: 'Arroz Extra 5kg', qty: 2, totalCents: 70800 }],
    lineWidth,
  };
}

describe('H2 evidencia — modelo A: térmica ESC/POS simulada (58/80mm)', () => {
  for (const width of [32, 48] as const) {
    it(`perfil ${width === 32 ? '58mm/32col' : '80mm/48col'}: layout completo + comando GS ( k )`, () => {
      const text = new TextDecoder().decode(buildEscPosPayload(cpeTicket(width)));
      expect(text).toContain('FACTURA ELECTRÓNICA');
      expect(text).toContain('RUC: 20512345678');
      expect(text).toContain('01 F001-00000123');
      expect(text).toContain('Fecha de emisión: 2026-08-24');
      expect(text).toContain('Adquirente: Comercial Andina SAC');
      expect(text).toContain('RUC: 20600695771');
      expect(text).toContain('TOTAL: S/ 708.00');
      expect(text).toContain('IGV: S/ 108.00');
      expect(text).toContain('Hash: digestvalue-fixture-0001'.slice(0, width));
      // Payload fiscal íntegro dentro de los bytes GS ( k ).
      const bytes = buildEscPosPayload(cpeTicket(width));
      const ascii = [...bytes]
        .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '\u0000'))
        .join('');
      expect(ascii).toContain(
        '20512345678|01|F001|00000123|108.00|708.00|2026-08-24|4|20600695771|',
      );
      const gsK = [...bytes].some(
        (_, i, arr) => arr[i] === 0x1d && arr[i + 1] === 0x28 && arr[i + 2] === 0x6b,
      );
      expect(gsK).toBe(true);
    });
  }
});

describe('H2 evidencia — modelo B: SystemPrint HTML + QR vendorizado real', () => {
  it('el generador vendorizado produce matriz ISO válida para el payload fiscal', async () => {
    const qrcode = await vendorQrcode;
    const payload = cpeTicket(48).qrPayload as string;
    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    const size = qr.getModuleCount();
    // Finder pattern TL 7×7: borde oscuro, anillo claro, núcleo oscuro.
    expect(qr.isDark(0, 0)).toBe(true);
    expect(qr.isDark(0, 6)).toBe(true);
    expect(qr.isDark(6, 0)).toBe(true);
    expect(qr.isDark(1, 1)).toBe(false);
    expect(qr.isDark(3, 3)).toBe(true);
    expect(qr.isDark(0, 7)).toBe(false); // separador claro
    expect(size).toBeGreaterThanOrEqual(21); // versión mínima 1 = 21 módulos
    // El SVG derivado conserva la geometría (módulos oscuros = comandos path).
    const svg = qrMatrixToSvg({ size, isDark: (r, c) => qr.isDark(r, c) === true });
    const darkModules = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => (qr.isDark(r, c) ? 1 : 0)),
    )
      .flat()
      .reduce<number>((a, b) => a + b, 0);
    expect((svg.match(/h1v1h-1z/g) ?? []).length).toBe(darkModules);
  });

  it('HTML system_print embebe el SVG real y todos los campos H2', async () => {
    const qrcode = await vendorQrcode;
    const data = cpeTicket(48);
    const html = buildTicketHtml(data, {
      qrSvg: (payload) => {
        const qr = qrcode(0, 'M');
        qr.addData(payload);
        qr.make();
        return qrMatrixToSvg({
          size: qr.getModuleCount(),
          isDark: (r, c) => qr.isDark(r, c) === true,
        });
      },
    });
    expect(html).toContain('<div class="qr-svg"><svg xmlns="http://www.w3.org/2000/svg"');
    expect(html).not.toContain('>QR: 20512345678'); // sin fallback textual
    expect(html).toContain('FACTURA ELECTRÓNICA');
    expect(html).toContain('Fecha de emisión: 2026-08-24');
    expect(html).toContain('IGV: S/ 108.00');
    expect(html).toContain('Adquirente: Comercial Andina SAC');
    expect(html).toContain('RUC: 20600695771');
  });
});
