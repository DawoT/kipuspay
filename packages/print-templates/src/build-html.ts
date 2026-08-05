import { formatTicketCents } from './format-cents.js';
import { legendForDocument } from './legends.js';
import { sanitizePrinterText } from './sanitize.js';
import type { TicketData } from './ticket-data.js';

/** HTML imprimible (window.print / SystemPrint). Sin npm PDF. */
export function buildTicketHtml(data: TicketData): string {
  const legend = legendForDocument(data.documentType);
  const isNv = data.documentType === 'NV' || data.documentType === 'NV_RETURN';
  const items = data.items
    .map(
      (i) =>
        `<tr><td>${i.qty}</td><td>${escapeHtml(sanitizePrinterText(i.name))}</td><td>S/ ${formatTicketCents(i.totalCents)}</td></tr>`,
    )
    .join('');
  const digest =
    !isNv && data.digestValue ? `<p class="hash">Hash: ${escapeHtml(data.digestValue)}</p>` : '';
  const qr =
    !isNv && data.qrPayload
      ? `<p class="qr" data-qr="${escapeHtml(data.qrPayload)}">QR: ${escapeHtml(data.qrPayload)}</p>`
      : '';
  const brand =
    data.brandFooter?.enabled === true
      ? `<p class="brand" data-testid="brand-footer">${escapeHtml(data.brandFooter.label)}</p>
<p class="brand-url">${escapeHtml(data.brandFooter.shortUrl)}</p>
<p class="brand-qr" data-brand-qr="${escapeHtml(data.brandFooter.qrPayload)}">QR marca: ${escapeHtml(data.brandFooter.qrPayload)}</p>`
      : '';

  // eslint-disable-next-line no-secrets/no-secrets -- plantilla HTML ticket, no secreto
  const head = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket</title>
<style>
body{font-family:ui-monospace,monospace;width:${data.lineWidth}ch;margin:0 auto}
h1{font-size:1rem;text-align:center} table{width:100%} td{padding:2px 0}
.legend{font-size:.75rem;margin-top:1rem}
.brand{font-size:.7rem;margin-top:.75rem;text-align:center}
</style></head><body>`;
  return `${head}
<h1>${escapeHtml(data.enterprise)}</h1>
<p>RUC: ${escapeHtml(data.ruc)}</p>
<p>${escapeHtml(data.documentType)} ${escapeHtml(data.series)}-${String(data.number).padStart(8, '0')}</p>
<table>${items}</table>
<p><strong>TOTAL: S/ ${formatTicketCents(data.totalCents)}</strong></p>
${digest}${qr}
<p class="legend">${escapeHtml(legend)}</p>
${brand}
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
