/**
 * SystemPrint / printTicket — ladder completa = PrinterTransport en pos-web.
 */
import { buildEscPosPayload } from './build-escpos.js';
import { buildTicketHtml } from './build-html.js';
import type { TicketData } from './ticket-data.js';

export type PrintMode = 'html' | 'escpos';

export interface SystemPrintPort {
  printHtml(html: string): Promise<void>;
  sendEscPos?(bytes: Uint8Array): Promise<void>;
}

export async function printTicket(
  data: TicketData,
  port: SystemPrintPort,
  mode: PrintMode = 'html',
): Promise<void> {
  if (mode === 'escpos') {
    if (!port.sendEscPos) throw new Error('ESCPOS_TRANSPORT_UNAVAILABLE');
    await port.sendEscPos(buildEscPosPayload(data));
    return;
  }
  await port.printHtml(buildTicketHtml(data));
}

/** Narrow DOM surface — package lib is es2022+webworker (no DOM). */
interface PrintFrame {
  style: { position: string; width: string; height: string; border: string };
  contentDocument: {
    open(): void;
    write(html: string): void;
    close(): void;
  } | null;
  contentWindow: { focus(): void; print(): void } | null;
  remove(): void;
}

interface BrowserPrintGlobals {
  document: {
    createElement(tag: 'iframe'): PrintFrame;
    body: { appendChild(node: PrintFrame): void };
  };
  window: object;
}

/**
 * Factory browser: window.print vía iframe efímero.
 */
export function createBrowserPrintPort(): SystemPrintPort {
  return {
    async printHtml(html: string): Promise<void> {
      const g = globalThis as unknown as Partial<BrowserPrintGlobals>;
      if (!g.document || !g.window) {
        throw new Error('BROWSER_PRINT_UNAVAILABLE');
      }
      const { document: docRoot } = g;
      const frame = docRoot.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      docRoot.body.appendChild(frame);
      const doc = frame.contentDocument;
      if (!doc) {
        frame.remove();
        throw new Error('BROWSER_PRINT_UNAVAILABLE');
      }
      doc.open();
      doc.write(html);
      doc.close();
      const w = frame.contentWindow;
      if (!w) {
        frame.remove();
        throw new Error('BROWSER_PRINT_UNAVAILABLE');
      }
      w.focus();
      w.print();
      await new Promise<void>((r) => {
        setTimeout(() => {
          frame.remove();
          r();
        }, 200);
      });
    },
  };
}
