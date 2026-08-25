import { formatTicketCents } from './format-cents.js';
import { buyerDocLabel, officialDocumentNameFor } from './fiscal-qr.js';
import { legendForDocument } from './legends.js';
import { sanitizePrinterText } from './sanitize.js';
import type { TicketData } from './ticket-data.js';

/** Renderer opcional del QR (inyección del transport; p.ej. matriz→SVG). */
export interface TicketHtmlRenderers {
  readonly qrSvg?: (payload: string) => string;
}

/** HTML imprimible (window.print / SystemPrint). Sin npm PDF. */
export function buildTicketHtml(data: TicketData, renderers?: TicketHtmlRenderers): string {
  const legend = legendForDocument(data.documentType, data.digestValue);
  const items = data.items
    .map(
      (i) =>
        `<tr><td>${i.qty}</td><td>${escapeHtml(sanitizePrinterText(i.name))}</td><td>S/ ${formatTicketCents(i.totalCents)}</td></tr>`,
    )
    .join('');
  const digest = digestBlock(data);
  const qr = qrBlock(data, renderers);
  // H2: campos mínimos de la representación impresa CPE (RS 097-2012 anexo 2).
  const fiscalHeader = fiscalHeaderBlock(data);
  const igvLine = igvBlock(data);
  const brand =
    data.brandFooter?.enabled === true
      ? `<p class="brand" data-testid="brand-footer">${escapeHtml(data.brandFooter.label)}</p>
<p class="brand-url">${escapeHtml(data.brandFooter.shortUrl)}</p>
<p class="brand-qr" data-brand-qr="${escapeHtml(data.brandFooter.qrPayload)}">QR marca: ${escapeHtml(data.brandFooter.qrPayload)}</p>`
      : '';

  const head = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title>
<style>
body{font-family:ui-monospace,monospace;width:${data.lineWidth}ch;margin:0 auto}
h1{font-size:1rem;text-align:center} table{width:100%} td{padding:2px 0}
.doc-title{text-align:center;font-weight:bold}
.legend{font-size:.75rem;margin-top:1rem}
.brand{font-size:.7rem;margin-top:.75rem;text-align:center}
</style></head><body>`;
  const ruc = data.ruc ? `<p>RUC: ${escapeHtml(data.ruc)}</p>` : '';
  return `${head}
<h1>${escapeHtml(data.enterprise)}</h1>
${ruc}
<p class="doc-title">${escapeHtml(officialDocumentNameFor(data.documentType))}</p>
<p>${escapeHtml(data.documentType)} ${escapeHtml(data.series)}-${String(data.number).padStart(8, '0')}</p>
${fiscalHeader}<table>${items}</table>
<p><strong>TOTAL: S/ ${formatTicketCents(data.totalCents)}</strong></p>
${igvLine}${digest}${qr}
<p class="legend">${escapeHtml(legend)}</p>
${brand}
</body></html>`;
}

function isNvDocument(data: TicketData): boolean {
  return data.documentType === 'NV' || data.documentType === 'NV_RETURN';
}

function digestBlock(data: TicketData): string {
  if (isNvDocument(data) || !data.digestValue) return '';
  return `<p class="hash">Hash: ${escapeHtml(data.digestValue)}</p>`;
}

/** H2 (auditoría 0031): QR como SVG con renderer inyectado; fallback textual. */
function qrBlock(data: TicketData, renderers?: TicketHtmlRenderers): string {
  if (isNvDocument(data) || !data.qrPayload) return '';
  const svg = renderers?.qrSvg ? renderers.qrSvg(data.qrPayload) : '';
  if (svg) return `<div class="qr-svg">${svg}</div>`;
  return `<p class="qr" data-qr="${escapeHtml(data.qrPayload)}">QR: ${escapeHtml(data.qrPayload)}</p>`;
}

function igvBlock(data: TicketData): string {
  if (isNvDocument(data) || data.igvCents === undefined) return '';
  return `<p>IGV: S/ ${formatTicketCents(data.igvCents)}</p>`;
}

/** Encabezado fiscal CPE: fecha de emisión + adquirente (antes de ítems). */
function fiscalHeaderBlock(data: TicketData): string {
  if (isNvDocument(data)) return '';
  const parts: string[] = [];
  if (data.issueDateIso) {
    parts.push(`<p>Fecha de emisión: ${escapeHtml(data.issueDateIso)}</p>`);
  }
  if (data.buyer) {
    const name = data.buyer.name ? escapeHtml(sanitizePrinterText(data.buyer.name)) : '';
    if (name) parts.push(`<p class="buyer">Adquirente: ${name}</p>`);
    if (data.buyer.docNumber) {
      const label = buyerDocLabel(data.buyer.docType ?? '');
      parts.push(`<p class="buyer-doc">${label}: ${escapeHtml(data.buyer.docNumber)}</p>`);
    }
  }
  return parts.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
