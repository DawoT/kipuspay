import { buildEscPosPayload } from './build-escpos.js';
import { buildTicketHtml } from './build-html.js';
import type { TicketData } from './ticket-data.js';

export type PrintMode = 'html' | 'escpos';

export interface SystemPrintPort {
  printHtml(html: string): Promise<void>;
  sendEscPos?(bytes: Uint8Array): Promise<void>;
}

/** Stub mínimo: HTML → port.printHtml; ESC/POS opcional (ladder completa = S25). */
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

/**
 * Factory browser: el adaptador real usa window.print en la app.
 * En Node/tests se inyecta SystemPrintPort mock.
 */
export function createBrowserPrintPort(): SystemPrintPort {
  return {
    printHtml(html: string): Promise<void> {
      void html;
      return Promise.reject(new Error('BROWSER_PRINT_UNAVAILABLE'));
    },
  };
}
