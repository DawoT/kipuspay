import { formatTicketCents } from './format-cents.js';
import { legendForDocument } from './legends.js';
import { maxItemNameLen } from './line-width.js';
import { sanitizePrinterText } from './sanitize.js';
import type { TicketData } from './ticket-data.js';

/** Construye bytes ESC/POS (zero-dep). QR = línea de payload texto (sin lib npm). */
export function buildEscPosPayload(data: TicketData): Uint8Array {
  const encoder = new TextEncoder();
  const cmd: number[] = [];
  const lineWidth = data.lineWidth || 32;
  const separator = '-'.repeat(lineWidth) + '\n';
  const legend = legendForDocument(data.documentType);
  const isNv = data.documentType === 'NV' || data.documentType === 'NV_RETURN';

  cmd.push(0x1b, 0x40);
  cmd.push(0x1b, 0x61, 0x01);
  cmd.push(
    ...encoder.encode(
      `${sanitizePrinterText(data.enterprise)}\nRUC: ${sanitizePrinterText(data.ruc)}\n${separator}`,
    ),
  );
  cmd.push(
    ...encoder.encode(
      `${data.documentType} ${sanitizePrinterText(data.series)}-${String(data.number).padStart(8, '0')}\n`,
    ),
  );
  cmd.push(0x1b, 0x61, 0x00);

  const maxName = maxItemNameLen(lineWidth);
  for (const item of data.items) {
    const nameTrunc = sanitizePrinterText(item.name).substring(0, maxName);
    cmd.push(
      ...encoder.encode(`${item.qty} x ${nameTrunc} S/ ${formatTicketCents(item.totalCents)}\n`),
    );
  }

  cmd.push(0x1b, 0x45, 0x01);
  cmd.push(...encoder.encode(`\nTOTAL: S/ ${formatTicketCents(data.totalCents)}\n\n`));
  cmd.push(0x1b, 0x45, 0x00);

  if (!isNv && data.digestValue) {
    cmd.push(
      ...encoder.encode(`Hash: ${sanitizePrinterText(data.digestValue).slice(0, lineWidth)}\n`),
    );
  }
  if (!isNv && data.qrPayload) {
    cmd.push(...encoder.encode(`QR: ${sanitizePrinterText(data.qrPayload).slice(0, lineWidth)}\n`));
  }

  cmd.push(...encoder.encode(`\n${legend}\n\n`));

  if (data.brandFooter?.enabled === true) {
    cmd.push(
      ...encoder.encode(
        `${sanitizePrinterText(data.brandFooter.label)}\n${sanitizePrinterText(data.brandFooter.shortUrl).slice(0, lineWidth)}\nQR marca: ${sanitizePrinterText(data.brandFooter.qrPayload).slice(0, lineWidth)}\n\n`,
      ),
    );
  }

  cmd.push(0x1d, 0x56, 0x42, 0x00);
  return new Uint8Array(cmd);
}
