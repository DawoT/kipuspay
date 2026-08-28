/**
 * Pairing de impresoras — WebUSB + WSS LAN (C7) + pos_terminals (§5.3).
 * Guarda en Storage local y refleja pos_terminals (paper_width_mm + printer_strategy)
 * sin duplicar la ladder PrinterTransport (§7.5). Zero-dep, Web Platform only.
 */
import type { PrinterStrategy } from '@kipuspay/print-templates';
import { resolveLineWidth } from '@kipuspay/print-templates';
import {
  buildPosPrinterEnv,
  readPosPrinterSettings,
  registerUsbPrinterDevice,
  writePosPrinterSettings,
  type PosPrinterSettings,
} from './printer-runtime.js';
import { createPrinterTransport, type PrinterTransportEnv } from './printer-transport.js';
import type { PrintTicketSnapshot } from '@kipuspay/print-templates';
import type { UsbDevicePort } from '../printing/price-label-transports.js';

export const TERMINAL_ID_KEY = 'kipuspay:pos-terminal-id';
export const TERMINAL_CONFIG_KEY = 'kipuspay:pos-terminal-config';

export interface TerminalPairing {
  readonly terminalId: string | null;
  readonly paperWidthMm: 58 | 80;
  readonly printerStrategy: PrinterStrategy;
  readonly wssUrl?: string | null;
  readonly allowlistedHosts?: readonly string[];
}

function parsePaperWidth(value: unknown): 58 | 80 {
  return value === 80 ? 80 : 58;
}

function parseStrategy(value: unknown): PrinterStrategy {
  const allowed: readonly string[] = ['webusb', 'wss_lan', 'bluetooth', 'system_print'];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as PrinterStrategy;
  }
  return 'webusb';
}

export function readTerminalPairing(storage: Storage): TerminalPairing {
  const raw = storage.getItem(TERMINAL_CONFIG_KEY);
  let parsed: Record<string, unknown> = {};
  if (raw) {
    try {
      const j = JSON.parse(raw) as unknown;
      if (j && typeof j === 'object') parsed = j as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const terminalId = storage.getItem(TERMINAL_ID_KEY);
  const paperWidthMm = parsePaperWidth(parsed.paperWidthMm);
  const printerStrategy = parseStrategy(parsed.printerStrategy);
  const wss = readPosPrinterSettings(storage);
  return {
    terminalId: terminalId && terminalId.trim() ? terminalId.trim() : null,
    paperWidthMm,
    printerStrategy,
    wssUrl: wss.wssUrl,
    allowlistedHosts: wss.allowlistedHosts,
  };
}

export function writeTerminalPairing(storage: Storage, pairing: TerminalPairing): void {
  if (pairing.terminalId && pairing.terminalId.trim()) {
    storage.setItem(TERMINAL_ID_KEY, pairing.terminalId.trim());
  } else {
    storage.removeItem(TERMINAL_ID_KEY);
  }
  const payload = {
    paperWidthMm: pairing.paperWidthMm,
    printerStrategy: pairing.printerStrategy,
  };
  storage.setItem(TERMINAL_CONFIG_KEY, JSON.stringify(payload));
  const wss: PosPrinterSettings = {
    ...(pairing.wssUrl !== undefined ? { wssUrl: pairing.wssUrl } : {}),
    ...(pairing.allowlistedHosts !== undefined
      ? { allowlistedHosts: pairing.allowlistedHosts }
      : {}),
  };
  writePosPrinterSettings(storage, wss);
}

export function validateWssUrl(
  url: string,
): { readonly ok: true; readonly host: string } | { readonly ok: false; readonly error: string } {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: 'WSS_URL_REQUIRED' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'WSS_URL_INVALID' };
  }
  if (parsed.protocol !== 'wss:') return { ok: false, error: 'PRINTER_WSS_REQUIRED' };
  if (!parsed.hostname) return { ok: false, error: 'WSS_HOST_REQUIRED' };
  return { ok: true, host: parsed.hostname };
}

/** Pair WSS: valida, persist allowlist y estrategia en pos_terminals (local). */
export function pairWss(
  storage: Storage,
  wssUrl: string,
): { ok: boolean; host?: string; error?: string } {
  const v = validateWssUrl(wssUrl);
  if (!v.ok) return { ok: false, error: v.error };
  const current = readTerminalPairing(storage);
  writeTerminalPairing(storage, {
    terminalId: current.terminalId,
    paperWidthMm: current.paperWidthMm,
    printerStrategy: 'wss_lan',
    wssUrl: wssUrl.trim(),
    allowlistedHosts: [v.host],
  });
  return { ok: true, host: v.host };
}

export function pairWebUsb(device: UsbDevicePort): void {
  registerUsbPrinterDevice(device);
}

export function unpairWebUsb(): void {
  registerUsbPrinterDevice(null);
}

export function setPaperWidth(storage: Storage, paperWidthMm: 58 | 80): void {
  const current = readTerminalPairing(storage);
  const lineWidth = resolveLineWidth(paperWidthMm);
  // lineWidth is derived server-side; we keep consistency but store paper width as source.
  void lineWidth;
  writeTerminalPairing(storage, {
    terminalId: current.terminalId,
    paperWidthMm,
    printerStrategy: current.printerStrategy,
    wssUrl: current.wssUrl,
    allowlistedHosts: current.allowlistedHosts,
  });
}

export function setTerminalId(storage: Storage, terminalId: string): void {
  const current = readTerminalPairing(storage);
  writeTerminalPairing(storage, {
    terminalId: terminalId.trim() || null,
    paperWidthMm: current.paperWidthMm,
    printerStrategy: current.printerStrategy,
    wssUrl: current.wssUrl,
    allowlistedHosts: current.allowlistedHosts,
  });
}

export function listAvailableAdapters(
  env: PrinterTransportEnv,
): Promise<readonly PrinterStrategy[]> {
  return createPrinterTransport(env).preflight();
}

export function buildPairingEnv(
  storage: Storage,
  usbDevice?: UsbDevicePort | null,
): PrinterTransportEnv {
  return buildPosPrinterEnv({ storage, usbDevice: usbDevice ?? undefined });
}

/** Test de impresión end-to-end con la ladder actual (no duplica bytes). */
export async function testPrintWithCurrentLadder(input: {
  readonly storage: Storage;
  readonly ticket: PrintTicketSnapshot;
  readonly escPosBase64?: string | null;
  readonly preferredAdapter?: PrinterStrategy | null;
  readonly usbDevice?: UsbDevicePort | null;
}): Promise<{ ok: boolean; adapter?: PrinterStrategy; error?: string }> {
  const usb = input.usbDevice ?? null;
  const env = buildPairingEnv(input.storage, usb);
  const transport = createPrinterTransport(env);
  const result = await transport.print({
    ticket: input.ticket,
    escPosBase64: input.escPosBase64 ?? null,
    preferredAdapter: input.preferredAdapter ?? null,
  });
  return result.ok
    ? { ok: true, adapter: result.adapter }
    : { ok: false, adapter: result.adapter, error: result.error };
}

/** Intento best-effort de persistencia server-side pos_terminals (fail-open, nunca bloquea caja). */
export async function persistTerminalToServer(input: {
  readonly storage: Storage;
  readonly fetchFn?: typeof fetch;
  readonly apiBase?: string;
}): Promise<boolean> {
  const pairing = readTerminalPairing(input.storage);
  if (!pairing.terminalId) return false;
  const fn = input.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fn) return false;
  const base = input.apiBase ?? '';
  const url = `${base}/api/pos/terminals/pairing`.replace(/\/\//g, '/').replace(':/', '://');
  try {
    const res = await fn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        terminalId: pairing.terminalId,
        paperWidthMm: pairing.paperWidthMm,
        lineWidth: resolveLineWidth(pairing.paperWidthMm),
        printerStrategy: pairing.printerStrategy,
        wssUrl: pairing.wssUrl ?? null,
        allowlistedHosts: pairing.allowlistedHosts ?? [],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
