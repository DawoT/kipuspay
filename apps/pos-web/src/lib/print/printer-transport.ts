/**
 * PrinterTransport ladder (§7.5): WebUSB → WSS → Bluetooth → SystemPrint → WhatsApp hint.
 */
import {
  base64ToBytes,
  buildTicketHtml,
  type PrinterStrategy,
  type PrintTicketSnapshot,
  type SystemPrintPort,
} from '@kipuspay/print-templates';
import { snapshotToTicketData } from './offload-compile.js';

export type TransportResult =
  | { readonly ok: true; readonly adapter: PrinterStrategy }
  | { readonly ok: false; readonly adapter: PrinterStrategy; readonly error: string };

export interface PrinterTransportEnv {
  readonly wssUrl?: string | null;
  /** Best-effort WA: solo señala que se puede enviar; no bloquea. */
  readonly whatsappFallback?: (snap: PrintTicketSnapshot) => Promise<boolean>;
}

export interface PrinterTransport {
  preflight(): Promise<readonly PrinterStrategy[]>;
  print(job: {
    readonly ticket: PrintTicketSnapshot;
    readonly escPosBase64: string | null;
  }): Promise<TransportResult>;
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

function tryWebUsb(bytes: Uint8Array): Promise<void> {
  const nav = navigator as Navigator & {
    usb?: {
      requestDevice: (opts: { filters: unknown[] }) => Promise<{ open: () => Promise<void> }>;
    };
  };
  if (!nav.usb) return Promise.reject(new Error('WEBUSB_UNAVAILABLE'));
  // Pre-flight / print: sin device emparejado → fail (tests inyectan mock).
  void bytes;
  return Promise.reject(new Error('WEBUSB_NO_DEVICE'));
}

function tryWss(bytes: Uint8Array, url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith('wss:')) return Promise.reject(new Error('WSS_URL_INVALID'));
  void bytes;
  return Promise.reject(new Error('WSS_NOT_CONNECTED'));
}

function tryBluetooth(bytes: Uint8Array): Promise<void> {
  const nav = navigator as Navigator & { bluetooth?: unknown };
  if (!nav.bluetooth) return Promise.reject(new Error('BLUETOOTH_UNAVAILABLE'));
  void bytes;
  return Promise.reject(new Error('BLUETOOTH_NO_DEVICE'));
}

export function createPrinterTransport(env: PrinterTransportEnv = {}): PrinterTransport {
  const system = createSystemPort();
  return {
    preflight() {
      const available: PrinterStrategy[] = [];
      if ((navigator as { usb?: unknown }).usb) available.push('webusb');
      if (env.wssUrl?.startsWith('wss:')) available.push('wss_lan');
      if ((navigator as { bluetooth?: unknown }).bluetooth) available.push('bluetooth');
      available.push('system_print');
      if (env.whatsappFallback) available.push('whatsapp');
      return Promise.resolve(available);
    },
    async print(job) {
      const bytes = job.escPosBase64 ? base64ToBytes(job.escPosBase64) : null;
      const order: PrinterStrategy[] = [
        'webusb',
        'wss_lan',
        'bluetooth',
        'system_print',
        'whatsapp',
      ];
      let lastError = 'NO_ADAPTER';
      for (const adapter of order) {
        try {
          if (adapter === 'webusb') {
            if (!bytes) throw new Error('ESCPOS_REQUIRED');
            await tryWebUsb(bytes);
            return { ok: true, adapter };
          }
          if (adapter === 'wss_lan') {
            if (!bytes) throw new Error('ESCPOS_REQUIRED');
            await tryWss(bytes, env.wssUrl);
            return { ok: true, adapter };
          }
          if (adapter === 'bluetooth') {
            if (!bytes) throw new Error('ESCPOS_REQUIRED');
            await tryBluetooth(bytes);
            return { ok: true, adapter };
          }
          if (adapter === 'system_print') {
            const html = buildTicketHtml(snapshotToTicketData(job.ticket));
            await system.printHtml(html);
            return { ok: true, adapter };
          }
          if (adapter === 'whatsapp' && env.whatsappFallback) {
            const ok = await env.whatsappFallback(job.ticket);
            if (!ok) throw new Error('WHATSAPP_FALLBACK_FAILED');
            return { ok: true, adapter };
          }
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
  };
}
