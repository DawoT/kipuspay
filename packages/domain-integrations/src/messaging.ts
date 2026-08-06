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

export interface MessagingSenderPort {
  sendReceipt(request: MessagingSendReceiptRequest): Promise<MessagingSendReceiptResult>;
}

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

export function assertSendableReceipt(request: MessagingSendReceiptRequest): void {
  assertWhatsAppOptIn(request.optedIn);
  if (!request.phoneE164.startsWith('+') || request.phoneE164.length < 10) {
    throw new Error('WHATSAPP_PHONE_INVALID');
  }
  if (!request.representationUrl.startsWith('https://')) {
    throw new Error('WHATSAPP_URL_NOT_HTTPS');
  }
}
