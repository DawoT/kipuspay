export { resolveLineWidth, maxItemNameLen } from './line-width.js';
export { NV_TICKET_LEGEND, CPE_TICKET_LEGEND, legendForDocument } from './legends.js';
export { formatTicketCents } from './format-cents.js';
export { sanitizePrinterText } from './sanitize.js';
export { buildEscPosPayload } from './build-escpos.js';
export { buildTicketHtml } from './build-html.js';
export {
  printTicket,
  createBrowserPrintPort,
  type PrintMode,
  type SystemPrintPort,
} from './system-print.js';
export type { TicketData, TicketItem } from './ticket-data.js';
