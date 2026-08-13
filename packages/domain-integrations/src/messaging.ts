/**
 * Sprint 24 — MessagingSender WhatsApp (§5.4 regla 5).
 */

export type ReceiptDocumentKind = 'NV' | 'CPE';

export interface MessagingSendReceiptRequest {
  readonly tenantId: string;
  readonly customerId: string;
  readonly saleId: string;
  readonly documentKind: ReceiptDocumentKind;
  readonly phoneE164: string;
  readonly optedIn: boolean;
  readonly representationUrl: string;
}

export interface MessagingSendReceiptResult {
  readonly accepted: boolean;
  readonly providerRef: string | null;
  readonly templateId: string;
}

export interface MessagingSendQuoteRequest {
  readonly tenantId: string;
  readonly customerId: string;
  readonly quoteId: string;
  readonly phoneE164: string;
  readonly optedIn: boolean;
  readonly representationUrl: string;
}

export interface MessagingSendQuoteResult {
  readonly accepted: boolean;
  readonly providerRef: string | null;
  readonly templateId: string;
}

export interface MessagingSenderPort {
  sendReceipt(request: MessagingSendReceiptRequest): Promise<MessagingSendReceiptResult>;
  sendQuote?(request: MessagingSendQuoteRequest): Promise<MessagingSendQuoteResult>;
}

export const QUOTE_TEMPLATE_ID = 'kipus_quote_v1';

export function assertWhatsAppOptIn(optedIn: boolean): void {
  if (!optedIn) throw new Error('WHATSAPP_OPT_IN_REQUIRED');
}

/** Plantillas distintas NV vs CPE (leyendas). */
export function receiptTemplateId(kind: ReceiptDocumentKind): string {
  if (kind === 'NV') return 'kipus_nv_receipt_v1';
  return 'kipus_cpe_receipt_v1';
}

export function receiptLegend(kind: ReceiptDocumentKind): string {
  if (kind === 'NV') {
    return 'Nota de venta interna — no es comprobante fiscal SUNAT';
  }
  return 'Comprobante electrónico — verifique en SUNAT / portal CPE';
}

/** S24-H1: E.164 estricto — `+` seguido de 8–15 dígitos, sin letras ni símbolos. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/** S24-H1: URL absoluta https con host — rechaza http://, javascript:, texto plano. */
function isHttpsAbsoluteUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.hostname !== '' && parsed.hostname.includes('.');
}

export function assertSendableReceipt(request: MessagingSendReceiptRequest): void {
  assertWhatsAppOptIn(request.optedIn);
  if (!E164_PATTERN.test(request.phoneE164)) {
    throw new Error('WHATSAPP_PHONE_INVALID');
  }
  if (!isHttpsAbsoluteUrl(request.representationUrl)) {
    throw new Error('WHATSAPP_URL_NOT_HTTPS');
  }
}

export function assertSendableQuote(request: MessagingSendQuoteRequest): void {
  assertWhatsAppOptIn(request.optedIn);
  if (!E164_PATTERN.test(request.phoneE164)) {
    throw new Error('WHATSAPP_PHONE_INVALID');
  }
  if (!isHttpsAbsoluteUrl(request.representationUrl)) {
    throw new Error('WHATSAPP_URL_NOT_HTTPS');
  }
}
