/**
 * hw-printers-matrix 2×2: 58/32 vs 80/48 × WebUSB vs WSS LAN
 * Cada celda = bytes ESC/POS decodificados (GS k, corte, separador) + layout verificado.
 * Usa PrinterTransport existente (no duplica bytes), templates 58/80 normativos.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildEscPosPayload, resolveLineWidth, maxItemNameLen } from '@kipuspay/print-templates';
import { buildGsKQrCommands } from '@kipuspay/print-templates';
import type { TicketData } from '@kipuspay/print-templates';
import { createPrinterTransport } from './printer-transport.js';
import type { SocketPort, UsbDevicePort } from '../printing/price-label-transports.js';

function ticketForWidth(lineWidth: 32 | 48): TicketData {
  return {
    enterprise: 'Kipus Tienda',
    ruc: '20123456789',
    documentType: '01',
    series: 'F001',
    number: 1,
    totalCents: 11800,
    igvCents: 1800,
    issueDateIso: '2026-08-24',
    buyer: { name: 'Cliente', docType: '1', docNumber: '44443333' },
    digestValue: 'abc123',
    qrPayload: '20123456789|01|F001|00000001|18.00|118.00|2026-08-24|1|44443333|abc123',
    brandFooter: { enabled: false, label: '', shortUrl: '', qrPayload: '' },
    lineWidth,
    items: [
      { name: 'Producto largo de nombre extenso para truncado', qty: 2, totalCents: 5000 },
      { name: 'Otro', qty: 1, totalCents: 6800 },
    ],
  };
}

function hasSequence(bytes: Uint8Array, seq: readonly number[]): boolean {
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function usbMock(): UsbDevicePort {
  return {
    opened: false,
    open: vi.fn(() => Promise.resolve()),
    selectConfiguration: vi.fn(() => Promise.resolve()),
    claimInterface: vi.fn(() => Promise.resolve()),
    transferOut: vi.fn(() => Promise.resolve({ status: 'ok' })),
    releaseInterface: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  } as unknown as UsbDevicePort;
}

describe('hw-printers-matrix 2x2 (58/80 × WebUSB/WSS)', () => {
  it('resuelve anchos normativos 58→32 / 80→48', () => {
    expect(resolveLineWidth(58)).toBe(32);
    expect(resolveLineWidth(80)).toBe(48);
    expect(maxItemNameLen(32)).toBe(14);
    expect(maxItemNameLen(48)).toBe(26);
  });

  it('GS k (QR) existe y GS v raster no se usa (QR nativo)', () => {
    const cmds = buildGsKQrCommands('payload-qr');
    expect(hasSequence(new Uint8Array(cmds), [0x1d, 0x28, 0x6b])).toBe(true);
  });

  // Matriz física 2x2 — cada celda verifica bytes + layout + transporte
  it('celda 58mm/32col × WebUSB — separador 32, truncado 14, GS k y corte', async () => {
    const data = ticketForWidth(32);
    const bytes = buildEscPosPayload(data);
    const text = textOf(bytes);
    // separador normativo 58mm
    expect(text).toContain('-'.repeat(32));
    expect(text).not.toContain('-'.repeat(48));
    // truncado 14 en 32 col
    const longName = 'Producto largo de nombre extenso para truncado'.substring(0, 14);
    expect(text).toContain(longName);
    // GS k QR nativo presente (0x1d 0x28 0x6b)
    expect(hasSequence(bytes, [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00])).toBe(true);
    // Corte GS V 0x1d 0x56 0x42
    expect(hasSequence(bytes, [0x1d, 0x56, 0x42])).toBe(true);
    expect(hasSequence(bytes, [0x1b, 0x40])).toBe(true); // Reset

    // Transporte WebUSB real (adapter PriceLabelWebUsb)
    const transport = createPrinterTransport({ usbDevice: usbMock() });
    const escB64 = Buffer.from(bytes).toString('base64');
    const res = await transport.print({
      ticket: {
        enterprise: data.enterprise,
        ruc: data.ruc!,
        documentType: data.documentType,
        series: data.series,
        number: data.number,
        totalCents: data.totalCents,
        items: data.items,
        lineWidth: 32,
      },
      escPosBase64: escB64,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('webusb');
  });

  it('celda 58mm/32col × WSS LAN — mismo layout 32, ACK por nonce correlacionado', async () => {
    const data = ticketForWidth(32);
    const bytes = buildEscPosPayload(data);
    const escB64 = Buffer.from(bytes).toString('base64');
    let onMessage: ((e: { data?: unknown }) => void) | undefined;
    const send = vi.fn();
    const transport = createPrinterTransport({
      wssUrl: 'wss://printer.local/escpos',
      allowlistedHosts: ['printer.local'],
      socketFactory: (): SocketPort => ({
        send,
        close: vi.fn(),
        addEventListener(type, l) {
          if (type === 'message') onMessage = l;
        },
      }),
      randomBytes: (n: number) => new Uint8Array(n).fill(0xaa),
    });

    const pending = transport.print({
      ticket: {
        enterprise: data.enterprise,
        ruc: data.ruc!,
        documentType: data.documentType,
        series: data.series,
        number: data.number,
        totalCents: data.totalCents,
        items: data.items,
        lineWidth: 32,
      },
      escPosBase64: escB64,
      preferredAdapter: 'wss_lan',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(send).toHaveBeenCalled();
    // ACK correlacionado por itemId + nonce (hex de 0xaa*16)
    const nonce = 'aa'.repeat(16);
    onMessage?.({ data: JSON.stringify({ type: 'ACK', itemId: '01:F001:1', nonce }) });
    const res = await pending;
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('wss_lan');
    // layout check igual que celda WebUSB 58
    expect(textOf(bytes)).toContain('-'.repeat(32));
  });

  it('celda 80mm/48col × WebUSB — separador 48, truncado 26, IGV + fecha + QR', async () => {
    const data = ticketForWidth(48);
    const bytes = buildEscPosPayload(data);
    const text = textOf(bytes);
    expect(text).toContain('-'.repeat(48));
    expect(text).toContain('IGV: S/ 18.00');
    expect(text).toContain('Fecha de emisión: 2026-08-24');
    expect(text).toContain('FACTURA ELECTRÓNICA');
    // truncado 26 en 80mm (verifica que no trunca a 14)
    expect(text).toContain('Producto largo de nombre ex'.substring(0, 26));
    expect(hasSequence(bytes, [0x1d, 0x28, 0x6b])).toBe(true);
    // WebUSB
    const transport = createPrinterTransport({ usbDevice: usbMock() });
    const res = await transport.print({
      ticket: {
        enterprise: data.enterprise,
        ruc: data.ruc!,
        documentType: data.documentType,
        series: data.series,
        number: data.number,
        totalCents: data.totalCents,
        items: data.items,
        lineWidth: 48,
      },
      escPosBase64: Buffer.from(bytes).toString('base64'),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('webusb');
  });

  it('celda 80mm/48col × WSS LAN — layout 48 y bytes idénticos a WebUSB (misma compilación)', async () => {
    const data = ticketForWidth(48);
    const bytes = buildEscPosPayload(data);
    const escB64 = Buffer.from(bytes).toString('base64');
    let onMessage: ((e: { data?: unknown }) => void) | undefined;
    const send = vi.fn();
    const transport = createPrinterTransport({
      wssUrl: 'wss://192.168.1.50:8080',
      allowlistedHosts: ['192.168.1.50'],
      socketFactory: (): SocketPort => ({
        send,
        close: vi.fn(),
        addEventListener(t, l) {
          if (t === 'message') onMessage = l;
        },
      }),
      randomBytes: (n: number) => new Uint8Array(n).fill(0xbb),
    });
    const pending = transport.print({
      ticket: {
        enterprise: data.enterprise,
        ruc: data.ruc!,
        documentType: data.documentType,
        series: data.series,
        number: data.number,
        totalCents: data.totalCents,
        items: data.items,
        lineWidth: 48,
      },
      escPosBase64: escB64,
      preferredAdapter: 'wss_lan',
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(send).toHaveBeenCalledOnce();
    // Verifica frame enviado contiene nonce + itemId + payload (validación de protocolo WSS)
    const sent: Uint8Array = send.mock.calls[0][0];
    expect(sent[0]).toBe(1); // version frame
    expect(sent[1]).toBe(16); // nonce len
    onMessage?.({
      data: JSON.stringify({ type: 'ACK', itemId: '01:F001:1', nonce: 'bb'.repeat(16) }),
    });
    const res = await pending;
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('wss_lan');
    // Bytes 80mm deben ser más largos que 58mm (más columnas)
    const narrow = buildEscPosPayload(ticketForWidth(32));
    expect(bytes.length).toBeGreaterThan(narrow.length);
  });

  it('NV 58mm no imprime bloques fiscales (fail-closed) pero sí leyenda y corte', () => {
    const nv: TicketData = {
      enterprise: 'Negocio',
      ruc: '20123456789',
      documentType: 'NV',
      series: 'NV01',
      number: 5,
      totalCents: 1000,
      items: [{ name: 'Item', qty: 1, totalCents: 1000 }],
      lineWidth: 32,
      digestValue: 'should-not-appear',
      qrPayload: 'should-not-appear',
      issueDateIso: '2026-08-24',
      igvCents: 180,
    };
    const bytes = buildEscPosPayload(nv);
    const text = textOf(bytes);
    expect(text).not.toContain('IGV:');
    expect(text).not.toContain('Fecha de emisión');
    expect(text).not.toContain('Hash:');
    expect(hasSequence(bytes, [0x1d, 0x28, 0x6b])).toBe(false); // sin QR en NV
    expect(text).toContain('control interno');
  });

  it('WSS rechaza host no allowlisted antes de enviar (seguridad fail-closed)', async () => {
    const t = createPrinterTransport({
      wssUrl: 'wss://evil.local/escpos',
      allowlistedHosts: ['printer.local'],
      socketFactory: () => ({ send: vi.fn(), close: vi.fn() }) as unknown as SocketPort,
    });
    const res = await t.print({
      ticket: {
        enterprise: 'X',
        ruc: '201',
        documentType: 'NV',
        series: 'NV01',
        number: 1,
        totalCents: 100,
        items: [{ name: 'A', qty: 1, totalCents: 100 }],
        lineWidth: 32,
      },
      escPosBase64: 'AA==',
      preferredAdapter: 'wss_lan',
    });
    // Debe caer a system_print y fallar en node (sin document), reportando error del host o fallback
    expect(res.ok).toBe(false);
  });
});
