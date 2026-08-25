import { formatTicketCents } from './format-cents.js';
import { buyerDocLabel, officialDocumentNameFor } from './fiscal-qr.js';
import { buildGsKQrCommands } from './escpos-qr.js';
import { legendForDocument } from './legends.js';
import { maxItemNameLen } from './line-width.js';
import { sanitizePrinterText } from './sanitize.js';
import type { TicketData } from './ticket-data.js';

/** Construye bytes ESC/POS (zero-dep). QR térmica = GS ( k ) nativo. */
export function buildEscPosPayload(data: TicketData): Uint8Array {
  const encoder = new TextEncoder();
  const cmd: number[] = [];
  const lineWidth = data.lineWidth || 32;
  const separator = '-'.repeat(lineWidth) + '\n';
  const legend = legendForDocument(data.documentType, data.digestValue);
  const isNv = data.documentType === 'NV' || data.documentType === 'NV_RETURN';

  cmd.push(0x1b, 0x40);
  cmd.push(0x1b, 0x61, 0x01);
  const rucLine = data.ruc ? `RUC: ${sanitizePrinterText(data.ruc)}\n` : '';
  // H2 (auditoría 0031): denominación oficial del documento (RS 097-2012).
  const docTitle = `${officialDocumentNameFor(data.documentType)}\n`;
  cmd.push(
    ...encoder.encode(`${sanitizePrinterText(data.enterprise)}\n${rucLine}${docTitle}${separator}`),
  );
  cmd.push(
    ...encoder.encode(
      `${data.documentType} ${sanitizePrinterText(data.series)}-${String(data.number).padStart(8, '0')}\n`,
    ),
  );
  // H2: fecha de emisión + adquirente (solo CPE; la NV es control interno).
  pushFiscalHeader(cmd, encoder, data, isNv);
  cmd.push(0x1b, 0x61, 0x00);

  const maxName = maxItemNameLen(lineWidth);
  for (const item of data.items) {
    const qtyPrefix = `${item.qty}x `;
    const priceStr = `S/ ${formatTicketCents(item.totalCents)}`;
    const availForName = lineWidth - qtyPrefix.length - priceStr.length - 1;
    const maxLen = Math.max(6, Math.min(maxName, availForName));
    const nameTrunc = sanitizePrinterText(item.name).substring(0, maxLen);
    const leftPart = `${qtyPrefix}${nameTrunc}`;
    const spaceCount = Math.max(1, lineWidth - leftPart.length - priceStr.length);
    const lineStr = `${leftPart}${' '.repeat(spaceCount)}${priceStr}\n`;
    cmd.push(...encoder.encode(lineStr));
  }

  cmd.push(0x1b, 0x45, 0x01);
  cmd.push(...encoder.encode(`\nTOTAL: S/ ${formatTicketCents(data.totalCents)}\n`));
  cmd.push(0x1b, 0x45, 0x00);
  // H2: IGV desglosado junto a los totales (anexo 2 RS 097-2012).
  if (!isNv && data.igvCents !== undefined) {
    cmd.push(...encoder.encode(`IGV: S/ ${formatTicketCents(data.igvCents)}\n`));
  }
  cmd.push(...encoder.encode('\n'));

  // P2: propina como línea informativa (fuera del valor de venta, sin IGV).
  if (data.tipCents !== undefined && data.tipCents > 0) {
    cmd.push(...encoder.encode(`PROPINA: S/ ${formatTicketCents(data.tipCents)}\n\n`));
  }

  pushFiscalTail(cmd, encoder, data, isNv, lineWidth);

  cmd.push(...encoder.encode(`\n${legend}\n\n`));

  pushBrandFooter(cmd, encoder, data, lineWidth);

  cmd.push(0x1d, 0x56, 0x42, 0x04);
  return new Uint8Array(cmd);
}

/** H2: fecha de emisión + adquirente del CPE (líneas izquierdas del header). */
function pushFiscalHeader(
  cmd: number[],
  encoder: TextEncoder,
  data: TicketData,
  isNv: boolean,
): void {
  if (isNv) return;
  if (data.issueDateIso) {
    cmd.push(...encoder.encode(`Fecha de emisión: ${sanitizePrinterText(data.issueDateIso)}\n`));
  }
  const buyer = data.buyer;
  if (!buyer) return;
  const buyerName = buyer.name ? sanitizePrinterText(buyer.name) : '';
  if (buyerName) cmd.push(...encoder.encode(`Adquirente: ${buyerName}\n`));
  if (buyer.docNumber) {
    const label = buyerDocLabel(buyer.docType ?? '');
    cmd.push(...encoder.encode(`${label}: ${sanitizePrinterText(buyer.docNumber)}\n`));
  }
}

/** Hash + QR fiscal GS ( k ) — solo CPE; la NV termina en leyenda. */
function pushFiscalTail(
  cmd: number[],
  encoder: TextEncoder,
  data: TicketData,
  isNv: boolean,
  lineWidth: number,
): void {
  if (isNv) return;
  if (data.digestValue) {
    cmd.push(
      ...encoder.encode(`Hash: ${sanitizePrinterText(data.digestValue).slice(0, lineWidth)}\n`),
    );
  }
  if (data.qrPayload) {
    cmd.push(0x1b, 0x61, 0x01);
    cmd.push(...buildGsKQrCommands(data.qrPayload));
    cmd.push(0x1b, 0x61, 0x00);
    cmd.push(0x0a);
  }
}

/** S12-H2: pie de marca KipusPay; jamás antes de la leyenda fiscal. */
function pushBrandFooter(
  cmd: number[],
  encoder: TextEncoder,
  data: TicketData,
  lineWidth: number,
): void {
  const brand = data.brandFooter;
  if (brand?.enabled !== true) return;
  cmd.push(
    ...encoder.encode(
      `${sanitizePrinterText(brand.label)}\n${sanitizePrinterText(brand.shortUrl).slice(0, lineWidth)}\n`,
    ),
  );
  if (brand.qrPayload) {
    cmd.push(0x1b, 0x61, 0x01);
    cmd.push(...buildGsKQrCommands(brand.qrPayload));
    cmd.push(0x1b, 0x61, 0x00);
    cmd.push(0x0a);
  }
}

/**
 * Backlog v10 P2 — apertura del cajón de efectivo por ESC/POS (`ESC p`).
 * Comando estándar: 0x1b 0x70 <m=0> <t1=0x19> <t2=0xFA> (impulso 50ms/200ms
 * según Epson). Zero-dep.
 */
export function openDrawerBytes(): Uint8Array {
  return new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);
}
