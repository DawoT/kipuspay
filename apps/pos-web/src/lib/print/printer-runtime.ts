/**
 * C7 — runtime browser de la ladder de tickets. Conecta el WebSocket nativo,
 * lee el pairing WSS configurado por el admin y expone el device USB adquirido
 * por gesto (requestDevice). Sin pairing configurado no miente en preflight:
 * la ladder cae a system_print/whatsapp (§7.5).
 */
import type { SocketPort, UsbDevicePort } from '../printing/price-label-transports.js';
import type { PrinterTransportEnv } from './printer-transport.js';

const WSS_URL_KEY = 'kipuspay_printer_wss_url';
const ALLOWLIST_KEY = 'kipuspay_printer_allowlisted_hosts';

/** WebSocket nativo cumple la interfaz SocketPort (send/close/addEventListener). */
export function nativeSocketFactory(url: string): SocketPort {
  return new WebSocket(url);
}

export interface PosPrinterSettings {
  readonly wssUrl?: string | null;
  readonly allowlistedHosts?: readonly string[];
}

export function readPosPrinterSettings(storage: Storage): PosPrinterSettings {
  const wssUrl = storage.getItem(WSS_URL_KEY);
  let allowlistedHosts: readonly string[] = [];
  const raw = storage.getItem(ALLOWLIST_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) allowlistedHosts = parsed.filter((h) => typeof h === 'string');
    } catch {
      allowlistedHosts = [];
    }
  }
  return {
    wssUrl: wssUrl && wssUrl.trim() ? wssUrl.trim() : null,
    allowlistedHosts,
  };
}

export function writePosPrinterSettings(
  storage: Storage,
  settings: PosPrinterSettings,
): void {
  if (settings.wssUrl && settings.wssUrl.trim()) {
    storage.setItem(WSS_URL_KEY, settings.wssUrl.trim());
  } else {
    storage.removeItem(WSS_URL_KEY);
  }
  if (settings.allowlistedHosts?.length) {
    storage.setItem(ALLOWLIST_KEY, JSON.stringify(settings.allowlistedHosts));
  } else {
    storage.removeItem(ALLOWLIST_KEY);
  }
}

let registeredUsbDevice: UsbDevicePort | null = null;

/** Registra el device WebUSB adquirido por gesto (requestDevice) en la sesión. */
export function registerUsbPrinterDevice(device: UsbDevicePort | null): void {
  registeredUsbDevice = device;
}

export function currentUsbPrinterDevice(): UsbDevicePort | null {
  return registeredUsbDevice;
}

/** Construye el env de la ladder de tickets para el POS (fail-closed). */
export function buildPosPrinterEnv(input: {
  readonly storage?: Storage;
  readonly usbDevice?: UsbDevicePort | null;
  readonly whatsappFallback?: (snap: unknown) => Promise<boolean>;
} = {}): PrinterTransportEnv {
  const storage = input.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const settings = storage ? readPosPrinterSettings(storage) : {};
  const device = input.usbDevice !== undefined ? input.usbDevice : registeredUsbDevice;
  return {
    wssUrl: settings.wssUrl,
    allowlistedHosts: settings.allowlistedHosts,
    socketFactory: nativeSocketFactory,
    ...(device ? { usbDevice: device } : {}),
    ...(input.whatsappFallback ? { whatsappFallback: input.whatsappFallback } : {}),
  };
}