export { resolveLineWidth, maxItemNameLen } from './line-width.js';
export {
  buildFiscalQrPayload,
  officialDocumentNameFor,
  buyerDocLabel,
  type FiscalCpeType,
  type FiscalQrInput,
} from './fiscal-qr.js';
export { qrMatrixToSvg, type QrMatrixLike, type QrSvgOptions } from './qr-svg.js';
export {
  NV_TICKET_LEGEND,
  CPE_TICKET_LEGEND,
  CPE_PENDING_TICKET_LEGEND,
  legendForDocument,
} from './legends.js';
export { formatTicketCents } from './format-cents.js';
export { sanitizePrinterText } from './sanitize.js';
export { buildEscPosPayload, openDrawerBytes } from './build-escpos.js';
export { buildGsKQrCommands } from './escpos-qr.js';
export { buildTicketHtml, type TicketHtmlRenderers } from './build-html.js';
export {
  printTicket,
  createBrowserPrintPort,
  type PrintMode,
  type SystemPrintPort,
} from './system-print.js';
export {
  MAX_PRINT_ITEMS,
  assertPrintPayloadSize,
  printJobKey,
  countBlockingPrintJobs,
  assertPrintJobTransition,
  bytesToBase64,
  base64ToBytes,
  type PrintJobStatus,
  type PrintJobKind,
  type PrinterStrategy,
  type PrintTicketSnapshot,
  type PrintJobRecord,
  type PriceLabelPrintItemRecord,
  type PriceLabelPrintJobRecord,
  type GenericPrintJobRecord,
  type PrintOutboxPort,
} from './print-outbox.js';
export {
  canonicalizePriceLabelSnapshots,
  compilePriceLabelTemplate,
  encodePriceLabelBarcode,
  hashPriceLabelPayload,
  hashPriceLabelSnapshots,
  validatePriceLabelTemplate,
  type PriceLabelAlignment,
  type PriceLabelBarcodeType,
  type PriceLabelSnapshot,
  type PriceLabelTemplateV1,
} from './price-labels.js';
export type { TicketData, TicketItem, TicketBuyer, TicketBrandFooter } from './ticket-data.js';
