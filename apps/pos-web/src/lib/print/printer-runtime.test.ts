/**
 * C7 — runtime browser de la ladder: pairing WSS persistido y env fail-closed
 * (sin config, preflight no miente: sin wss_lan; con pairing, lo habilita).
 */
import { describe, expect, it } from 'vitest';
import {
  buildPosPrinterEnv,
  readPosPrinterSettings,
  registerUsbPrinterDevice,
  writePosPrinterSettings,
} from './printer-runtime.js';

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
  };
}

describe('C7 runtime de impresión', () => {
  it('sin pairing persistido: env fail-closed sin WSS ni USB', () => {
    const env = buildPosPrinterEnv({ storage: memoryStorage() });
    expect(env.wssUrl).toBeNull();
    expect(env.allowlistedHosts).toEqual([]);
    expect(env.usbDevice).toBeUndefined();
    expect(typeof env.socketFactory).toBe('function');
  });

  it('persiste y relee el pairing WSS', () => {
    const storage = memoryStorage();
    writePosPrinterSettings(storage, {
      wssUrl: 'wss://printer.local/escpos',
      allowlistedHosts: ['printer.local'],
    });
    const settings = readPosPrinterSettings(storage);
    expect(settings.wssUrl).toBe('wss://printer.local/escpos');
    expect(settings.allowlistedHosts).toEqual(['printer.local']);

    const env = buildPosPrinterEnv({ storage });
    expect(env.wssUrl).toBe('wss://printer.local/escpos');
    expect(env.allowlistedHosts).toEqual(['printer.local']);
  });

  it('ignora allowlist JSON corrupto (fail-closed)', () => {
    const storage = memoryStorage();
    storage.setItem('kipuspay_printer_allowlisted_hosts', '{not json');
    storage.setItem('kipuspay_printer_wss_url', '   ');
    const settings = readPosPrinterSettings(storage);
    expect(settings.wssUrl).toBeNull();
    expect(settings.allowlistedHosts).toEqual([]);
  });

  it('env con device USB registrado expone usbDevice', () => {
    const device = {
      opened: false,
      open: () => Promise.resolve(),
      selectConfiguration: () => Promise.resolve(),
      claimInterface: () => Promise.resolve(),
      transferOut: () => Promise.resolve({ status: 'ok' }),
      releaseInterface: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    registerUsbPrinterDevice(device);
    const env = buildPosPrinterEnv({ storage: memoryStorage() });
    expect(env.usbDevice).toBe(device);
    registerUsbPrinterDevice(null);
  });
});
