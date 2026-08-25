/**
 * Portal CPE adquirente — retención consulta ≥ 1 año (Arquitectura §5.2).
 * Zero-dep: representación HTML/texto; sin npm PDF.
 *
 * H4 (auditoría 0031): además del HTML, el portal sirve los ARCHIVOS del CPE
 * (XML firmado desde R2 y constancia de recepción derivada del estado D1) y
 * expone la derivación determinista del enlace distribuible
 * (`buildCpePortalUrl`) para que el POS lo comparta al adquirente.
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
  /** H4: hrefs relativos de descarga (xml/constancia); solo con CPE aceptado. */
  readonly fileUrls?: CpePortalFileUrls;
}

export interface CpePortalFileUrls {
  readonly xml: string;
  readonly cdr: string;
}

export interface CpePortalView {
  readonly saleId: string;
  readonly documentLabel: string;
  readonly issuedAtIso: string;
  readonly totalAmountCents: number;
  readonly html: string;
}

/** Escape mínimo HTML para atributos href/texto interpolados en el portal. */
function escHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Escape XML para valores dinámicos (mensajes SUNAT, series, ids). */
function escXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
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

/**
 * H4: enlace distribuible del portal — derivación determinista (token =
 * SHA-256 de tenant:sale:secret), sin escritura en D1. El POS lo obtiene tras
 * CDR ACCEPTED y lo comparte (WhatsApp/impresa); sirve por 1 año (§5.2).
 */
export async function buildCpePortalUrl(input: {
  readonly baseUrl: string;
  readonly tenantId: string;
  readonly saleId: string;
  readonly secret: string;
}): Promise<{ readonly url: string; readonly token: string }> {
  const token = await mintPortalToken(input.tenantId, input.saleId, input.secret);
  const base = input.baseUrl.replace(/\/+$/, '');
  return {
    token,
    url: `${base}/v1/cpe/portal/${input.tenantId}/${input.saleId}?token=${token}`,
  };
}

export function renderCpePortalHtml(doc: CpePortalLookup, nowMs: number): CpePortalView {
  assertWithinRetention(doc.issuedAtMs, nowMs);
  const label = `${doc.series}-${String(doc.correlative).padStart(8, '0')}`;
  const issuedAtIso = new Date(doc.issuedAtMs).toISOString();
  const metaCharset = 'charset="utf-8"';
  const downloads = doc.fileUrls
    ? `<p><a href="${escHtml(doc.fileUrls.xml)}">Descargar XML firmado</a> · ` +
      `<a href="${escHtml(doc.fileUrls.cdr)}">Descargar constancia de recepción</a></p>`
    : '';
  const html =
    `<!DOCTYPE html><html lang="es"><head><meta ${metaCharset}><title>CPE ${escHtml(label)}</title></head>` +
    `<body><h1>KipusPay CPE</h1><p>${escHtml(doc.documentType)} ${escHtml(label)}</p>` +
    `<p>Emitido: ${issuedAtIso}</p><p>Total cents: ${doc.totalAmountCents}</p>` +
    `<p>Hash: ${escHtml(doc.xmlHash ?? 'n/a')}</p>${downloads}</body></html>`;
  return {
    saleId: doc.saleId,
    documentLabel: label,
    issuedAtIso,
    totalAmountCents: doc.totalAmountCents,
    html,
  };
}

export interface CpeReceiptInput {
  readonly documentType: string;
  readonly series: string;
  readonly correlative: number;
  readonly issuedAtMs: number;
  /** Estado autoritativo en D1 — nunca se fabrica ACCEPTED aquí arriba. */
  readonly sunatStatus: string;
  readonly responseCode: string | null;
  readonly responseMessage: string | null;
  readonly dailySummary: {
    readonly id: string;
    readonly status: string;
    readonly cdrCode: string | null;
    readonly cdrMessage: string | null;
  } | null;
}

/**
 * H4: constancia de recepción del CPE, generada desde el estado autoritativo
 * de D1 (`sales.sunat_status` + CDR del resumen diario para boletas). Es una
 * constancia KipusPay del estado registrado — NO reemplaza el CDR zip original
 * de SUNAT (el pipeline hoy no retiene ese artefacto; retenerlo es cambio del
 * drain, worker-fiscal). Solo se sirve con sunat_status='ACCEPTED'.
 */
export function renderCpeReceiptXml(doc: CpeReceiptInput): string {
  const numero = String(doc.correlative).padStart(8, '0');
  const resumen = doc.dailySummary
    ? `  <ResumenDiario id="${escXml(doc.dailySummary.id)}" estado="${escXml(doc.dailySummary.status)}"` +
      ` codigoCDR="${escXml(doc.dailySummary.cdrCode ?? '')}"` +
      ` mensajeCDR="${escXml(doc.dailySummary.cdrMessage ?? '')}"/>\n`
    : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ConstanciaRecepcionCPE generador="KipusPay"` +
    ` nota="Constancia del estado registrado tras el envio a SUNAT; no reemplaza el CDR original">\n` +
    `  <Comprobante tipo="${escXml(doc.documentType)}" serie="${escXml(doc.series)}" numero="${numero}"/>\n` +
    `  <FechaEmision>${new Date(doc.issuedAtMs).toISOString()}</FechaEmision>\n` +
    `  <EstadoSunat>${escXml(doc.sunatStatus)}</EstadoSunat>\n` +
    `  <CodigoRespuesta>${escXml(doc.responseCode ?? '')}</CodigoRespuesta>\n` +
    `  <MensajeRespuesta>${escXml(doc.responseMessage ?? '')}</MensajeRespuesta>\n` +
    resumen +
    `</ConstanciaRecepcionCPE>\n`
  );
}
