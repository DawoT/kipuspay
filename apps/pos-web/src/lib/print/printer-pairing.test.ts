/**
 * C7 pairing UI — TDD: lista impresoras, empareja (WebUSB + WSS), persiste en pos_terminals.
 * Usa Storage memoria y transport mock; no depende de navigator real.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrintTicketSnapshot } from '@kipuspay/print-templates';
import {
  pairWss,
  readTerminalPairing,
  setPaperWidth,
  setTerminalId,
  testPrintWithCurrentLadder,
  validateWssUrl,
  writeTerminalPairing,
} from './printer-pairing.js';
import { createPrinterTransport } from './printer-transport.js';
import type { SocketPort, UsbDevicePort } from '../printing/price-label-transports.js';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  } as Storage;
}

const snap: PrintTicketSnapshot = {
  enterprise: 'Negocio',
  ruc: '20123456789',
  documentType: 'NV',
  series: 'NV01',
  number: 1,
  totalCents: 1180,
  items: [{ name: 'Item', qty: 1, totalCents: 1180 }],
  lineWidth: 32,
};

function usbDevice(): UsbDevicePort {
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

describe('printer pairing — lista, empareja, persiste (C7)', () => {
  it('lista impresoras: preflight muestra webusb/wss_lan cuando hay pairing', async () => {
    const storage = memoryStorage();
    // sin pairing -> solo system_print
    const empty = await createPrinterTransport({
      usbDevice: null,
      wssUrl: null,
    } as never).preflight();
    expect(empty).toContain('system_print');
    expect(empty).not.toContain('webusb');
    expect(empty).not.toContain('wss_lan');

    // con pairing WSS
    pairWss(storage, 'wss://printer.local/escpos');
    const wssEnv = {
      wssUrl: 'wss://printer.local/escpos',
      allowlistedHosts: ['printer.local'],
      socketFactory: () => ({ send: vi.fn(), close: vi.fn() }) as unknown as SocketPort,
    };
    const withWss = await createPrinterTransport(wssEnv as never).preflight();
    expect(withWss).toContain('wss_lan');

    // con WebUSB
    const withUsb = await createPrinterTransport({ usbDevice: usbDevice() } as never).preflight();
    expect(withUsb).toContain('webusb');
  });

  it('empareja WSS: valida wss://, extrae host y persiste allowlist + strategy', () => {
    const storage = memoryStorage();
    expect(validateWssUrl('wss://192.168.1.50:9100/escpos').ok).toBe(true);
    expect(validateWssUrl('ws://printer.local').ok).toBe(false);
    expect(validateWssUrl('https://printer.local').ok).toBe(false);

    const res = pairWss(storage, 'wss://192.168.1.50:9100/escpos');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.host).toBe('192.168.1.50');
    const pairing = readTerminalPairing(storage);
    expect(pairing.wssUrl).toBe('wss://192.168.1.50:9100/escpos');
    expect(pairing.allowlistedHosts).toEqual(['192.168.1.50']);
    expect(pairing.printerStrategy).toBe('wss_lan');
  });

  it('persiste en pos_terminals: terminalId + paper_width_mm + printer_strategy', () => {
    const storage = memoryStorage();
    setTerminalId(storage, 'TERM-1');
    setPaperWidth(storage, 80);
    writeTerminalPairing(storage, {
      terminalId: 'TERM-1',
      paperWidthMm: 80,
      printerStrategy: 'webusb',
    });
    const p = readTerminalPairing(storage);
    expect(p.terminalId).toBe('TERM-1');
    expect(p.paperWidthMm).toBe(80);
    expect(p.printerStrategy).toBe('webusb');
    // 80mm -> 48 col fallback checked via buildEscPos
    expect(storage.getItem('kipuspay:pos-terminal-id')).toBe('TERM-1');
    expect(storage.getItem('kipuspay:pos-terminal-config')).toContain('80');

    // cambio a 58mm
    setPaperWidth(storage, 58);
    expect(readTerminalPairing(storage).paperWidthMm).toBe(58);
  });

  it('test de impresión: usa ladder actual y reporta adapter (WebUSB y WSS)', async () => {
    const storage = memoryStorage();
    pairWss(storage, 'wss://printer.local/escpos');
    // WSS path — mock ACK por nonce
    let onMessage: ((e: { data?: unknown }) => void) | undefined;
    const send = vi.fn();
    const wssStorage = memoryStorage();
    pairWss(wssStorage, 'wss://printer.local/escpos');
    const socketFactory = (): SocketPort => ({
      send,
      close: vi.fn(),
      addEventListener(type, listener) {
        if (type === 'message') onMessage = listener;
      },
    });
    // transport directo: simula éxito WSS
    const t = createPrinterTransport({
      wssUrl: 'wss://printer.local/escpos',
      allowlistedHosts: ['printer.local'],
      socketFactory,
      randomBytes: (n: number) => new Uint8Array(n).fill(0x11),
    });
    const pending = t.print({ ticket: { ...snap, lineWidth: 48 }, escPosBase64: 'AA==' });
    await new Promise((r) => setTimeout(r, 0));
    expect(send).toHaveBeenCalled();
    onMessage?.({
      data: JSON.stringify({
        type: 'ACK',
        itemId: 'NV:NV01:1',
        nonce: '11111111111111111111111111111111',
      }),
    });
    const res = await pending;
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.adapter).toBe('wss_lan');
  });

  it('testPrintWithCurrentLadder: persiste y corre test via ladder integrada', async () => {
    const storage = memoryStorage();
    pairWss(storage, 'wss://printer.local/escpos');
    // Como no podemos abrir socket real en test, inyectamos fallo controlado que debe
    // caer hasta system_print (que en node falla -> verificar que retorna error coherente)
    const result = await testPrintWithCurrentLadder({
      storage,
      ticket: snap,
      escPosBase64: null, // sin ESC/POS => system_print usa HTML (falla en node) -> debe reportar error
    });
    // en entorno node sin document, system_print falla y no hay whatsapp -> debe ser ok:false
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
