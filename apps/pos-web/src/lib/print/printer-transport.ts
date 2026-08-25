/**
 * PrinterTransport ladder (§7.5): WebUSB → WSS → Bluetooth → SystemPrint → WhatsApp hint.
 */
import {
  base64ToBytes,
  buildTicketHtml,
  bytesToBase64,
  openDrawerBytes,
  qrMatrixToSvg,
  type PrinterStrategy,
  type PrintTicketSnapshot,
  type SystemPrintPort,
} from '@kipuspay/print-templates';
import { snapshotToTicketData } from './offload-compile.js';
import { qrMatrix } from './qr-canvas.js';
import {
  createPriceLabelWebUsbTransport,
  createPriceLabelWssTransport,
  type PriceLabelItemTransport,
  type SocketPort,
  type UsbDevicePort,
} from '../printing/price-label-transports.js';

export type TransportResult =
  | { readonly ok: true; readonly adapter: PrinterStrategy }
  | { readonly ok: false; readonly adapter: PrinterStrategy; readonly error: string };

export interface PrinterTransportEnv {
  readonly wssUrl?: string | null;
  /** C7: hosts WSS previamente paired/allowlisted (§5.8); vacío = sin WSS. */
  readonly allowlistedHosts?: readonly string[];
  /** C7: fábrica del socket WSS real (inyectable; el navegador la construye). */
  readonly socketFactory?: (url: string) => SocketPort;
  /** C7: device WebUSB real emparejado; ausente = sin WebUSB. */
  readonly usbDevice?: UsbDevicePort | null;
  /** C7: inyectable para tests deterministas del nonce WSS. */
  readonly randomBytes?: (length: number) => Uint8Array;
  /** Best-effort WA: solo señala que se puede enviar; no bloquea. */
  readonly whatsappFallback?: (snap: PrintTicketSnapshot) => Promise<boolean>;
}

export interface PrinterTransport {
  preflight(): Promise<readonly PrinterStrategy[]>;
  print(job: {
    readonly ticket: PrintTicketSnapshot;
    readonly escPosBase64: string | null;
    readonly preferredAdapter?: PrinterStrategy | null;
  }): Promise<TransportResult>;
  /**
   * Backlog v10 P2 — abre el cajón de efectivo por ESC/POS (`ESC p`) en el
   * primer adaptador de hardware disponible (webusb/wss_lan/bluetooth).
   * system_print/whatsapp no abren cajón (no son hardware de caja).
   */
  openDrawer(): Promise<TransportResult>;
}

function createSystemPort(): SystemPrintPort {
  return {
    async printHtml(html: string) {
      if (typeof document === 'undefined' || typeof window === 'undefined') {
        throw new Error('BROWSER_PRINT_UNAVAILABLE');
      }
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      if (!doc) {
        frame.remove();
        throw new Error('BROWSER_PRINT_UNAVAILABLE');
      }
      doc.open();
      doc.write(html);
      doc.close();
      await new Promise<void>((resolve, reject) => {
        const w = frame.contentWindow;
        if (!w) {
          reject(new Error('BROWSER_PRINT_UNAVAILABLE'));
          return;
        }
        w.focus();
        w.print();
        setTimeout(() => {
          frame.remove();
          resolve();
        }, 300);
      });
    },
  };
}

/** itemId del ticket para el ACK WSS correlacionado (documentType:series:number). */
function ticketItemId(ticket: PrintTicketSnapshot): string {
  return `${ticket.documentType}:${ticket.series}:${ticket.number}`;
}

/** C7: transport WebUSB real (§5.8: open→claim→transferOut→release→close). */
function webUsbTransport(env: PrinterTransportEnv): PriceLabelItemTransport | null {
  if (!env.usbDevice) return null;
  // allowedProfiles se omite: el device ya fue emparejado por gesto del usuario.
  return createPriceLabelWebUsbTransport({
    device: env.usbDevice,
    configurationValue: 1,
    interfaceNumber: 2,
    endpointNumber: 3,
  });
}

/** C7: transport WSS real con host allowlisted y ACK por nonce (§5.8). */
function wssTransport(env: PrinterTransportEnv): PriceLabelItemTransport | null {
  if (!env.wssUrl || !env.socketFactory || !env.wssUrl.startsWith('wss:')) return null;
  const hosts = env.allowlistedHosts ?? [];
  try {
    return createPriceLabelWssTransport({
      url: env.wssUrl,
      allowlistedHosts: hosts,
      socketFactory: env.socketFactory,
      ...(env.randomBytes ? { randomBytes: env.randomBytes } : {}),
    });
  } catch {
    return null;
  }
}

function tryBluetooth(bytes: Uint8Array): Promise<void> {
  const nav = navigator as Navigator & { bluetooth?: unknown };
  if (!nav.bluetooth) return Promise.reject(new Error('BLUETOOTH_UNAVAILABLE'));
  void bytes;
  return Promise.reject(new Error('BLUETOOTH_NO_DEVICE'));
}

async function executeSingleAdapter(
  adapter: PrinterStrategy,
  job: { readonly ticket: PrintTicketSnapshot; readonly escPosBase64: string | null },
  bytes: Uint8Array | null,
  env: PrinterTransportEnv,
  system: SystemPrintPort,
): Promise<void> {
  const itemId = ticketItemId(job.ticket);
  switch (adapter) {
    case 'webusb': {
      if (!bytes) throw new Error('ESCPOS_REQUIRED');
      const usb = webUsbTransport(env);
      if (!usb) throw new Error('WEBUSB_NO_DEVICE');
      await usb.send(itemId, bytes);
      return;
    }
    case 'wss_lan': {
      if (!bytes) throw new Error('ESCPOS_REQUIRED');
      const wss = wssTransport(env);
      if (!wss) throw new Error('WSS_NOT_CONNECTED');
      await wss.send(itemId, bytes);
      return;
    }
    case 'bluetooth':
      if (!bytes) throw new Error('ESCPOS_REQUIRED');
      return tryBluetooth(bytes);
    case 'system_print':
      // H2 (auditoría 0031): system_print renderiza el QR fiscal como SVG
      // (matriz del generador vendorizado MIT + conversor zero-dep del package).
      return system.printHtml(
        buildTicketHtml(snapshotToTicketData(job.ticket), {
          qrSvg: (payload) => qrMatrixToSvg(qrMatrix(payload)),
        }),
      );
    case 'whatsapp':
      if (env.whatsappFallback && (await env.whatsappFallback(job.ticket))) return;
      throw new Error('WHATSAPP_FALLBACK_FAILED');
  }
}

export function createPrinterTransport(env: PrinterTransportEnv = {}): PrinterTransport {
  const system = createSystemPort();
  return {
    preflight() {
      const available: PrinterStrategy[] = [];
      if (env.usbDevice) available.push('webusb');
      const wssReady =
        !!env.wssUrl &&
        env.wssUrl.startsWith('wss:') &&
        !!env.socketFactory &&
        (env.allowlistedHosts ?? []).includes(new URL(env.wssUrl).hostname);
      if (wssReady) available.push('wss_lan');
      const nav =
        typeof navigator !== 'undefined' ? (navigator as { bluetooth?: unknown }) : undefined;
      if (nav?.bluetooth) available.push('bluetooth');
      available.push('system_print');
      if (env.whatsappFallback) available.push('whatsapp');
      return Promise.resolve(available);
    },
    async print(job) {
      const bytes = job.escPosBase64 ? base64ToBytes(job.escPosBase64) : null;
      const defaultOrder: PrinterStrategy[] = [
        'webusb',
        'wss_lan',
        'bluetooth',
        'system_print',
        'whatsapp',
      ];
      const preferred = job.preferredAdapter;
      const order: PrinterStrategy[] =
        preferred && defaultOrder.includes(preferred)
          ? [preferred, ...defaultOrder.filter((a) => a !== preferred)]
          : defaultOrder;

      let lastError = 'NO_ADAPTER';
      for (const adapter of order) {
        try {
          await executeSingleAdapter(adapter, job, bytes, env, system);
          return { ok: true, adapter };
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
      return { ok: false, adapter: 'system_print', error: lastError };
    },
    async openDrawer() {
      const drawerBytes = openDrawerBytes();
      const drawerOrder: PrinterStrategy[] = ['webusb', 'wss_lan', 'bluetooth'];
      let lastError = 'NO_ADAPTER';
      for (const adapter of drawerOrder) {
        try {
          await executeSingleAdapter(
            adapter,
            { ticket: {} as PrintTicketSnapshot, escPosBase64: bytesToBase64(drawerBytes) },
            drawerBytes,
            env,
            system,
          );
          return { ok: true, adapter };
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
      return { ok: false, adapter: 'system_print', error: lastError };
    },
  };
}

/** Inyectable para tests: corta la escalera en el primer adaptador mock. */
export function createMockPrinterTransport(
  adapters: ReadonlyArray<{
    readonly strategy: PrinterStrategy;
    readonly run: () => Promise<void>;
  }>,
): PrinterTransport {
  return {
    preflight: () => Promise.resolve(adapters.map((a) => a.strategy)),
    async print() {
      for (const a of adapters) {
        try {
          await a.run();
          return { ok: true, adapter: a.strategy };
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          if (a === adapters[adapters.length - 1]) {
            return { ok: false, adapter: a.strategy, error };
          }
        }
      }
      return { ok: false, adapter: 'system_print', error: 'EMPTY_LADDER' };
    },
    async openDrawer() {
      const hardware = adapters.filter(
        (a) => a.strategy !== 'system_print' && a.strategy !== 'whatsapp',
      );
      for (const a of hardware) {
        try {
          await a.run();
          return { ok: true, adapter: a.strategy };
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          if (a === hardware[hardware.length - 1]) {
            return { ok: false, adapter: a.strategy, error };
          }
        }
      }
      return { ok: false, adapter: 'system_print', error: 'NO_DRAWER_ADAPTER' };
    },
  };
}
