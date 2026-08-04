/**
 * Portal CPE adquirente — retención consulta ≥ 1 año (Arquitectura §5.2).
 * Zero-dep: representación HTML/texto; sin npm PDF.
 */

const RETENTION_MS = 365 * 24 * 3600 * 1000;

export interface CpePortalLookup {
  readonly tenantId: string;
  readonly saleId: string;
  readonly issuedAtMs: number;
  readonly xmlHash: string | null;
  readonly documentType: string;
  readonly series: string;
  readonly correlative: number;
  readonly totalAmountCents: number;
}

export interface CpePortalView {
  readonly saleId: string;
  readonly documentLabel: string;
  readonly issuedAtIso: string;
  readonly totalAmountCents: number;
  readonly html: string;
}

export function assertWithinRetention(issuedAtMs: number, nowMs: number): void {
  if (nowMs - issuedAtMs > RETENTION_MS) {
    throw new Error('CPE_PORTAL_EXPIRED');
  }
  if (issuedAtMs > nowMs + 6 * 3600 * 1000) {
    throw new Error('CPE_PORTAL_ISSUED_FUTURE');
  }
}

/** Token opaco: no expone tenant ajeno en URL legible. */
export async function mintPortalToken(
  tenantId: string,
  saleId: string,
  secret: string,
): Promise<string> {
  const raw = `${tenantId}:${saleId}:${secret}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPortalToken(
  token: string,
  tenantId: string,
  saleId: string,
  secret: string,
): Promise<boolean> {
  const expected = await mintPortalToken(tenantId, saleId, secret);
  return token === expected;
}

export function renderCpePortalHtml(doc: CpePortalLookup, nowMs: number): CpePortalView {
  assertWithinRetention(doc.issuedAtMs, nowMs);
  const label = `${doc.series}-${String(doc.correlative).padStart(8, '0')}`;
  const issuedAtIso = new Date(doc.issuedAtMs).toISOString();
  const metaCharset = 'charset="utf-8"';
  const html =
    `<!DOCTYPE html><html lang="es"><head><meta ${metaCharset}><title>CPE ${label}</title></head>` +
    `<body><h1>KipusPay CPE</h1><p>${doc.documentType} ${label}</p>` +
    `<p>Emitido: ${issuedAtIso}</p><p>Total cents: ${doc.totalAmountCents}</p>` +
    `<p>Hash: ${doc.xmlHash ?? 'n/a'}</p></body></html>`;
  return {
    saleId: doc.saleId,
    documentLabel: label,
    issuedAtIso,
    totalAmountCents: doc.totalAmountCents,
    html,
  };
}
